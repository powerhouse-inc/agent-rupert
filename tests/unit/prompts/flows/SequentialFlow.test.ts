import { SequentialFlow } from '../../../../src/prompts/flows/SequentialFlow.js';
import { RenderedScenario, RenderedScenarioTask } from '../../../../src/prompts/types.js';

describe('SequentialFlow', () => {
    let flow: SequentialFlow;
    let scenario: RenderedScenario;

    beforeEach(() => {
        // Create a test scenario with 3 tasks
        scenario = {
            id: 'TEST.00',
            title: 'Test Scenario',
            preamble: 'Test preamble',
            tasks: [
                { id: 'TEST.00.1', title: 'First Task', content: 'Do first thing' },
                { id: 'TEST.00.2', title: 'Second Task', content: 'Do second thing' },
                { id: 'TEST.00.3', title: 'Third Task', content: 'Do third thing' }
            ]
        };
        flow = new SequentialFlow(scenario);
    });

    describe('initial state', () => {
        it('should not be started initially', () => {
            expect(flow.started()).toBe(false);
        });

        it('should not be finished initially', () => {
            expect(flow.finished()).toBe(false);
        });

        it('should have correct initial status', () => {
            const status = flow.status();
            expect(status.started).toBe(false);
            expect(status.awaitingResult).toBe(false);
            expect(status.finished).toBe(false);
            expect(status.success).toBeUndefined();
            expect(status.error).toBeUndefined();
        });
    });

    describe('sequential execution', () => {
        it('should return tasks in sequence', () => {
            // Get first task
            const task1 = flow.nextTask();
            expect(task1).toEqual(scenario.tasks[0]);
            expect(flow.started()).toBe(true);
            expect(flow.status().awaitingResult).toBe(true);

            // Report success for first task
            flow.reportTaskResult(true);
            expect(flow.status().awaitingResult).toBe(false);

            // Get second task
            const task2 = flow.nextTask();
            expect(task2).toEqual(scenario.tasks[1]);

            // Report success for second task
            flow.reportTaskResult(true);

            // Get third task
            const task3 = flow.nextTask();
            expect(task3).toEqual(scenario.tasks[2]);

            // Report success for third task
            flow.reportTaskResult(true);

            // Should be finished successfully
            const finalTask = flow.nextTask();
            expect(finalTask).toBeNull();
            expect(flow.finished()).toBe(true);
            const status = flow.status();
            expect(status.finished).toBe(true);
            expect(status.success).toBe(true);
            expect(status.error).toBeUndefined();
        });

        it('should complete successfully after all tasks', () => {
            // Execute all tasks
            for (let i = 0; i < scenario.tasks.length; i++) {
                const task = flow.nextTask();
                expect(task).toEqual(scenario.tasks[i]);
                flow.reportTaskResult(true);
            }

            // Check completion
            expect(flow.nextTask()).toBeNull();
            expect(flow.finished()).toBe(true);
            expect(flow.status().success).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should terminate on task failure', () => {
            // Get first task
            const task1 = flow.nextTask();
            expect(task1).toEqual(scenario.tasks[0]);

            // Report failure
            const error = new Error('Task failed');
            flow.reportTaskResult(false, error);

            // Should be finished with error
            expect(flow.finished()).toBe(true);
            const status = flow.status();
            expect(status.finished).toBe(true);
            expect(status.success).toBe(false);
            expect(status.error).toEqual(error);

            // Should not return any more tasks
            expect(flow.nextTask()).toBeNull();
        });

        it('should create default error if none provided', () => {
            flow.nextTask();
            flow.reportTaskResult(false);

            const status = flow.status();
            expect(status.error).toBeDefined();
            expect(status.error?.message).toContain('TEST.00.1');
        });

        it('should throw if nextTask called while awaiting result', () => {
            flow.nextTask();
            expect(() => flow.nextTask()).toThrow('Cannot get next task: waiting for result');
        });

        it('should throw if reportTaskResult called without pending task', () => {
            expect(() => flow.reportTaskResult(true)).toThrow('No task result expected');
        });
    });

    describe('reset', () => {
        it('should reset to initial state', () => {
            // Execute some tasks
            flow.nextTask();
            flow.reportTaskResult(true);
            flow.nextTask();
            flow.reportTaskResult(false);

            // Should be finished with error
            expect(flow.finished()).toBe(true);
            expect(flow.started()).toBe(true);

            // Reset
            flow.reset();

            // Should be back to initial state
            expect(flow.started()).toBe(false);
            expect(flow.finished()).toBe(false);
            const status = flow.status();
            expect(status.started).toBe(false);
            expect(status.awaitingResult).toBe(false);
            expect(status.finished).toBe(false);
            expect(status.success).toBeUndefined();
            expect(status.error).toBeUndefined();

            // Should be able to execute again
            const task = flow.nextTask();
            expect(task).toEqual(scenario.tasks[0]);
        });
    });

    describe('utility methods', () => {
        it('should provide scenario info', () => {
            const info = flow.getScenarioInfo();
            expect(info.id).toBe('TEST.00');
            expect(info.title).toBe('Test Scenario');
            expect(info.totalTasks).toBe(3);
        });

        it('should track progress correctly', () => {
            // Initial progress
            let progress = flow.getProgress();
            expect(progress.currentTaskIndex).toBe(-1);
            expect(progress.totalTasks).toBe(3);
            expect(progress.completedTasks).toBe(0);

            // After first task requested
            flow.nextTask();
            progress = flow.getProgress();
            expect(progress.currentTaskIndex).toBe(0);
            expect(progress.completedTasks).toBe(0); // Not completed until result reported

            // After first task completed
            flow.reportTaskResult(true);
            progress = flow.getProgress();
            expect(progress.completedTasks).toBe(1);

            // After second task requested
            flow.nextTask();
            progress = flow.getProgress();
            expect(progress.currentTaskIndex).toBe(1);
            expect(progress.completedTasks).toBe(1);
        });
    });

    describe('edge cases', () => {
        it('should handle empty scenario', () => {
            const emptyScenario: RenderedScenario = {
                id: 'EMPTY',
                title: 'Empty Scenario',
                tasks: []
            };
            const emptyFlow = new SequentialFlow(emptyScenario);

            // Should immediately finish successfully
            const task = emptyFlow.nextTask();
            expect(task).toBeNull();
            expect(emptyFlow.finished()).toBe(true);
            expect(emptyFlow.status().success).toBe(true);
        });

        it('should handle single task scenario', () => {
            const singleTaskScenario: RenderedScenario = {
                id: 'SINGLE',
                title: 'Single Task',
                tasks: [{ id: 'SINGLE.1', title: 'Only Task', content: 'Do it' }]
            };
            const singleFlow = new SequentialFlow(singleTaskScenario);

            const task = singleFlow.nextTask();
            expect(task).toEqual(singleTaskScenario.tasks[0]);
            
            singleFlow.reportTaskResult(true);
            
            expect(singleFlow.nextTask()).toBeNull();
            expect(singleFlow.finished()).toBe(true);
            expect(singleFlow.status().success).toBe(true);
        });
    });
});