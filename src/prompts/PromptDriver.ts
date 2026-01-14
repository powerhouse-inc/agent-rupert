import { IAgentBrain } from '../agents/IAgentBrain.js';
import { PromptRepository } from './PromptRepository.js';
import { PromptScenario, ScenarioTask } from './types.js';

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
}

export class PromptDriver {
  private repository: PromptRepository;
  private agent: IAgentBrain;
  private sessionActive: boolean = false;

  constructor(agent: IAgentBrain, repositoryPath: string = './build/prompts') {
    this.agent = agent;
    this.repository = new PromptRepository(repositoryPath);
  }

  /**
   * Initialize the repository
   */
  async initialize(): Promise<void> {
    await this.repository.load();
  }

  /**
   * Execute a complete scenario sequence
   * @param scenarioKey The key or path to the scenario document
   * @returns ExecutionResult with all task responses
   */
  async executeScenarioSequence(scenarioKey: string): Promise<ExecutionResult> {
    // Load the scenario document
    const scenario = this.repository.getScenario(scenarioKey);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioKey}`);
    }

    const responses: TaskResponse[] = [];

    try {
      // Start a new session if not active
      if (!this.sessionActive) {
        await this.startSession(scenario);
      }

      // Execute each task sequentially
      for (const task of scenario.tasks) {
        const response = await this.executeTask(task);
        
        responses.push({
          taskId: task.id,
          taskTitle: task.title,
          response,
          timestamp: new Date()
        });
      }

      return {
        scenarioId: scenario.id,
        totalTasks: scenario.tasks.length,
        completedTasks: responses.length,
        responses
      };
    } finally {
      // Keep session active for potential follow-up sequences
      // The session will be reused if another sequence is executed
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: ScenarioTask): Promise<string> {
    // Build the prompt for this task
    const taskPrompt = this.buildTaskPrompt(task);
    
    // Send to agent and get response
    if (!this.agent.sendMessage) {
      throw new Error('Agent does not support sendMessage method');
    }
    
    const result = await this.agent.sendMessage(taskPrompt);
    
    return result.response;
  }

  /**
   * Build prompt string for a task
   */
  private buildTaskPrompt(task: ScenarioTask): string {
    // Include task ID and title as context
    let prompt = `## Task ${task.id}: ${task.title}\n\n`;
    
    // Add the task content - call the function to render it
    prompt += task.content();
    
    return prompt;
  }

  /**
   * Start a new session with preamble if available
   */
  private async startSession(scenario: PromptScenario): Promise<void> {
    // Set system prompt with document context
    let systemPrompt = `You are executing a structured sequence of tasks from the "${scenario.id}" scenario.\n`;
    systemPrompt += `Scenario: ${scenario.title}\n\n`;
    
    if (scenario.preamble) {
      // Call the preamble function to render it
      systemPrompt += `Instructions:\n${scenario.preamble()}\n\n`;
    }
    
    systemPrompt += `You will receive tasks one by one. Complete each task thoroughly before moving to the next.`;
    
    // Set the system prompt (this maintains the session context)
    if (this.agent.setSystemPrompt) {
      this.agent.setSystemPrompt(systemPrompt);
    }
    
    this.sessionActive = true;
  }

  /**
   * End the current session
   */
  async endSession(): Promise<void> {
    this.sessionActive = false;
    // The agent brain maintains its own session lifecycle
    // We just track whether we've initialized it with our prompt context
  }

  /**
   * Execute multiple scenario sequences in order
   */
  async executeMultipleSequences(scenarioKeys: string[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    
    for (const key of scenarioKeys) {
      const result = await this.executeScenarioSequence(key);
      results.push(result);
    }
    
    return results;
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
}