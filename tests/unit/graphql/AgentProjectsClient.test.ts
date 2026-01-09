import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { AgentProjectsClient } from '../../../src/graphql/AgentProjectsClient.js';
import { ProjectStatus, LogLevel, LogSource } from '../../../src/graphql/types.js';

// Mock fetch globally
const originalFetch = global.fetch;
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('AgentProjectsClient', () => {
    let client: AgentProjectsClient;
    let mockFetch: jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
        mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
        mockFetch.mockClear();
        
        // Default mock to prevent undefined errors
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: {} }),
            text: async () => 'OK',
            status: 200
        } as Response);
        
        client = new AgentProjectsClient({
            endpoint: 'http://localhost:4001/graphql',
            retryAttempts: 2,
            retryDelay: 100,
            timeout: 5000
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useRealTimers();
        // Clear any pending queue processing
        if (client) {
            (client as any).queueTimer && clearTimeout((client as any).queueTimer);
        }
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    describe('registerProject', () => {
        it('should register a project successfully', async () => {
            // The actual implementation now returns operation ID, not complex response
            const mockResponse = {
                data: {
                    registerProject: {
                        success: true,
                        message: 'Project registered successfully',
                        document: {
                            id: 'test-project',
                            name: 'test-project',
                            path: '/projects/test-project',
                            port: 3000,
                            status: 'STOPPED',
                            autoStart: false,
                            createdAt: '2024-01-01T00:00:00Z',
                            updatedAt: '2024-01-01T00:00:00Z'
                        }
                    }
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
                text: async () => JSON.stringify(mockResponse),
                status: 200
            } as Response);

            const result = await client.registerProject('/projects/test-project');

            expect(result.success).toBe(true);
            expect(result.document?.name).toBe('test-project');
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4001/graphql',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json'
                    })
                })
            );
        });

        it('should handle GraphQL errors', async () => {
            const mockResponse = {
                errors: [{
                    message: 'Project already exists'
                }]
            };

            // Clear the default mock and set specific mocks for this test
            mockFetch.mockReset();
            // Provide the same error response for all retry attempts (client has retryAttempts: 2)
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
                text: async () => JSON.stringify(mockResponse),
                status: 200
            } as Response);

            await expect(client.registerProject('/projects/existing-project')).rejects.toThrow('Project already exists');
        });

        it('should retry on network failure', async () => {
            mockFetch
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        data: {
                            registerProject: {
                                success: true,
                                document: { id: 'test', name: 'test' }
                            }
                        }
                    }),
                    text: async () => JSON.stringify({
                        data: {
                            registerProject: {
                                success: true,
                                document: { id: 'test', name: 'test' }
                            }
                        }
                    }),
                    status: 200
                } as Response);

            const result = await client.registerProject('/test');

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });
    });

    describe('updateProjectStatus', () => {
        it('should update project status', async () => {
            const mockResponse = {
                data: {
                    updateProjectStatus: {
                        success: true,
                        document: {
                            id: 'test-project',
                            status: 'RUNNING'
                        }
                    }
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
                text: async () => JSON.stringify(mockResponse),
                status: 200
            } as Response);

            const result = await client.updateProjectStatus(
                'test-project',
                ProjectStatus.RUNNING
            );

            expect(result.success).toBe(true);
            expect(result.document?.status).toBe('RUNNING');
        });
    });

    describe('updateProjectRuntime', () => {
        it('should update project runtime with Drive URL', async () => {
            const mockResponse = {
                data: {
                    updateProjectRuntime: {
                        success: true,
                        document: {
                            id: 'test-project',
                            runtime: {
                                pid: 12345,
                                startedAt: '2024-01-01T00:00:00Z',
                                driveUrl: 'http://localhost:4001/drives/xyz'
                            }
                        }
                    }
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
                text: async () => JSON.stringify(mockResponse),
                status: 200
            } as Response);

            const result = await client.updateProjectRuntime(
                'test-project',
                {
                    pid: 12345,
                    startedAt: '2024-01-01T00:00:00Z',
                    driveUrl: 'http://localhost:4001/drives/xyz'
                }
            );

            expect(result.success).toBe(true);
            expect(result.document?.runtime?.driveUrl).toBe('http://localhost:4001/drives/xyz');
        });
    });

    describe('addLogEntry', () => {
        it('should add a log entry', async () => {
            const mockResponse = {
                data: {
                    addLogEntry: {
                        success: true,
                        document: {
                            id: 'test-project',
                            logs: [
                                {
                                    id: 'log-1',
                                    timestamp: '2024-01-01T00:00:00Z',
                                    level: 'INFO',
                                    message: 'Project started',
                                    source: 'SYSTEM'
                                }
                            ]
                        }
                    }
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
                text: async () => JSON.stringify(mockResponse),
                status: 200
            } as Response);

            const result = await client.addLogEntry(
                'test-project',
                LogLevel.INFO,
                'Project started',
                LogSource.SYSTEM,
                { additional: 'metadata' }
            );

            expect(result.success).toBe(true);
            expect(result.document?.logs).toHaveLength(1);
            expect(result.document?.logs[0].message).toBe('Project started');
        });
    });

    describe('getProject', () => {
        it('should fetch a project by ID', async () => {
            const mockResponse = {
                data: {
                    getDocument: {
                        id: 'test-project',
                        name: 'test-project',
                        path: '/projects/test-project',
                        status: 'STOPPED',
                        autoStart: false,
                        runtime: null,
                        logs: [],
                        createdAt: '2024-01-01T00:00:00Z',
                        updatedAt: '2024-01-01T00:00:00Z'
                    }
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
                text: async () => JSON.stringify(mockResponse),
                status: 200
            } as Response);

            const project = await client.getProject('test-project');

            expect(project).toBeDefined();
            expect(project?.id).toBe('test-project');
            expect(project?.name).toBe('test-project');
        });

        it('should return null when project not found', async () => {
            const mockResponse = {
                errors: [{
                    message: 'Project not found'
                }]
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
                text: async () => JSON.stringify(mockResponse),
                status: 200
            } as Response);

            const project = await client.getProject('nonexistent');

            expect(project).toBeNull();
        });
    });

    describe('getAllProjects', () => {
        it('should fetch all projects', async () => {
            const mockResponse = {
                data: {
                    getDocuments: [
                        {
                            id: 'project1',
                            name: 'project1',
                            status: 'RUNNING'
                        },
                        {
                            id: 'project2',
                            name: 'project2',
                            status: 'STOPPED'
                        }
                    ]
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
                text: async () => JSON.stringify(mockResponse),
                status: 200
            } as Response);

            const projects = await client.getAllProjects();

            expect(projects).toHaveLength(2);
            expect(projects[0].name).toBe('project1');
            expect(projects[1].name).toBe('project2');
        });

        it('should return empty array on error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const projects = await client.getAllProjects();

            expect(projects).toEqual([]);
        });
    });

    describe('queue management', () => {
        it('should queue mutations when offline', async () => {
            // Create a new client for this test to avoid interference
            const testClient = new AgentProjectsClient({
                endpoint: 'http://localhost:4001/graphql',
                retryAttempts: 0, // No retries to avoid timeouts
                retryDelay: 100,
                timeout: 5000
            });
            
            // Simulate offline by always rejecting
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            // This should fail but be queued
            await expect(testClient.registerProject('/queued')).rejects.toThrow('Network error');

            // Check that the queue has the mutation
            expect(testClient.getQueueSize()).toBe(1);
            
            // Clean up timer
            (testClient as any).queueTimer && clearTimeout((testClient as any).queueTimer);
        });

        it('should flush queue when requested', async () => {
            // Clear default mock for this test
            mockFetch.mockReset();
            
            // First fail to queue the mutation
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await expect(client.registerProject('/queued')).rejects.toThrow();

            expect(client.getQueueSize()).toBe(1);

            // Now mock success for flush
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        registerProject: {
                            success: true,
                            document: { id: 'queued-project' }
                        }
                    }
                }),
                text: async () => JSON.stringify({
                    data: {
                        registerProject: {
                            success: true,
                            document: { id: 'queued-project' }
                        }
                    }
                }),
                status: 200
            } as Response);

            await client.flushQueue();

            // Queue should be empty after successful flush
            expect(client.getQueueSize()).toBe(0);
        });
    });

    describe('timeout handling', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should timeout long-running requests', async () => {
            // Mock AbortController
            const abortMock = jest.fn();
            global.AbortController = jest.fn().mockImplementation(() => ({
                abort: abortMock,
                signal: { aborted: false }
            })) as any;

            // Mock a request that rejects with AbortError
            mockFetch.mockImplementationOnce(() => {
                const error = new Error('The operation was aborted');
                error.name = 'AbortError';
                return Promise.reject(error);
            });

            const fastClient = new AgentProjectsClient({
                endpoint: 'http://localhost:4001/graphql',
                timeout: 100,
                retryAttempts: 0 // No retries for this test
            });

            const promise = fastClient.getProject('test');
            
            // Advance timers to trigger timeout
            jest.advanceTimersByTime(100);
            
            // The promise should return null (as per getProject's error handling)
            const result = await promise;
            expect(result).toBeNull();
        });
    });
});