import { describe, it, expect } from '@jest/globals';
import { 
    createCLITask, 
    isCLITask,
    createClaudeCodeTask,
    isClaudeCodeTask,
    type BaseTask
} from '../../src/tasks/types.js';

describe('CLITask Types', () => {
    describe('createCLITask', () => {
        it('should create a valid CLITask with required fields', () => {
            const task = createCLITask({
                title: 'Test Task',
                instructions: 'Run a test command',
                command: 'echo',
                args: ['hello', 'world']
            });

            expect(task.id).toBeDefined();
            expect(task.id).toMatch(/^task-\d+-[a-z0-9]+$/);
            expect(task.type).toBe('cli');
            expect(task.title).toBe('Test Task');
            expect(task.instructions).toBe('Run a test command');
            expect(task.command).toBe('echo');
            expect(task.args).toEqual(['hello', 'world']);
            expect(task.status).toBe('pending');
            expect(task.createdAt).toBeInstanceOf(Date);
            expect(task.updatedAt).toBeInstanceOf(Date);
        });

        it('should create CLITask with optional fields', () => {
            const task = createCLITask({
                title: 'Complex Task',
                instructions: 'Run with environment',
                command: 'npm',
                args: ['run', 'build'],
                workingDirectory: '/home/user/project',
                environment: {
                    NODE_ENV: 'production',
                    CI: 'true'
                }
            });

            expect(task.workingDirectory).toBe('/home/user/project');
            expect(task.environment).toEqual({
                NODE_ENV: 'production',
                CI: 'true'
            });
        });

        it('should generate unique IDs for multiple tasks', () => {
            const task1 = createCLITask({
                title: 'Task 1',
                instructions: 'First task',
                command: 'ls',
                args: []
            });

            const task2 = createCLITask({
                title: 'Task 2',
                instructions: 'Second task',
                command: 'pwd',
                args: []
            });

            expect(task1.id).not.toBe(task2.id);
        });

        it('should set correct timestamps', () => {
            const beforeCreate = new Date();
            
            const task = createCLITask({
                title: 'Timestamp Test',
                instructions: 'Test timestamps',
                command: 'date',
                args: []
            });

            const afterCreate = new Date();

            expect(task.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(task.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
            expect(task.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(task.updatedAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });
    });

    describe('isCLITask', () => {
        it('should correctly identify CLI tasks', () => {
            const cliTask = createCLITask({
                title: 'CLI Task',
                instructions: 'Test CLI task',
                command: 'echo',
                args: ['test']
            });

            expect(isCLITask(cliTask)).toBe(true);
        });

        it('should correctly reject non-CLI tasks', () => {
            const nonCliTask: BaseTask = {
                id: 'task-123',
                type: 'claude-code',
                title: 'Claude Task',
                instructions: 'Test Claude task',
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            expect(isCLITask(nonCliTask)).toBe(false);
        });

        it('should handle different task types', () => {
            const claudeAgentTask: BaseTask = {
                id: 'task-456',
                type: 'claude-agent',
                title: 'Agent Task',
                instructions: 'Test agent task',
                status: 'running',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            expect(isCLITask(claudeAgentTask)).toBe(false);
        });
    });

    describe('CLITask structure', () => {
        it('should have all required BaseTask fields', () => {
            const task = createCLITask({
                title: 'Structure Test',
                instructions: 'Test structure',
                command: 'test',
                args: []
            });

            // Check BaseTask fields
            expect(task).toHaveProperty('id');
            expect(task).toHaveProperty('type');
            expect(task).toHaveProperty('title');
            expect(task).toHaveProperty('instructions');
            expect(task).toHaveProperty('status');
            expect(task).toHaveProperty('createdAt');
            expect(task).toHaveProperty('updatedAt');

            // Check CLITask specific fields
            expect(task).toHaveProperty('command');
            expect(task).toHaveProperty('args');
        });

        it('should handle empty args array', () => {
            const task = createCLITask({
                title: 'No Args Task',
                instructions: 'Task without arguments',
                command: 'ls',
                args: []
            });

            expect(task.args).toEqual([]);
            expect(task.args).toHaveLength(0);
        });
    });
});

describe('ClaudeCodeTask Types', () => {
    describe('createClaudeCodeTask', () => {
        it('should create a valid ClaudeCodeTask with required fields', () => {
            const task = createClaudeCodeTask({
                title: 'Claude Code Task',
                instructions: 'Generate code using Claude',
                prompt: 'Write a function to calculate fibonacci numbers'
            });

            expect(task.id).toBeDefined();
            expect(task.id).toMatch(/^task-\d+-[a-z0-9]+$/);
            expect(task.type).toBe('claude-code');
            expect(task.title).toBe('Claude Code Task');
            expect(task.instructions).toBe('Generate code using Claude');
            expect(task.prompt).toBe('Write a function to calculate fibonacci numbers');
            expect(task.status).toBe('pending');
            expect(task.createdAt).toBeInstanceOf(Date);
            expect(task.updatedAt).toBeInstanceOf(Date);
            expect(task.projectPath).toBeUndefined();
            expect(task.additionalFlags).toBeUndefined();
        });

        it('should create ClaudeCodeTask with optional projectPath', () => {
            const task = createClaudeCodeTask({
                title: 'Project Task',
                instructions: 'Generate code for project',
                prompt: 'Add error handling to the main function',
                projectPath: '/home/user/my-project'
            });

            expect(task.projectPath).toBe('/home/user/my-project');
            expect(task.additionalFlags).toBeUndefined();
        });

        it('should create ClaudeCodeTask with optional additionalFlags', () => {
            const task = createClaudeCodeTask({
                title: 'Task with Flags',
                instructions: 'Generate with custom flags',
                prompt: 'Refactor the database module',
                additionalFlags: ['--no-cache', '--verbose', '--model=claude-3']
            });

            expect(task.additionalFlags).toEqual(['--no-cache', '--verbose', '--model=claude-3']);
            expect(task.projectPath).toBeUndefined();
        });

        it('should create ClaudeCodeTask with all optional fields', () => {
            const task = createClaudeCodeTask({
                title: 'Full Task',
                instructions: 'Complete Claude task',
                prompt: 'Implement authentication system',
                projectPath: '/workspace/auth-project',
                additionalFlags: ['--context=auth', '--max-tokens=4000']
            });

            expect(task.prompt).toBe('Implement authentication system');
            expect(task.projectPath).toBe('/workspace/auth-project');
            expect(task.additionalFlags).toEqual(['--context=auth', '--max-tokens=4000']);
        });

        it('should generate unique IDs for multiple tasks', () => {
            const task1 = createClaudeCodeTask({
                title: 'Task 1',
                instructions: 'First Claude task',
                prompt: 'Write test 1'
            });

            const task2 = createClaudeCodeTask({
                title: 'Task 2',
                instructions: 'Second Claude task',
                prompt: 'Write test 2'
            });

            expect(task1.id).not.toBe(task2.id);
        });

        it('should set correct timestamps', () => {
            const beforeCreate = new Date();
            
            const task = createClaudeCodeTask({
                title: 'Timestamp Test',
                instructions: 'Test timestamps',
                prompt: 'Generate timestamp function'
            });

            const afterCreate = new Date();

            expect(task.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(task.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
            expect(task.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
            expect(task.updatedAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
        });

        it('should handle empty additionalFlags array', () => {
            const task = createClaudeCodeTask({
                title: 'Empty Flags Task',
                instructions: 'Task with empty flags',
                prompt: 'Generate code',
                additionalFlags: []
            });

            expect(task.additionalFlags).toEqual([]);
            expect(task.additionalFlags).toHaveLength(0);
        });
    });

    describe('isClaudeCodeTask', () => {
        it('should correctly identify Claude Code tasks', () => {
            const claudeTask = createClaudeCodeTask({
                title: 'Claude Task',
                instructions: 'Test Claude task',
                prompt: 'Generate test code'
            });

            expect(isClaudeCodeTask(claudeTask)).toBe(true);
        });

        it('should correctly reject non-Claude Code tasks', () => {
            const cliTask = createCLITask({
                title: 'CLI Task',
                instructions: 'Test CLI task',
                command: 'echo',
                args: ['test']
            });

            expect(isClaudeCodeTask(cliTask)).toBe(false);
        });

        it('should correctly reject claude-agent tasks', () => {
            const agentTask: BaseTask = {
                id: 'task-123',
                type: 'claude-agent',
                title: 'Agent Task',
                instructions: 'Test agent task',
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            expect(isClaudeCodeTask(agentTask)).toBe(false);
        });

        it('should handle all task statuses', () => {
            const statuses: Array<'pending' | 'running' | 'completed' | 'failed'> = 
                ['pending', 'running', 'completed', 'failed'];

            statuses.forEach(status => {
                const task: BaseTask = {
                    id: `task-${status}`,
                    type: 'claude-code',
                    title: `${status} Task`,
                    instructions: `Test ${status} task`,
                    status: status,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                expect(isClaudeCodeTask(task)).toBe(true);
            });
        });
    });

    describe('ClaudeCodeTask structure', () => {
        it('should have all required BaseTask fields', () => {
            const task = createClaudeCodeTask({
                title: 'Structure Test',
                instructions: 'Test structure',
                prompt: 'Test prompt'
            });

            // Check BaseTask fields
            expect(task).toHaveProperty('id');
            expect(task).toHaveProperty('type');
            expect(task).toHaveProperty('title');
            expect(task).toHaveProperty('instructions');
            expect(task).toHaveProperty('status');
            expect(task).toHaveProperty('createdAt');
            expect(task).toHaveProperty('updatedAt');

            // Check ClaudeCodeTask specific fields
            expect(task).toHaveProperty('prompt');
        });

        it('should allow result and error fields to be set later', () => {
            const task = createClaudeCodeTask({
                title: 'Result Test',
                instructions: 'Test result/error',
                prompt: 'Generate code'
            });

            // Initially undefined
            expect(task.result).toBeUndefined();
            expect(task.error).toBeUndefined();

            // Can be set later
            task.result = { code: 'function test() {}' };
            task.error = 'API rate limit exceeded';

            expect(task.result).toEqual({ code: 'function test() {}' });
            expect(task.error).toBe('API rate limit exceeded');
        });
    });

    describe('Type guards for mixed tasks', () => {
        it('should correctly identify task types in a mixed array', () => {
            const tasks: BaseTask[] = [
                createCLITask({
                    title: 'CLI',
                    instructions: 'CLI task',
                    command: 'ls',
                    args: []
                }),
                createClaudeCodeTask({
                    title: 'Claude',
                    instructions: 'Claude task',
                    prompt: 'Generate code'
                }),
                {
                    id: 'agent-1',
                    type: 'claude-agent',
                    title: 'Agent',
                    instructions: 'Agent task',
                    status: 'pending',
                    createdAt: new Date(),
                    updatedAt: new Date()
                } as BaseTask
            ];

            const cliTasks = tasks.filter(isCLITask);
            const claudeCodeTasks = tasks.filter(isClaudeCodeTask);

            expect(cliTasks).toHaveLength(1);
            expect(claudeCodeTasks).toHaveLength(1);
            expect(cliTasks[0].type).toBe('cli');
            expect(claudeCodeTasks[0].type).toBe('claude-code');
        });
    });
});