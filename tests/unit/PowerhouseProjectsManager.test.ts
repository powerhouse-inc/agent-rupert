import { describe, it, expect, beforeEach, afterEach, jest, xit } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PowerhouseProjectsManager } from '../../src/powerhouse/PowerhouseProjectsManager.js';

describe('PowerhouseProjectsManager', () => {
    let tempDir: string;
    let manager: PowerhouseProjectsManager;
    let originalConsoleWarn: typeof console.warn;
    let originalConsoleLog: typeof console.log;
    let mockCLIExecutor: any;
    let mockServiceExecutor: any;
    let mockExecute: jest.Mock;
    let mockStart: jest.Mock;
    let mockStop: jest.Mock;
    let serviceListeners: Map<string, Function[]>;

    beforeEach(async () => {
        // Use fake timers to control setTimeout
        jest.useFakeTimers();
        // Suppress console.warn and console.log in tests
        originalConsoleWarn = console.warn;
        originalConsoleLog = console.log;
        console.warn = jest.fn();
        console.log = jest.fn();
        
        // Create a temporary directory for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ph-test-'));
        
        // Reset mocks
        jest.clearAllMocks();
        
        // Track service executor event listeners
        serviceListeners = new Map();
        
        // Create mock CLI executor for init
        mockExecute = jest.fn();
        mockCLIExecutor = {
            execute: mockExecute,
            on: jest.fn(),
            emit: jest.fn()
        };
        
        // Create mock Service executor for run/stop
        mockStart = jest.fn();
        mockStop = jest.fn();
        mockServiceExecutor = {
            start: mockStart,
            stop: mockStop,
            restart: jest.fn(),
            getStatus: jest.fn(),
            getLogs: jest.fn(),
            getAllServices: jest.fn(),
            stopAll: jest.fn(),
            on: jest.fn((event: string, handler: Function) => {
                if (!serviceListeners.has(event)) {
                    serviceListeners.set(event, []);
                }
                serviceListeners.get(event)!.push(handler);
            }),
            once: jest.fn((event: string, handler: Function) => {
                if (!serviceListeners.has(event)) {
                    serviceListeners.set(event, []);
                }
                serviceListeners.get(event)!.push(handler);
            }),
            emit: jest.fn((event: string, ...args: any[]) => {
                const handlers = serviceListeners.get(event) || [];
                handlers.forEach(handler => handler(...args));
            }),
            removeListener: jest.fn()
        };
        
        // Create manager instance with temp directory and mock executors
        manager = new PowerhouseProjectsManager(tempDir, mockCLIExecutor, mockServiceExecutor);
    });

    afterEach(async () => {
        // Clear all timers and restore real timers
        jest.clearAllTimers();
        jest.useRealTimers();
        
        // Restore console
        console.warn = originalConsoleWarn;
        console.log = originalConsoleLog;
        
        // Clean up temp directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('init', () => {
        it('should successfully initialize a new project', async () => {
            const projectName = 'test-project';
            const projectPath = path.join(tempDir, projectName);

            // Mock successful execution
            mockExecute.mockImplementation(async () => {
                // Create the project structure
                await fs.mkdir(projectPath, { recursive: true });
                await fs.writeFile(
                    path.join(projectPath, 'package.json'),
                    JSON.stringify({ name: projectName })
                );
                await fs.writeFile(
                    path.join(projectPath, 'powerhouse.config.json'),
                    JSON.stringify({ studio: { port: 3000 } })
                );
                
                return {
                    stdout: 'Project initialized successfully',
                    stderr: '',
                    exitCode: 0,
                    timedOut: false,
                    startedAt: new Date(),
                    completedAt: new Date(),
                    duration: 1000
                };
            });

            const result = await manager.init(projectName);

            expect(result.success).toBe(true);
            expect(result.projectPath).toBe(projectPath);
            expect(result.error).toBeUndefined();
        });

        it('should fail if project name is empty', async () => {
            const result = await manager.init('');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Project name cannot be empty');
            expect(mockExecute).not.toHaveBeenCalled();
        });

        it('should fail if project already exists', async () => {
            const projectName = 'existing-project';
            const projectPath = path.join(tempDir, projectName);

            // Create existing project
            await fs.mkdir(projectPath, { recursive: true });

            const result = await manager.init(projectName);

            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
            expect(mockExecute).not.toHaveBeenCalled();
        });
    });

    describe('runProject', () => {
        beforeEach(async () => {
            // Create a test project
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ connect: { port: 3000 }, switchboard: { port: 4001 } })
            );
        });

        it('should successfully start a project', async () => {
            // Mock successful service start
            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);

            const resultPromise = manager.runProject('test-project');
            
            // Emit boot-timeout to resolve the promise
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', { handle: mockHandle });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);

            const result = await resultPromise;

            expect(result.success).toBe(true);
            expect(result.projectName).toBe('test-project');
            expect(result.connectPort).toBe(3000);
            expect(result.switchboardPort).toBe(4001);
            expect(result.error).toBeUndefined();

            // Verify ServiceTask was created correctly
            expect(mockStart).toHaveBeenCalledTimes(1);
            const task = mockStart.mock.calls[0][0];
            expect(task.command).toBe('ph');
            expect(task.args).toEqual([
                'vetra', 
                '--watch',
                '--connect-port', '3000',
                '--switchboard-port', '4001'
            ]);
            expect(task.workingDirectory).toContain('test-project');
            expect(task.environment.NODE_ENV).toBe('development');
        });

        it('should use custom ports when provided', async () => {
            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);

            const resultPromise = manager.runProject('test-project', {
                connectPort: 8080,
                switchboardPort: 8081,
                startupTimeout: 60000
            });
            
            // Emit boot-timeout to resolve
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', { handle: mockHandle });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);
            
            const result = await resultPromise;

            expect(result.success).toBe(true);
            expect(result.connectPort).toBe(8080);
            expect(result.switchboardPort).toBe(8081);

            const task = mockStart.mock.calls[0][0];
            expect(task.args).toEqual([
                'vetra',
                '--watch',
                '--connect-port', '8080',
                '--switchboard-port', '8081'
            ]);
        });

        it('should fail if project does not exist', async () => {
            const result = await manager.runProject('non-existent');

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
            expect(mockStart).not.toHaveBeenCalled();
        });

        it('should fail if a project is already running', async () => {
            // Start first project
            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);

            const firstPromise = manager.runProject('test-project');
            
            // Emit boot-timeout to complete first project
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', { handle: mockHandle });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);
            
            await firstPromise;

            // Try to start another project
            const projectPath2 = path.join(tempDir, 'another-project');
            await fs.mkdir(projectPath2, { recursive: true });
            await fs.writeFile(
                path.join(projectPath2, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3010 } })
            );

            const result = await manager.runProject('another-project');

            expect(result.success).toBe(false);
            expect(result.error).toContain('already running');
            expect(result.error).toContain('test-project');
            // Should not try to start the second project
            expect(mockStart).toHaveBeenCalledTimes(1);
        });

        it('should fail with empty project name', async () => {
            const result = await manager.runProject('');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Project name cannot be empty');
            expect(mockStart).not.toHaveBeenCalled();
        });

        it('should handle streaming output', async () => {
            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);

            const projectPromise = manager.runProject('test-project');
            
            // Emit boot-timeout to complete startup
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', { handle: mockHandle });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);
            
            await projectPromise;

            // Simulate service output events
            mockServiceExecutor.emit('service-output', {
                serviceId: mockHandle.id,
                type: 'stdout',
                data: 'Server starting...'
            });
            mockServiceExecutor.emit('service-output', {
                serviceId: mockHandle.id,
                type: 'stdout',
                data: 'Listening on port 5000'
            });
            mockServiceExecutor.emit('service-output', {
                serviceId: mockHandle.id,
                type: 'stderr',
                data: 'Warning: development mode'
            });

            // Check logs were captured
            const logs = manager.getProjectLogs();
            expect(logs).toBeDefined();
            expect(logs).toContain('[stdout] Server starting...');
            expect(logs).toContain('[stdout] Listening on port 5000');
            expect(logs).toContain('[stderr] Warning: development mode');
        });

        it('should limit logs to 500 entries', async () => {
            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);

            const projectPromise = manager.runProject('test-project');
            
            // Emit boot-timeout to complete startup
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', { handle: mockHandle });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);
            
            await projectPromise;

            // Should always keep 500 logs maximum
            for (let i = 0; i < 600; i++) {
                mockServiceExecutor.emit('service-output', {
                    serviceId: mockHandle.id,
                    type: 'stdout',
                    data: `Log entry ${i}`
                });
            }

            let logs = manager.getProjectLogs();
            expect(logs).toBeDefined();
            expect(logs!.length).toBe(500); // Should keep 500 logs
            expect(logs![0]).toContain('Log entry 100'); // First kept entry
            expect(logs![499]).toContain('Log entry 599'); // Last entry

            // Even after Drive URL is captured, should still keep 500 logs
            mockServiceExecutor.emit('service-output', {
                serviceId: mockHandle.id,
                type: 'stdout',
                data: 'Drive URL: http://localhost:4001/drives/test'
            });
            for (let i = 600; i < 700; i++) {
                mockServiceExecutor.emit('service-output', {
                    serviceId: mockHandle.id,
                    type: 'stdout',
                    data: `Log entry ${i}`
                });
            }

            logs = manager.getProjectLogs();
            expect(logs!.length).toBe(500); // Should still keep 500 logs
            expect(logs![0]).toContain('Log entry 201'); // First kept entry after adding 101 more
            expect(logs![499]).toContain('Log entry 699'); // Last entry
        });

        it('should capture Drive URL from service-ready event and set isFullyStarted', async () => {
            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date(),
                endpoints: new Map([['drive-url', 'http://localhost:4001/drives/abc123']])
            };
            mockStart.mockResolvedValue(mockHandle);

            // Start the project - this will set up listeners
            const projectPromise = manager.runProject('test-project');

            // Wait a bit for the project to be initialized
            await Promise.resolve(); // Use microtask instead of timer
            
            // Initially, project should not be fully started
            let runningProject = manager.getRunningProject();
            expect(runningProject).toBeDefined();
            expect(runningProject!.isFullyStarted).toBe(false);
            expect(runningProject!.driveUrl).toBeUndefined();

            // Simulate service-ready event with Drive URL in endpoints
            mockServiceExecutor.emit('service-ready', {
                handle: mockHandle
            });

            // Wait for the project to complete startup
            const result = await projectPromise;

            // After service-ready, project should be fully started
            runningProject = manager.getRunningProject();
            expect(runningProject!.isFullyStarted).toBe(true);
            expect(runningProject!.driveUrl).toBe('http://localhost:4001/drives/abc123');
            expect(result.driveUrl).toBe('http://localhost:4001/drives/abc123');
        });

        it('should handle boot-timeout event when readiness patterns do not match', async () => {
            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);

            // Start the project
            const projectPromise = manager.runProject('test-project');

            // Simulate boot-timeout event (patterns not matched)
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', {
                    handle: mockHandle
                });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);

            // Wait for project to complete startup
            const result = await projectPromise;

            // Project should succeed but without Drive URL
            expect(result.success).toBe(true);
            expect(result.driveUrl).toBeUndefined();
            
            const runningProject = manager.getRunningProject();
            expect(runningProject!.isFullyStarted).toBe(false);
            expect(runningProject!.driveUrl).toBeUndefined();
        });

        it('should include Drive URL from service-ready event in result', async () => {
            // Create test project
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date(),
                endpoints: new Map([['drive-url', 'http://localhost:4001/drives/test123']])
            };
            mockStart.mockResolvedValue(mockHandle);

            // Start the project
            const projectPromise = manager.runProject('test-project');

            // Emit service-ready event with Drive URL
            setTimeout(() => {
                mockServiceExecutor.emit('service-ready', {
                    handle: mockHandle
                });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);

            const result = await projectPromise;

            expect(result.success).toBe(true);
            expect(result.driveUrl).toBe('http://localhost:4001/drives/test123');
        });

        it('should use custom startup timeout from options', async () => {
            // Create test project
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date(),
                endpoints: new Map([['drive-url', 'http://localhost:6000/drives/custom']])
            };
            mockStart.mockResolvedValue(mockHandle);

            // Start with custom timeout
            const projectPromise = manager.runProject('test-project', { 
                connectPort: 5000,
                switchboardPort: 6000,
                startupTimeout: 30000 
            });

            // Emit service-ready
            setTimeout(() => {
                mockServiceExecutor.emit('service-ready', {
                    handle: mockHandle
                });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);

            const result = await projectPromise;

            expect(result.success).toBe(true);
            expect(result.driveUrl).toBe('http://localhost:6000/drives/custom');
            
            // Verify the task was created with correct readiness timeout
            const taskCall = mockStart.mock.calls[0][0];
            expect(taskCall.readiness.timeout).toBe(30000);
        });

        it('should use custom ports from options', async () => {
            // Create test project  
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);

            // Use new signature with custom ports
            const resultPromise = manager.runProject('test-project', { 
                connectPort: 3500, 
                switchboardPort: 4500,
                startupTimeout: 60000
            });
            
            // Emit boot-timeout to resolve
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', { handle: mockHandle });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);

            const result = await resultPromise;

            expect(result.success).toBe(true);
            expect(result.connectPort).toBe(3500);
            expect(result.switchboardPort).toBe(4500);
        });

        it('should handle executor errors', async () => {
            // Mock the executor to throw synchronously (before promise handlers are attached)
            mockStart.mockImplementation(() => {
                throw new Error('Failed to start server');
            });

            const result = await manager.runProject('test-project');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to start server');

            // Should clear running project on error
            const running = manager.getRunningProject();
            expect(running).toBeNull();
        });
    });

    describe('getRunningProject', () => {
        it('should return null when no project is running', () => {
            const running = manager.getRunningProject();
            expect(running).toBeNull();
        });

        it('should return project info when a project is running', async () => {
            // Create and start a test project
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);

            const projectPromise = manager.runProject('test-project');
            
            // Emit boot-timeout to complete startup
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', { handle: mockHandle });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);
            
            await projectPromise;

            const running = manager.getRunningProject();
            expect(running).not.toBeNull();
            expect(running!.name).toBe('test-project');
            expect(running!.path).toBe(projectPath);
            expect(running!.connectPort).toBe(3000);
            expect(running!.switchboardPort).toBe(4001);
            expect(running!.startedAt).toBeInstanceOf(Date);
        });
    });

    describe('shutdownProject', () => {
        it('should successfully shutdown a running project', async () => {
            // Start a project first
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);
            mockStop.mockResolvedValue(undefined);

            const projectPromise = manager.runProject('test-project');
            
            // Emit boot-timeout to complete startup
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', { handle: mockHandle });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);
            
            await projectPromise;

            // Shutdown the project
            const result = await manager.shutdownProject();

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(mockStop).toHaveBeenCalledWith('service-123', expect.objectContaining({
                timeout: 10000
            }));

            // Should clear running project
            const running = manager.getRunningProject();
            expect(running).toBeNull();
        });

        it('should return error when no project is running', async () => {
            const result = await manager.shutdownProject();

            expect(result.success).toBe(false);
            expect(result.error).toContain('No project is currently running');
        });

        it('should handle shutdown errors gracefully', async () => {
            // Start a project
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            const mockHandle = {
                id: 'service-123',
                taskId: 'task-456',
                status: 'running',
                pid: 1234,
                startedAt: new Date()
            };
            mockStart.mockResolvedValue(mockHandle);
            mockStop.mockRejectedValue(new Error('Failed to stop service'));

            const projectPromise = manager.runProject('test-project');
            
            // Emit boot-timeout to complete startup
            setTimeout(() => {
                mockServiceExecutor.emit('boot-timeout', { handle: mockHandle });
            }, 10);
            
            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(10);
            
            await projectPromise;

            // Try to shutdown - should handle error gracefully
            const result = await manager.shutdownProject();

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to stop service');
            expect(mockStop).toHaveBeenCalledWith('service-123', expect.objectContaining({
                timeout: 10000
            }));
        });
    });

    describe('listProjects', () => {
        it('should return empty array for empty directory', async () => {
            const projects = await manager.listProjects();
            expect(projects).toEqual([]);
        });

        it('should list valid Powerhouse projects', async () => {
            // Create valid project
            const projectPath = path.join(tempDir, 'valid-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({
                    connect: { port: 3000 },
                    switchboard: { port: 4001 }
                })
            );

            // Create invalid project (no config)
            const invalidPath = path.join(tempDir, 'invalid-project');
            await fs.mkdir(invalidPath, { recursive: true });

            const projects = await manager.listProjects();

            expect(projects).toHaveLength(1);
            expect(projects[0]).toEqual({
                name: 'valid-project',
                path: projectPath,
                connectPort: 3000,
                switchboardPort: 4001
            });
        });
    });

    describe('getProjectsDir', () => {
        it('should return the resolved projects directory path', () => {
            const projectsDir = manager.getProjectsDir();
            expect(projectsDir).toBe(tempDir);
        });
    });
});