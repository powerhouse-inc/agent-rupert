import { IAgentBrain } from '../agents/IAgentBrain.js';
import { PromptScenario, ScenarioTask } from './types.js';
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
  
  // State management
  private currentState: TaskExecutionState = TaskExecutionState.IDLE;
  private currentTask: ScenarioTask | null = null;
  private currentScenario: PromptScenario | null = null;
  private sessionContext: Map<string, any> = new Map();
  private completedTasks: Set<string> = new Set();
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
    callbacks: ActivityLoopCallbacks = {}
  ) {
    this.agent = agent;
    this.callbacks = callbacks;
    
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
  async initialize(scenario: PromptScenario): Promise<void> {
    this.currentScenario = scenario;
    this.loopStartTime = new Date();
    this.setState(TaskExecutionState.IDLE);
    
    // Start progress reporting if configured
    if (this.config.progressReportInterval > 0) {
      this.startProgressReporting();
    }
    
    // Start checkpoint saving if enabled
    if (this.config.enableCheckpoints && this.config.checkpointInterval > 0) {
      this.startCheckpointing();
    }
    
    // Initialize agent session
    if (this.agent.setSystemPrompt) {
      const systemPrompt = this.buildSystemPrompt(scenario);
      this.agent.setSystemPrompt(systemPrompt);
    }
  }

  /**
   * Process all tasks in the scenario
   */
  async processScenario(scenario: PromptScenario): Promise<ProgressReport> {
    await this.initialize(scenario);
    
    // Send preamble if exists
    if (scenario.preamble && this.agent.sendMessage) {
      await this.agent.sendMessage(scenario.preamble);
    }
    
    // Process each task sequentially
    for (const task of scenario.tasks) {
      const result = await this.processTask(task);
      
      if (result.state === TaskExecutionState.FAILED && !this.shouldContinueOnFailure()) {
        break;
      }
      
      if (result.state === TaskExecutionState.BLOCKED) {
        // Wait for unblock or timeout
        await this.waitForUnblock(task);
      }
    }
    
    return this.generateProgressReport();
  }

  /**
   * Process a single task
   */
  async processTask(task: ScenarioTask): Promise<TaskExecutionResult> {
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
        const taskResult = await this.executeTaskWithTimeout(task);
        
        if (taskResult.isComplete) {
          result.state = TaskExecutionState.COMPLETED;
          result.response = taskResult.response;
          result.endTime = new Date();
          this.completedTasks.add(task.id);
          
          if (this.callbacks.onTaskComplete) {
            await this.callbacks.onTaskComplete(task, result);
          }
          break;
        } else if (taskResult.isBlocked) {
          result.state = TaskExecutionState.BLOCKED;
          result.blockedReason = {
            taskId: task.id,
            reason: taskResult.blockedReason || 'Unknown reason',
            timestamp: new Date()
          };
          this.blockedTasks.set(task.id, result.blockedReason);
          
          if (this.callbacks.onTaskBlocked) {
            await this.callbacks.onTaskBlocked(task, result.blockedReason);
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
  private async executeTaskWithTimeout(task: ScenarioTask): Promise<TaskStatus> {
    return new Promise<TaskStatus>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task ${task.id} timed out after ${this.config.taskTimeout}ms`));
      }, this.config.taskTimeout);
      
      try {
        const status = await this.executeTask(task);
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
  private async executeTask(task: ScenarioTask): Promise<TaskStatus> {
    if (!this.agent.sendMessage) {
      throw new Error('Agent does not support sendMessage');
    }
    
    // Build and send task prompt
    const taskPrompt = this.buildTaskPrompt(task);
    const response = await this.agent.sendMessage(taskPrompt);
    
    // Analyze response for completion status
    const status = this.analyzeTaskResponse(response, task);
    
    return status;
  }

  /**
   * Analyze agent response to determine task status
   */
  private analyzeTaskResponse(response: string, task: ScenarioTask): TaskStatus {
    const status: TaskStatus = {
      isComplete: false,
      isBlocked: false,
      isFailed: false,
      response
    };
    
    // Check for completion indicators
    const completionIndicators = [
      'completed',
      'finished',
      'done',
      'successfully',
      'created',
      'implemented',
      'added',
      'updated'
    ];
    
    const lowerResponse = response.toLowerCase();
    status.isComplete = completionIndicators.some(indicator => 
      lowerResponse.includes(indicator)
    );
    
    // Check for blocked indicators
    const blockedIndicators = [
      'blocked',
      'waiting for',
      'need input',
      'require clarification',
      'cannot proceed'
    ];
    
    if (blockedIndicators.some(indicator => lowerResponse.includes(indicator))) {
      status.isBlocked = true;
      status.blockedReason = this.extractBlockedReason(response);
    }
    
    // Check for failure indicators
    const failureIndicators = [
      'failed',
      'error',
      'unable to',
      'could not',
      'exception'
    ];
    
    if (!status.isComplete && failureIndicators.some(indicator => 
      lowerResponse.includes(indicator)
    )) {
      status.isFailed = true;
      status.error = new Error(`Task failed: ${response.substring(0, 200)}`);
    }
    
    // Default to complete if response seems substantial and no issues detected
    if (!status.isBlocked && !status.isFailed && response.length > 50) {
      status.isComplete = true;
    }
    
    return status;
  }

  /**
   * Extract blocked reason from response
   */
  private extractBlockedReason(response: string): string {
    // Try to extract the reason from common patterns
    const patterns = [
      /blocked\s+because\s+(.+)/i,
      /waiting\s+for\s+(.+)/i,
      /need\s+(.+)\s+to\s+proceed/i,
      /require\s+(.+)\s+from/i
    ];
    
    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return 'Task is blocked - manual intervention required';
  }

  /**
   * Wait for a blocked task to be unblocked
   */
  private async waitForUnblock(task: ScenarioTask): Promise<void> {
    // In a real implementation, this would wait for external input
    // For now, we'll just wait a bit and continue
    await this.delay(5000);
    this.blockedTasks.delete(task.id);
  }

  /**
   * Build system prompt for the scenario
   */
  private buildSystemPrompt(scenario: PromptScenario): string {
    return `You are executing a structured sequence of tasks from the "${scenario.id}" scenario.
Scenario: ${scenario.title}

${scenario.preamble ? `Instructions:\n${scenario.preamble}\n\n` : ''}
You will receive tasks one by one. Complete each task thoroughly before moving to the next.
Indicate clearly when a task is completed or if you are blocked and need additional input.`;
  }

  /**
   * Build task prompt
   */
  private buildTaskPrompt(task: ScenarioTask): string {
    return `## Task ${task.id}: ${task.title}

${task.content}

Please complete this task and indicate when you are finished.`;
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
  getCurrentTask(): ScenarioTask | null {
    return this.currentTask;
  }
}