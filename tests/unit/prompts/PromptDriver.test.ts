import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PromptDriver, ExecutionResult } from '../../../src/prompts/PromptDriver.js';
import { IAgentBrain } from '../../../src/agents/IAgentBrain.js';
import { SequentialScenarioFlow } from '../../../src/prompts/flows/SequentialScenarioFlow.js';
import { SkillsRepository } from '../../../src/prompts/SkillsRepository.js';
import { DefaultConsoleLogger } from '../../../src/logging/ILogger.js';

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
  let repository: SkillsRepository;
  let logger: DefaultConsoleLogger;

  beforeEach(async () => {
    mockAgent = new MockAgentBrain();
    // Use the actual build/prompts directory with real data
    repository = new SkillsRepository('./build/prompts');
    logger = new DefaultConsoleLogger();
    driver = new PromptDriver(mockAgent as IAgentBrain, repository, logger);
    await driver.initialize();
  });

  describe('initialization', () => {
    it('should initialize and load prompts from repository', async () => {
      expect(driver.isReady()).toBe(true);
    });
  });

  describe('createSequentialFlow', () => {
    it('should create a sequential flow for a scenario', () => {
      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      expect(flow).toBeInstanceOf(SequentialScenarioFlow);
      expect(flow.getScenarioInfo().id).toBe('DM.00');
      expect(flow.getScenarioInfo().totalTasks).toBe(5);
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
      expect(flow).toBeInstanceOf(SequentialScenarioFlow);
      const task = flow.nextTask();
      expect(task).toBeDefined();
      // Context would be applied in the task content if the template used it
    });
  });

  describe('executeScenarioFlow', () => {
    it('should execute a complete scenario', async () => {
      // Set up mock responses for each task (briefing is now queued with first task)
      const expectedResponses = [
        'Completed task DM.00.1',  // First task response (includes briefing)
        'Completed task DM.00.2',
        'Completed task DM.00.3',
        'Completed task DM.00.4',
        'Completed task DM.00.5'
      ];
      mockAgent.setResponses(expectedResponses);

      // Create a flow for the scenario
      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      const result = await driver.executeScenarioFlow('document-modeling/DM.00', flow);

      expect(result).toBeDefined();
      expect(result.scenarioId).toBe('DM.00');
      expect(result.totalTasks).toBe(5);
      expect(result.completedTasks).toBe(5);
      expect(result.responses).toHaveLength(5);

      // Verify each task response
      expect(result.responses[0].taskId).toBe('DM.00.1');
      expect(result.responses[0].response).toBe('Completed task DM.00.1');
      expect(result.responses[0].success).toBe(true);
      expect(result.responses[4].taskId).toBe('DM.00.5');
      expect(result.responses[4].response).toBe('Completed task DM.00.5');
      expect(result.responses[4].success).toBe(true);
    });

    it('should send briefing message with scenario context', async () => {
      let briefingMessage: string | undefined;
      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        if (message.includes('BEGIN BRIEFING')) {
          briefingMessage = message;
        }
        return { response: 'acknowledged', sessionId: sessionId || 'test-session' };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenarioFlow('document-modeling/DM.00', flow);

      expect(briefingMessage).toBeDefined();
      expect(briefingMessage).toContain('DM.00');
      expect(briefingMessage).toContain('Check the prerequisites for creating a document model');
      expect(briefingMessage).toContain('BEGIN BRIEFING');
      expect(briefingMessage).toContain('END BRIEFING');
    });

    it('should maintain session across tasks', async () => {
      const responses: string[] = [];
      let callCount = 0;

      // Override sendMessage to track calls
      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        callCount++;
        const response = `Response ${callCount} to task`;
        responses.push(response);
        return { response, sessionId: sessionId || 'test-session' };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.01');
      const result = await driver.executeScenarioFlow('document-modeling/DM.01', flow);

      // DM.01 has 4 tasks (briefing is now queued with first task)
      expect(callCount).toBe(4);
      expect(result.completedTasks).toBe(4);
    });

    it('should handle task failures', async () => {
      // Simulate failure on fourth task (briefing is now queued with first task)
      let messageCount = 0;
      mockAgent.sendMessage = jest.fn(async () => {
        messageCount++;
        if (messageCount === 4) {  // 4th task
          throw new Error('Task 4 failed');
        }
        return { response: `Success for message ${messageCount}`, sessionId: 'test-session' };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      const result = await driver.executeScenarioFlow('document-modeling/DM.00', flow);

      // Should have 4 responses (3 success, 1 failure)
      expect(result.responses).toHaveLength(4);
      expect(result.responses[0].success).toBe(true);
      expect(result.responses[1].success).toBe(true);
      expect(result.responses[2].success).toBe(true);
      expect(result.responses[3].success).toBe(false);
      expect(result.responses[3].error?.message).toBe('Task 4 failed');
      expect(result.completedTasks).toBe(3); // Only 3 successful
    });

    it('should reset flow before execution', async () => {
      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      
      // Use the flow partially
      flow.nextTask();
      flow.reportTaskResult(true);
      expect(flow.started()).toBe(true);

      // Execute scenario - should reset the flow
      await driver.executeScenarioFlow('document-modeling/DM.00', flow);
      
      // Flow should have been reset and completed
      expect(flow.finished()).toBe(true);
    });
  });

  describe('session management', () => {
    it('should capture session ID from first message', async () => {
      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        return {
          response: 'test response',
          sessionId: sessionId || 'new-session-123'
        };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenarioFlow('document-modeling/DM.00', flow);

      // Should have captured the session ID
      expect(driver.getSessionId()).toBe('new-session-123');
    });

    it('should use provided sessionId when specified', async () => {
      const providedSessionId = 'existing-session-456';
      let capturedSessionId: string | undefined;
      
      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        capturedSessionId = sessionId;
        return {
          response: 'test response',
          sessionId: sessionId || 'new-session'
        };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenarioFlow('document-modeling/DM.00', flow, {}, { sessionId: providedSessionId });
      
      // Should use the provided session ID
      expect(capturedSessionId).toBe(providedSessionId);
      expect(driver.getSessionId()).toBe(providedSessionId);
    });

    it('should always send briefing message regardless of session state', async () => {
      let briefingMessageCount = 0;
      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        if (message.includes('BEGIN BRIEFING')) {
          briefingMessageCount++;
        }
        return { response: 'acknowledged', sessionId: sessionId || 'test-session' };
      });

      const flow1 = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenarioFlow('document-modeling/DM.00', flow1);
      
      const flow2 = driver.createSequentialFlow('document-modeling/DM.01');
      await driver.executeScenarioFlow('document-modeling/DM.01', flow2);

      // Briefing message should be sent for each scenario
      expect(briefingMessageCount).toBe(2);
    });

    it('should handle endSession correctly', async () => {
      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        return {
          response: 'test response',
          sessionId: sessionId || 'session-789'
        };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenarioFlow('document-modeling/DM.00', flow);
      
      expect(driver.getSessionId()).toBe('session-789');
      
      // End the session
      await driver.endSession();
      expect(driver.getSessionId()).toBeNull();

      // New execution should capture a new session ID
      const newFlow = driver.createSequentialFlow('document-modeling/DM.01');
      await driver.executeScenarioFlow('document-modeling/DM.01', newFlow);
      
      // Should have a new session ID
      expect(driver.getSessionId()).toBe('session-789');
    });

    it('should maintain session ID across multiple tasks', async () => {
      const sessionIds: (string | undefined)[] = [];
      
      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        sessionIds.push(sessionId);
        return {
          response: 'test response',
          sessionId: sessionId || 'consistent-session'
        };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenarioFlow('document-modeling/DM.00', flow);
      
      // After first message, all subsequent messages should use the same session ID
      const capturedSessionId = sessionIds.find(id => id);
      if (capturedSessionId) {
        // All messages after session ID capture should use the same ID
        const afterCapture = sessionIds.slice(sessionIds.indexOf(capturedSessionId));
        expect(afterCapture.every(id => id === capturedSessionId || id === 'consistent-session')).toBe(true);
      }
    });
  });

  describe('maxTurns configuration', () => {
    it('should use default maxTurns', async () => {
      mockAgent.sendMessage = jest.fn(async (message, sessionId, options) => {
        expect(options?.maxTurns).toBe(5); // Default
        return { response: 'test response', sessionId: 'test-session' };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenarioFlow('document-modeling/DM.00', flow);
      
      expect(mockAgent.sendMessage).toHaveBeenCalled();
    });

    it('should use custom maxTurns from options', async () => {
      mockAgent.sendMessage = jest.fn(async (message, sessionId, options) => {
        expect(options?.maxTurns).toBe(10); // Custom
        return { response: 'test response', sessionId: 'test-session' };
      });

      const flow = driver.createSequentialFlow('document-modeling/DM.00');
      await driver.executeScenarioFlow('document-modeling/DM.00', flow, {}, { maxTurns: 10 });
      
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

  describe('executeTask', () => {
    it('should execute a single task directly', async () => {
      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        return {
          response: 'Task executed successfully',
          sessionId: sessionId || 'test-session'
        };
      });

      const task = {
        id: 'TEST.1',
        title: 'Test Task',
        content: 'Perform test action'
      };

      const result = await driver.executeTask(task);

      expect(result.taskId).toBe('TEST.1');
      expect(result.taskTitle).toBe('Test Task');
      expect(result.response).toBe('Task executed successfully');
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle task execution failure', async () => {
      mockAgent.sendMessage = jest.fn(async () => {
        throw new Error('Task execution failed');
      });

      const task = {
        id: 'TEST.2',
        title: 'Failing Task',
        content: 'This will fail'
      };

      const result = await driver.executeTask(task);

      expect(result.taskId).toBe('TEST.2');
      expect(result.success).toBe(false);
      expect(result.response).toBe('Task execution failed');
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Task execution failed');
    });

    it('should use provided sessionId', async () => {
      let capturedSessionId: string | undefined;
      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        capturedSessionId = sessionId;
        return {
          response: 'Done',
          sessionId: sessionId || 'new-session'
        };
      });

      const task = {
        id: 'TEST.3',
        title: 'Session Task',
        content: 'Test with session'
      };

      await driver.executeTask(task, { sessionId: 'provided-session' });

      expect(capturedSessionId).toBe('provided-session');
      expect(driver.getSessionId()).toBe('provided-session');
    });

    it('should respect captureSession option', async () => {
      // Reset session first
      await driver.endSession();

      mockAgent.sendMessage = jest.fn(async (message, sessionId) => {
        return {
          response: 'Done',
          sessionId: 'new-session-xyz'
        };
      });

      const task = {
        id: 'TEST.4',
        title: 'No Capture Task',
        content: 'Test without capture'
      };

      // Execute with captureSession: false
      await driver.executeTask(task, { captureSession: false });

      // Session should not be captured
      expect(driver.getSessionId()).toBeNull();

      // Execute with captureSession: true (default)
      await driver.executeTask(task);

      // Session should now be captured
      expect(driver.getSessionId()).toBe('new-session-xyz');
    });

    it('should use custom maxTurns when provided', async () => {
      mockAgent.sendMessage = jest.fn(async (message, sessionId, options) => {
        expect(options?.maxTurns).toBe(20);
        return {
          response: 'Done',
          sessionId: 'test-session'
        };
      });

      const task = {
        id: 'TEST.5',
        title: 'MaxTurns Task',
        content: 'Test maxTurns'
      };

      await driver.executeTask(task, { maxTurns: 20 });

      expect(mockAgent.sendMessage).toHaveBeenCalled();
    });
  });
});