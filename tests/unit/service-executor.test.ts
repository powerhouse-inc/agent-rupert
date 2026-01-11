import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ServiceExecutor } from '../../src/tasks/executors/service-executor.js';
import { createServiceTask, ServiceTask } from '../../src/tasks/types.js';

/**
 * Unit tests for ServiceExecutor
 * 
 * These tests focus on the ServiceExecutor API and basic validation.
 * More complex process management scenarios are tested in integration tests.
 */
describe('ServiceExecutor', () => {
    let executor: ServiceExecutor;

    beforeEach(() => {
        executor = new ServiceExecutor({
            maxLogSize: 100,
            defaultGracefulShutdownTimeout: 5000
        });
    });

    afterEach(async () => {
        // Clean up any running services
        await executor.stopAll({ force: true });
    });

    describe('Service Management API', () => {
        it('should create ServiceExecutor with default options', () => {
            const executor = new ServiceExecutor();
            expect(executor).toBeInstanceOf(ServiceExecutor);
        });

        it('should create ServiceExecutor with custom options', () => {
            const executor = new ServiceExecutor({
                maxLogSize: 50,
                defaultGracefulShutdownTimeout: 10000,
                autoRestart: true
            });
            expect(executor).toBeInstanceOf(ServiceExecutor);
        });

        it('should return empty array when no services are running', () => {
            const services = executor.getAllServices();
            expect(services).toEqual([]);
        });

        it('should return null status for non-existent service', () => {
            const status = executor.getStatus('non-existent');
            expect(status).toBeNull();
        });

        it('should return empty logs for non-existent service', () => {
            const logs = executor.getLogs('non-existent');
            expect(logs).toEqual([]);
        });

        it('should handle stopping non-existent service', async () => {
            await expect(executor.stop('non-existent')).rejects.toThrow(/not found/);
        });

        it('should handle restarting non-existent service', async () => {
            await expect(executor.restart('non-existent')).rejects.toThrow(/not found/);
        });
    });

    describe('Task Validation', () => {
        it('should validate service task with missing title', async () => {
            const task = createServiceTask({
                title: 'Test',
                instructions: 'Test service',
                command: 'node',
                args: ['-e', 'process.exit(0)']
            });
            task.title = ''; // Make it invalid

            await expect(executor.start(task)).rejects.toThrow();
        });

        it('should validate service task with empty command', async () => {
            const task = createServiceTask({
                title: 'Test',
                instructions: 'Test service',
                command: '',
                args: []
            });

            await expect(executor.start(task)).rejects.toThrow();
        });

        it('should validate service task with invalid restart policy', async () => {
            const task = createServiceTask({
                title: 'Test',
                instructions: 'Test service',
                command: 'node',
                args: ['-e', 'process.exit(0)'],
                restartPolicy: {
                    enabled: true,
                    maxRetries: -1 // Invalid
                }
            });

            await expect(executor.start(task)).rejects.toThrow(/must be a positive number/);
        });
    });

    describe('Event Emission', () => {
        it('should be an EventEmitter', () => {
            expect(executor.on).toBeDefined();
            expect(executor.emit).toBeDefined();
            expect(executor.removeListener).toBeDefined();
        });

        it('should emit process-spawned event', (done) => {
            executor.once('process-spawned', (event) => {
                expect(event).toHaveProperty('pid');
                expect(event).toHaveProperty('command');
                expect(event).toHaveProperty('args');
                done();
            });

            const task = createServiceTask({
                title: 'Test',
                instructions: 'Test service',
                command: 'node',
                args: ['-e', 'setTimeout(() => process.exit(0), 100)']
            });

            executor.start(task).catch(() => {
                // Ignore errors, we're just testing event emission
            });
        });
    });

    describe('Service Handle', () => {
        it('should return valid service handle on start', async () => {
            const task = createServiceTask({
                title: 'Test Service',
                instructions: 'Test service',
                command: 'node',
                args: ['-e', 'setTimeout(() => process.exit(0), 100)']
            });

            const handle = await executor.start(task);

            expect(handle).toBeDefined();
            expect(handle.id).toMatch(/^service-\d+-[a-z0-9]+$/);
            expect(handle.taskId).toBe(task.id);
            expect(handle.status).toBe('running');
            expect(handle.startedAt).toBeInstanceOf(Date);
            expect(handle.pid).toBeDefined();
            expect(typeof handle.pid).toBe('number');
        });

        it('should prevent starting same task twice', async () => {
            const task = createServiceTask({
                title: 'Test Service',
                instructions: 'Test service',
                command: 'node',
                args: ['-e', 'setTimeout(() => process.exit(0), 1000)']
            });

            const handle1 = await executor.start(task);
            expect(handle1).toBeDefined();

            // Try to start the same task again
            await expect(executor.start(task)).rejects.toThrow(/already running/);

            // Clean up
            await executor.stop(handle1.id, { force: true });
        });
    });

    describe('Log Management', () => {
        it('should return logs with limit', async () => {
            // Create mock logs
            const service: any = {
                logs: ['log1', 'log2', 'log3', 'log4', 'log5']
            };
            
            // Store the service temporarily
            const serviceId = 'test-service-id';
            (executor as any).services.set(serviceId, service);

            const logs = executor.getLogs(serviceId, { limit: 3 });
            expect(logs).toEqual(['log3', 'log4', 'log5']); // Last 3 logs

            // Clean up
            (executor as any).services.delete(serviceId);
        });
    });

    describe('Stop All Services', () => {
        it('should handle stopAll when no services running', async () => {
            await expect(executor.stopAll()).resolves.toBeUndefined();
        });

        it('should handle stopAll with force option', async () => {
            await expect(executor.stopAll({ force: true })).resolves.toBeUndefined();
        });
    });
});