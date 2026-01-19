import { IAgentBrain } from '../agents/IAgentBrain.js';
import { SkillsRepository } from './SkillsRepository.js';
import type { ISkillsRepository } from './ISkillsRepository.js';
import { RenderedScenario, RenderedScenarioTask } from './types.js';
import type { IScenarioFlow } from './flows/IScenarioFlow.js';
import type { ISkillFlow, ScenarioResult } from './flows/ISkillFlow.js';
import { SequentialScenarioFlow } from './flows/SequentialScenarioFlow.js';

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
  responses: TaskResponse[];
}

export interface TaskResponse {
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
  private maxTurns: number = 5;  // Default maxTurns for message sending

  constructor(
    agent: IAgentBrain,
    repositoryOrPath: ISkillsRepository | string = './build/prompts'
  ) {
    this.agent = agent;
    if (typeof repositoryOrPath === 'string') {
      this.repository = new SkillsRepository(repositoryOrPath);
    } else {
      this.repository = repositoryOrPath;
    }
  }

  /**
   * Initialize the repository
   */
  async initialize(): Promise<void> {
    await this.repository.loadSkills();
  }

  /**
   * Set the maximum number of turns for message exchanges
   * @param maxTurns Maximum number of turns to allow
   */
  setMaxTurns(maxTurns: number): void {
    this.maxTurns = maxTurns;
  }

  /**
   * Get the maximum number of turns for message exchanges
   * @returns Current maxTurns setting
   */
  getMaxTurns(): number {
    return this.maxTurns;
  }

  async sendSkillPreamble<TContext = any>(skill: string, context: TContext) {
    const skillPreamble = this.repository.getSkillPreamble(skill, context);
    if (skillPreamble && skillPreamble.trim().length > 0) {
      await this.sendMessage(skillPreamble, this.maxTurns);
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
    const maxTurns = options?.maxTurns ?? this.maxTurns;
    
    // Use provided sessionId if available
    if (options?.sessionId) {
      this.sessionId = options.sessionId;
    }
    
    // Send skill preamble if requested (default: true)
    const sendPreamble = options?.sendSkillPreamble ?? true;
    if (sendPreamble) {
      await this.sendSkillPreamble(skill, context);
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
        console.log(`PromptDriver::executeSkillFlow - Starting scenario "${scenario.id} - ${scenario.title}"`);
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

          console.log(`PromptDriver::executeSkillFlow - Reporting scenario result: "${scenario.id} - ${scenario.title}"`);
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
      
      console.log(`PromptDriver::executeSkillFlow - Completed ${flow.getProgress().completedScenarios}/${flow.getProgress().totalScenarios} scenarios for skill ${skill}`);

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
    const maxTurns = options?.maxTurns ?? this.maxTurns;
    
    // Use provided sessionId if available
    if (options?.sessionId) {
      this.sessionId = options.sessionId;
    }

    const responses: TaskResponse[] = [];

    // Reset flow for new scenario
    flow.reset();

    try {
      console.log(`PromptDriver::executeScenarioFlow - Sending scenario briefing "${scenario.id} - ${scenario.title}"`);
      // Always send the briefing (regardless of session state)
      await this.sendRenderedScenarioBriefing(scenario, flow, maxTurns);

      // Execute tasks using the flow
      let task = flow.nextTask();
      while (task !== null) {
        console.log(`PromptDriver::executeScenarioFlow - Starting task "${task.id} - ${task.title}"`);
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

      console.log(`PromptDriver::executeScenarioFlow - Finished ${scenario.tasks.length} tasks for scenario "${scenario.id} - ${scenario.title}"`);

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
  public async executeTask(
    task: RenderedScenarioTask,
    options?: { 
      maxTurns?: number;
      sessionId?: string;
      captureSession?: boolean;
      preamble?: string;
    }
  ): Promise<TaskResponse> {
    // Use provided maxTurns or fallback to instance default
    const maxTurns = options?.maxTurns ?? this.maxTurns;
    
    // Use provided sessionId if available
    if (options?.sessionId) {
      this.sessionId = options.sessionId;
    }
    
    // Default to capturing session if not specified
    const captureSession = options?.captureSession ?? true;
    
    try {
      // Build the task prompt
      const taskPrompt: string[] = [
         `## Task ${task.id}: ${task.title}`,
         options?.preamble || '',
         task.content
      ];
      
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

  public async sendScenarioBriefing<TContext = any>(skill: string, scenarioId: string, context: TContext = {} as TContext): Promise<void> {
    const scenarioKey = this.repository.generateScenarioKey(skill, scenarioId);
    const scenario = this.repository.getScenarioByKey(scenarioKey, context);
    
    if (scenario) {
      // Use the existing private method to send the rendered scenario briefing
      await this.sendRenderedScenarioBriefing(scenario, undefined, this.maxTurns);
    } else {
      throw new Error(`Cannot send scenario briefing. Scenario '${scenarioKey}' not found.`);
    }
  }

  /**
   * Send briefing message (always sent, regardless of session state)
   */
  private async sendRenderedScenarioBriefing(
    scenario: RenderedScenario,
    flow?: IScenarioFlow,
    maxTurns: number = 5,
  ): Promise<void> {
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
    
    await this.sendMessage(briefingMessage, maxTurns || 5);
  }
  
  /**
   * Build the base briefing message
   */
  private getBriefingIntroMessage(scenario: RenderedScenario, flow?: IScenarioFlow): string {
    return `=== BEGIN BRIEFING ===

Listen to your briefing and acknowledge before proceeding.

# Scenario Overview

You are about to execute a structured sequence of tasks taken from the following scenario:

<scenario>${scenario.id} : ${scenario.title}</scenario>

<tasks>
${scenario.tasks.map(t => ' - ' + t.id + ' ' + t.title).join("\n")}
</tasks>

Tasks will be following a ${flow?.name() || 'controlled flow'}. ${flow?.description() || 'Be ready to execute tasks in arbitrary order.'}

Keep this overview in mind to proceed with one task at a time when you're instructed to do so.`;
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
   * Send a message to the agent and capture the session ID if needed
   * @param message The message to send
   * @param maxTurns Maximum number of turns for the message exchange
   * @returns The response from the agent
   */
  public async sendMessage(
    message: string,
    maxTurns: number = 5,
    captureSession: boolean = true,
  ): Promise<{ response: string; sessionId?: string }> {
    const result = await this.agent.sendMessage(message, this.sessionId || undefined, { maxTurns });
    
    // Capture sessionId from the response if we don't have one yet
    if (captureSession && result.sessionId) {
      this.sessionId = result.sessionId;
    }
    
    return result;
  }

  /**
   * End the current session
   */
  public async endSession(): Promise<void> {
    this.sessionId = null;
    // The agent brain maintains its own session lifecycle
    // We just clear our reference to the session
  }

  public continueSession(sessionId: string) {
    if (this.sessionId) {
      this.endSession();
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