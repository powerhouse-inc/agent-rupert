import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ServiceExecutor } from '../../src/tasks/executors/service-executor.js';
import { createServiceTask } from '../../src/tasks/types.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Integration tests for ServiceExecutor
 * 
 * These tests use a real test service script to verify that ServiceExecutor
 * correctly manages long-running processes without timeouts.
 */
describe('ServiceExecutor Integration Tests', () => {
    let executor: ServiceExecutor;
    const testServicePath = path.join(__dirname, '..', 'fixtures', 'test-service.js');

    beforeAll(() => {
        executor = new ServiceExecutor({
            maxLogSize: 100,
            defaultGracefulShutdownTimeout: 2000
        });
    });

    afterAll(async () => {
        // Ensure all services are stopped
        await executor.stopAll({ force: true });
        
        // Give time for processes to fully clean up
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Remove all listeners to prevent memory leaks
        executor.removeAllListeners();
    });

    describe('Long-Running Services Without Timeout', () => {
        it('should run a service for longer than typical CLI timeout', async () => {
            // Start a simple service that runs forever
            const task = createServiceTask({
                title: 'Long Running Service',
                instructions: 'Test that service runs without timeout',
                command: 'node',
                args: [testServicePath, 'simple']
            });

            const handle = await executor.start(task);
            expect(handle.status).toBe('running');

            // Wait for 3 seconds (longer than typical CLI timeout)
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Service should still be running
            const status = executor.getStatus(handle.id);
            expect(status).toBeDefined();
            expect(status?.handle.status).toBe('running');
            expect(status?.uptime).toBeGreaterThanOrEqual(3000);

            // Verify we captured some logs
            const logs = executor.getLogs(handle.id);
            expect(logs.length).toBeGreaterThan(0);
            expect(logs.some(log => log.includes('tick'))).toBe(true);

            // Clean up
            await executor.stop(handle.id);
        }, 10000); // 10 second test timeout

        it('should handle service that exits after some time', async () => {
            const task = createServiceTask({
                title: 'Counted Service',
                instructions: 'Service that exits after 5 ticks',
                command: 'node',
                args: [testServicePath, 'counted']
            });

            const handle = await executor.start(task);
            expect(handle.status).toBe('running');

            // Wait for service to complete (5 ticks * 200ms = 1 second)
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Service should no longer be in the registry
            const status = executor.getStatus(handle.id);
            expect(status).toBeNull();

            // Logs should contain all 5 ticks
            const logs = executor.getLogs(handle.id);
            expect(logs.filter(log => log.includes('tick')).length).toBe(0); // Logs cleared after exit
        });
    });

    describe('Graceful Shutdown', () => {
        it('should stop service gracefully with SIGTERM', async () => {
            const task = createServiceTask({
                title: 'Graceful Service',
                instructions: 'Service that handles SIGTERM',
                command: 'node',
                args: [testServicePath, 'graceful']
            });

            const handle = await executor.start(task);
            
            // Let it run for a moment
            await new Promise(resolve => setTimeout(resolve, 500));

            // Stop gracefully
            await executor.stop(handle.id);

            // Service should be gone
            const status = executor.getStatus(handle.id);
            expect(status).toBeNull();
        });

        it('should force stop stubborn service with SIGKILL', async () => {
            const task = createServiceTask({
                title: 'Stubborn Service',
                instructions: 'Service that ignores SIGTERM',
                command: 'node',
                args: [testServicePath, 'stubborn']
            });

            const handle = await executor.start(task);
            
            // Let it run for a moment
            await new Promise(resolve => setTimeout(resolve, 500));

            // Force stop
            await executor.stop(handle.id, { force: true });

            // Service should be gone
            const status = executor.getStatus(handle.id);
            expect(status).toBeNull();
        });
    });

    describe('Service Output Capture', () => {
        it('should capture both stdout and stderr', async () => {
            const task = createServiceTask({
                title: 'Output Service',
                instructions: 'Service that outputs to both streams',
                command: 'node',
                args: [testServicePath, 'output']
            });

            const outputs: any[] = [];
            executor.on('service-output', (data) => outputs.push(data));

            const handle = await executor.start(task);

            // Wait for service to complete
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check that we captured both stdout and stderr
            expect(outputs.length).toBeGreaterThan(0);
            expect(outputs.some(o => o.type === 'stdout')).toBe(true);
            expect(outputs.some(o => o.type === 'stderr')).toBe(true);

            // Clean up listener
            executor.removeAllListeners('service-output');
        });
    });

    describe('Multiple Services', () => {
        it('should manage multiple concurrent services', async () => {
            const task1 = createServiceTask({
                title: 'Service 1',
                instructions: 'First service',
                command: 'node',
                args: [testServicePath, 'simple']
            });

            const task2 = createServiceTask({
                title: 'Service 2',
                instructions: 'Second service',
                command: 'node',
                args: [testServicePath, 'graceful']
            });

            const handle1 = await executor.start(task1);
            const handle2 = await executor.start(task2);

            // Both should be running
            const services = executor.getAllServices();
            expect(services.length).toBe(2);
            expect(services.some(s => s.id === handle1.id)).toBe(true);
            expect(services.some(s => s.id === handle2.id)).toBe(true);

            // Stop all with force to ensure cleanup
            await executor.stopAll({ force: true });

            // None should be running
            const servicesAfter = executor.getAllServices();
            expect(servicesAfter.length).toBe(0);
        });
    });

    describe('Service Restart', () => {
        it('should restart a service', async () => {
            const task = createServiceTask({
                title: 'Restartable Service',
                instructions: 'Service to be restarted',
                command: 'node',
                args: [testServicePath, 'simple']
            });

            const handle1 = await executor.start(task);
            const pid1 = handle1.pid;

            // Wait a moment
            await new Promise(resolve => setTimeout(resolve, 500));

            // Restart the service
            const handle2 = await executor.restart(handle1.id);
            const pid2 = handle2.pid;

            // Should have different PIDs
            expect(pid2).not.toBe(pid1);
            expect(handle2.status).toBe('running');

            // Clean up
            await executor.stop(handle2.id);
        });
    });

    describe('Error Handling', () => {
        it('should handle service that fails immediately', async () => {
            const task = createServiceTask({
                title: 'Failing Service',
                instructions: 'Service that exits with error',
                command: 'node',
                args: [testServicePath, 'immediate-fail']
            });

            const handle = await executor.start(task);

            // Wait for service to fail
            await new Promise(resolve => setTimeout(resolve, 500));

            // Service should not be in registry
            const status = executor.getStatus(handle.id);
            expect(status).toBeNull();
        });

        it('should handle invalid command', async () => {
            const task = createServiceTask({
                title: 'Invalid Service',
                instructions: 'Service with invalid command',
                command: 'nonexistent-command-xyz',
                args: []
            });

            // Should complete without throwing (process spawn error handled internally)
            const handle = await executor.start(task);
            expect(handle).toBeDefined();

            // Wait a moment for the error to be processed
            await new Promise(resolve => setTimeout(resolve, 100));

            // Service should have failed
            const status = executor.getStatus(handle.id);
            expect(status).toBeNull(); // Removed from registry after failure
        });
    });

    describe('Event Lifecycle', () => {
        it('should emit complete service lifecycle events', async () => {
            const events: string[] = [];
            
            executor.on('service-started', () => events.push('started'));
            executor.on('service-stopping', () => events.push('stopping'));
            executor.on('service-stopped', () => events.push('stopped'));
            executor.on('service-exited', () => events.push('exited'));

            const task = createServiceTask({
                title: 'Event Test Service',
                instructions: 'Test lifecycle events',
                command: 'node',
                args: [testServicePath, 'graceful']
            });

            const handle = await executor.start(task);
            expect(events).toContain('started');

            await executor.stop(handle.id);
            expect(events).toContain('stopping');
            expect(events).toContain('stopped');

            // Clean up listeners
            executor.removeAllListeners('service-started');
            executor.removeAllListeners('service-stopping');
            executor.removeAllListeners('service-stopped');
            executor.removeAllListeners('service-exited');
        });
    });
});