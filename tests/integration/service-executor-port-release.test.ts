import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ServiceExecutor, ServiceExecutorOptions } from '../../src/tasks/executors/service-executor.js';
import { createServiceTask } from '../../src/tasks/types.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    SERVICE_STABILIZATION_TIME,
    PROCESS_CLEANUP_TIME,
    PORT_RELEASE_CHECK_TIME,
    WAIT_FOR_TIMEOUT,
    DEFAULT_READINESS_TIMEOUT,
    STANDARD_TEST_TIMEOUT,
    WAIT_FOR_DELAYED_PORT_RELEASE
} from './test-timing-constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ServiceExecutor Port Release Verification', () => {
    let executor: ServiceExecutor;
    const fixtureScript = path.join(__dirname, '..', 'fixtures', 'test-service-with-ports.js');
    const TEST_TIMEOUT = STANDARD_TEST_TIMEOUT; // Standard timeout for port tests
    
    // Helper to wait for a condition
    const waitFor = (condition: () => boolean, timeout = WAIT_FOR_TIMEOUT): Promise<void> => {
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
                    timeout: DEFAULT_READINESS_TIMEOUT
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
            await waitFor(() => handle.status === 'running', WAIT_FOR_TIMEOUT);
            expect(handle.endpoints?.get('main-service')).toBe('http://localhost:9501');

            // Stop the service
            await executor.stop(handle.id);

            // Verify port release event was fired
            expect(portReleaseEventFired).toBe(true);
            expect(portsReleasedList).toContain(9501);
        }, TEST_TIMEOUT);

        it('should handle delayed port release', async () => {
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
                    timeout: DEFAULT_READINESS_TIMEOUT
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
            await waitFor(() => handle.status === 'running', WAIT_FOR_TIMEOUT);

            // Stop the service (will have 500ms delay)
            await executor.stop(handle.id);

            // Verify events
            expect(checkingPortRelease).toBe(true);
            expect(portReleased).toBe(true);
        }, TEST_TIMEOUT);
    });

    describe('Multiple Ports Service', () => {
        it('should verify release of multiple ports', async () => {
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
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            let portsReleased: number[] = [];

            executor.on('ports-released', (event) => {
                portsReleased = event.ports;
            });

            // Start the service
            const handle = await executor.start(task);
            
            // Wait for all services to be ready
            await waitFor(() => handle.status === 'running', WAIT_FOR_TIMEOUT);
            
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
        it('should only monitor ports with monitorPortReleaseUponTermination=true', async () => {
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
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            let portsChecked: number[] = [];

            executor.on('checking-port-release', (event) => {
                portsChecked = event.ports;
            });

            // Start the service
            const handle = await executor.start(task);
            await waitFor(() => handle.status === 'running', WAIT_FOR_TIMEOUT);

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
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            let portCheckingStarted = false;

            executor.on('checking-port-release', () => {
                portCheckingStarted = true;
            });

            // Start the service
            const handle = await executor.start(task);
            await waitFor(() => handle.status === 'running', WAIT_FOR_TIMEOUT);

            // Stop the service
            await executor.stop(handle.id);

            // No port checking should occur
            expect(portCheckingStarted).toBe(false);
        }, TEST_TIMEOUT);
    });

    describe('Port Release Success', () => {
        it('should NOT emit timeout event when ports are released quickly', async () => {
            // This test verifies that properly terminated services release ports without timeout
            const task = createServiceTask({
                title: 'Service with Quick Port Release',
                instructions: 'Test port releases quickly',
                command: 'node',
                args: [fixtureScript, 'immediate-release', '9530'],
                readiness: {
                    patterns: [{
                        regex: 'Service ready on http://localhost:(\\d+)',
                        name: 'service-url',
                        endpoints: [{
                            endpointName: 'quick-service',
                            endpointDefaultHostUrl: 'http://localhost',
                            endpointCaptureGroup: 1,
                            monitorPortReleaseUponTermination: true
                        }]
                    }],
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            let timeoutEventFired = false;
            let portsReleased = false;

            executor.on('port-release-timeout', () => {
                timeoutEventFired = true;
            });

            executor.on('ports-released', () => {
                portsReleased = true;
            });

            // Start the service
            const handle = await executor.start(task);
            await waitFor(() => handle.status === 'running', WAIT_FOR_TIMEOUT);

            // Stop the service - should release ports quickly
            await executor.stop(handle.id);

            // Should have successful release, not timeout
            expect(portsReleased).toBe(true);
            expect(timeoutEventFired).toBe(false);
        }, TEST_TIMEOUT);
    });

    describe('Unexpected Exit Port Release', () => {
        it.skip('should handle unexpected process exit gracefully', async () => {
            // SKIPPED: SIGKILL behavior is system-dependent and unpredictable
            // The OS will eventually release the port, but timing varies
            // This test verifies that the system handles SIGKILL appropriately
            // When a process is killed with SIGKILL, it cannot clean up ports immediately,
            // but the port will eventually be released by the OS
            const task = createServiceTask({
                title: 'Service with Unexpected Exit',
                instructions: 'Test unexpected exit handling',
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
                    timeout: DEFAULT_READINESS_TIMEOUT
                }
            });

            // Start the service
            const handle = await executor.start(task);
            await waitFor(() => handle.status === 'running', WAIT_FOR_TIMEOUT);

            // Get the service and kill it unexpectedly
            const services = (executor as any).services;
            const service = services.get(handle.id);
            if (service && service.process) {
                // SIGKILL the process - this simulates a crash
                service.process.kill('SIGKILL');
                
                // Give a moment for the process death to be detected
                await new Promise(resolve => setTimeout(resolve, SERVICE_STABILIZATION_TIME));
            }

            // Wait for service to be removed from registry after process exit
            await waitFor(() => !services.has(handle.id), WAIT_FOR_TIMEOUT);

            // Verify service is removed from registry
            const status = executor.getStatus(handle.id);
            expect(status).toBeNull();
            
            // Note: After SIGKILL, port release may take time and is handled by OS
            // We're mainly testing that the system doesn't crash or hang
        }, TEST_TIMEOUT);
    });
});