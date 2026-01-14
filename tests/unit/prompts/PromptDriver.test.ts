import { jest } from '@jest/globals';
import { PromptDriver, ExecutionResult } from '../../../src/prompts/PromptDriver.js';
import { IAgentBrain } from '../../../src/agents/IAgentBrain.js';

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

  describe('executeScenarioSequence', () => {
    it('should execute a complete scenario sequence', async () => {
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

      const result = await driver.executeScenarioSequence('document-modeling/DM.00');

      expect(result).toBeDefined();
      expect(result.scenarioId).toBe('DM.00');
      expect(result.totalTasks).toBe(6);
      expect(result.completedTasks).toBe(6);
      expect(result.responses).toHaveLength(6);

      // Verify each task response
      expect(result.responses[0].taskId).toBe('DM.00.1');
      expect(result.responses[0].response).toBe('Completed task DM.00.1');
      expect(result.responses[5].taskId).toBe('DM.00.6');
      expect(result.responses[5].response).toBe('Completed task DM.00.6');
    });

    it('should set system prompt with scenario context', async () => {
      await driver.executeScenarioSequence('document-modeling/DM.00');

      const systemPrompt = mockAgent.getSystemPrompt();
      expect(systemPrompt).toBeDefined();
      expect(systemPrompt).toContain('DM.00');
      expect(systemPrompt).toContain('Check the prerequisites for creating a document model');
    });

    it('should throw error for non-existent scenario', async () => {
      await expect(
        driver.executeScenarioSequence('non-existent/scenario')
      ).rejects.toThrow('Scenario not found: non-existent/scenario');
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

      const result = await driver.executeScenarioSequence('document-modeling/DM.01');

      // DM.01 has 5 tasks
      expect(callCount).toBe(5);
      expect(result.completedTasks).toBe(5);
      
      // All responses should be from the same session
      expect(mockAgent.getSystemPrompt()).toContain('DM.01');
    });
  });

  describe('executeMultipleSequences', () => {
    it('should execute multiple scenario sequences in order', async () => {
      const responses: string[] = [];
      
      mockAgent.sendMessage = jest.fn(async () => {
        const response = `Completed: task`;
        responses.push(response);
        return response;
      });

      const results = await driver.executeMultipleSequences([
        'document-modeling/DM.00',
        'document-modeling/DM.01'
      ]);

      expect(results).toHaveLength(2);
      
      // First sequence (DM.00)
      expect(results[0].scenarioId).toBe('DM.00');
      expect(results[0].completedTasks).toBe(6);
      
      // Second sequence (DM.01)
      expect(results[1].scenarioId).toBe('DM.01');
      expect(results[1].completedTasks).toBe(5);
      
      // Total tasks executed
      expect(responses).toHaveLength(11);
    });

    it('should maintain session across multiple sequences', async () => {
      let systemPromptCalls = 0;
      
      mockAgent.setSystemPrompt = jest.fn(() => {
        systemPromptCalls++;
      });

      await driver.executeMultipleSequences([
        'document-modeling/DM.00',
        'document-modeling/DM.01'
      ]);

      // System prompt is only set once for the first sequence
      // The session continues without resetting for subsequent sequences
      expect(systemPromptCalls).toBe(1);
    });
  });

  describe('task execution', () => {
    it('should format task prompts correctly', async () => {
      const capturedMessages: string[] = [];
      
      mockAgent.sendMessage = jest.fn(async (message: string) => {
        capturedMessages.push(message);
        return 'Task completed';
      });

      await driver.executeScenarioSequence('document-modeling/DM.00');

      // Check first task prompt format
      expect(capturedMessages[0]).toContain('## Task DM.00.1:');
      expect(capturedMessages[0]).toContain('Ensure you have the required input and context');
      
      // Check that task content is included
      expect(capturedMessages[0]).toContain('Ensure you know who the stakeholder is');
    });

    it('should include timestamps in responses', async () => {
      const beforeTime = new Date();
      
      const result = await driver.executeScenarioSequence('document-modeling/DM.01');
      
      const afterTime = new Date();

      result.responses.forEach(response => {
        expect(response.timestamp).toBeInstanceOf(Date);
        expect(response.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        expect(response.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      });
    });
  });

  describe('skill preambles', () => {
    it('should inject skill preamble when executing scenario', async () => {
      const context = { character: 'Alice' };
      
      // Capture the messages sent to the agent
      const capturedMessages: string[] = [];
      mockAgent.sendMessage = jest.fn(async (message: string) => {
        capturedMessages.push(message);
        return { response: 'Task completed', sessionId: 'test-session' };
      });
      
      // Execute a scenario from short-story-writing skill which has a preamble
      const result = await driver.executeScenarioSequence(
        'short-story-writing/SS.00',
        context
      );
      
      expect(result).toBeDefined();
      expect(mockAgent.sendMessage).toHaveBeenCalled();
      
      // First message should be the skill preamble
      const firstMessage = capturedMessages[0];
      expect(firstMessage).toContain('Name your main character "Alice"');
    });
    
    it('should work for scenarios in skills without preambles', async () => {
      const context = {};
      
      // Execute a scenario from a skill without preamble
      const result = await driver.executeScenarioSequence(
        'document-modeling/DM.00',
        context
      );
      
      expect(result).toBeDefined();
      expect(result.completedTasks).toBeGreaterThan(0);
    });
  });
  
  describe('executeScenarioSequence with context', () => {
    it('should pass context to template functions', async () => {
      const context = {
        projectName: 'TestProject',
        userName: 'TestUser',
        timestamp: new Date().toISOString()
      };

      // Capture the messages sent to the agent
      const capturedMessages: string[] = [];
      mockAgent.sendMessage = jest.fn(async (message: string) => {
        capturedMessages.push(message);
        return { response: 'Task completed', sessionId: 'test-session' };
      });

      const result = await driver.executeScenarioSequence(
        'document-modeling/DM.00',
        context
      );

      expect(result).toBeDefined();
      expect(result.scenarioId).toBe('DM.00');
      expect(mockAgent.sendMessage).toHaveBeenCalled();
    });

    it('should work with typed context', async () => {
      interface MyContext {
        projectName: string;
        version: number;
        features: string[];
      }

      const context: MyContext = {
        projectName: 'TypedProject',
        version: 1,
        features: ['feature1', 'feature2']
      };

      const result = await driver.executeScenarioSequence<MyContext>(
        'document-modeling/DM.00',
        context
      );

      expect(result).toBeDefined();
      expect(result.completedTasks).toBeGreaterThan(0);
    });

    it('should work without context (backward compatibility)', async () => {
      const result = await driver.executeScenarioSequence('document-modeling/DM.00');
      
      expect(result).toBeDefined();
      expect(result.scenarioId).toBe('DM.00');
      expect(result.completedTasks).toBeGreaterThan(0);
    });
  });

  describe('executeMultipleSequences with context', () => {
    it('should execute multiple sequences with shared context', async () => {
      const context = { sharedData: 'test' };
      
      const results = await driver.executeMultipleSequences(
        ['document-modeling/DM.00', 'document-modeling/DM.01'],
        context
      );

      expect(results).toHaveLength(2);
      expect(results[0].scenarioId).toBe('DM.00');
      expect(results[1].scenarioId).toBe('DM.01');
    });

    it('should work without context', async () => {
      const results = await driver.executeMultipleSequences([
        'document-modeling/DM.00', 
        'document-modeling/DM.01'
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].scenarioId).toBe('DM.00');
      expect(results[1].scenarioId).toBe('DM.01');
    });
  });

  describe('error handling', () => {
    it('should handle agent errors gracefully', async () => {
      mockAgent.sendMessage = jest.fn().mockRejectedValueOnce(new Error('Agent error'));

      await expect(
        driver.executeScenarioSequence('document-modeling/DM.00')
      ).rejects.toThrow('Agent error');
    });
  });
});