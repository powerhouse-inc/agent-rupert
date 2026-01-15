import { ScenarioTaskTemplate } from './types.js';

/**
 * Execution states for the activity loop
 */
export enum TaskExecutionState {
  IDLE = 'IDLE',                 // No task currently executing
  EXECUTING = 'EXECUTING',       // Task sent to agent, awaiting completion
  BLOCKED = 'BLOCKED',           // Waiting for stakeholder input
  COMPLETED = 'COMPLETED',       // Task successfully completed
  FAILED = 'FAILED',             // Task execution failed
  PAUSED = 'PAUSED'              // Execution paused by user
}

/**
 * Reason for a blocked task
 */
export interface BlockedReason {
  taskId: string;
  reason: string;
  requiredInput?: string;
  timestamp: Date;
}

/**
 * Result of a task execution
 */
export interface TaskExecutionResult {
  taskId: string;
  state: TaskExecutionState;
  response?: string;
  error?: Error;
  startTime: Date;
  endTime?: Date;
  attempts: number;
  blockedReason?: BlockedReason;
}

/**
 * Progress report for the entire scenario
 */
export interface ProgressReport {
  scenarioId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  currentTask?: string;
  currentState: TaskExecutionState;
  startTime: Date;
  estimatedCompletion?: Date;
  taskResults: Map<string, TaskExecutionResult>;
}

/**
 * Activity loop configuration
 */
export interface ActivityLoopConfig {
  maxRetries?: number;              // Maximum retries for failed tasks
  retryDelay?: number;              // Delay between retries in ms
  taskTimeout?: number;             // Timeout for individual tasks in ms
  enableCheckpoints?: boolean;      // Enable checkpoint saving
  checkpointInterval?: number;      // Interval for saving checkpoints in ms
  progressReportInterval?: number;  // Interval for progress reports in ms
}

/**
 * Checkpoint data for resuming execution
 */
export interface ExecutionCheckpoint {
  scenarioId: string;
  completedTasks: string[];
  currentTask?: string;
  sessionContext: Map<string, any>;
  timestamp: Date;
  taskResults: Map<string, TaskExecutionResult>;
}

/**
 * Callback functions for activity loop events
 */
export interface ActivityLoopCallbacks {
  onTaskStart?: (task: ScenarioTaskTemplate) => void | Promise<void>;
  onTaskComplete?: (task: ScenarioTaskTemplate, result: TaskExecutionResult) => void | Promise<void>;
  onTaskFailed?: (task: ScenarioTaskTemplate, error: Error) => void | Promise<void>;
  onTaskBlocked?: (task: ScenarioTaskTemplate, reason: BlockedReason) => void | Promise<void>;
  onProgressUpdate?: (report: ProgressReport) => void | Promise<void>;
  onStateChange?: (oldState: TaskExecutionState, newState: TaskExecutionState) => void | Promise<void>;
}

/**
 * Task status from monitoring
 */
export interface TaskStatus {
  isComplete: boolean;
  isBlocked: boolean;
  isFailed: boolean;
  response?: string;
  error?: Error;
  blockedReason?: string;
}