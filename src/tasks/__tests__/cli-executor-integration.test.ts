import { describe, it, expect } from '@jest/globals';
import { CLIExecutor } from '../executors/cli-executor.js';
import { CLIExecutorEnhanced } from '../executors/cli-executor-enhanced.js';
import { createCLITask } from '../types.js';
import { TaskProcessError, TaskValidationError } from '../executors/errors.js';

describe('CLIExecutor Integration Tests', () => {
    describe('CLIExecutor', () => {
        it('should execute echo command successfully', async () => {
            const executor = new CLIExecutor();
            const task = createCLITask({
                title: 'Echo Test',
                instructions: 'Echo hello world',
                command: 'echo',
                args: ['hello world']
            });

            const result = await executor.execute(task);

            expect(result.stdout).toContain('hello world');
            expect(result.exitCode).toBe(0);
            expect(result.timedOut).toBe(false);
            expect(result.duration).toBeGreaterThan(0);
        });

        it('should execute ls command', async () => {
            const executor = new CLIExecutor();
            const task = createCLITask({
                title: 'List Files',
                instructions: 'List current directory',
                command: 'ls',
                args: ['-la', '.']
            });

            const result = await executor.execute(task);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBeDefined();
            expect(result.stdout.length).toBeGreaterThan(0);
        });

        it('should handle command failure', async () => {
            const executor = new CLIExecutor();
            const task = createCLITask({
                title: 'Fail Test',
                instructions: 'Command that fails',
                command: 'ls',
                args: ['/nonexistent-directory-12345']
            });

            await expect(executor.execute(task)).rejects.toThrow('Process exited with code');
        });

        it('should respect working directory', async () => {
            const executor = new CLIExecutor();
            const task = createCLITask({
                title: 'PWD Test',
                instructions: 'Print working directory',
                command: 'pwd',
                args: [],
                workingDirectory: '/tmp'
            });

            const result = await executor.execute(task);

            expect(result.stdout.trim()).toBe('/tmp');
            expect(result.exitCode).toBe(0);
        });

        it('should pass environment variables', async () => {
            const executor = new CLIExecutor();
            const testValue = `test_${Date.now()}`;
            const task = createCLITask({
                title: 'Env Test',
                instructions: 'Test environment variable',
                command: process.platform === 'win32' ? 'echo %TEST_VAR%' : 'echo $TEST_VAR',
                args: [],
                environment: {
                    TEST_VAR: testValue
                }
            });

            const result = await executor.execute(task);

            expect(result.stdout).toContain(testValue);
        });

        it('should validate empty command', () => {
            const executor = new CLIExecutor();
            const task = createCLITask({
                title: 'Empty Command',
                instructions: 'Invalid task',
                command: '',
                args: []
            });

            expect(() => executor.validateTask(task)).toThrow('Task command cannot be empty');
        });
    });

    describe('CLIExecutorEnhanced', () => {
        it('should execute command with enhanced features', async () => {
            const executor = new CLIExecutorEnhanced({
                timeout: 5000,
                retryAttempts: 1
            });

            const task = createCLITask({
                title: 'Enhanced Test',
                instructions: 'Test enhanced executor',
                command: 'echo',
                args: ['enhanced test']
            });

            const result = await executor.execute(task);

            expect(result.stdout).toContain('enhanced test');
            expect(result.exitCode).toBe(0);
            expect(result.retryCount).toBe(0);
        });

        it('should validate dangerous commands', async () => {
            const executor = new CLIExecutorEnhanced();
            const task = createCLITask({
                title: 'Dangerous Command',
                instructions: 'Should be blocked',
                command: 'rm -rf /',
                args: []
            });

            await expect(executor.execute(task)).rejects.toThrow(TaskValidationError);
        });

        it('should handle non-zero exit with proper error', async () => {
            const executor = new CLIExecutorEnhanced({
                retryAttempts: 1
            });

            const task = createCLITask({
                title: 'Exit Code Test',
                instructions: 'Test exit code handling',
                command: 'exit',
                args: ['42']
            });

            await expect(executor.execute(task)).rejects.toThrow(TaskProcessError);
        });

        it('should emit events during execution', async () => {
            const executor = new CLIExecutorEnhanced();
            const events: string[] = [];

            executor.on('attempt', () => events.push('attempt'));
            executor.on('started', () => events.push('started'));
            executor.on('stdout', () => events.push('stdout'));
            executor.on('completed', () => events.push('completed'));

            const task = createCLITask({
                title: 'Event Test',
                instructions: 'Test event emission',
                command: 'echo',
                args: ['test output']
            });

            await executor.execute(task);

            expect(events).toContain('attempt');
            expect(events).toContain('started');
            expect(events).toContain('stdout');
            expect(events).toContain('completed');
        });

        it('should allow dangerous commands with permission', async () => {
            const executor = new CLIExecutorEnhanced();
            const task = createCLITask({
                title: 'Allowed Dangerous',
                instructions: 'Allowed with flag',
                command: 'echo',
                args: ['rm -rf / # just echoing, not executing'],
                environment: {
                    ALLOW_DANGEROUS: 'true'
                }
            });

            const result = await executor.execute(task);
            expect(result.exitCode).toBe(0);
        });
    });

    describe('Timeout Handling', () => {
        it('should timeout long running commands', async () => {
            const executor = new CLIExecutor({ timeout: 100 });
            const task = createCLITask({
                title: 'Timeout Test',
                instructions: 'Should timeout',
                command: 'sleep',
                args: ['2']
            });

            const startTime = Date.now();
            await expect(executor.execute(task)).rejects.toThrow('timed out');
            const duration = Date.now() - startTime;

            // Should timeout around 100ms, not wait for full 2 seconds
            expect(duration).toBeLessThan(500);
        }, 10000);
    });
});