import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { CLIExecutor } from '../../src/tasks/executors/cli-executor.js';
import { createCLITask } from '../../src/tasks/types.js';
import { 
    TaskProcessError, 
    TaskTimeoutError, 
    TaskExecutionError,
    TaskValidationError 
} from '../../src/tasks/executors/errors.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper to get test script path
const getTestScript = (scriptName: string) => {
    return path.join(__dirname, 'test-scripts', scriptName);
};

// Clean up any test artifacts
const cleanupTestArtifacts = () => {
    const attemptFile = path.join(__dirname, 'test-scripts', '.attempt-count');
    if (fs.existsSync(attemptFile)) {
        fs.unlinkSync(attemptFile);
    }
};

describe('CLIExecutor Advanced Features', () => {
    let executor: CLIExecutor;
    
    beforeEach(() => {
        jest.clearAllMocks();
        cleanupTestArtifacts();
    });

    afterEach(() => {
        jest.useRealTimers();
        cleanupTestArtifacts();
    });

    describe('Streaming Functionality', () => {
        it('should stream output from script', async () => {
            executor = new CLIExecutor({ retryAttempts: 1 });
            const stdoutChunks: string[] = [];
            const streamEvents: any[] = [];
            
            executor.on('stream', (event) => {
                streamEvents.push(event);
            });

            const task = createCLITask({
                title: 'Stream Test',
                instructions: 'Test streaming output',
                command: 'node',
                args: [getTestScript('stream-output.js')]
            });

            const result = await executor.executeWithStream(task, {
                onStdout: (data) => stdoutChunks.push(data),
                bufferOutput: true
            });

            expect(stdoutChunks.length).toBeGreaterThan(0);
            expect(result.stdout).toContain('First line');
            expect(result.stdout).toContain('Second line');
            expect(result.stdout).toContain('Third line');
            
            // Check stream events
            const startEvent = streamEvents.find(e => e.type === 'start');
            const stdoutEvents = streamEvents.filter(e => e.type === 'stdout');
            const exitEvent = streamEvents.find(e => e.type === 'exit');
            
            expect(startEvent).toBeDefined();
            expect(stdoutEvents.length).toBeGreaterThan(0);
            expect(exitEvent).toBeDefined();
            expect(exitEvent.code).toBe(0);
        });

        it('should handle both stdout and stderr', async () => {
            executor = new CLIExecutor({ retryAttempts: 1 });
            const stdoutChunks: string[] = [];
            const stderrChunks: string[] = [];

            const task = createCLITask({
                title: 'Error Output Test',
                instructions: 'Test error output',
                command: 'node',
                args: [getTestScript('error-output.js')],
                environment: {
                    MESSAGE: 'test message',
                    EXIT_CODE: '0'
                }
            });

            const result = await executor.executeWithStream(task, {
                onStdout: (data) => stdoutChunks.push(data),
                onStderr: (data) => stderrChunks.push(data),
                bufferOutput: true
            });

            expect(stdoutChunks.join('')).toContain('stdout: test message');
            expect(stderrChunks.join('')).toContain('stderr: test message');
            expect(result.exitCode).toBe(0);
        });

        it('should handle stream without buffering', async () => {
            executor = new CLIExecutor({ retryAttempts: 1 });
            let outputReceived = false;

            const task = createCLITask({
                title: 'No Buffer Test',
                instructions: 'Test without buffering',
                command: 'echo',
                args: ['unbuffered output']
            });

            const result = await executor.executeWithStream(task, {
                onStdout: (_data) => { outputReceived = true; },
                bufferOutput: false
            });

            expect(outputReceived).toBe(true);
            // When bufferOutput is false, stdout should be empty
            expect(result.stdout).toBe('');
        });
    });

    describe('Retry Logic', () => {
        it('should retry on retryable exit codes', async () => {
            executor = new CLIExecutor({ 
                retryAttempts: 2,
                retryDelay: 10
            });

            let attemptCount = 0;
            let retryCount = 0;
            
            executor.on('attempt', () => attemptCount++);
            executor.on('retry', () => retryCount++);

            // Use exit code 137 which is retryable (SIGKILL)
            const task = createCLITask({
                title: 'Retry Test',
                instructions: 'Test retry on retryable exit code',
                command: 'exit',
                args: ['137']
            });

            await expect(executor.execute(task)).rejects.toThrow(TaskProcessError);
            
            // Should have attempted twice (1 initial + 1 retry)
            expect(attemptCount).toBe(2);
            expect(retryCount).toBe(1);
        });

        it('should handle timeout with controlled script', async () => {
            executor = new CLIExecutor({ 
                timeout: 100,
                retryAttempts: 2,
                retryDelay: 10
            });

            let timeoutEvents = 0;
            executor.on('timeout', () => timeoutEvents++);

            const task = createCLITask({
                title: 'Controlled Timeout Test',
                instructions: 'Test timeout handling',
                command: 'node',
                args: [getTestScript('controlled-timeout.js')],
                environment: {
                    DURATION_MS: '500' // Run for 500ms but timeout is 100ms
                }
            });

            await expect(executor.execute(task)).rejects.toThrow(TaskTimeoutError);
            expect(timeoutEvents).toBe(2); // One for each attempt
        });

        it('should not retry on validation errors', async () => {
            executor = new CLIExecutor({ 
                retryAttempts: 3
            });

            let attemptCount = 0;
            executor.on('attempt', () => attemptCount++);

            const task = createCLITask({
                title: 'Validation Error Test',
                instructions: 'Test no retry on validation',
                command: '',
                args: []
            });

            await expect(executor.execute(task)).rejects.toThrow(TaskValidationError);
            expect(attemptCount).toBe(0); // Should not even attempt
        });
    });

    describe('Error Handling', () => {
        it('should emit lifecycle events on success', async () => {
            executor = new CLIExecutor({ retryAttempts: 1 });
            const events: string[] = [];
            
            executor.on('attempt', () => events.push('attempt'));
            executor.on('started', () => events.push('started'));
            executor.on('stdout', () => events.push('stdout'));
            executor.on('completed', () => events.push('completed'));

            const task = createCLITask({
                title: 'Event Test',
                instructions: 'Test events',
                command: 'echo',
                args: ['test output']
            });

            await executor.execute(task);
            
            expect(events).toContain('attempt');
            expect(events).toContain('started');
            expect(events).toContain('stdout');
            expect(events).toContain('completed');
        });

        it('should handle non-zero exit codes', async () => {
            executor = new CLIExecutor({ retryAttempts: 1 });

            const task = createCLITask({
                title: 'Exit Code Test',
                instructions: 'Test exit code handling',
                command: 'node',
                args: [getTestScript('error-output.js')],
                environment: {
                    MESSAGE: 'error',
                    EXIT_CODE: '42'
                }
            });

            await expect(executor.execute(task)).rejects.toThrow(TaskProcessError);
        });

        it('should respect IGNORE_EXIT_CODE', async () => {
            executor = new CLIExecutor({ retryAttempts: 1 });

            const task = createCLITask({
                title: 'Ignore Exit Code Test',
                instructions: 'Test ignoring exit codes',
                command: 'node',
                args: [getTestScript('error-output.js')],
                environment: {
                    MESSAGE: 'ignored error',
                    EXIT_CODE: '42',
                    IGNORE_EXIT_CODE: 'true'
                }
            });

            const result = await executor.execute(task);
            expect(result.exitCode).toBe(42);
            expect(result.stdout).toContain('ignored error');
        });

        it('should emit warning on output truncation', async () => {
            executor = new CLIExecutor({ 
                maxOutputSize: 20, // Very small to trigger truncation
                retryAttempts: 1
            });
            
            let warningEmitted = false;
            executor.on('warning', (event) => {
                warningEmitted = true;
                expect(event.message).toContain('exceeded');
            });

            const task = createCLITask({
                title: 'Truncation Test',
                instructions: 'Test output truncation',
                command: 'echo',
                args: ['This is a very long output that will definitely be truncated because it exceeds the limit']
            });

            const result = await executor.execute(task);
            
            expect(warningEmitted).toBe(true);
            expect(result.stdout).toContain('[Output truncated');
        });
    });

    describe('Validation', () => {
        it('should validate required task properties', async () => {
            executor = new CLIExecutor();

            // Test missing command
            const task1 = createCLITask({
                title: 'test',
                instructions: 'test',
                command: '',
                args: []
            });
            await expect(executor.execute(task1)).rejects.toThrow(TaskValidationError);

            // Test invalid args
            const task2 = { 
                ...createCLITask({
                    title: 'test',
                    instructions: 'test',
                    command: 'echo',
                    args: []
                }),
                args: null as any
            };
            await expect(executor.execute(task2)).rejects.toThrow(TaskValidationError);
        });

        it('should block dangerous commands by default', async () => {
            executor = new CLIExecutor();

            const task = createCLITask({
                title: 'Dangerous Command',
                instructions: 'Should be blocked',
                command: 'rm -rf /',
                args: []
            });

            await expect(executor.execute(task)).rejects.toThrow(TaskValidationError);
        });

        it('should allow dangerous commands with permission', async () => {
            executor = new CLIExecutor({ retryAttempts: 1 });

            const task = createCLITask({
                title: 'Dangerous Allowed',
                instructions: 'Test dangerous with permission',
                command: 'echo',
                args: ['simulating dangerous command'],
                environment: {
                    ALLOW_DANGEROUS: 'true'
                }
            });

            const result = await executor.execute(task);
            expect(result.exitCode).toBe(0);
        });
    });
});