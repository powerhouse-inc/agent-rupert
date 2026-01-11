import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ClaudeCodeExecutor } from '../../src/tasks/executors/claude-code-executor.js';
import { ReactorPackagesManager } from '../../src/powerhouse/ReactorPackagesManager.js';
import { createClaudeCodeTask } from '../../src/tasks/types.js';
import { TaskValidationError } from '../../src/tasks/executors/errors.js';

describe('ClaudeCodeExecutor', () => {
    let executor: ClaudeCodeExecutor;
    let mockProjectsManager: any;
    let mockCLIExecutor: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock ReactorPackagesManager
        mockProjectsManager = {
            getRunningProject: jest.fn(),
            runProject: jest.fn(),
            shutdownProject: jest.fn()
        };

        // Create executor with mocked dependencies
        executor = new ClaudeCodeExecutor(mockProjectsManager);
        
        // Add a default error listener to prevent unhandled error events
        executor.on('error', () => {});

        // Mock the internal CLI executor
        mockCLIExecutor = {
            execute: jest.fn()
        };
        (executor as any).cliExecutor = mockCLIExecutor;
    });

    describe('execute', () => {
        it('should fail when no project is running', async () => {
            // Mock no running project
            mockProjectsManager.getRunningProject.mockReturnValue(null);

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: 'Help me write a function'
            });

            const result = await executor.execute(task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No Powerhouse project is currently running');
            expect(mockCLIExecutor.execute).not.toHaveBeenCalled();
        });

        it('should execute successfully with running project', async () => {
            // Mock a running project
            mockProjectsManager.getRunningProject.mockReturnValue({
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            });

            // Mock successful CLI execution
            mockCLIExecutor.execute.mockResolvedValue({
                stdout: 'Claude response output',
                stderr: '',
                exitCode: 0,
                timedOut: false,
                startedAt: new Date(),
                completedAt: new Date(),
                duration: 1000
            });

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: 'Help me write a function'
            });

            const result = await executor.execute(task);

            expect(result.success).toBe(true);
            expect(result.output).toBe('Claude response output');
            expect(result.projectName).toBe('test-project');
            expect(result.projectPath).toBe('/path/to/test-project');
            expect(result.error).toBeUndefined();

            // Verify CLI task was created with correct parameters
            expect(mockCLIExecutor.execute).toHaveBeenCalledTimes(1);
            const cliTask = mockCLIExecutor.execute.mock.calls[0][0];
            expect(cliTask.command).toBe('claude');
            expect(cliTask.args).toContain('Help me write a function');
            expect(cliTask.workingDirectory).toBe('/path/to/test-project');
        });

        it('should use custom project path when provided', async () => {
            // Mock a running project
            mockProjectsManager.getRunningProject.mockReturnValue({
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            });

            mockCLIExecutor.execute.mockResolvedValue({
                stdout: 'Success',
                stderr: '',
                exitCode: 0
            });

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: 'Test prompt',
                projectPath: '/custom/path'
            });

            await executor.execute(task);

            const cliTask = mockCLIExecutor.execute.mock.calls[0][0];
            expect(cliTask.workingDirectory).toBe('/custom/path');
        });

        it('should fail with empty prompt', async () => {
            // Mock a running project
            mockProjectsManager.getRunningProject.mockReturnValue({
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            });

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: ''
            });

            await expect(executor.execute(task)).rejects.toThrow(TaskValidationError);
            await expect(executor.execute(task)).rejects.toThrow('requires a non-empty prompt');
            expect(mockCLIExecutor.execute).not.toHaveBeenCalled();
        });

        it('should fail with prompt exceeding max length', async () => {
            // Mock a running project
            mockProjectsManager.getRunningProject.mockReturnValue({
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            });

            // Create executor with small max prompt length
            const limitedExecutor = new ClaudeCodeExecutor(mockProjectsManager, {
                maxPromptLength: 10
            });
            (limitedExecutor as any).cliExecutor = mockCLIExecutor;

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: 'This prompt is way too long for the limit'
            });

            await expect(limitedExecutor.execute(task)).rejects.toThrow(TaskValidationError);
            await expect(limitedExecutor.execute(task)).rejects.toThrow('exceeds maximum length');
            expect(mockCLIExecutor.execute).not.toHaveBeenCalled();
        });

        it('should handle CLI execution failure', async () => {
            // Mock a running project
            mockProjectsManager.getRunningProject.mockReturnValue({
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            });

            // Mock failed CLI execution
            mockCLIExecutor.execute.mockResolvedValue({
                stdout: 'Partial output',
                stderr: 'Error: API rate limit exceeded',
                exitCode: 1,
                timedOut: false,
                startedAt: new Date(),
                completedAt: new Date(),
                duration: 1000
            });

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: 'Test prompt'
            });

            const result = await executor.execute(task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('API rate limit exceeded');
            expect(result.output).toBe('Partial output');
            expect(result.projectName).toBe('test-project');
        });

        it('should handle CLI execution exception', async () => {
            // Mock a running project
            mockProjectsManager.getRunningProject.mockReturnValue({
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            });

            // Mock CLI execution throwing error
            mockCLIExecutor.execute.mockRejectedValue(new Error('Command not found: claude'));

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: 'Test prompt'
            });

            const result = await executor.execute(task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to execute Claude Code task');
            expect(result.error).toContain('Command not found: claude');
        });

        it('should include additional flags when provided', async () => {
            // Mock a running project
            mockProjectsManager.getRunningProject.mockReturnValue({
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            });

            mockCLIExecutor.execute.mockResolvedValue({
                stdout: 'Success',
                stderr: '',
                exitCode: 0
            });

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: 'Test prompt',
                additionalFlags: ['--verbose', '--json']
            });

            await executor.execute(task);

            const cliTask = mockCLIExecutor.execute.mock.calls[0][0];
            expect(cliTask.args).toEqual(['Test prompt', '--verbose', '--json']);
        });

        it('should emit events during execution', async () => {
            // Mock a running project
            mockProjectsManager.getRunningProject.mockReturnValue({
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            });

            mockCLIExecutor.execute.mockResolvedValue({
                stdout: 'Success',
                stderr: '',
                exitCode: 0
            });

            const startedHandler = jest.fn();
            const completedHandler = jest.fn();
            const errorHandler = jest.fn();

            executor.on('started', startedHandler);
            executor.on('completed', completedHandler);
            executor.on('error', errorHandler);

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: 'Test prompt'
            });

            await executor.execute(task);

            expect(startedHandler).toHaveBeenCalledTimes(1);
            expect(startedHandler).toHaveBeenCalledWith(expect.objectContaining({
                task,
                projectName: 'test-project',
                projectPath: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001
            }));

            expect(completedHandler).toHaveBeenCalledTimes(1);
            expect(errorHandler).not.toHaveBeenCalled();
        });

        it('should emit error event when no project is running', async () => {
            mockProjectsManager.getRunningProject.mockReturnValue(null);

            const errorHandler = jest.fn();
            executor.on('error', errorHandler);

            const task = createClaudeCodeTask({
                title: 'Test Claude Task',
                instructions: 'Test instructions',
                prompt: 'Test prompt'
            });

            await executor.execute(task);

            expect(errorHandler).toHaveBeenCalledTimes(1);
            expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
                task,
                error: expect.stringContaining('No Powerhouse project')
            }));
        });
    });

    describe('hasRunningProject', () => {
        it('should return true when project is running', () => {
            mockProjectsManager.getRunningProject.mockReturnValue({
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            });

            expect(executor.hasRunningProject()).toBe(true);
        });

        it('should return false when no project is running', () => {
            mockProjectsManager.getRunningProject.mockReturnValue(null);

            expect(executor.hasRunningProject()).toBe(false);
        });
    });

    describe('getRunningProject', () => {
        it('should return running project info', () => {
            const projectInfo = {
                name: 'test-project',
                path: '/path/to/test-project',
                connectPort: 3000,
                switchboardPort: 4001,
                startedAt: new Date(),
                logs: []
            };

            mockProjectsManager.getRunningProject.mockReturnValue(projectInfo);

            expect(executor.getRunningProject()).toBe(projectInfo);
        });

        it('should return null when no project is running', () => {
            mockProjectsManager.getRunningProject.mockReturnValue(null);

            expect(executor.getRunningProject()).toBeNull();
        });
    });
});