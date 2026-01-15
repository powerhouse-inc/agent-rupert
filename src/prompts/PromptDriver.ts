import { IAgentBrain } from '../agents/IAgentBrain.js';
import { SkillsRepository } from './SkillsRepository.js';
import { RenderedScenario, RenderedScenarioTask } from './types.js';
import type { IScenarioFlow } from './flows/IScenarioFlow.js';
import { SequentialScenarioFlow } from './flows/SequentialFlow.js';

export interface ExecutionResult {
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
  private repository: SkillsRepository;
  private agent: IAgentBrain;
  private sessionId: string | null = null;
  private maxTurns: number = 5;  // Default maxTurns for message sending

  constructor(
    agent: IAgentBrain,
    // replace with repository: SkillsRepository
    repositoryPath: string = './build/prompts'
  ) {
    this.agent = agent;
    this.repository = new SkillsRepository(repositoryPath);
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

  async sendSkillPreamble<TContext = any>(skill: string, context: TContext) {
    const skillPreamble = this.repository.getSkillPreamble(skill, context);
    if (skillPreamble && skillPreamble.trim().length > 0) {
      await this.sendMessage(skillPreamble, this.maxTurns);
    }
  }

  /**
   * Execute a scenario using the provided flow
   * @param scenarioKey The key or path to the scenario document
   * @param flow The flow to use for execution
   * @param context Context object to pass to template functions (optional)
   * @param options Optional execution options including sessionId and maxTurns
   * @returns ExecutionResult with all task responses
   */
  async executeScenario<TScenarioContext = any>(
    scenarioKey: string,
    flow: IScenarioFlow,
    context: TScenarioContext = {} as TScenarioContext,
    options?: { maxTurns?: number; sessionId?: string }
  ): Promise<ExecutionResult> {
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
      // Always send the briefing (regardless of session state)
      await this.sendScenarioBriefing(scenario, flow, maxTurns);

      // Execute tasks using the flow
      let task = flow.nextTask();
      while (task !== null) {
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
  async executeTask(
    task: RenderedScenarioTask,
    options?: { 
      maxTurns?: number; 
      sessionId?: string; 
      captureSession?: boolean 
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
      const taskPrompt = `## Task ${task.id}: ${task.title}\n\n${task.content}`;
      
      // Send the task and optionally capture session
      const result = await this.sendMessage(taskPrompt, maxTurns, captureSession);
      
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
   * Send briefing message (always sent, regardless of session state)
   */
  private async sendScenarioBriefing(
    scenario: RenderedScenario,
    flow: IScenarioFlow,
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
    
    await this.sendMessage(briefingMessage, maxTurns);
  }
  
  /**
   * Build the base briefing message
   */
  private getBriefingIntroMessage(scenario: RenderedScenario, flow: IScenarioFlow): string {
    return `=== BEGIN BRIEFING ===

Listen to your briefing and acknowledge before proceeding.

# Scenario Overview

You are about to execute a structured sequence of tasks taken from the following scenario:

<scenario>${scenario.id} : ${scenario.title}</scenario>

<tasks>
${scenario.tasks.map(t => ' - ' + t.id + ' ' + t.title).join("\n")}
</tasks>

Tasks will be following a ${flow.name()}. ${flow.description()}

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
  private async sendMessage(
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
  async endSession(): Promise<void> {
    this.sessionId = null;
    // The agent brain maintains its own session lifecycle
    // We just clear our reference to the session
  }
  
  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Helper method to create a SequentialFlow for a scenario
   * @param scenarioKey The key or path to the scenario document
   * @param context Context object to pass to template functions
   * @returns A new SequentialFlow instance for the scenario
   */
  createSequentialFlow<TContext = any>(
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
   * Get available scenarios
   */
  getAvailableScenarios(): string[] {
    return this.repository.getAllMetadata().map(m => {
      return m.skill === 'default' ? m.id : `${m.skill}/${m.id}`;
    });
  }

  /**
   * Check if repository is loaded
   */
  isReady(): boolean {
    return this.repository.isLoaded();
  }

  /**
   * Get the repository instance for direct access if needed
   */
  getRepository(): SkillsRepository {
    return this.repository;
  }
}