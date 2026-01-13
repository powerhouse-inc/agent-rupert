import { jest } from '@jest/globals';
import { AgentActivityLoop } from '../../../src/prompts/AgentActivityLoop.js';
import { IAgentBrain } from '../../../src/agents/IAgentBrain.js';
import { PromptScenario, ScenarioTask } from '../../../src/prompts/types.js';
import {
  TaskExecutionState,
  ActivityLoopConfig,
  ActivityLoopCallbacks
} from '../../../src/prompts/ActivityLoopTypes.js';

// Mock agent brain
class MockAgentBrain implements IAgentBrain {
  private systemPrompt?: string;
  public sendMessage: jest.Mock;
  public setSystemPrompt: jest.Mock;
  public setLogger: jest.Mock;
  public describeWbsOperations: jest.Mock;
  public describeInboxOperations: jest.Mock;

  constructor() {
    this.sendMessage = jest.fn();
    this.setSystemPrompt = jest.fn((prompt: string) => {
      this.systemPrompt = prompt;
    });
    this.setLogger = jest.fn();
    this.describeWbsOperations = jest.fn().mockResolvedValue('WBS operations description');
    this.describeInboxOperations = jest.fn().mockResolvedValue('Inbox operations description');
  }

  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }
}

describe('AgentActivityLoop', () => {
  let loop: AgentActivityLoop;
  let mockAgent: MockAgentBrain;
  let mockCallbacks: ActivityLoopCallbacks;
  let testScenario: PromptScenario;

  beforeEach(() => {
    mockAgent = new MockAgentBrain();
    mockCallbacks = {
      onTaskStart: jest.fn(),
      onTaskComplete: jest.fn(),
      onTaskFailed: jest.fn(),
      onTaskBlocked: jest.fn(),
      onProgressUpdate: jest.fn(),
      onStateChange: jest.fn()
    };

    testScenario = {
      id: 'TEST.01',
      title: 'Test Scenario',
      preamble: 'This is a test scenario',
      tasks: [
        {
          id: 'TEST.01.1',
          title: 'First task',
          content: 'Complete the first task'
        },
        {
          id: 'TEST.01.2',
          title: 'Second task',
          content: 'Complete the second task'
        },
        {
          id: 'TEST.01.3',
          title: 'Third task',
          content: 'Complete the third task'
        }
      ]
    };

    const config: ActivityLoopConfig = {
      maxRetries: 2,
      retryDelay: 100,
      taskTimeout: 5000,
      enableCheckpoints: true,
      checkpointInterval: 1000,
      progressReportInterval: 500
    };

    loop = new AgentActivityLoop(mockAgent, config, mockCallbacks);
  });

  afterEach(async () => {
    await loop.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with proper state', async () => {
      await loop.initialize(testScenario);
      
      expect(loop.getState()).toBe(TaskExecutionState.IDLE);
      expect(mockAgent.setSystemPrompt).toHaveBeenCalled();
      
      const systemPrompt = mockAgent.setSystemPrompt.mock.calls[0][0];
      expect(systemPrompt).toContain('TEST.01');
      expect(systemPrompt).toContain('Test Scenario');
    });

    it('should include preamble in system prompt', async () => {
      await loop.initialize(testScenario);
      
      const systemPrompt = mockAgent.setSystemPrompt.mock.calls[0][0];
      expect(systemPrompt).toContain('This is a test scenario');
    });
  });

  describe('task execution', () => {
    it('should execute tasks sequentially', async () => {
      mockAgent.sendMessage
        .mockResolvedValueOnce({ response: 'Preamble acknowledged', sessionId: 'test-session-1' })  // For preamble
        .mockResolvedValueOnce({ response: 'Task TEST.01.1 completed successfully', sessionId: 'test-session-1' })
        .mockResolvedValueOnce({ response: 'Task TEST.01.2 completed successfully', sessionId: 'test-session-1' })
        .mockResolvedValueOnce({ response: 'Task TEST.01.3 completed successfully', sessionId: 'test-session-1' });

      const report = await loop.processScenario(testScenario);

      expect(mockAgent.sendMessage).toHaveBeenCalledTimes(4); // preamble + 3 tasks
      // First call should be the preamble with no session
      expect(mockAgent.sendMessage).toHaveBeenNthCalledWith(1, 'This is a test scenario', undefined);
      // Subsequent calls should use the session ID
      expect(mockAgent.sendMessage).toHaveBeenNthCalledWith(2, expect.any(String), 'test-session-1');
      expect(report.completedTasks).toBe(3);
      expect(report.failedTasks).toBe(0);
      expect(report.blockedTasks).toBe(0);
    });

    it('should call task callbacks', async () => {
      mockAgent.sendMessage.mockResolvedValue({ response: 'Task completed', sessionId: 'test-session-1' });

      await loop.processScenario(testScenario);

      expect(mockCallbacks.onTaskStart).toHaveBeenCalledTimes(3);
      expect(mockCallbacks.onTaskComplete).toHaveBeenCalledTimes(3);
      
      // Check first task callback
      expect(mockCallbacks.onTaskStart).toHaveBeenNthCalledWith(1, testScenario.tasks[0]);
    });

    it('should detect completed tasks', async () => {
      mockAgent.sendMessage
        .mockResolvedValueOnce({ response: 'Preamble acknowledged', sessionId: 'test-session-1' })  // For preamble
        .mockResolvedValueOnce({ response: 'I have successfully completed the task', sessionId: 'test-session-1' })
        .mockResolvedValueOnce({ response: 'Task is now finished', sessionId: 'test-session-1' })
        .mockResolvedValueOnce({ response: 'Done with this task', sessionId: 'test-session-1' });

      const report = await loop.processScenario(testScenario);

      expect(report.completedTasks).toBe(3);
      expect(report.taskResults.get('TEST.01.1')?.state).toBe(TaskExecutionState.COMPLETED);
    });


    it('should detect failed tasks', async () => {
      mockAgent.sendMessage
        .mockResolvedValueOnce({ response: 'Preamble acknowledged', sessionId: 'test-session-1' })  // For preamble
        .mockResolvedValueOnce({ response: 'Task completed', sessionId: 'test-session-1' })
        .mockResolvedValueOnce({ response: 'Error: Unable to complete task', sessionId: 'test-session-1' })
        .mockResolvedValueOnce({ response: 'Task completed', sessionId: 'test-session-1' });

      const report = await loop.processScenario(testScenario);

      expect(mockCallbacks.onTaskFailed).toHaveBeenCalled();
      expect(report.failedTasks).toBe(1);
    });

    it('should retry failed tasks', async () => {
      mockAgent.sendMessage
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ response: 'Task completed after retry', sessionId: 'test-session-1' });

      await loop.processTask(testScenario.tasks[0]);

      expect(mockAgent.sendMessage).toHaveBeenCalledTimes(2);
      const result = Array.from(loop.generateProgressReport().taskResults.values())[0];
      expect(result.attempts).toBe(2);
      expect(result.state).toBe(TaskExecutionState.COMPLETED);
    });

    it('should respect max retries', async () => {
      mockAgent.sendMessage.mockRejectedValue(new Error('Persistent error'));

      const result = await loop.processTask(testScenario.tasks[0]);

      expect(mockAgent.sendMessage).toHaveBeenCalledTimes(2); // maxRetries = 2
      expect(result.state).toBe(TaskExecutionState.FAILED);
      expect(result.attempts).toBe(2);
    });
  });

  describe('state management', () => {
    it('should track state changes', async () => {
      mockAgent.sendMessage.mockResolvedValue({ response: 'Task completed', sessionId: 'test-session-1' });

      await loop.processTask(testScenario.tasks[0]);

      // Should have transitioned: IDLE -> EXECUTING -> IDLE
      expect(mockCallbacks.onStateChange).toHaveBeenCalledWith(
        TaskExecutionState.IDLE,
        TaskExecutionState.EXECUTING
      );
      expect(mockCallbacks.onStateChange).toHaveBeenCalledWith(
        TaskExecutionState.EXECUTING,
        TaskExecutionState.IDLE
      );
    });

    it('should pause and resume execution', () => {
      loop.pause();
      expect(loop.getState()).toBe(TaskExecutionState.PAUSED);

      loop.resume();
      expect(loop.getState()).toBe(TaskExecutionState.IDLE);
    });
  });

  describe('progress reporting', () => {
    it('should generate progress reports', async () => {
      mockAgent.sendMessage
        .mockResolvedValueOnce({ response: 'Task 1 completed', sessionId: 'test-session-1' })
        .mockResolvedValueOnce({ response: 'Task 2 completed', sessionId: 'test-session-1' });

      // Process first two tasks
      await loop.processTask(testScenario.tasks[0]);
      await loop.processTask(testScenario.tasks[1]);

      const report = loop.generateProgressReport();

      expect(report.completedTasks).toBe(2);
      expect(report.totalTasks).toBe(0); // Scenario not set via processScenario
      expect(report.taskResults.size).toBe(2);
    });

    it('should estimate completion time', async () => {
      await loop.initialize(testScenario);
      
      mockAgent.sendMessage.mockResolvedValue({ response: 'Task completed', sessionId: 'test-session-1' });

      // Complete first task
      await loop.processTask(testScenario.tasks[0]);

      const report = loop.generateProgressReport();
      
      // Should have an estimated completion time
      expect(report.estimatedCompletion).toBeInstanceOf(Date);
    });

  });

  describe('checkpoint management', () => {
    it('should save checkpoints', async () => {
      await loop.initialize(testScenario);
      
      mockAgent.sendMessage.mockResolvedValue({ response: 'Task completed', sessionId: 'test-session-1' });
      await loop.processTask(testScenario.tasks[0]);

      const checkpoint = await loop.saveCheckpoint();

      expect(checkpoint.scenarioId).toBe('TEST.01');
      expect(checkpoint.completedTasks).toContain('TEST.01.1');
      expect(checkpoint.timestamp).toBeInstanceOf(Date);
    });

    it('should restore from checkpoint', async () => {
      await loop.initialize(testScenario);
      
      const checkpoint = {
        scenarioId: 'TEST.01',
        completedTasks: ['TEST.01.1', 'TEST.01.2'],
        currentTask: 'TEST.01.3',
        sessionContext: new Map(),
        timestamp: new Date(),
        taskResults: new Map()
      };

      await loop.restoreFromCheckpoint(checkpoint);

      const report = loop.generateProgressReport();
      expect(report.completedTasks).toBe(2);
    });
  });

  describe('error handling', () => {

    it('should handle sendMessage errors', async () => {
      mockAgent.sendMessage.mockRejectedValue(new Error('API error'));
      
      const result = await loop.processTask(testScenario.tasks[0]);
      
      expect(result.state).toBe(TaskExecutionState.FAILED);
      expect(result.error?.message).toContain('API error');
    }, 10000);
  });

});