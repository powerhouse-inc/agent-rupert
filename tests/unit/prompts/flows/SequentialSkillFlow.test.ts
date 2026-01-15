import { beforeEach, describe, expect, it } from '@jest/globals';
import { SequentialSkillFlow } from '../../../../src/prompts/flows/SequentialSkillFlow.js';
import { RenderedScenario } from '../../../../src/prompts/types.js';
import { ScenarioResult } from '../../../../src/prompts/flows/ISkillFlow.js';

describe('SequentialSkillFlow', () => {
    let flow: SequentialSkillFlow;
    let scenarios: RenderedScenario[];

    beforeEach(() => {
        // Create test scenarios
        scenarios = [
            {
                id: 'DM.00',
                title: 'Prerequisites Check',
                preamble: 'Check prerequisites',
                tasks: [
                    { id: 'DM.00.1', title: 'Task 1', content: 'Content 1' },
                    { id: 'DM.00.2', title: 'Task 2', content: 'Content 2' }
                ]
            },
            {
                id: 'DM.01',
                title: 'Create Document Model',
                preamble: 'Create the model',
                tasks: [
                    { id: 'DM.01.1', title: 'Task 1', content: 'Content 1' },
                    { id: 'DM.01.2', title: 'Task 2', content: 'Content 2' },
                    { id: 'DM.01.3', title: 'Task 3', content: 'Content 3' }
                ]
            },
            {
                id: 'DM.02',
                title: 'Test Document Model',
                tasks: [
                    { id: 'DM.02.1', title: 'Test Task', content: 'Test content' }
                ]
            }
        ];

        flow = new SequentialSkillFlow('document-modeling', scenarios);
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
            expect(status.completedScenarios).toBe(0);
            expect(status.totalScenarios).toBe(3);
        });

        it('should provide correct skill info', () => {
            const info = flow.getSkillInfo();
            expect(info.name).toBe('document-modeling');
            expect(info.totalScenarios).toBe(3);
        });
    });

    describe('sequential execution', () => {
        it('should return scenarios in sequence', async () => {
            // Get first scenario
            const scenario1 = await flow.nextScenario();
            expect(scenario1).toEqual(scenarios[0]);
            expect(flow.started()).toBe(true);
            expect(flow.status().awaitingResult).toBe(true);

            // Report success for first scenario
            await flow.reportScenarioResult({
                scenarioId: 'DM.00',
                success: true,
                completedTasks: 2,
                totalTasks: 2
            });
            expect(flow.status().awaitingResult).toBe(false);
            expect(flow.status().completedScenarios).toBe(1);

            // Get second scenario
            const scenario2 = await flow.nextScenario();
            expect(scenario2).toEqual(scenarios[1]);

            // Report success for second scenario
            await flow.reportScenarioResult({
                scenarioId: 'DM.01',
                success: true,
                completedTasks: 3,
                totalTasks: 3
            });

            // Get third scenario
            const scenario3 = await flow.nextScenario();
            expect(scenario3).toEqual(scenarios[2]);

            // Report success for third scenario
            await flow.reportScenarioResult({
                scenarioId: 'DM.02',
                success: true,
                completedTasks: 1,
                totalTasks: 1
            });

            // Should be finished successfully
            const finalScenario = await flow.nextScenario();
            expect(finalScenario).toBeNull();
            expect(flow.finished()).toBe(true);
            const status = flow.status();
            expect(status.finished).toBe(true);
            expect(status.success).toBe(true);
            expect(status.error).toBeUndefined();
            expect(status.completedScenarios).toBe(3);
        });

        it('should complete successfully after all scenarios', async () => {
            // Execute all scenarios
            for (let i = 0; i < scenarios.length; i++) {
                const scenario = await flow.nextScenario();
                expect(scenario).toEqual(scenarios[i]);
                await flow.reportScenarioResult({
                    scenarioId: scenarios[i].id,
                    success: true,
                    completedTasks: scenarios[i].tasks.length,
                    totalTasks: scenarios[i].tasks.length
                });
            }

            // Check completion
            expect(await flow.nextScenario()).toBeNull();
            expect(flow.finished()).toBe(true);
            expect(flow.status().success).toBe(true);
            expect(flow.status().completedScenarios).toBe(3);
        });
    });

    describe('error handling', () => {
        it('should terminate on scenario failure', async () => {
            // Get first scenario
            const scenario1 = await flow.nextScenario();
            expect(scenario1).toEqual(scenarios[0]);

            // Report success
            await flow.reportScenarioResult({
                scenarioId: 'DM.00',
                success: true,
                completedTasks: 2,
                totalTasks: 2
            });

            // Get second scenario
            const scenario2 = await flow.nextScenario();
            expect(scenario2).toEqual(scenarios[1]);

            // Report failure
            const error = new Error('Scenario failed');
            await flow.reportScenarioResult({
                scenarioId: 'DM.01',
                success: false,
                completedTasks: 1,
                totalTasks: 3,
                error
            });

            // Should be finished with error
            expect(flow.finished()).toBe(true);
            const status = flow.status();
            expect(status.finished).toBe(true);
            expect(status.success).toBe(false);
            expect(status.error).toEqual(error);
            expect(status.completedScenarios).toBe(1); // Only first scenario was completed

            // Should not return any more scenarios
            expect(await flow.nextScenario()).toBeNull();
        });

        it('should create default error if none provided', async () => {
            const scenario = await flow.nextScenario();
            await flow.reportScenarioResult({
                scenarioId: 'DM.00',
                success: false,
                completedTasks: 0,
                totalTasks: 2
            });

            const status = flow.status();
            expect(status.error).toBeDefined();
            expect(status.error?.message).toContain('DM.00');
        });

        it('should throw if nextScenario called while awaiting result', async () => {
            await flow.nextScenario();
            await expect(flow.nextScenario()).rejects.toThrow('Cannot get next scenario: waiting for result');
        });

        it('should throw if reportScenarioResult called without pending scenario', async () => {
            const result: ScenarioResult = {
                scenarioId: 'DM.00',
                success: true,
                completedTasks: 2,
                totalTasks: 2
            };
            await expect(flow.reportScenarioResult(result)).rejects.toThrow('No scenario result expected');
        });
    });

    describe('reset', () => {
        it('should reset to initial state', async () => {
            // Execute some scenarios
            await flow.nextScenario();
            await flow.reportScenarioResult({
                scenarioId: 'DM.00',
                success: true,
                completedTasks: 2,
                totalTasks: 2
            });
            await flow.nextScenario();
            await flow.reportScenarioResult({
                scenarioId: 'DM.01',
                success: false,
                completedTasks: 1,
                totalTasks: 3
            });

            // Should be finished with error
            expect(flow.finished()).toBe(true);
            expect(flow.started()).toBe(true);
            expect(flow.status().completedScenarios).toBe(1);

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
            expect(status.completedScenarios).toBe(0);

            // Should be able to execute again
            const scenario = await flow.nextScenario();
            expect(scenario).toEqual(scenarios[0]);
        });
    });

    describe('progress tracking', () => {
        it('should track progress correctly', async () => {
            // Initial progress
            let progress = flow.getProgress();
            expect(progress.currentScenarioIndex).toBe(-1);
            expect(progress.totalScenarios).toBe(3);
            expect(progress.completedScenarios).toBe(0);

            // After first scenario requested
            await flow.nextScenario();
            progress = flow.getProgress();
            expect(progress.currentScenarioIndex).toBe(0);
            expect(progress.completedScenarios).toBe(0); // Not completed until result reported

            // After first scenario completed
            await flow.reportScenarioResult({
                scenarioId: 'DM.00',
                success: true,
                completedTasks: 2,
                totalTasks: 2
            });
            progress = flow.getProgress();
            expect(progress.completedScenarios).toBe(1);

            // After second scenario requested
            await flow.nextScenario();
            progress = flow.getProgress();
            expect(progress.currentScenarioIndex).toBe(1);
            expect(progress.completedScenarios).toBe(1);
        });
    });

    describe('edge cases', () => {
        it('should handle empty scenarios list', async () => {
            const emptyFlow = new SequentialSkillFlow('empty-skill', []);

            // Should immediately finish successfully
            const scenario = await emptyFlow.nextScenario();
            expect(scenario).toBeNull();
            expect(emptyFlow.finished()).toBe(true);
            expect(emptyFlow.status().success).toBe(true);
            expect(emptyFlow.status().completedScenarios).toBe(0);
        });

        it('should handle single scenario', async () => {
            const singleScenario: RenderedScenario = {
                id: 'SINGLE',
                title: 'Single Scenario',
                tasks: [{ id: 'SINGLE.1', title: 'Task', content: 'Do it' }]
            };
            const singleFlow = new SequentialSkillFlow('single-skill', [singleScenario]);

            const scenario = await singleFlow.nextScenario();
            expect(scenario).toEqual(singleScenario);

            await singleFlow.reportScenarioResult({
                scenarioId: 'SINGLE',
                success: true,
                completedTasks: 1,
                totalTasks: 1
            });

            expect(await singleFlow.nextScenario()).toBeNull();
            expect(singleFlow.finished()).toBe(true);
            expect(singleFlow.status().success).toBe(true);
        });
    });

    describe('flow metadata', () => {
        it('should provide correct flow name and description', () => {
            expect(flow.name()).toBe('SequentialSkillFlow');
            expect(flow.description()).toContain('executed in sequence');
        });
    });

    describe('scenario flow factory', () => {
        it('should create a SequentialScenarioFlow for scenarios', async () => {
            const scenario = scenarios[0];
            const scenarioFlow = await flow.createScenarioFlow(scenario);
            
            expect(scenarioFlow).toBeDefined();
            expect(scenarioFlow.name()).toBe('SequentialFlow');
            expect(scenarioFlow.getScenarioInfo().id).toBe('DM.00');
            expect(scenarioFlow.getScenarioInfo().totalTasks).toBe(2);
        });

        it('should create independent flows for different scenarios', async () => {
            const flow1 = await flow.createScenarioFlow(scenarios[0]);
            const flow2 = await flow.createScenarioFlow(scenarios[1]);
            
            expect(flow1).not.toBe(flow2);
            expect(flow1.getScenarioInfo().id).toBe('DM.00');
            expect(flow2.getScenarioInfo().id).toBe('DM.01');
        });
    });
});