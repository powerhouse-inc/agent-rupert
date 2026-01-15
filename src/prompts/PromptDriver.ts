import { IAgentBrain } from '../agents/IAgentBrain.js';
import { SkillsRepository } from './SkillsRepository.js';
import { RenderedScenario, RenderedScenarioTask } from './types.js';

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
  private repository: SkillsRepository;
  private agent: IAgentBrain;
  private sessionActive: boolean = false;
  private maxTurns: number = 5;  // Default maxTurns for message sending

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
   * Set the maximum number of turns for message exchanges
   * @param maxTurns Maximum number of turns to allow
   */
  setMaxTurns(maxTurns: number): void {
    this.maxTurns = maxTurns;
  }

  /**
   * Execute a complete scenario sequence with optional context
   * @param scenarioKey The key or path to the scenario document
   * @param context Context object to pass to template functions (optional)
   * @param options Optional execution options
   * @returns ExecutionResult with all task responses
   */
  async executeScenarioSequence<TScenarioContext = any>(
    scenarioKey: string, 
    context: TScenarioContext = {} as TScenarioContext,
    options?: { maxTurns?: number }
  ): Promise<ExecutionResult> {
    // Get the rendered scenario with context applied
    const scenario = this.repository.getScenarioByKey(scenarioKey, context);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioKey}`);
    }

    // Extract skill name from scenario key (e.g., "short-story-writing/SS.00" -> "short-story-writing")
    const skillName = scenarioKey.includes('/') ? scenarioKey.split('/')[0] : 'default';
    
    // Use provided maxTurns or fallback to instance default
    const maxTurns = options?.maxTurns ?? this.maxTurns;

    const responses: TaskResponse[] = [];

    try {
      // Start a new session if not active
      if (!this.sessionActive) {
        await this.startSessionWithContext(scenario, context, skillName);
      }

      // Execute each task sequentially (tasks are already rendered with context)
      for (const task of scenario.tasks) {
        const response = await this.executeRenderedTask(task, maxTurns);
        
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
   * Execute a rendered task (content is already a string)
   */
  private async executeRenderedTask(
    task: RenderedScenarioTask,
    maxTurns: number = 5
  ): Promise<string> {
    // Build the prompt for this task
    const taskPrompt = `## Task ${task.id}: ${task.title}\n\n${task.content}`;
    
    // Send to agent and get response
    if (!this.agent.sendMessage) {
      throw new Error('Agent does not support sendMessage method');
    }
    
    const result = await this.agent.sendMessage(taskPrompt, undefined, { maxTurns });
    
    return result.response;
  }


  /**
   * Start a new session with preamble and context
   */
  private async startSessionWithContext<TContext = any>(
    scenario: RenderedScenario, 
    context: TContext,
    skillName: string = 'default'
  ): Promise<void> {
    // Set system prompt with document context
    let systemPrompt = `You are executing a structured sequence of tasks from the "${scenario.id}" scenario.\n`;
    systemPrompt += `Scenario: ${scenario.title}\n\n`;

    systemPrompt = 
`
=== BEGIN BRIEFING ===

Listen to your briefing and acknowledge before proceeding. 

# Scenario Overview

After your briefing, you will be asked to execute a sequence 
of tasks from the following scenario:

<scenario>${scenario.id} : ${scenario.title}</scenario>

<tasks>
${scenario.tasks.map(t => ' - ' + t.id + ' ' + t.title).join("\n")}
</tasks>

Keep this overview in mind to proceed with one task at a time when 
you're instructed to do so.

`;
    
    if (scenario.preamble) {
      // Preamble is already rendered with context
      systemPrompt += `# Instructions\n\n${scenario.preamble}\n\n`;
    }
    
    systemPrompt += `You will now receive tasks one by one. Complete each task thoroughly before moving to the next.`;
    systemPrompt += `=== END BRIEFING ===`;
    
    // Set the system prompt (this maintains the session context)
    if (this.agent.setSystemPrompt) {
      this.agent.setSystemPrompt(systemPrompt);
    }
    
    // After setting system prompt, send skill preamble as a message if it exists
    const skillPreamble = this.repository.getSkillPreamble(skillName, context);
    if (skillPreamble && this.agent.sendMessage) {
      if (skillPreamble.trim().length > 0) {
        // Send skill preamble as first message with maxTurns
        await this.agent.sendMessage(skillPreamble, undefined, { maxTurns: this.maxTurns });
      }
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
   * Execute multiple scenario sequences in order with optional context
   */
  async executeMultipleSequences<TContext = any>(
    scenarioKeys: string[],
    context: TContext = {} as TContext
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    
    for (const key of scenarioKeys) {
      const result = await this.executeScenarioSequence(key, context);
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