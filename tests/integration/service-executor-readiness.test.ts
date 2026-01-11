import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ServiceExecutor } from '../../src/tasks/executors/service-executor.js';
import { createServiceTask } from '../../src/tasks/types.js';
import type { ServiceTask, ServiceHandle, ReadinessConfig } from '../../src/tasks/types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    FIXTURE_PATTERN_INTERVAL,
    TEST_TIMING_BUFFER,
    DEFAULT_READINESS_TIMEOUT,
    EXTENDED_READINESS_TIMEOUT,
    EXTENDED_TEST_TIMEOUT
} from './test-timing-constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper to get test fixture path
const getTestFixture = (name: string) => {
    return path.join(__dirname, '..', 'fixtures', name);
};

describe('ServiceExecutor Readiness Detection', () => {
    let executor: ServiceExecutor;
    let runningServices: ServiceHandle[] = [];

    beforeEach(() => {
        executor = new ServiceExecutor({
            maxLogSize: 100,
            defaultGracefulShutdownTimeout: 5000
        });
        runningServices = [];
    });

    afterEach(async () => {
        // Clean up all running services
        for (const handle of runningServices) {
            try {
                await executor.stop(handle.id, { force: true });
            } catch {
                // Ignore errors during cleanup
            }
        }
    });

    describe('Boot Phase with Readiness Patterns', () => {
        it('should start service in booting status when readiness configured', async () => {
            const task = createServiceTask({
                title: 'Test Service with Readiness',
                instructions: 'Test boot phase',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'immediate-ready'],
                readiness: {
                    patterns: [{
                        regex: 'Service ready',
                        stream: 'stdout'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Should start in booting status
            expect(handle.status).toBe('booting');
            expect(handle.bootedAt).toBeUndefined();
        });

        it('should start service in running status when no readiness configured', async () => {
            const task = createServiceTask({
                title: 'Test Service without Readiness',
                instructions: 'Test immediate running',
                command: 'node',
                args: [getTestFixture('test-service.js'), 'simple']
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Should start in running status immediately
            expect(handle.status).toBe('running');
            expect(handle.bootedAt).toBeUndefined(); // No boot phase
        });

        it('should transition from booting to running when pattern matches', async () => {
            const readyPromise = new Promise<ServiceHandle>((resolve) => {
                executor.once('service-ready', (event) => {
                    resolve(event.handle);
                });
            });

            const task = createServiceTask({
                title: 'Test Readiness Transition',
                instructions: 'Test booting to running transition',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'port-only'],
                readiness: {
                    patterns: [{
                        regex: 'listening on port (\\d+)',
                        stream: 'stdout',
                        name: 'http-port'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            expect(handle.status).toBe('booting');

            // Wait for readiness
            const readyHandle = await readyPromise;
            
            expect(readyHandle.id).toBe(handle.id);
            expect(readyHandle.status).toBe('running');
            expect(readyHandle.bootedAt).toBeInstanceOf(Date);
            expect(readyHandle.readinessMatches).toBeDefined();
            expect(readyHandle.readinessMatches?.get('http-port')).toEqual(['8888']);
        });

        it('should capture endpoint information from patterns', async () => {
            const readyPromise = new Promise<ServiceHandle>((resolve) => {
                executor.once('service-ready', (event) => {
                    resolve(event.handle);
                });
            });

            const task = createServiceTask({
                title: 'Test Endpoint Capture',
                instructions: 'Test endpoint URL construction',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'powerhouse'],
                readiness: {
                    patterns: [
                        {
                            regex: 'Connect Studio running on port (\\d+)',
                            stream: 'stdout',
                            name: 'connect',
                            endpoints: [{
                                endpointName: 'vetra-connect',
                                endpointDefaultHostUrl: 'http://localhost',
                                endpointCaptureGroup: 1
                            }]
                        },
                        {
                            regex: 'Switchboard listening on port (\\d+)',
                            stream: 'stdout',
                            name: 'switchboard',
                            endpoints: [{
                                endpointName: 'vetra-switchboard',
                                endpointDefaultHostUrl: 'http://localhost',
                                endpointCaptureGroup: 1
                            }]
                        },
                        {
                            regex: 'Drive URL: (https?://[^\\s]+)',
                            stream: 'stdout',
                            name: 'drive',
                            endpoints: [{
                                endpointName: 'drive-url',
                                endpointDefaultHostUrl: '',
                                endpointCaptureGroup: 1
                            }]
                        }
                    ],
                    timeout: EXTENDED_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Wait for readiness
            const readyHandle = await readyPromise;
            
            expect(readyHandle.endpoints).toBeDefined();
            expect(readyHandle.endpoints?.get('vetra-connect')).toBe('http://localhost:3000');
            expect(readyHandle.endpoints?.get('vetra-switchboard')).toBe('http://localhost:4001');
            expect(readyHandle.endpoints?.get('drive-url')).toBe('http://localhost:4001/drives/abc123xyz789');
        });

        it('should match patterns from stderr', async () => {
            const readyPromise = new Promise<ServiceHandle>((resolve) => {
                executor.once('service-ready', (event) => {
                    resolve(event.handle);
                });
            });

            const task = createServiceTask({
                title: 'Test Stderr Readiness',
                instructions: 'Test readiness from stderr',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'stderr-ready'],
                readiness: {
                    patterns: [{
                        regex: 'Drive URL: (https?://[^\\s]+)',
                        stream: 'stderr',
                        name: 'drive-stderr'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Wait for readiness
            const readyHandle = await readyPromise;
            
            expect(readyHandle.readinessMatches?.get('drive-stderr')).toEqual(['http://localhost:4001/drives/stderr456']);
        });

        it('should match patterns from any stream', async () => {
            const readyPromise = new Promise<ServiceHandle>((resolve) => {
                executor.once('service-ready', (event) => {
                    resolve(event.handle);
                });
            });

            const task = createServiceTask({
                title: 'Test Any Stream Readiness',
                instructions: 'Test readiness from any stream',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'stderr-ready'],
                readiness: {
                    patterns: [{
                        regex: 'Connect port: (\\d+)',
                        stream: 'any',
                        name: 'connect-any'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Wait for readiness
            const readyHandle = await readyPromise;
            
            // Should match from stderr even though pattern is 'any'
            expect(readyHandle.readinessMatches?.get('connect-any')).toEqual(['3000']);
        });

        it('should require all patterns to match for readiness', async () => {
            let readyEventFired = false;
            executor.once('service-ready', () => {
                readyEventFired = true;
            });

            const task = createServiceTask({
                title: 'Test Multiple Pattern Requirements',
                instructions: 'Test all patterns must match',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'multi-pattern'],
                readiness: {
                    patterns: [
                        {
                            regex: 'Database connected',
                            name: 'database'
                        },
                        {
                            regex: 'API server ready',
                            name: 'api'
                        },
                        {
                            regex: 'WebSocket server listening',
                            name: 'websocket'
                        },
                        {
                            regex: 'All components ready',
                            name: 'final'
                        }
                    ],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Wait a bit for partial matches (3 patterns at 20ms intervals)
            await new Promise(resolve => setTimeout(resolve, FIXTURE_PATTERN_INTERVAL * 2));
            
            // Should still be booting after partial matches
            expect(handle.status).toBe('booting');
            expect(readyEventFired).toBe(false);

            // Wait for the final pattern
            await new Promise(resolve => setTimeout(resolve, FIXTURE_PATTERN_INTERVAL * 2 + TEST_TIMING_BUFFER));
            
            // Now should be ready
            expect(handle.status).toBe('running');
            expect(readyEventFired).toBe(true);
        });

        it('should timeout if patterns not matched within timeout', async () => {
            const timeoutPromise = new Promise<void>((resolve) => {
                executor.once('boot-timeout', () => {
                    resolve();
                });
            });

            const task = createServiceTask({
                title: 'Test Boot Timeout',
                instructions: 'Test boot phase timeout',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'boot-fail'],
                readiness: {
                    patterns: [{
                        regex: 'This pattern will never match',
                        name: 'never'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT // Short timeout for testing
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            expect(handle.status).toBe('booting');

            // Wait for timeout
            await timeoutPromise;

            // Service should transition to running even after timeout (by default)
            expect(handle.status).toBe('running');
            expect(handle.bootedAt).toBeInstanceOf(Date);
            expect(handle.readinessMatches?.size).toBe(0); // No matches
        });

        it('should handle mixed output with readiness patterns', async () => {
            const readyPromise = new Promise<ServiceHandle>((resolve) => {
                executor.once('service-ready', (event) => {
                    resolve(event.handle);
                });
            });

            const task = createServiceTask({
                title: 'Test Mixed Output',
                instructions: 'Test readiness detection in noisy output',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'mixed-output'],
                readiness: {
                    patterns: [
                        {
                            regex: 'Server port: (\\d+)',
                            name: 'port'
                        },
                        {
                            regex: 'Drive URL: (https?://[^\\s]+)',
                            name: 'drive'
                        }
                    ],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Wait for readiness
            const readyHandle = await readyPromise;
            
            expect(readyHandle.readinessMatches?.get('port')).toEqual(['7777']);
            expect(readyHandle.readinessMatches?.get('drive')).toEqual(['http://localhost:7777/drives/mixed999']);
        });
    });

    describe('Boot Phase Events', () => {
        it('should emit service-booting event when starting with readiness', async () => {
            const bootingPromise = new Promise<any>((resolve) => {
                executor.once('service-booting', (event) => {
                    resolve(event);
                });
            });

            const readiness: ReadinessConfig = {
                patterns: [{
                    regex: 'ready',
                    name: 'ready'
                }],
                timeout: EXTENDED_READINESS_TIMEOUT
            };

            const task = createServiceTask({
                title: 'Test Booting Event',
                instructions: 'Test service-booting event',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'immediate-ready'],
                readiness
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            const bootingEvent = await bootingPromise;
            
            expect(bootingEvent.handle.id).toBe(handle.id);
            expect(bootingEvent.readinessConfig).toEqual(readiness);
        });

        it('should emit service-ready event with boot duration', async () => {
            const readyPromise = new Promise<any>((resolve) => {
                executor.once('service-ready', (event) => {
                    resolve(event);
                });
            });

            const task = createServiceTask({
                title: 'Test Ready Event',
                instructions: 'Test service-ready event',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'port-only'],
                readiness: {
                    patterns: [{
                        regex: 'listening on port',
                        name: 'port'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const startTime = Date.now();
            const handle = await executor.start(task);
            runningServices.push(handle);

            const readyEvent = await readyPromise;
            const endTime = Date.now();
            
            expect(readyEvent.handle.id).toBe(handle.id);
            expect(readyEvent.bootDuration).toBeGreaterThan(0);
            expect(readyEvent.bootDuration).toBeLessThanOrEqual(endTime - startTime);
            expect(readyEvent.readinessMatches).toBeDefined();
        });

        it('should emit readiness-match event for each pattern match', async () => {
            const matches: any[] = [];
            executor.on('readiness-match', (event) => {
                matches.push(event);
            });

            const task = createServiceTask({
                title: 'Test Match Events',
                instructions: 'Test readiness-match events',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'powerhouse'],
                readiness: {
                    patterns: [
                        {
                            regex: 'Connect Studio running on port (\\d+)',
                            name: 'connect'
                        },
                        {
                            regex: 'Switchboard listening on port (\\d+)',
                            name: 'switchboard'
                        }
                    ],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Wait for patterns to match
            await new Promise(resolve => setTimeout(resolve, 350));

            expect(matches.length).toBe(2);
            expect(matches[0].pattern).toBe('connect');
            expect(matches[0].matches).toEqual(['3000']);
            expect(matches[1].pattern).toBe('switchboard');
            expect(matches[1].matches).toEqual(['4001']);

            executor.removeAllListeners('readiness-match');
        });

        it('should emit boot-timeout event when timeout expires', async () => {
            const timeoutPromise = new Promise<any>((resolve) => {
                executor.once('boot-timeout', (event) => {
                    resolve(event);
                });
            });

            const task = createServiceTask({
                title: 'Test Timeout Event',
                instructions: 'Test boot-timeout event',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'boot-fail'],
                readiness: {
                    patterns: [{
                        regex: 'Never matches',
                        name: 'never'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT // Very short timeout
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            const timeoutEvent = await timeoutPromise;
            
            // Verify the event has all properties that consumers like PowerhouseProjectsManager expect
            expect(timeoutEvent).toBeDefined();
            expect(timeoutEvent.handle).toBeDefined();
            expect(timeoutEvent.handle.id).toBe(handle.id);
            expect(timeoutEvent.timeout).toBe(DEFAULT_READINESS_TIMEOUT);
            
            // Verify that the service transitions to running after timeout
            const serviceInfo = executor.getStatus(handle.id);
            expect(serviceInfo?.handle.status).toBe('running');
        });
    });

    describe('Service Lifecycle with Boot Phase', () => {
        it('should stop service during boot phase', async () => {
            const task = createServiceTask({
                title: 'Test Stop During Boot',
                instructions: 'Test stopping during boot phase',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'slow-boot'],
                readiness: {
                    patterns: [{
                        regex: 'Service ready on port',
                        name: 'ready'
                    }],
                    timeout: EXTENDED_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            
            // Give the service a moment to enter boot phase
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(handle.status).toBe('booting');

            // Stop during boot phase
            await executor.stop(handle.id);
            
            // Give time for cleanup
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const status = executor.getStatus(handle.id);
            expect(status).toBeNull(); // Service removed after stop
        }, 10000);

        it('should clear boot timeout when service stops', async () => {
            let timeoutFired = false;
            executor.once('boot-timeout', () => {
                timeoutFired = true;
            });

            const task = createServiceTask({
                title: 'Test Timeout Cleanup',
                instructions: 'Test boot timeout cleanup on stop',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'boot-fail'],
                readiness: {
                    patterns: [{
                        regex: 'Never',
                        name: 'never'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            
            // Stop before timeout
            await executor.stop(handle.id, { force: true });
            
            // Wait past when timeout would have fired
            await new Promise(resolve => setTimeout(resolve, 600));
            
            expect(timeoutFired).toBe(false);
        });

        it('should add log entry when boot timeout occurs', async () => {
            const task = createServiceTask({
                title: 'Test Timeout Log',
                instructions: 'Test that timeout adds log entry',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'boot-fail'],
                readiness: {
                    patterns: [{
                        regex: 'Will never match this',
                        name: 'never'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Wait for timeout to occur
            await new Promise(resolve => setTimeout(resolve, DEFAULT_READINESS_TIMEOUT + 100));

            const logs = executor.getLogs(handle.id);
            const timeoutLog = logs.find(log => 
                log.includes(`Boot timeout after ${DEFAULT_READINESS_TIMEOUT}ms`)
            );
            
            expect(timeoutLog).toBeDefined();
            expect(handle.status).toBe('running'); // Should be running after timeout
        });

        it('should handle multiple services with different boot timeouts', async () => {
            const timeoutEvents: any[] = [];
            executor.on('boot-timeout', (event) => {
                timeoutEvents.push(event);
            });

            // First service with short timeout
            const task1 = createServiceTask({
                title: 'Service 1',
                instructions: 'Service with short timeout',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'boot-fail'],
                readiness: {
                    patterns: [{ regex: 'Never', name: 'never' }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            // Second service with longer timeout  
            const task2 = createServiceTask({
                title: 'Service 2',
                instructions: 'Service with longer timeout',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'boot-fail'],
                readiness: {
                    patterns: [{ regex: 'Never', name: 'never' }],
                    timeout: EXTENDED_READINESS_TIMEOUT
                }
            });

            const handle1 = await executor.start(task1);
            const handle2 = await executor.start(task2);
            runningServices.push(handle1, handle2);

            // Wait for first timeout
            await new Promise(resolve => setTimeout(resolve, DEFAULT_READINESS_TIMEOUT + 100));
            expect(timeoutEvents).toHaveLength(1);
            expect(timeoutEvents[0].handle.id).toBe(handle1.id);

            // Wait for second timeout
            await new Promise(resolve => setTimeout(resolve, EXTENDED_READINESS_TIMEOUT));
            expect(timeoutEvents).toHaveLength(2);
            expect(timeoutEvents[1].handle.id).toBe(handle2.id);

            executor.removeAllListeners('boot-timeout');
        }, EXTENDED_TEST_TIMEOUT);


        it('should emit boot-timeout event consumable by managers', async () => {
            // This test verifies that the boot-timeout event can be properly consumed
            // by managers like PowerhouseProjectsManager
            
            let bootTimeoutHandlerCalled = false;
            let capturedEvent: any = null;
            
            // Simulate PowerhouseProjectsManager's bootTimeoutHandler
            const bootTimeoutHandler = (event: any) => {
                // This mimics what PowerhouseProjectsManager does
                if (event.handle && event.handle.id) {
                    bootTimeoutHandlerCalled = true;
                    capturedEvent = event;
                    // In real code, this would resolve a promise with null
                    // (PowerhouseProjectsManager would log a warning here)
                }
            };
            
            executor.once('boot-timeout', bootTimeoutHandler);
            
            const task = createServiceTask({
                title: 'Manager Timeout Test',
                instructions: 'Test that managers can consume boot-timeout',
                command: 'node', 
                args: [getTestFixture('test-service-with-readiness.js'), 'boot-fail'],
                readiness: {
                    patterns: [{
                        regex: 'Drive URL:\\s+(https?://[^\\s]+)',
                        name: 'drive-url'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });
            
            const handle = await executor.start(task);
            runningServices.push(handle);
            
            // Wait for timeout to occur
            await new Promise(resolve => setTimeout(resolve, DEFAULT_READINESS_TIMEOUT + 100));
            
            // Verify the handler was called
            expect(bootTimeoutHandlerCalled).toBe(true);
            expect(capturedEvent).toBeDefined();
            expect(capturedEvent.handle.id).toBe(handle.id);
            expect(capturedEvent.timeout).toBe(DEFAULT_READINESS_TIMEOUT);
            
            // Clean up
            executor.removeListener('boot-timeout', bootTimeoutHandler);
        });

        it('should transition from booting to running on timeout', async () => {
            const task = createServiceTask({
                title: 'Timeout Transition Service',
                instructions: 'Test state transition on timeout',
                command: 'node',
                args: [getTestFixture('test-service-with-readiness.js'), 'boot-fail'],
                readiness: {
                    patterns: [{
                        regex: 'Will not match',
                        name: 'never'
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            const handle = await executor.start(task);
            runningServices.push(handle);

            // Initially should be booting
            expect(handle.status).toBe('booting');

            // Wait for timeout to occur
            await new Promise(resolve => setTimeout(resolve, DEFAULT_READINESS_TIMEOUT + 100));

            // Should transition to running after timeout
            const serviceInfo = executor.getStatus(handle.id);
            expect(serviceInfo?.handle.status).toBe('running');
        });
    });
});