import { describe, it, expect, beforeEach, afterEach, jest, xit } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PowerhouseProjectsManager } from '../../src/powerhouse/PowerhouseProjectsManager.js';

describe('PowerhouseProjectsManager', () => {
    let tempDir: string;
    let manager: PowerhouseProjectsManager;
    let originalConsoleWarn: typeof console.warn;
    let mockExecutor: any;
    let mockExecute: jest.Mock;
    let mockExecuteWithStream: jest.Mock;

    beforeEach(async () => {
        // Suppress console.warn in tests
        originalConsoleWarn = console.warn;
        console.warn = jest.fn();
        
        // Create a temporary directory for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ph-test-'));
        
        // Reset mocks
        jest.clearAllMocks();
        
        // Create mock executor
        mockExecute = jest.fn();
        mockExecuteWithStream = jest.fn();
        mockExecutor = {
            execute: mockExecute,
            executeWithStream: mockExecuteWithStream,
            on: jest.fn(),
            emit: jest.fn()
        };
        
        // Create manager instance with temp directory and mock executor
        manager = new PowerhouseProjectsManager(tempDir, mockExecutor);
        
        // Mock waitForDriveUrl to resolve immediately in tests (avoid 60s timeout)
        jest.spyOn(manager, 'waitForDriveUrl').mockImplementation(() => Promise.resolve(null));
    });

    afterEach(async () => {
        // Restore console.warn
        console.warn = originalConsoleWarn;
        
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
            // Mock successful execution
            mockExecuteWithStream.mockResolvedValue({
                stdout: 'Server started',
                stderr: '',
                exitCode: 0
            });

            const result = await manager.runProject('test-project');

            expect(result.success).toBe(true);
            expect(result.projectName).toBe('test-project');
            expect(result.connectPort).toBe(3000);
            expect(result.switchboardPort).toBe(4001);
            expect(result.error).toBeUndefined();

            // Verify CLI task was created correctly
            expect(mockExecuteWithStream).toHaveBeenCalledTimes(1);
            const task = mockExecuteWithStream.mock.calls[0][0];
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
            mockExecuteWithStream.mockResolvedValue({
                stdout: 'Server started',
                stderr: '',
                exitCode: 0
            });

            const result = await manager.runProject('test-project', {
                connectPort: 8080,
                switchboardPort: 8081
            });

            expect(result.success).toBe(true);
            expect(result.connectPort).toBe(8080);
            expect(result.switchboardPort).toBe(8081);

            const task = mockExecuteWithStream.mock.calls[0][0];
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
            expect(mockExecuteWithStream).not.toHaveBeenCalled();
        });

        it('should fail if a project is already running', async () => {
            // Start first project
            mockExecuteWithStream.mockResolvedValue({
                stdout: 'Server started',
                stderr: '',
                exitCode: 0
            });

            await manager.runProject('test-project');

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
            expect(mockExecuteWithStream).toHaveBeenCalledTimes(1);
        });

        it('should fail with empty project name', async () => {
            const result = await manager.runProject('');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Project name cannot be empty');
            expect(mockExecuteWithStream).not.toHaveBeenCalled();
        });

        it('should handle streaming output', async () => {
            let capturedOnStdout: ((data: string) => void) | undefined;
            let capturedOnStderr: ((data: string) => void) | undefined;

            // Mock execution with stream callbacks
            mockExecuteWithStream.mockImplementation(async (_task: any, streamOptions: any) => {
                capturedOnStdout = streamOptions?.onStdout;
                capturedOnStderr = streamOptions?.onStderr;
                return { exitCode: 0 };
            });

            await manager.runProject('test-project');

            // Simulate output
            if (capturedOnStdout) {
                capturedOnStdout('Server starting...');
                capturedOnStdout('Listening on port 5000');
            }
            if (capturedOnStderr) {
                capturedOnStderr('Warning: development mode');
            }

            // Check logs were captured
            const logs = manager.getProjectLogs();
            expect(logs).toBeDefined();
            expect(logs).toContain('[stdout] Server starting...');
            expect(logs).toContain('[stdout] Listening on port 5000');
            expect(logs).toContain('[stderr] Warning: development mode');
        });

        it('should limit logs to 500 entries', async () => {
            let capturedOnStdout: ((data: string) => void) | undefined;

            mockExecuteWithStream.mockImplementation(async (_task: any, streamOptions: any) => {
                capturedOnStdout = streamOptions?.onStdout;
                return { exitCode: 0 };
            });

            await manager.runProject('test-project');

            // Should always keep 500 logs maximum
            if (capturedOnStdout) {
                for (let i = 0; i < 600; i++) {
                    capturedOnStdout(`Log entry ${i}`);
                }
            }

            let logs = manager.getProjectLogs();
            expect(logs).toBeDefined();
            expect(logs!.length).toBe(500); // Should keep 500 logs
            expect(logs![0]).toContain('Log entry 100'); // First kept entry
            expect(logs![499]).toContain('Log entry 599'); // Last entry

            // Even after Drive URL is captured, should still keep 500 logs
            if (capturedOnStdout) {
                capturedOnStdout('Drive URL: http://localhost:4001/drives/test');
                for (let i = 600; i < 700; i++) {
                    capturedOnStdout(`Log entry ${i}`);
                }
            }

            logs = manager.getProjectLogs();
            expect(logs!.length).toBe(500); // Should still keep 500 logs
            expect(logs![0]).toContain('Log entry 201'); // First kept entry after adding 101 more
            expect(logs![499]).toContain('Log entry 699'); // Last entry
        });

        it('should capture Drive URL from stdout and set isFullyStarted', async () => {
            let capturedOnStdout: ((data: string) => void) | undefined;

            mockExecuteWithStream.mockImplementation(async (_task: any, streamOptions: any) => {
                capturedOnStdout = streamOptions?.onStdout;
                return { exitCode: 0 };
            });

            await manager.runProject('test-project');

            // Initially, project should not be fully started
            let runningProject = manager.getRunningProject();
            expect(runningProject).toBeDefined();
            expect(runningProject!.isFullyStarted).toBe(false);
            expect(runningProject!.driveUrl).toBeUndefined();

            // Simulate Drive URL appearing in stdout
            if (capturedOnStdout) {
                capturedOnStdout('Drive URL: http://localhost:4001/drives/abc123');
            }

            // After Drive URL, project should be fully started
            runningProject = manager.getRunningProject();
            expect(runningProject!.isFullyStarted).toBe(true);
            expect(runningProject!.driveUrl).toBe('http://localhost:4001/drives/abc123');
        });

        it('should capture Drive URL from stderr', async () => {
            let capturedOnStderr: ((data: string) => void) | undefined;

            mockExecuteWithStream.mockImplementation(async (_task: any, streamOptions: any) => {
                capturedOnStderr = streamOptions?.onStderr;
                return { exitCode: 0 };
            });

            await manager.runProject('test-project');

            // Simulate Drive URL appearing in stderr
            if (capturedOnStderr) {
                capturedOnStderr('Some startup logs... Drive URL: http://localhost:4001/drives/xyz789 ... more logs');
            }

            const runningProject = manager.getRunningProject();
            expect(runningProject!.isFullyStarted).toBe(true);
            expect(runningProject!.driveUrl).toBe('http://localhost:4001/drives/xyz789');
        });

        it('should wait for Drive URL and include it in result', async () => {
            // Create test project
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            // Mock waitForDriveUrl to return a URL
            (manager.waitForDriveUrl as jest.Mock).mockResolvedValue('http://localhost:4001/drives/test123');
            mockExecuteWithStream.mockResolvedValue({ exitCode: 0 });

            const result = await manager.runProject('test-project');

            expect(result.success).toBe(true);
            expect(result.driveUrl).toBe('http://localhost:4001/drives/test123');
            expect(manager.waitForDriveUrl).toHaveBeenCalledWith(60000); // Default timeout
        });

        it('should use custom startup timeout from options', async () => {
            // Create test project
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            // Mock waitForDriveUrl
            (manager.waitForDriveUrl as jest.Mock).mockResolvedValue('http://localhost:4001/drives/custom');
            mockExecuteWithStream.mockResolvedValue({ exitCode: 0 });

            const result = await manager.runProject('test-project', { 
                connectPort: 5000,
                switchboardPort: 6000,
                startupTimeout: 30000 
            });

            expect(result.success).toBe(true);
            expect(result.driveUrl).toBe('http://localhost:4001/drives/custom');
            expect(manager.waitForDriveUrl).toHaveBeenCalledWith(30000);
        });

        it('should use custom ports from options', async () => {
            // Create test project  
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            mockExecuteWithStream.mockResolvedValue({ exitCode: 0 });

            // Use new signature with custom ports
            const result = await manager.runProject('test-project', { 
                connectPort: 3500, 
                switchboardPort: 4500,
                startupTimeout: 60000
            });

            expect(result.success).toBe(true);
            expect(result.connectPort).toBe(3500);
            expect(result.switchboardPort).toBe(4500);
        });

        it('should handle executor errors', async () => {
            // Mock the executor to throw synchronously (before promise handlers are attached)
            mockExecuteWithStream.mockImplementation(() => {
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

            mockExecuteWithStream.mockResolvedValue({ exitCode: 0 });

            await manager.runProject('test-project');

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

            const mockProcess = {
                killed: false,
                kill: jest.fn((_signal?: string) => {
                    mockProcess.killed = true;
                })
            };

            mockExecutor.currentProcess = mockProcess;
            mockExecuteWithStream.mockResolvedValue({ exitCode: 0 });

            await manager.runProject('test-project');

            // Shutdown the project
            const result = await manager.shutdownProject();

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

            // Should clear running project
            const running = manager.getRunningProject();
            expect(running).toBeNull();
        });

        it('should return error when no project is running', async () => {
            const result = await manager.shutdownProject();

            expect(result.success).toBe(false);
            expect(result.error).toContain('No project is currently running');
        });

        it('should force kill if graceful shutdown fails', async () => {
            // Start a project
            const projectPath = path.join(tempDir, 'test-project');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );

            const mockProcess = {
                killed: false,
                kill: jest.fn((signal?: string) => {
                    // Only mark as killed on SIGTERM
                    if (signal === 'SIGTERM') {
                        mockProcess.killed = true;
                    }
                })
            };

            mockExecutor.currentProcess = mockProcess;
            mockExecuteWithStream.mockResolvedValue({ exitCode: 0 });

            await manager.runProject('test-project');

            // Mock timer to speed up test
            jest.useFakeTimers();
            const shutdownPromise = manager.shutdownProject();
            
            // Advance timer to trigger SIGTERM
            jest.advanceTimersByTime(1100);
            
            const result = await shutdownPromise;
            jest.useRealTimers();

            expect(result.success).toBe(true);
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
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