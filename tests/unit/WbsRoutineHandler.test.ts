import { jest, describe, it, beforeEach, expect } from '@jest/globals';
import { WbsRoutineHandler } from '../../src/agents/AgentBase/WbsRoutineHandler';
import { WorkBreakdownStructureDocument, Goal } from 'powerhouse-agent/document-models/work-breakdown-structure';
import { ISkillsRepository } from '../../src/prompts/ISkillsRepository';

describe('WbsRoutineHandler', () => {
    describe('resolveWorkItem', () => {
        let mockSkillsRepository: ISkillsRepository;
        
        beforeEach(() => {
            // Create a mock skills repository
            mockSkillsRepository = {
                getSkills: jest.fn(() => ['create-reactor-package']),
                getSkillTemplate: jest.fn((skillName: string) => {
                    if (skillName === 'create-reactor-package') {
                        return {
                            id: 'create-reactor-package',
                            name: 'Create Reactor Package',
                            description: 'Test skill',
                            scenarios: [
                                {
                                    id: 'CRP.00',
                                    title: 'Verify Ready',
                                    description: 'Test scenario',
                                    tasks: [
                                        {
                                            id: 'CRP.00.1',
                                            description: 'List projects',
                                            prompt: 'Test task'
                                        }
                                    ]
                                }
                            ]
                        };
                    }
                    // Return null for prefix lookups - this simulates the repository scan fallback
                    return null;
                }),
                generateScenarioKey: jest.fn(),
                getScenarioByKey: jest.fn(),
                getScenarioIds: jest.fn(),
                getTaskIds: jest.fn(),
                initTaskData: jest.fn()
            } as any;
        });

        it('should resolve work item with only task ID in goal chain', () => {
            const goalChain: Goal[] = [
                {
                    id: 'task-goal',
                    description: 'List existing Reactor projects',
                    status: 'TODO',
                    parentId: null,
                    dependencies: [],
                    isDraft: false,
                    instructions: {
                        workType: 'TASK',
                        workId: 'CRP.00.1',
                        comments: '',
                        context: null
                    },
                    notes: [],
                    assignee: null
                }
            ];

            // Use reflection to call private method
            const resolution = (WbsRoutineHandler as any).resolveWorkItem(
                goalChain,
                mockSkillsRepository
            );

            expect(resolution).toBeDefined();
            expect(resolution?.skillName).toBe('create-reactor-package');
            expect(resolution?.scenarioId).toBe('CRP.00');
            expect(resolution?.taskId).toBe('CRP.00.1');
            expect(resolution?.confidence).toBe('inferred');  
            expect(resolution?.source.skill).toBe('scenario_prefix');  // Inferred from scenario prefix
            expect(resolution?.source.scenario).toBe('task_prefix');  // Inferred from task ID
        });

        it('should use explicit IDs when available', () => {
            const goalChain: Goal[] = [
                {
                    id: 'skill-goal',
                    description: 'Create Reactor Package',
                    status: 'TODO',
                    parentId: null,
                    dependencies: [],
                    isDraft: false,
                    instructions: {
                        workType: 'SKILL',
                        workId: 'create-reactor-package',
                        comments: '',
                        context: null
                    },
                    notes: [],
                    assignee: null
                },
                {
                    id: 'scenario-goal',
                    description: 'Verify Ready',
                    status: 'TODO',
                    parentId: 'skill-goal',
                    dependencies: [],
                    isDraft: false,
                    instructions: {
                        workType: 'SCENARIO',
                        workId: 'CRP.00',
                        comments: '',
                        context: null
                    },
                    notes: [],
                    assignee: null
                },
                {
                    id: 'task-goal',
                    description: 'List projects',
                    status: 'TODO',
                    parentId: 'scenario-goal',
                    dependencies: [],
                    isDraft: false,
                    instructions: {
                        workType: 'TASK',
                        workId: 'CRP.00.1',
                        comments: '',
                        context: null
                    },
                    notes: [],
                    assignee: null
                }
            ];

            const resolution = (WbsRoutineHandler as any).resolveWorkItem(
                goalChain,
                mockSkillsRepository
            );

            expect(resolution).toBeDefined();
            expect(resolution?.skillName).toBe('create-reactor-package');
            expect(resolution?.scenarioId).toBe('CRP.00');
            expect(resolution?.taskId).toBe('CRP.00.1');
            expect(resolution?.confidence).toBe('explicit');
            expect(resolution?.source.skill).toBe('wbs');
            expect(resolution?.source.scenario).toBe('wbs');
        });

        it('should return null if no task ID is found', () => {
            const goalChain: Goal[] = [
                {
                    id: 'skill-goal',
                    description: 'Create Reactor Package',
                    status: 'TODO',
                    parentId: null,
                    dependencies: [],
                    isDraft: false,
                    instructions: {
                        workType: 'SKILL',
                        workId: 'create-reactor-package',
                        comments: '',
                        context: null
                    },
                    notes: [],
                    assignee: null
                }
            ];

            const resolution = (WbsRoutineHandler as any).resolveWorkItem(
                goalChain,
                mockSkillsRepository
            );

            expect(resolution).toBeNull();
        });
    });
});