import { IAgentBrain } from '../agents/IAgentBrain.js';
import { SkillsRepository } from './SkillsRepository.js';
import { AgentActivityLoop } from './AgentActivityLoop.js';
import { ScenarioTemplate } from './types.js';
import {
  TaskExecutionState,
  ProgressReport,
  ActivityLoopConfig,
  ActivityLoopCallbacks,
  ExecutionCheckpoint,
  TaskExecutionResult
} from './ActivityLoopTypes.js';

/**
 * Enhanced execution result with detailed progress information
 */
export interface EnhancedExecutionResult {
  scenarioId: string;
  scenarioTitle: string;
  skill: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  startTime: Date;
  endTime: Date;
  duration: number; // in milliseconds
  taskResults: TaskExecutionResult[];
  finalState: TaskExecutionState;
  checkpoint?: ExecutionCheckpoint;
}

/**
 * Options for executing scenarios
 */
export interface ExecutionOptions {
  continueOnFailure?: boolean;
  saveCheckpoints?: boolean;
  progressCallback?: (report: ProgressReport) => void;
  verbose?: boolean;
}

/**
 * EnhancedPromptDriver uses AgentActivityLoop for sophisticated scenario execution
 * with state management, progress tracking, and error recovery
 */
export class EnhancedPromptDriver {
  private repository: SkillsRepository;
  private agent: IAgentBrain;
  private activityLoop: AgentActivityLoop | null = null;
  private checkpoints: Map<string, ExecutionCheckpoint> = new Map();

  constructor(agent: IAgentBrain, repositoryPath: string = './build/prompts') {
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
   * Execute a scenario with advanced features
   */
  async executeScenario(
    scenarioKey: string,
    options: ExecutionOptions = {}
  ): Promise<EnhancedExecutionResult> {
    // Load the scenario template (raw, not rendered)
    const scenario = this.repository.getScenarioTemplateInternal(scenarioKey);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioKey}`);
    }

    // Get metadata for skill information
    const metadata = this.repository.getScenarioMetadata(scenarioKey);
    
    // Configure the activity loop
    const loopConfig: ActivityLoopConfig = {
      maxRetries: 3,
      retryDelay: 2000,
      taskTimeout: 300000, // 5 minutes
      enableCheckpoints: options.saveCheckpoints ?? true,
      checkpointInterval: 30000, // 30 seconds
      progressReportInterval: options.verbose ? 5000 : 0
    };

    // Setup callbacks
    const callbacks: ActivityLoopCallbacks = {
      onProgressUpdate: options.progressCallback,
      onTaskStart: options.verbose ? (task) => {
        console.log(`Starting task ${task.id}: ${task.title}`);
      } : undefined,
      onTaskComplete: options.verbose ? (task, result) => {
        console.log(`Completed task ${task.id} in ${
          result.endTime ? (result.endTime.getTime() - result.startTime.getTime()) / 1000 : 0
        }s`);
      } : undefined,
      onTaskFailed: options.verbose ? (task, error) => {
        console.error(`Task ${task.id} failed:`, error.message);
      } : undefined,
      onTaskBlocked: options.verbose ? (task, reason) => {
        console.warn(`Task ${task.id} blocked: ${reason.reason}`);
      } : undefined
    };

    // Create and configure the activity loop
    this.activityLoop = new AgentActivityLoop(this.agent, loopConfig, callbacks);

    const startTime = new Date();

    try {
      // Check for existing checkpoint
      const existingCheckpoint = this.checkpoints.get(scenarioKey);
      if (existingCheckpoint && options.verbose) {
        console.log(`Resuming from checkpoint (${existingCheckpoint.completedTasks.length} tasks already completed)`);
        await this.activityLoop.restoreFromCheckpoint(existingCheckpoint);
      }

      // Execute the scenario
      const progressReport = await this.activityLoop.processScenario(scenario);
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Save final checkpoint if enabled
      let checkpoint: ExecutionCheckpoint | undefined;
      if (options.saveCheckpoints) {
        checkpoint = await this.activityLoop.saveCheckpoint();
        this.checkpoints.set(scenarioKey, checkpoint);
      }

      // Convert task results map to array
      const taskResults = Array.from(progressReport.taskResults.values());

      // Determine final state
      let finalState = TaskExecutionState.COMPLETED;
      if (progressReport.failedTasks > 0 && !options.continueOnFailure) {
        finalState = TaskExecutionState.FAILED;
      } else if (progressReport.blockedTasks > 0) {
        finalState = TaskExecutionState.BLOCKED;
      }

      return {
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        skill: metadata?.skill || 'default',
        totalTasks: progressReport.totalTasks,
        completedTasks: progressReport.completedTasks,
        failedTasks: progressReport.failedTasks,
        blockedTasks: progressReport.blockedTasks,
        startTime,
        endTime,
        duration,
        taskResults,
        finalState,
        checkpoint
      };

    } finally {
      // Cleanup the activity loop
      if (this.activityLoop) {
        await this.activityLoop.cleanup();
        this.activityLoop = null;
      }
    }
  }

  /**
   * Execute multiple scenarios in sequence
   */
  async executeMultipleScenarios(
    scenarioKeys: string[],
    options: ExecutionOptions = {}
  ): Promise<EnhancedExecutionResult[]> {
    const results: EnhancedExecutionResult[] = [];

    for (const key of scenarioKeys) {
      try {
        const result = await this.executeScenario(key, options);
        results.push(result);

        // Stop if scenario failed and continueOnFailure is false
        if (result.finalState === TaskExecutionState.FAILED && !options.continueOnFailure) {
          break;
        }
      } catch (error) {
        if (options.verbose) {
          console.error(`Failed to execute scenario ${key}:`, error);
        }
        if (!options.continueOnFailure) {
          throw error;
        }
      }
    }

    return results;
  }

  /**
   * Execute all scenarios in a skill
   */
  async executeSkillScenarios(
    skill: string,
    options: ExecutionOptions = {}
  ): Promise<EnhancedExecutionResult[]> {
    const scenarios = this.repository.getScenariosBySkill(skill);
    const scenarioKeys = scenarios.map(s => 
      this.repository.generateScenarioKey(skill, s.id)
    );

    return this.executeMultipleScenarios(scenarioKeys, options);
  }

  /**
   * Resume execution from a checkpoint
   */
  async resumeFromCheckpoint(
    scenarioKey: string,
    checkpoint: ExecutionCheckpoint,
    options: ExecutionOptions = {}
  ): Promise<EnhancedExecutionResult> {
    // Store the checkpoint
    this.checkpoints.set(scenarioKey, checkpoint);

    // Execute with the stored checkpoint
    return this.executeScenario(scenarioKey, options);
  }

  /**
   * Get the current execution state
   */
  getCurrentState(): TaskExecutionState | null {
    return this.activityLoop?.getState() || null;
  }

  /**
   * Pause current execution
   */
  pause(): void {
    this.activityLoop?.pause();
  }

  /**
   * Resume paused execution
   */
  resume(): void {
    this.activityLoop?.resume();
  }

  /**
   * Get available scenarios with metadata
   */
  getAvailableScenariosWithMetadata() {
    return this.repository.getAllMetadata().map(metadata => ({
      key: metadata.skill === 'default' ? metadata.id : `${metadata.skill}/${metadata.id}`,
      ...metadata
    }));
  }

  /**
   * Get scenario by key with full details
   */
  getScenarioDetails(scenarioKey: string) {
    const scenario = this.repository.getScenarioByKey(scenarioKey);
    const metadata = this.repository.getScenarioMetadata(scenarioKey);
    
    if (!scenario) return null;

    return {
      scenario,
      metadata,
      taskCount: scenario.tasks.length,
      estimatedDuration: scenario.tasks.length * 30000 // Rough estimate: 30s per task
    };
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints.clear();
  }

  /**
   * Get checkpoint for a scenario
   */
  getCheckpoint(scenarioKey: string): ExecutionCheckpoint | undefined {
    return this.checkpoints.get(scenarioKey);
  }

  /**
   * Check if repository is loaded
   */
  isReady(): boolean {
    return this.repository.isLoaded();
  }

  /**
   * Get the repository instance (for direct access if needed)
   */
  getRepository(): SkillsRepository {
    return this.repository;
  }
}