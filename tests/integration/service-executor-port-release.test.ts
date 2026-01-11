import { describe, it, expect, beforeEach, afterEach, xit } from '@jest/globals';
import { ServiceExecutor, ServiceExecutorOptions } from '../../src/tasks/executors/service-executor.js';
import { createServiceTask } from '../../src/tasks/types.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ServiceExecutor Port Release Verification', () => {
    let executor: ServiceExecutor;
    const fixtureScript = path.join(__dirname, '..', 'fixtures', 'test-service-with-ports.js');
    const TEST_TIMEOUT = 10000; // 10 seconds for port tests
    
    // Helper to wait for a condition
    const waitFor = (condition: () => boolean, timeout = 5000): Promise<void> => {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const interval = setInterval(() => {
                if (condition()) {
                    clearInterval(interval);
                    resolve();
                } else if (Date.now() - start > timeout) {
                    clearInterval(interval);
                    reject(new Error('Timeout waiting for condition'));
                }
            }, 50);
        });
    };

    beforeEach(() => {
        const options: ServiceExecutorOptions = {
            maxLogSize: 100,
            defaultGracefulShutdownTimeout: 1000,
            portReleaseOptions: {
                verifyPortRelease: true,
                portReleaseTimeout: 3000,
                portCheckInterval: 100,
                portCheckRetries: 30
            }
        };
        executor = new ServiceExecutor(options);
    });

    afterEach(async () => {
        // Clean up any running services
        const services = executor.getAllServices();
        for (const handle of services) {
            try {
                await executor.stop(handle.id);
            } catch (error) {
                // Ignore errors during cleanup
            }
        }
    });

    describe('Single Port Service', () => {
        it('should detect and verify port release for HTTP server', async () => {
            const task = createServiceTask({
                title: 'HTTP Server with Port',
                instructions: 'Test HTTP server port release',
                command: 'node',
                args: [fixtureScript, 'http-server', '9501'],
                readiness: {
                    patterns: [{
                        regex: 'Service ready on http://localhost:(\\d+)',
                        name: 'service-url',
                        endpoints: [{
                            endpointName: 'main-service',
                            endpointDefaultHostUrl: 'http://localhost',
                            endpointCaptureGroup: 1,
                            monitorPortReleaseUponTermination: true
                        }]
                    }],
                    timeout: 1000
                }
            });

            let portReleaseEventFired = false;
            let portsReleasedList: number[] = [];

            executor.on('ports-released', (event) => {
                portReleaseEventFired = true;
                portsReleasedList = event.ports;
            });

            // Start the service
            const handle = await executor.start(task);
            expect(handle.status).toBe('booting');

            // Wait for service to be ready
            await waitFor(() => handle.status === 'running', 2000);
            expect(handle.endpoints?.get('main-service')).toBe('http://localhost:9501');

            // Stop the service
            await executor.stop(handle.id);

            // Verify port release event was fired
            expect(portReleaseEventFired).toBe(true);
            expect(portsReleasedList).toContain(9501);
        }, TEST_TIMEOUT);

        xit('should handle delayed port release', async () => {
            const task = createServiceTask({
                title: 'Service with Delayed Port Release',
                instructions: 'Test delayed port release',
                command: 'node',
                args: [fixtureScript, 'delayed-release', '9502'],
                readiness: {
                    patterns: [{
                        regex: 'Service ready on http://localhost:(\\d+)',
                        name: 'service-url',
                        endpoints: [{
                            endpointName: 'delayed-service',
                            endpointDefaultHostUrl: 'http://localhost',
                            endpointCaptureGroup: 1,
                            monitorPortReleaseUponTermination: true
                        }]
                    }],
                    timeout: 1000
                }
            });

            let checkingPortRelease = false;
            let portReleased = false;

            executor.on('checking-port-release', () => {
                checkingPortRelease = true;
            });

            executor.on('ports-released', () => {
                portReleased = true;
            });

            // Start and wait for ready
            const handle = await executor.start(task);
            await waitFor(() => handle.status === 'running', 2000);

            // Stop the service (will have 500ms delay)
            await executor.stop(handle.id);

            // Verify events
            expect(checkingPortRelease).toBe(true);
            expect(portReleased).toBe(true);
        }, TEST_TIMEOUT);
    });

    describe('Multiple Ports Service', () => {
        xit('should verify release of multiple ports', async () => {
            const task = createServiceTask({
                title: 'Multi-Port Service',
                instructions: 'Test multiple port release',
                command: 'node',
                args: [fixtureScript, 'multiple-ports', '9510'],
                readiness: {
                    patterns: [
                        {
                            regex: 'API server listening on port (\\d+)',
                            name: 'api-port',
                            endpoints: [{
                                endpointName: 'api',
                                endpointDefaultHostUrl: 'http://localhost',
                                endpointCaptureGroup: 1,
                                monitorPortReleaseUponTermination: true
                            }]
                        },
                        {
                            regex: 'WebSocket server listening on port (\\d+)',
                            name: 'ws-port',
                            endpoints: [{
                                endpointName: 'websocket',
                                endpointDefaultHostUrl: 'ws://localhost',
                                endpointCaptureGroup: 1,
                                monitorPortReleaseUponTermination: true
                            }]
                        },
                        {
                            regex: 'Admin server listening on port (\\d+)',
                            name: 'admin-port',
                            endpoints: [{
                                endpointName: 'admin',
                                endpointDefaultHostUrl: 'http://localhost',
                                endpointCaptureGroup: 1,
                                monitorPortReleaseUponTermination: true
                            }]
                        }
                    ],
                    timeout: 1000
                }
            });

            let portsReleased: number[] = [];

            executor.on('ports-released', (event) => {
                portsReleased = event.ports;
            });

            // Start the service
            const handle = await executor.start(task);
            
            // Wait for all services to be ready
            await waitFor(() => handle.status === 'running', 2000);
            
            // Verify all endpoints were captured
            expect(handle.endpoints?.get('api')).toBe('http://localhost:9510');
            expect(handle.endpoints?.get('websocket')).toBe('ws://localhost:9511');
            expect(handle.endpoints?.get('admin')).toBe('http://localhost:9512');

            // Stop the service
            await executor.stop(handle.id);

            // Verify all ports were released
            expect(portsReleased).toContain(9510);
            expect(portsReleased).toContain(9511);
            expect(portsReleased).toContain(9512);
            expect(portsReleased.length).toBe(3);
        }, TEST_TIMEOUT);
    });

    describe('Selective Port Monitoring', () => {
        xit('should only monitor ports with monitorPortReleaseUponTermination=true', async () => {
            const task = createServiceTask({
                title: 'Selective Port Monitoring',
                instructions: 'Test selective port monitoring',
                command: 'node',
                args: [fixtureScript, 'port-with-url', '9520'],
                readiness: {
                    patterns: [
                        {
                            regex: 'Switchboard listening on port (\\d+)',
                            name: 'switchboard',
                            endpoints: [{
                                endpointName: 'switchboard',
                                endpointDefaultHostUrl: 'http://localhost',
                                endpointCaptureGroup: 1,
                                monitorPortReleaseUponTermination: true  // Monitor this one
                            }]
                        },
                        {
                            regex: 'Connect Studio running on port (\\d+)',
                            name: 'connect',
                            endpoints: [{
                                endpointName: 'connect',
                                endpointDefaultHostUrl: 'http://localhost',
                                endpointCaptureGroup: 1,
                                monitorPortReleaseUponTermination: false  // Don't monitor this one
                            }]
                        }
                    ],
                    timeout: 1000
                }
            });

            let portsChecked: number[] = [];

            executor.on('checking-port-release', (event) => {
                portsChecked = event.ports;
            });

            // Start the service
            const handle = await executor.start(task);
            await waitFor(() => handle.status === 'running', 2000);

            // Stop the service
            await executor.stop(handle.id);

            // Only port 9520 should be monitored, not 9521
            expect(portsChecked).toContain(9520);
            expect(portsChecked).not.toContain(9521);
            expect(portsChecked.length).toBe(1);
        }, TEST_TIMEOUT);
    });

    describe('No Port Service', () => {
        it('should handle services without ports gracefully', async () => {
            const task = createServiceTask({
                title: 'Service Without Ports',
                instructions: 'Test service with no ports',
                command: 'node',
                args: [fixtureScript, 'no-port'],
                readiness: {
                    patterns: [{
                        regex: 'Service ready \\(no ports\\)',
                        name: 'ready'
                    }],
                    timeout: 1000
                }
            });

            let portCheckingStarted = false;

            executor.on('checking-port-release', () => {
                portCheckingStarted = true;
            });

            // Start the service
            const handle = await executor.start(task);
            await waitFor(() => handle.status === 'running', 2000);

            // Stop the service
            await executor.stop(handle.id);

            // No port checking should occur
            expect(portCheckingStarted).toBe(false);
        }, TEST_TIMEOUT);
    });

    describe('Port Release Timeout', () => {
        xit('should emit timeout event if port is not released', async () => {
            // This test simulates a stuck port by using a very short timeout
            const quickTimeoutExecutor = new ServiceExecutor({
                maxLogSize: 100,
                defaultGracefulShutdownTimeout: 1000,
                portReleaseOptions: {
                    verifyPortRelease: true,
                    portReleaseTimeout: 100,  // Very short timeout
                    portCheckInterval: 50,
                    portCheckRetries: 2  // Only 2 retries
                }
            });

            const task = createServiceTask({
                title: 'Service with Stuck Port',
                instructions: 'Test port release timeout',
                command: 'node',
                args: [fixtureScript, 'delayed-release', '9530'],
                readiness: {
                    patterns: [{
                        regex: 'Service ready on http://localhost:(\\d+)',
                        name: 'service-url',
                        endpoints: [{
                            endpointName: 'stuck-service',
                            endpointDefaultHostUrl: 'http://localhost',
                            endpointCaptureGroup: 1,
                            monitorPortReleaseUponTermination: true
                        }]
                    }],
                    timeout: 1000
                }
            });

            let timeoutEventFired = false;
            let unavailablePorts: number[] = [];

            quickTimeoutExecutor.on('port-release-timeout', (event) => {
                timeoutEventFired = true;
                unavailablePorts = event.unavailablePorts;
            });

            // Start the service
            const handle = await quickTimeoutExecutor.start(task);
            await waitFor(() => handle.status === 'running', 2000);

            // Stop the service (port release will be delayed by 500ms, but timeout is 100ms)
            await quickTimeoutExecutor.stop(handle.id);

            // Timeout event should have fired
            expect(timeoutEventFired).toBe(true);
            expect(unavailablePorts).toContain(9530);
            
            // Clean up
            await new Promise(resolve => setTimeout(resolve, 1000));
        }, TEST_TIMEOUT);
    });

    describe('Unexpected Exit Port Release', () => {
        xit('should verify port release on unexpected process exit', async () => {
            const task = createServiceTask({
                title: 'Service with Unexpected Exit',
                instructions: 'Test port release on crash',
                command: 'node',
                args: [fixtureScript, 'immediate-release', '9540'],
                readiness: {
                    patterns: [{
                        regex: 'Service ready on http://localhost:(\\d+)',
                        name: 'service-url',
                        endpoints: [{
                            endpointName: 'crash-service',
                            endpointDefaultHostUrl: 'http://localhost',
                            endpointCaptureGroup: 1,
                            monitorPortReleaseUponTermination: true
                        }]
                    }],
                    timeout: 1000
                }
            });

            let portsReleased = false;

            executor.on('ports-released', () => {
                portsReleased = true;
            });

            // Start the service
            const handle = await executor.start(task);
            await waitFor(() => handle.status === 'running', 2000);

            // Get the service and kill it unexpectedly
            const services = (executor as any).services;
            const service = services.get(handle.id);
            if (service) {
                // Simulate unexpected exit by killing the process
                service.process.kill('SIGKILL');
            }

            // Wait for process to exit and port release check
            await waitFor(() => !services.has(handle.id), 2000);

            // Port release should still be verified
            expect(portsReleased).toBe(true);
        }, TEST_TIMEOUT);
    });
});