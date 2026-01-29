import { IAgentBrain } from '../agents/IAgentBrain.js';
import type { ISkillsRepository } from './ISkillsRepository.js';
import { RenderedScenario, RenderedScenarioTask } from './types.js';
import type { IScenarioFlow } from './flows/IScenarioFlow.js';
import type { ISkillFlow, ScenarioResult } from './flows/ISkillFlow.js';
import { SequentialScenarioFlow } from './flows/SequentialScenarioFlow.js';
import { ILogger } from '../logging/ILogger.js';
import { Goal } from 'powerhouse-agent/document-models/work-breakdown-structure';

type WbsTaskContext = { 
  skill: Goal | null, 
  scenario: Goal | null, 
  task: Goal, 
  precedingTasks: Goal[], 
  followingTasks: Goal[] 
}

export interface SkillExecutionResult {
  skill: string;
  totalScenarios: number;
  completedScenarios: number;
  scenarioResults: ScenarioExecutionResult[];
  success: boolean;
  error?: Error;
}

export interface ScenarioExecutionResult {
  scenarioId: string;
  totalTasks: number;
  completedTasks: number;
  responses: TaskExecutionResult[];
}

export interface TaskExecutionResult {
  taskId: string;
  taskTitle: string;
  response: string;
  timestamp: Date;
  success: boolean;
  error?: Error;
}

export class PromptDriver {
  private repository: ISkillsRepository;
  private agent: IAgentBrain;
  private sessionId: string | null = null;
  private defaultMaxTurns: number = 5;  // Default maxTurns for message sending
  private logger: ILogger;
  private messageQueue: string[] = [];  // Queue for messages to be grouped

  constructor(agent: IAgentBrain, repository: ISkillsRepository, logger: ILogger) {
    this.agent = agent;
    this.repository = repository;
    this.logger = logger;
  }

  /**
   * Initialize the repository
   */
  async initialize(): Promise<void> {
    await this.repository.loadSkills();
  }

  /**
   * Queue skill preamble to be sent with next message
   */
  queueSkillPreamble<TContext = any>(skill: string, context: TContext): void {
    const skillPreamble = this.repository.getSkillPreamble(skill, context);
    if (skillPreamble && skillPreamble.trim().length > 0) {
      this.queueMessage(skillPreamble);
    }
  }

  /**
   * Execute a complete skill using the provided skill flow
   * @param skill The skill name
   * @param flow The skill flow to use for execution
   * @param context Context object to pass to template functions (optional)
   * @param options Optional execution options
   * @returns SkillExecutionResult with results from all scenarios
   */
  async executeSkillFlow<TContext = any>(
    skill: string,
    flow: ISkillFlow,
    context: TContext = {} as TContext,
    options?: {
      maxTurns?: number;
      sessionId?: string;
      sendSkillPreamble?: boolean;
    }
  ): Promise<SkillExecutionResult> {
    // Use provided maxTurns or fallback to instance default
    const maxTurns = options?.maxTurns ?? this.defaultMaxTurns;
    
    // Use provided sessionId if available
    if (options?.sessionId) {
      this.sessionId = options.sessionId;
    }
    
    // Queue skill preamble if requested (default: true)
    const sendPreamble = options?.sendSkillPreamble ?? true;
    if (sendPreamble) {
      this.queueSkillPreamble(skill, context);
    }
    
    const scenarioResults: ScenarioExecutionResult[] = [];
    let overallSuccess = true;
    let overallError: Error | undefined;
    
    try {
      // Reset the skill flow
      flow.reset();
      
      // Process scenarios using the skill flow
      let scenario = await flow.nextScenario();
      
      while (scenario !== null) {
        this.logger?.info(`PromptDriver::executeSkillFlow - Starting scenario "${scenario.id} - ${scenario.title}"`);
        try {
          // Create a scenario flow for this scenario
          const scenarioFlow = await flow.createScenarioFlow(scenario);
          
          // Build the scenario key
          const scenarioKey = this.repository.generateScenarioKey(skill, scenario.id);
          
          // Execute the scenario using existing method
          const scenarioResult = await this.executeScenarioFlow(
            scenarioKey,
            scenarioFlow,
            context,
            { maxTurns, sessionId: this.sessionId || undefined }
          );
          
          scenarioResults.push(scenarioResult);
          
          // Report success to skill flow
          const result: ScenarioResult = {
            scenarioId: scenario.id,
            success: true,
            completedTasks: scenarioResult.completedTasks,
            totalTasks: scenarioResult.totalTasks
          };

          this.logger?.info(`PromptDriver::executeSkillFlow - Reporting scenario result: "${scenario.id} - ${scenario.title}"`);
          await flow.reportScenarioResult(result);
          
        } catch (error) {
          const scenarioError = error as Error;
          
          // Create a failed execution result
          scenarioResults.push({
            scenarioId: scenario.id,
            totalTasks: scenario.tasks.length,
            completedTasks: 0,
            responses: []
          });
          
          // Report failure to skill flow
          const result: ScenarioResult = {
            scenarioId: scenario.id,
            success: false,
            completedTasks: 0,
            totalTasks: scenario.tasks.length,
            error: scenarioError
          };
          await flow.reportScenarioResult(result);
          
          // Check if skill flow continues after error
          if (flow.finished()) {
            overallSuccess = false;
            overallError = scenarioError;
            break;
          }
        }
        
        // Get next scenario from flow
        scenario = await flow.nextScenario();
      }
      
      this.logger?.info(`PromptDriver::executeSkillFlow - Completed ${flow.getProgress().completedScenarios}/${flow.getProgress().totalScenarios} scenarios for skill ${skill}`);

      // Get final status from skill flow
      const finalStatus = flow.status();
      if (finalStatus.error) {
        overallSuccess = false;
        overallError = finalStatus.error;
      }
      
    } catch (error) {
      overallSuccess = false;
      overallError = error as Error;
    }
    
    // Get skill info for the result
    const skillInfo = flow.getSkillInfo();
    const progress = flow.getProgress();
    
    return {
      skill: skillInfo.name,
      totalScenarios: skillInfo.totalScenarios,
      completedScenarios: progress.completedScenarios,
      scenarioResults,
      success: overallSuccess,
      error: overallError
    };
  }

  /**
   * Execute a scenario using the provided flow
   * @param scenarioKey The key or path to the scenario document
   * @param flow The flow to use for execution
   * @param context Context object to pass to template functions (optional)
   * @param options Optional execution options including sessionId and maxTurns
   * @returns ExecutionResult with all task responses
   */
  public async executeScenarioFlow<TScenarioContext = any>(
    scenarioKey: string,
    flow: IScenarioFlow,
    context: TScenarioContext = {} as TScenarioContext,
    options?: { maxTurns?: number; sessionId?: string }
  ): Promise<ScenarioExecutionResult> {
    // Get the rendered scenario with context applied
    const scenario = this.repository.getScenarioByKey(scenarioKey, context);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioKey}`);
    }
    
    // Use provided maxTurns or fallback to instance default
    const maxTurns = options?.maxTurns ?? this.defaultMaxTurns;
    
    // Use provided sessionId if available
    if (options?.sessionId) {
      this.sessionId = options.sessionId;
    }

    const responses: TaskExecutionResult[] = [];

    // Reset flow for new scenario
    flow.reset();

    try {
      this.logger?.debug(`PromptDriver::executeScenarioFlow - Queueing scenario briefing "${scenario.id} - ${scenario.title}"`);
      // Queue the briefing to be sent with first task
      this.queueRenderedScenarioBriefing(scenario, flow);

      // Execute tasks using the flow
      let task = flow.nextTask();
      while (task !== null) {
        this.logger?.debug(`PromptDriver::executeScenarioFlow - Starting task "${task.id} - ${task.title}"`);
        try {
          const response = await this.executeRenderedTask(task, maxTurns);
          
          responses.push({
            taskId: task.id,
            taskTitle: task.title,
            response,
            timestamp: new Date(),
            success: true
          });
          
          // Report success to flow
          flow.reportTaskResult(true);
        } catch (error) {
          // Report failure to flow
          const taskError = error as Error;
          responses.push({
            taskId: task.id,
            taskTitle: task.title,
            response: taskError.message,
            timestamp: new Date(),
            success: false,
            error: taskError
          });
          
          flow.reportTaskResult(false, taskError);
          
          // Check if flow continues after error
          if (flow.finished()) {
            break;
          }
        }
        
        // Get next task from flow
        task = flow.nextTask();
      }

      this.logger?.debug(`PromptDriver::executeScenarioFlow - Finished ${scenario.tasks.length} tasks for scenario "${scenario.id} - ${scenario.title}"`);

      return {
        scenarioId: scenario.id,
        totalTasks: scenario.tasks.length,
        completedTasks: responses.filter(r => r.success).length,
        responses
      };
    } finally {
      // Keep session active for potential follow-up sequences
      // The session will be reused if another sequence is executed
    }
  }

  /**
   * Execute a single task directly
   * @param task The task to execute
   * @param options Execution options
   * @returns The task response
   */
  public async executeTask<TTaskContext = any>(
    task: RenderedScenarioTask,
    options?: { 
      maxTurns?: number;
      sessionId?: string;
      captureSession?: boolean;
      preamble?: string;
    },
    context: TTaskContext = {} as TTaskContext
  ): Promise<TaskExecutionResult> {
    // Use provided maxTurns or fallback to instance default
    const maxTurns = options?.maxTurns ?? this.defaultMaxTurns;
    
    // Use provided sessionId if available
    if (options?.sessionId) {
      this.sessionId = options.sessionId;
    }
    
    // Default to capturing session if not specified
    const captureSession = options?.captureSession ?? true;
    
    try {
      // Build the task prompt
      const taskPrompt: string[] = [];

      const wbsGoalsContext = {
        wbsId: (context as any).wbsId as string | undefined,
        goals: (context as any).goals as WbsTaskContext | undefined,
      };

      if (wbsGoalsContext.wbsId && wbsGoalsContext.goals) {
        const p = this.getGoalContextMessage(wbsGoalsContext.wbsId, wbsGoalsContext.goals);
        taskPrompt.push(p);
        console.log("WbsGoalContext", p); 
      }
      
      taskPrompt.push(`## Task ${task.id}: ${task.title}`);
      taskPrompt.push(options?.preamble || '');
      taskPrompt.push(task.content);
      taskPrompt.push("\n\n All briefings are completed. Proceed now with the task.");

      // Send the task and optionally capture session
      const result = await this.sendMessage(taskPrompt.filter(t => t.length > 0).join("\n\n"), maxTurns, captureSession);
      
      return {
        taskId: task.id,
        taskTitle: task.title,
        response: result.response,
        timestamp: new Date(),
        success: true
      };
    } catch (error) {
      const taskError = error as Error;
      return {
        taskId: task.id,
        taskTitle: task.title,
        response: taskError.message,
        timestamp: new Date(),
        success: false,
        error: taskError
      };
    }
  }

  /**
   * Execute a rendered task (content is already a string)
   */
  private async executeRenderedTask(
    task: RenderedScenarioTask,
    maxTurns: number = 5
  ): Promise<string> {
    // Build the prompt for this task
    const taskPrompt = `## Task ${task.id}: ${task.title}\n\n${task.content}`;
    
    const result = await this.sendMessage(taskPrompt, maxTurns);
    return result.response;
  }

  /**
   * Queue scenario briefing to be sent with next message
   */
  public queueScenarioBriefing<TContext = any>(skill: string, scenarioId: string, context: TContext = {} as TContext): void {
    const scenarioKey = this.repository.generateScenarioKey(skill, scenarioId);
    const scenario = this.repository.getScenarioByKey(scenarioKey, context);
    
    if (scenario) {
      // Use the existing private method to queue the rendered scenario briefing
      this.queueRenderedScenarioBriefing(scenario, undefined);
    } else {
      throw new Error(`Cannot queue scenario briefing. Scenario '${scenarioKey}' not found.`);
    }
  }

  /**
   * Queue briefing message to be sent with next message
   */
  private queueRenderedScenarioBriefing(
    scenario: RenderedScenario,
    flow?: IScenarioFlow,
  ): void {
    // Start building the briefing message
    let briefingMessage = this.getBriefingIntroMessage(scenario, flow);
    
    // Optionally add scenario preamble
    const scenarioPreamble = this.getScenarioPreamble(scenario);
    if (scenarioPreamble) {
      briefingMessage += `\n\n${scenarioPreamble}`;
    }
    
    // Always conclude the briefing
    briefingMessage += `\n\nYou will now receive tasks one by one. Complete each task thoroughly before moving to the next and don't jump ahead.`;
    briefingMessage += `\n\n=== END BRIEFING ===`;
    
    this.queueMessage(briefingMessage);
  }
  
  /**
   * Build the base briefing message
   */
  private getBriefingIntroMessage(scenario: RenderedScenario, flow?: IScenarioFlow): string {
    return `=== BEGIN BRIEFING ===

Listen to your briefing and acknowledge before proceeding.

# Scenario Overview

You are about to execute a structured sequence of tasks taken from the following template:

<scenario>${scenario.id} : ${scenario.title}</scenario>

<tasks>
${scenario.tasks.map(t => ' - ' + t.id + ' ' + t.title).join("\n")}
</tasks>

Tasks will be following a ${flow?.name() || 'controlled flow'}. ${flow?.description() || 'Be ready to execute tasks in arbitrary order.'}

Keep this overview in mind to proceed with one task at a time when you're instructed to do so.`;
  }

  /**
   * Build the base briefing message
   */
  private getGoalContextMessage(wbsId: string, goals: WbsTaskContext): string {
    return `=== GOAL CONTEXT START ===

The purpose of this task is to complete your next WBS goal.

**WBS document ID:** '${wbsId}'

# Task Goal Reference

 - Goal ID: '${goals.task.id}'
 - Description: '${goals.task.description}'
 - Status: ${goals.task.status}

# Parent Goals
 - Skill-level Goal: [${goals.skill?.status}] ${goals.skill?.description}
   - Scenario-level Goal: [${goals.scenario?.status}] ${goals.scenario?.description}
     > Task Goal: ${goals.task.id}

${
  goals.task.instructions ? 
  "\n# Goal Instructions\n\n" + goals.task.instructions.comments + "\n":
  "\nNo additional goal instructions were provided\n"
}${
  goals.precedingTasks.length > 0 ? 
  "\n# Preceding Tasks (already processed)\n" + goals.precedingTasks.map(t => ` - [${t.status}] ${t.description}`).join("\n") + "\n":
  "\nThis is the first task of the scenario.\n"
}${
  goals.followingTasks.length > 0 ? 
  "\n# Later Tasks (wait with these until instructed)\n" + goals.followingTasks.map(t => ` - [${t.status}] ${t.description}`).join("\n") + "\n":
  "\nThis is the final task of the scenario.\n"
}${
  goals.task.notes.length > 0 ?
  "\n# Additional Notes\n\n" + goals.task.notes.map((n, i) => `**Note ${i+1}:**\n<note>\n  <author>${n.author}</author>\n\n${n.note}\n</note>\n`).join("\n") :
  "\nNo additional notes were provided.\n"
}


=== GOAL CONTEXT END ===
`;
  }
  
  /**
   * Get scenario preamble if it exists
   */
  private getScenarioPreamble(scenario: RenderedScenario): string | null {
    if (scenario.preamble && scenario.preamble.trim().length > 0) {
      return `# Scenario Instructions\n\n${scenario.preamble}`;
    }
    return null;
  }
  
  /**
   * Queue a message to be sent with the next sendMessage call
   * @param message The message to queue
   */
  public queueMessage(message: string): void {
    if (message && message.trim().length > 0) {
      this.messageQueue.push(message);
    }
  }

  /**
   * Clear the message queue without sending
   */
  public clearMessageQueue(): void {
    this.messageQueue = [];
  }

  /**
   * Get the current queue size
   */
  public getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Send a message to the agent and capture the session ID if needed
   * Automatically prepends any queued messages and clears the queue
   * @param message The message to send
   * @param maxTurns Maximum number of turns for the message exchange
   * @returns The response from the agent
   */
  public async sendMessage(
    message: string,
    maxTurns: number = 5,
    captureSession: boolean = true,
  ): Promise<{ response: string; sessionId?: string }> {

    // Combine queued messages with the current message
    let fullMessage = message;
    if (this.messageQueue.length > 0) {
      fullMessage = this.messageQueue.join('\n\n') + '\n\n' + message;
      this.messageQueue = [];
    }

    const result = await this.agent.sendMessage(fullMessage, this.sessionId || undefined, { maxTurns });
    
    // Capture sessionId from the response if we don't have one yet
    if (captureSession && result.sessionId) {
      //console.log("-- SETTING SESSION ID --", result);
      this.sessionId = result.sessionId;
    }
    
    return result;
  }

  /**
   * End the current session
   */
  public async endSession(): Promise<void> {
    if (this.sessionId) {
      //console.log("-- ENDING SESSION ID --", this.sessionId);
      // Call the brain's endSession if available
      if (this.agent.endSession) {
        await this.agent.endSession(this.sessionId);
      }
      this.sessionId = null;
    }
  }

  public async continueSession(sessionId: string): Promise<void> {
    if (this.sessionId && this.sessionId !== sessionId) {
      await this.endSession();
    }

    this.sessionId = sessionId;
  }
  
  /**
   * Get the current session ID
   */
  public getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Helper method to create a SequentialFlow for a scenario
   * @param scenarioKey The key or path to the scenario document
   * @param context Context object to pass to template functions
   * @returns A new SequentialFlow instance for the scenario
   * 
   * @deprecated
   */
  public createSequentialFlow<TContext = any>(
    scenarioKey: string,
    context: TContext = {} as TContext
  ): SequentialScenarioFlow {
    const scenario = this.repository.getScenarioByKey(scenarioKey, context);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioKey}`);
    }
    return new SequentialScenarioFlow(scenario);
  }

  /**
   * Check if repository is loaded
   */
  public isReady(): boolean {
    return this.repository.isLoaded();
  }

  /**
   * Get the repository instance for direct access if needed
   */
  public getRepository(): ISkillsRepository {
    return this.repository;
  }
}