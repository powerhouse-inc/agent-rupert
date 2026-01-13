import { IAgentBrain } from '../agents/IAgentBrain.js';
import { PromptRepository } from './PromptRepository.js';
import { PromptDocument, PromptTask } from './types.js';

export interface ExecutionResult {
  promptId: string;
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
   * Execute a complete prompt sequence
   * @param promptKey The key or path to the prompt document
   * @returns ExecutionResult with all task responses
   */
  async executePromptSequence(promptKey: string): Promise<ExecutionResult> {
    // Load the prompt document
    const promptDoc = this.repository.getPrompt(promptKey);
    if (!promptDoc) {
      throw new Error(`Prompt not found: ${promptKey}`);
    }

    const responses: TaskResponse[] = [];

    try {
      // Start a new session if not active
      if (!this.sessionActive) {
        await this.startSession(promptDoc);
      }

      // Execute each task sequentially
      for (const task of promptDoc.tasks) {
        const response = await this.executeTask(task);
        
        responses.push({
          taskId: task.id,
          taskTitle: task.title,
          response,
          timestamp: new Date()
        });
      }

      return {
        promptId: promptDoc.id,
        totalTasks: promptDoc.tasks.length,
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
  private async executeTask(task: PromptTask): Promise<string> {
    // Build the prompt for this task
    const taskPrompt = this.buildTaskPrompt(task);
    
    // Send to agent and get response
    if (!this.agent.sendMessage) {
      throw new Error('Agent does not support sendMessage method');
    }
    
    const response = await this.agent.sendMessage(taskPrompt);
    
    return response;
  }

  /**
   * Build prompt string for a task
   */
  private buildTaskPrompt(task: PromptTask): string {
    // Include task ID and title as context
    let prompt = `## Task ${task.id}: ${task.title}\n\n`;
    
    // Add the task content
    prompt += task.content;
    
    return prompt;
  }

  /**
   * Start a new session with preamble if available
   */
  private async startSession(promptDoc: PromptDocument): Promise<void> {
    // Set system prompt with document context
    let systemPrompt = `You are executing a structured sequence of tasks from the "${promptDoc.id}" prompt document.\n`;
    systemPrompt += `Document: ${promptDoc.title}\n\n`;
    
    if (promptDoc.preamble) {
      systemPrompt += `Instructions:\n${promptDoc.preamble}\n\n`;
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
   * Execute multiple prompt sequences in order
   */
  async executeMultipleSequences(promptKeys: string[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    
    for (const key of promptKeys) {
      const result = await this.executePromptSequence(key);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Get available prompts
   */
  getAvailablePrompts(): string[] {
    return this.repository.getAllMetadata().map(m => {
      return m.category === 'default' ? m.id : `${m.category}/${m.id}`;
    });
  }

  /**
   * Check if repository is loaded
   */
  isReady(): boolean {
    return this.repository.isLoaded();
  }
}