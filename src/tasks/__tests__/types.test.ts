import { describe, it, expect } from '@jest/globals';
import { 
    createCLITask, 
    isCLITask,
    type BaseTask
} from '../types.js';

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