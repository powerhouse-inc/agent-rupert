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
class MockAgentBrain implements Partial<IAgentBrain> {
  private systemPrompt?: string;
  public sendMessage: jest.Mock;
  public setSystemPrompt: jest.Mock;

  constructor() {
    this.sendMessage = jest.fn();
    this.setSystemPrompt = jest.fn((prompt: string) => {
      this.systemPrompt = prompt;
    });
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

    loop = new AgentActivityLoop(mockAgent as IAgentBrain, config, mockCallbacks);
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
        .mockResolvedValueOnce('Task TEST.01.1 completed successfully')
        .mockResolvedValueOnce('Task TEST.01.2 completed successfully')
        .mockResolvedValueOnce('Task TEST.01.3 completed successfully');

      const report = await loop.processScenario(testScenario);

      expect(mockAgent.sendMessage).toHaveBeenCalledTimes(4); // preamble + 3 tasks
      expect(report.completedTasks).toBe(3);
      expect(report.failedTasks).toBe(0);
      expect(report.blockedTasks).toBe(0);
    });

    it('should call task callbacks', async () => {
      mockAgent.sendMessage.mockResolvedValue('Task completed');

      await loop.processScenario(testScenario);

      expect(mockCallbacks.onTaskStart).toHaveBeenCalledTimes(3);
      expect(mockCallbacks.onTaskComplete).toHaveBeenCalledTimes(3);
      
      // Check first task callback
      expect(mockCallbacks.onTaskStart).toHaveBeenNthCalledWith(1, testScenario.tasks[0]);
    });

    it('should detect completed tasks', async () => {
      mockAgent.sendMessage
        .mockResolvedValueOnce('I have successfully completed the task')
        .mockResolvedValueOnce('Task is now finished')
        .mockResolvedValueOnce('Done with this task');

      const report = await loop.processScenario(testScenario);

      expect(report.completedTasks).toBe(3);
      expect(report.taskResults.get('TEST.01.1')?.state).toBe(TaskExecutionState.COMPLETED);
    });

    it('should detect blocked tasks', async () => {
      mockAgent.sendMessage
        .mockResolvedValueOnce('Task completed')
        .mockResolvedValueOnce('I am blocked because I need user input')
        .mockResolvedValueOnce('Task completed');

      const report = await loop.processScenario(testScenario);

      expect(mockCallbacks.onTaskBlocked).toHaveBeenCalled();
      const blockedResult = report.taskResults.get('TEST.01.2');
      expect(blockedResult?.state).toBe(TaskExecutionState.BLOCKED);
      expect(blockedResult?.blockedReason).toBeDefined();
    });

    it('should detect failed tasks', async () => {
      mockAgent.sendMessage
        .mockResolvedValueOnce('Task completed')
        .mockResolvedValueOnce('Error: Unable to complete task')
        .mockResolvedValueOnce('Task completed');

      const report = await loop.processScenario(testScenario);

      expect(mockCallbacks.onTaskFailed).toHaveBeenCalled();
      expect(report.failedTasks).toBe(1);
    });

    it('should retry failed tasks', async () => {
      mockAgent.sendMessage
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('Task completed after retry');

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
      mockAgent.sendMessage.mockResolvedValue('Task completed');

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
        .mockResolvedValueOnce('Task 1 completed')
        .mockResolvedValueOnce('Task 2 completed');

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
      
      mockAgent.sendMessage.mockResolvedValue('Task completed');

      // Complete first task
      await loop.processTask(testScenario.tasks[0]);

      const report = loop.generateProgressReport();
      
      // Should have an estimated completion time
      expect(report.estimatedCompletion).toBeInstanceOf(Date);
    });

    it('should trigger progress callbacks', async () => {
      jest.useFakeTimers();
      
      mockAgent.sendMessage.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve('Task completed'), 100);
        });
      });

      const processPromise = loop.processScenario(testScenario);
      
      // Fast forward to trigger progress report
      jest.advanceTimersByTime(500);
      
      await processPromise;

      expect(mockCallbacks.onProgressUpdate).toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('checkpoint management', () => {
    it('should save checkpoints', async () => {
      await loop.initialize(testScenario);
      
      mockAgent.sendMessage.mockResolvedValue('Task completed');
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
    it('should handle task timeout', async () => {
      jest.useFakeTimers();
      
      mockAgent.sendMessage.mockImplementation(() => {
        return new Promise(() => {
          // Never resolves
        });
      });

      const taskPromise = loop.processTask(testScenario.tasks[0]);
      
      // Fast forward past timeout
      jest.advanceTimersByTime(6000);
      
      const result = await taskPromise;
      
      expect(result.state).toBe(TaskExecutionState.FAILED);
      expect(result.error?.message).toContain('timed out');
      
      jest.useRealTimers();
    });

    it('should handle agent without sendMessage', async () => {
      const limitedAgent = {
        setSystemPrompt: jest.fn()
      };

      const limitedLoop = new AgentActivityLoop(limitedAgent as any);
      
      const result = await limitedLoop.processTask(testScenario.tasks[0]);
      
      expect(result.state).toBe(TaskExecutionState.FAILED);
      expect(result.error?.message).toContain('does not support sendMessage');
    });
  });

  describe('cleanup', () => {
    it('should cleanup timers on cleanup', async () => {
      jest.useFakeTimers();
      
      await loop.initialize(testScenario);
      
      // Cleanup should clear all timers
      await loop.cleanup();
      
      // Advance time to check no callbacks are triggered
      jest.advanceTimersByTime(10000);
      
      expect(mockCallbacks.onProgressUpdate).not.toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });
});