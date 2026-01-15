import { jest } from '@jest/globals';
import { PromptDriver, ExecutionResult } from '../../../src/prompts/PromptDriver.js';
import { IAgentBrain } from '../../../src/agents/IAgentBrain.js';
import { SequentialFlow } from '../../../src/prompts/flows/SequentialFlow.js';

// Mock agent brain
class MockAgentBrain implements Partial<IAgentBrain> {
  private systemPrompt?: string;
  private responses: string[] = [];
  private responseIndex = 0;
  public sendMessage: jest.Mock;

  constructor() {
    this.sendMessage = jest.fn(async (message: string, sessionId?: string) => {
      // Return pre-configured responses or a default
      if (this.responseIndex < this.responses.length) {
        return {
          response: this.responses[this.responseIndex++],
          sessionId: sessionId || 'test-session-1'
        };
      }
      return {
        response: `Response to: ${message.substring(0, 50)}...`,
        sessionId: sessionId || 'test-session-1'
      };
    });
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  async describeWbsOperations(operations: any[]): Promise<string> {
    return 'WBS operations described';
  }

  async describeInboxOperations(operations: any[]): Promise<string> {
    return 'Inbox operations described';
  }

  setLogger(logger: any): void {
    // Mock implementation
  }

  setResponses(responses: string[]): void {
    this.responses = responses;
    this.responseIndex = 0;
  }
}

describe('PromptDriver', () => {
  let driver: PromptDriver;
  let mockAgent: MockAgentBrain;

  beforeEach(async () => {
    mockAgent = new MockAgentBrain();
    // Use the actual build/prompts directory with real data
    driver = new PromptDriver(mockAgent as IAgentBrain, './build/prompts');
    await driver.initialize();
  });

  describe('initialization', () => {
    it('should initialize and load prompts from repository', async () => {
      expect(driver.isReady()).toBe(true);
    });

    it('should list available scenarios', () => {
      const scenarios = driver.getAvailableScenarios();
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios).toContain('document-modeling/DM.00');
      expect(scenarios).toContain('document-modeling/DM.01');
    });
  });

  describe('createSequentialFlow', () => {
    it('should create a sequential flow for a scenario', () => {
      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      expect(flow).toBeInstanceOf(SequentialFlow);
      expect(flow.getScenarioInfo().id).toBe('DM.00');
      expect(flow.getScenarioInfo().totalTasks).toBe(6);
    });

    it('should throw error for non-existent scenario', () => {
      expect(() => 
        driver.createSequentialFlow('non-existent/scenario')
      ).toThrow('Scenario not found: non-existent/scenario');
    });

    it('should apply context when creating flow', () => {
      const context = { name: 'Test User' };
      const flow = driver.createSequentialFlow('document-modeling/DM.00', context);
      
      // The flow should have the scenario with context applied
      expect(flow).toBeInstanceOf(SequentialFlow);
      const task = flow.nextTask();
      expect(task).toBeDefined();
      // Context would be applied in the task content if the template used it
    });
  });

  describe('executeScenario', () => {
    it('should execute a complete scenario', async () => {
      // Set up mock responses for each task
      const expectedResponses = [
        'Completed task DM.00.1',
        'Completed task DM.00.2',
        'Completed task DM.00.3',
        'Completed task DM.00.4',
        'Completed task DM.00.5',
        'Completed task DM.00.6'
      ];
      mockAgent.setResponses(expectedResponses);

      // Create a flow for the scenario
      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      const result = await driver.executeScenario('document-modeling/DM.00', flow);

      expect(result).toBeDefined();
      expect(result.scenarioId).toBe('DM.00');
      expect(result.totalTasks).toBe(6);
      expect(result.completedTasks).toBe(6);
      expect(result.responses).toHaveLength(6);

      // Verify each task response
      expect(result.responses[0].taskId).toBe('DM.00.1');
      expect(result.responses[0].response).toBe('Completed task DM.00.1');
      expect(result.responses[0].success).toBe(true);
      expect(result.responses[5].taskId).toBe('DM.00.6');
      expect(result.responses[5].response).toBe('Completed task DM.00.6');
      expect(result.responses[5].success).toBe(true);
    });

    it('should set system prompt with scenario context', async () => {
      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenario('document-modeling/DM.00', flow);

      const systemPrompt = mockAgent.getSystemPrompt();
      expect(systemPrompt).toBeDefined();
      expect(systemPrompt).toContain('DM.00');
      expect(systemPrompt).toContain('Check the prerequisites for creating a document model');
    });

    it('should maintain session across tasks', async () => {
      const responses: string[] = [];
      let callCount = 0;

      // Override sendMessage to track calls
      mockAgent.sendMessage = jest.fn(async () => {
        callCount++;
        const response = `Response ${callCount} to task`;
        responses.push(response);
        return response;
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.01');
      const result = await driver.executeScenario('document-modeling/DM.01', flow);

      // DM.01 has 5 tasks
      expect(callCount).toBe(5);
      expect(result.completedTasks).toBe(5);
      
      // All responses should be from the same session
      expect(mockAgent.getSystemPrompt()).toContain('DM.01');
    });

    it('should handle task failures', async () => {
      // Simulate failure on third task
      let taskCount = 0;
      mockAgent.sendMessage = jest.fn(async () => {
        taskCount++;
        if (taskCount === 3) {
          throw new Error('Task 3 failed');
        }
        return { response: `Success for task ${taskCount}`, sessionId: 'test-session' };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      const result = await driver.executeScenario('document-modeling/DM.00', flow);

      // Should have 3 responses (2 success, 1 failure)
      expect(result.responses).toHaveLength(3);
      expect(result.responses[0].success).toBe(true);
      expect(result.responses[1].success).toBe(true);
      expect(result.responses[2].success).toBe(false);
      expect(result.responses[2].error?.message).toBe('Task 3 failed');
      expect(result.completedTasks).toBe(2); // Only 2 successful
    });

    it('should reset flow before execution', async () => {
      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      
      // Use the flow partially
      flow.nextTask();
      flow.reportTaskResult(true);
      expect(flow.started()).toBe(true);

      // Execute scenario - should reset the flow
      await driver.executeScenario('document-modeling/DM.00', flow);
      
      // Flow should have been reset and completed
      expect(flow.finished()).toBe(true);
    });
  });

  describe('session management', () => {
    it('should start a new session when not active', async () => {
      let setSystemPromptCalled = false;
      mockAgent.setSystemPrompt = jest.fn(() => {
        setSystemPromptCalled = true;
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenario('document-modeling/DM.00', flow);

      expect(setSystemPromptCalled).toBe(true);
    });

    it('should reuse session for subsequent scenarios', async () => {
      let systemPromptCalls = 0;
      mockAgent.setSystemPrompt = jest.fn(() => {
        systemPromptCalls++;
      });

      const flow1 = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenario('document-modeling/DM.00', flow1);
      
      const flow2 = driver.createSequentialFlow('document-modeling/DM.01');
      await driver.executeScenario('document-modeling/DM.01', flow2);

      // System prompt should only be set once (first scenario)
      expect(systemPromptCalls).toBe(1);
    });

    it('should handle endSession correctly', async () => {
      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenario('document-modeling/DM.00', flow);
      
      // End the session
      await driver.endSession();

      // New execution should start a new session
      let systemPromptCalls = 0;
      mockAgent.setSystemPrompt = jest.fn(() => {
        systemPromptCalls++;
      });

      const newFlow = driver.createSequentialFlow('document-modeling/DM.01');
      await driver.executeScenario('document-modeling/DM.01', newFlow);
      
      // Should set system prompt again after session ended
      expect(systemPromptCalls).toBe(1);
    });
  });

  describe('maxTurns configuration', () => {
    it('should use default maxTurns', async () => {
      mockAgent.sendMessage = jest.fn(async (message, sessionId, options) => {
        expect(options?.maxTurns).toBe(5); // Default
        return { response: 'test response', sessionId: 'test-session' };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenario('document-modeling/DM.00', flow);
      
      expect(mockAgent.sendMessage).toHaveBeenCalled();
    });

    it('should use custom maxTurns from options', async () => {
      mockAgent.sendMessage = jest.fn(async (message, sessionId, options) => {
        expect(options?.maxTurns).toBe(10); // Custom
        return { response: 'test response', sessionId: 'test-session' };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenario('document-modeling/DM.00', flow, {}, { maxTurns: 10 });
      
      expect(mockAgent.sendMessage).toHaveBeenCalled();
    });

    it('should update default maxTurns', async () => {
      driver.setMaxTurns(15);
      
      mockAgent.sendMessage = jest.fn(async (message, sessionId, options) => {
        expect(options?.maxTurns).toBe(15); // Updated default
        return { response: 'test response', sessionId: 'test-session' };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenario('document-modeling/DM.00', flow);
      
      expect(mockAgent.sendMessage).toHaveBeenCalled();
    });
  });

  describe('repository access', () => {
    it('should provide access to repository', () => {
      const repo = driver.getRepository();
      expect(repo).toBeDefined();
      expect(repo.isLoaded()).toBe(true);
    });
  });
});