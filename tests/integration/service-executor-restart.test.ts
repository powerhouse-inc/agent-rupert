import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ServiceExecutor } from '../../src/tasks/executors/service-executor.js';
import { ServiceTask, createServiceTask } from '../../src/tasks/types.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
    SERVICE_STABILIZATION_TIME,
    DEFAULT_READINESS_TIMEOUT,
    STANDARD_TEST_TIMEOUT,
    EXTENDED_TEST_TIMEOUT
} from './test-timing-constants.js';

describe('ServiceExecutor restart integration', () => {
    let executor: ServiceExecutor;
    let fixturesPath: string;

    beforeAll(() => {
        executor = new ServiceExecutor({
            maxLogSize: 100,
            defaultGracefulShutdownTimeout: 5000
        });
        
        // Path to test fixtures
        fixturesPath = path.join(process.cwd(), 'tests', 'unit', 'test-scripts');
    });

    afterAll(async () => {
        // Clean up any running services
        await executor.stopAll({ force: true });
    });

    describe('restart()', () => {
        it('should restart a running service and maintain the same configuration', async () => {
            // Ensure tmp directory exists
            const tmpDir = path.join(process.cwd(), 'tmp');
            await fs.mkdir(tmpDir, { recursive: true });
            
            // Create a simple counter service that increments a counter in a file
            const counterFile = path.join(tmpDir, `counter-${Date.now()}.txt`);
            
            const task: ServiceTask = createServiceTask({
                title: 'Counter Service',
                instructions: 'Count indefinitely and write to file',
                command: 'node',
                args: [path.join(fixturesPath, 'counter-service.js'), counterFile],
                workingDirectory: process.cwd(),
                environment: {
                    NODE_ENV: 'test',
                    COUNTER_INTERVAL: '100' // Count every 100ms
                }
            });

            // Start the service
            const handle = await executor.start(task);
            expect(handle.status).toBe('running');
            const firstPid = handle.pid;
            expect(firstPid).toBeGreaterThan(0);

            // Wait for counter to start counting
            await new Promise(resolve => setTimeout(resolve, SERVICE_STABILIZATION_TIME * 2));

            // Check that counter file exists and has some counts
            const firstContent = await fs.readFile(counterFile, 'utf-8');
            const firstCount = parseInt(firstContent.trim(), 10);
            expect(firstCount).toBeGreaterThan(0);

            // Get initial logs
            const logsBeforeRestart = executor.getLogs(handle.id);
            expect(logsBeforeRestart.length).toBeGreaterThan(0);

            // Restart the service
            const restartedHandle = await executor.restart(handle.id);
            expect(restartedHandle.id).toBeDefined(); // New service handle
            expect(restartedHandle.status).toBe('running');
            const secondPid = restartedHandle.pid;
            expect(secondPid).toBeGreaterThan(0);
            expect(secondPid).not.toBe(firstPid); // Different process

            // Wait for restarted service to run
            await new Promise(resolve => setTimeout(resolve, SERVICE_STABILIZATION_TIME * 2));

            // Check that counter restarted (should start from 1 again)
            const secondContent = await fs.readFile(counterFile, 'utf-8');
            const secondCount = parseInt(secondContent.trim(), 10);
            expect(secondCount).toBeGreaterThan(0);
            expect(secondCount).toBeLessThanOrEqual(firstCount); // Restarted, so count is lower or same

            // Get logs after restart - new handle has its own logs
            const logsAfterRestart = executor.getLogs(restartedHandle.id);
            expect(logsAfterRestart.length).toBeGreaterThan(0);

            // Stop the service (use the new handle ID)
            await executor.stop(restartedHandle.id, { force: true });

            // Clean up counter file
            await fs.unlink(counterFile).catch(() => {});
        }, EXTENDED_TEST_TIMEOUT);

        it('should handle restart of a service with readiness patterns', async () => {
            const task: ServiceTask = createServiceTask({
                title: 'HTTP Server with Readiness',
                instructions: 'Start HTTP server and detect when ready',
                command: 'node',
                args: [path.join(process.cwd(), 'tests', 'fixtures', 'test-service-with-readiness.js'), 'powerhouse'],
                workingDirectory: process.cwd(),
                readiness: {
                    patterns: [{
                        regex: 'Drive URL:\\s+(https?://[^\\s]+)',
                        name: 'drive-url'
                    }],
                    timeout: 2000 // Give it more time for readiness
                }
            });

            let readyEventCount = 0;
            const readyHandler = () => {
                readyEventCount++;
            };
            executor.on('service-ready', readyHandler);

            // Start the service
            const handle = await executor.start(task);
            // Service will be 'booting' initially until readiness patterns are matched
            expect(['booting', 'running', 'ready']).toContain(handle.status);
            
            // Wait for service to become ready
            await new Promise(resolve => setTimeout(resolve, 1000));
            expect(readyEventCount).toBeGreaterThanOrEqual(1);

            // Restart the service
            const restartedHandle = await executor.restart(handle.id);
            expect(['booting', 'running', 'ready']).toContain(restartedHandle.status); // Service restarts in booting state

            // Wait for the service to become ready again
            await new Promise(resolve => setTimeout(resolve, SERVICE_STABILIZATION_TIME * 10)); // More time for readiness
            
            // Check ready event was fired again (may be more than 2 due to restart)
            expect(readyEventCount).toBeGreaterThanOrEqual(2);

            // Stop the service (use the new handle ID)
            await executor.stop(restartedHandle.id, { force: true });
            executor.removeListener('service-ready', readyHandler);
        }, EXTENDED_TEST_TIMEOUT);

        it('should fail to restart a non-existent service', async () => {
            await expect(executor.restart('non-existent-service'))
                .rejects
                .toThrow(/Service .* not found/);
        });
    });
});