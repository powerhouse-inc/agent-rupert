import { IAgentBrain } from '../agents/IAgentBrain.js';
import { ScenarioTemplate, ScenarioTaskTemplate } from './types.js';
import { SkillsRepository } from './SkillsRepository.js';
import {
  TaskExecutionState,
  TaskExecutionResult,
  BlockedReason,
  ProgressReport,
  ActivityLoopConfig,
  ExecutionCheckpoint,
  ActivityLoopCallbacks,
  TaskStatus
} from './ActivityLoopTypes.js';

/**
 * AgentActivityLoop manages the execution of scenario tasks with comprehensive
 * state management, progress tracking, and error handling
 */
export class AgentActivityLoop {
  private agent: IAgentBrain;
  private config: Required<ActivityLoopConfig>;
  private callbacks: ActivityLoopCallbacks;
  private repository: SkillsRepository | null = null;
  
  // State management
  private currentState: TaskExecutionState = TaskExecutionState.IDLE;
  private currentTask: ScenarioTaskTemplate | null = null;
  private currentScenario: ScenarioTemplate | null = null;
  private sessionContext: Map<string, any> = new Map();
  private completedTasks: Set<string> = new Set();
  private sessionId: string | undefined;  // Track session ID for conversation continuity
  private blockedTasks: Map<string, BlockedReason> = new Map();
  private taskResults: Map<string, TaskExecutionResult> = new Map();
  
  // Timing
  private loopStartTime: Date | null = null;
  private currentTaskStartTime: Date | null = null;
  
  // Progress tracking
  private progressReportTimer: NodeJS.Timeout | null = null;
  private checkpointTimer: NodeJS.Timeout | null = null;

  constructor(
    agent: IAgentBrain,
    config: ActivityLoopConfig = {},
    callbacks: ActivityLoopCallbacks = {},
    repository?: SkillsRepository
  ) {
    this.agent = agent;
    this.callbacks = callbacks;
    this.repository = repository || null;
    
    // Apply default configuration
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 2000,
      taskTimeout: config.taskTimeout ?? 300000, // 5 minutes default
      enableCheckpoints: config.enableCheckpoints ?? true,
      checkpointInterval: config.checkpointInterval ?? 60000, // 1 minute
      progressReportInterval: config.progressReportInterval ?? 10000 // 10 seconds
    };
  }

  /**
   * Initialize the activity loop with an agent
   */
  async initialize(scenario: ScenarioTemplate): Promise<void> {
    this.currentScenario = scenario;
    this.loopStartTime = new Date();
    this.setState(TaskExecutionState.IDLE);
    
    // Reset session for new scenario to start fresh conversation
    this.sessionId = undefined;
    
    // Start progress reporting if configured
    if (this.config.progressReportInterval > 0) {
      this.startProgressReporting();
    }
    
    // Start checkpoint saving if enabled
    if (this.config.enableCheckpoints && this.config.checkpointInterval > 0) {
      this.startCheckpointing();
    }
    
    // Append scenario prompt to existing agent profile
    if (this.agent.setSystemPrompt) {
      const existingPrompt = this.agent.getSystemPrompt ? this.agent.getSystemPrompt() : '';
      const scenarioPrompt = this.buildSystemPrompt(scenario);
      const combinedPrompt = existingPrompt ? `${existingPrompt}\n\n---\n\n${scenarioPrompt}` : scenarioPrompt;
      this.agent.setSystemPrompt(combinedPrompt);
    }
  }

  /**
   * Process all tasks in the scenario with optional context
   */
  async processScenario<TContext = any>(
    scenario: ScenarioTemplate, 
    context: TContext = {} as TContext
  ): Promise<ProgressReport> {
    await this.initialize(scenario);
    
    // Extract skill name from scenario ID (e.g., "SS.00" -> "short-story-writing")
    const skillMapping: Record<string, string> = {
      'SS': 'short-story-writing',
      'CD': 'character-development',
      'WB': 'worldbuilding'
    };
    const prefix = scenario.id.split('.')[0];
    const skillName = skillMapping[prefix];
    
    // Send skill preamble if available
    if (skillName && this.repository) {
      const preambleContent = this.repository.getSkillPreamble(skillName, context);
      if (preambleContent) {
        const result = await this.agent.sendMessage(preambleContent, this.sessionId);
        this.sessionId = result.sessionId;
      }
    }
    
    // Send scenario preamble if exists - continues the session with context
    if (scenario.preamble) {
      const result = await this.agent.sendMessage(scenario.preamble(context), this.sessionId);
      this.sessionId = result.sessionId;  // Capture session ID for subsequent tasks
    }
    
    // Process each task sequentially with context
    for (const task of scenario.tasks) {
      const result = await this.processTask(task, context);
      
      if (result.state === TaskExecutionState.FAILED && !this.shouldContinueOnFailure()) {
        break;
      }
      
      // Skip blocked task handling for now
    }
    
    return this.generateProgressReport();
  }

  /**
   * Process a single task with optional context
   */
  async processTask<TContext = any>(
    task: ScenarioTaskTemplate, 
    context: TContext = {} as TContext
  ): Promise<TaskExecutionResult> {
    this.currentTask = task;
    this.currentTaskStartTime = new Date();
    this.setState(TaskExecutionState.EXECUTING);
    
    // Notify callback
    if (this.callbacks.onTaskStart) {
      await this.callbacks.onTaskStart(task);
    }
    
    const result: TaskExecutionResult = {
      taskId: task.id,
      state: TaskExecutionState.EXECUTING,
      startTime: this.currentTaskStartTime,
      attempts: 0
    };
    
    // Attempt execution with retries
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      result.attempts = attempt;
      
      try {
        const taskResult = await this.executeTaskWithTimeout(task, context);
        
        if (taskResult.isComplete) {
          result.state = TaskExecutionState.COMPLETED;
          result.response = taskResult.response;
          result.endTime = new Date();
          this.completedTasks.add(task.id);
          
          if (this.callbacks.onTaskComplete) {
            await this.callbacks.onTaskComplete(task, result);
          }
          break;
        } else if (taskResult.isFailed) {
          throw taskResult.error || new Error('Task execution failed');
        }
        
      } catch (error) {
        result.error = error as Error;
        
        if (attempt === this.config.maxRetries) {
          result.state = TaskExecutionState.FAILED;
          result.endTime = new Date();
          
          if (this.callbacks.onTaskFailed) {
            await this.callbacks.onTaskFailed(task, error as Error);
          }
        } else {
          // Wait before retry
          await this.delay(this.config.retryDelay);
        }
      }
    }
    
    this.taskResults.set(task.id, result);
    this.setState(TaskExecutionState.IDLE);
    
    return result;
  }

  /**
   * Execute a task with timeout
   */
  private async executeTaskWithTimeout<TContext = any>(
    task: ScenarioTaskTemplate,
    context: TContext
  ): Promise<TaskStatus> {
    return new Promise<TaskStatus>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task ${task.id} timed out after ${this.config.taskTimeout}ms`));
      }, this.config.taskTimeout);
      
      try {
        const status = await this.executeTask(task, context);
        clearTimeout(timeout);
        resolve(status);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Execute a task and monitor for completion
   */
  private async executeTask<TContext = any>(
    task: ScenarioTaskTemplate,
    context: TContext
  ): Promise<TaskStatus> {
    // Build and send task prompt - use existing session to maintain conversation context
    const taskPrompt = this.buildTaskPrompt(task, context);
    const result = await this.agent.sendMessage(taskPrompt, this.sessionId);
    
    // Update session ID (in case it changed)
    this.sessionId = result.sessionId;
    
    // Analyze response for completion status
    const status = this.analyzeTaskResponse(result.response, task);
    
    return status;
  }

  /**
   * Analyze agent response to determine task status
   */
  private analyzeTaskResponse(response: string, _task: ScenarioTaskTemplate): TaskStatus {
    const status: TaskStatus = {
      isComplete: false,
      isBlocked: false,
      isFailed: false,
      response
    };
    
    const lowerResponse = response.toLowerCase();
    
    // Check for error/failure indicators
    const errorIndicators = [
      'error:',
      'failed:',
      'unable to',
      'cannot complete'
    ];
    
    if (errorIndicators.some(indicator => lowerResponse.includes(indicator))) {
      status.isFailed = true;
      status.error = new Error(response);
      return status;
    }
    
    // For any other non-empty response, consider it complete
    if (response && response.trim().length > 0) {
      status.isComplete = true;
    }
    
    return status;
  }

  /**
   * Build system prompt for the scenario
   */
  private buildSystemPrompt(scenario: ScenarioTemplate): string {
    return `You are executing a structured sequence of tasks from the "${scenario.id}" scenario.
Scenario: ${scenario.title}

CRITICAL INSTRUCTIONS:
- You must NEVER use any tools (no Write, Edit, Bash, or any other tools)
- Provide all responses as plain text or markdown directly in your message
- Do NOT attempt to write to files or execute commands
- Simply respond with the requested content as text

${scenario.preamble ? `Instructions:\n${scenario.preamble()}\n\n` : ''}
You will receive tasks one by one. Complete each task thoroughly before moving to the next.
Respond directly with the content requested. Do not use any tools.`;
  }

  /**
   * Build task prompt
   */
  private buildTaskPrompt<TContext = any>(task: ScenarioTaskTemplate, context: TContext): string {
    return `## Task ${task.id}: ${task.title}

${task.content(context)}

REMEMBER: Do NOT use any tools. Respond directly with the requested content as plain text or markdown.
Please complete this task by providing your response directly and indicate when you are finished.`;
  }

  /**
   * Generate progress report
   */
  generateProgressReport(): ProgressReport {
    const totalTasks = this.currentScenario?.tasks.length || 0;
    const completedTasks = this.completedTasks.size;
    const failedTasks = Array.from(this.taskResults.values())
      .filter(r => r.state === TaskExecutionState.FAILED).length;
    const blockedTasks = this.blockedTasks.size;
    
    return {
      scenarioId: this.currentScenario?.id || '',
      totalTasks,
      completedTasks,
      failedTasks,
      blockedTasks,
      currentTask: this.currentTask?.id,
      currentState: this.currentState,
      startTime: this.loopStartTime || new Date(),
      estimatedCompletion: this.estimateCompletion(),
      taskResults: new Map(this.taskResults)
    };
  }

  /**
   * Estimate completion time based on current progress
   */
  private estimateCompletion(): Date | undefined {
    if (!this.loopStartTime || !this.currentScenario) return undefined;
    
    const totalTasks = this.currentScenario.tasks.length;
    const completedTasks = this.completedTasks.size;
    
    if (completedTasks === 0) return undefined;
    
    const elapsedMs = Date.now() - this.loopStartTime.getTime();
    const avgTimePerTask = elapsedMs / completedTasks;
    const remainingTasks = totalTasks - completedTasks;
    const estimatedRemainingMs = avgTimePerTask * remainingTasks;
    
    return new Date(Date.now() + estimatedRemainingMs);
  }

  /**
   * Start progress reporting timer
   */
  private startProgressReporting(): void {
    this.progressReportTimer = setInterval(async () => {
      if (this.callbacks.onProgressUpdate) {
        const report = this.generateProgressReport();
        await this.callbacks.onProgressUpdate(report);
      }
    }, this.config.progressReportInterval);
  }

  /**
   * Start checkpoint saving timer
   */
  private startCheckpointing(): void {
    this.checkpointTimer = setInterval(async () => {
      await this.saveCheckpoint();
    }, this.config.checkpointInterval);
  }

  /**
   * Save execution checkpoint
   */
  async saveCheckpoint(): Promise<ExecutionCheckpoint> {
    const checkpoint: ExecutionCheckpoint = {
      scenarioId: this.currentScenario?.id || '',
      completedTasks: Array.from(this.completedTasks),
      currentTask: this.currentTask?.id,
      sessionContext: new Map(this.sessionContext),
      timestamp: new Date(),
      taskResults: new Map(this.taskResults)
    };
    
    // In a real implementation, this would persist to storage
    return checkpoint;
  }

  /**
   * Restore from checkpoint
   */
  async restoreFromCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    this.completedTasks = new Set(checkpoint.completedTasks);
    this.sessionContext = new Map(checkpoint.sessionContext);
    this.taskResults = new Map(checkpoint.taskResults);
    
    // Find the next task to execute
    if (this.currentScenario) {
      const nextTaskIndex = this.currentScenario.tasks.findIndex(
        task => !this.completedTasks.has(task.id)
      );
      
      if (nextTaskIndex >= 0) {
        this.currentTask = this.currentScenario.tasks[nextTaskIndex];
      }
    }
  }

  /**
   * Set the current execution state
   */
  private setState(newState: TaskExecutionState): void {
    const oldState = this.currentState;
    this.currentState = newState;
    
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(oldState, newState);
    }
  }

  /**
   * Check if execution should continue after failure
   */
  private shouldContinueOnFailure(): boolean {
    // Could be made configurable
    return false;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.progressReportTimer) {
      clearInterval(this.progressReportTimer);
      this.progressReportTimer = null;
    }
    
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }
    
    this.setState(TaskExecutionState.IDLE);
  }

  /**
   * Pause execution
   */
  pause(): void {
    this.setState(TaskExecutionState.PAUSED);
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.currentState === TaskExecutionState.PAUSED) {
      this.setState(TaskExecutionState.IDLE);
    }
  }

  /**
   * Get current state
   */
  getState(): TaskExecutionState {
    return this.currentState;
  }

  /**
   * Get current task
   */
  getCurrentTask(): ScenarioTaskTemplate | null {
    return this.currentTask;
  }
}