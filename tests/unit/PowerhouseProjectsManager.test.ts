import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PowerhouseProjectsManager } from '../../src/powerhouse/PowerhouseProjectsManager.js';

describe('PowerhouseProjectsManager', () => {
    let tempDir: string;
    let manager: PowerhouseProjectsManager;
    let mockExecutor: any;
    let mockExecute: jest.Mock;
    let mockExecuteWithStream: jest.Mock;

    beforeEach(async () => {
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
        manager = new PowerhouseProjectsManager(tempDir, 5000, 10, mockExecutor);
    });

    afterEach(async () => {
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
                JSON.stringify({ studio: { port: 3000 }, reactor: { port: 4001 } })
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
            expect(result.studioPort).toBe(5000);
            expect(result.reactorPort).toBe(5001);
            expect(result.error).toBeUndefined();

            // Verify CLI task was created correctly
            expect(mockExecuteWithStream).toHaveBeenCalledTimes(1);
            const task = mockExecuteWithStream.mock.calls[0][0];
            expect(task.command).toBe('ph');
            expect(task.args).toEqual(['dev']);
            expect(task.workingDirectory).toContain('test-project');
            expect(task.environment.PORT).toBe('5000');
            expect(task.environment.REACTOR_PORT).toBe('5001');
        });

        it('should use custom ports when provided', async () => {
            mockExecuteWithStream.mockResolvedValue({
                stdout: 'Server started',
                stderr: '',
                exitCode: 0
            });

            const result = await manager.runProject('test-project', 8080, 8081);

            expect(result.success).toBe(true);
            expect(result.studioPort).toBe(8080);
            expect(result.reactorPort).toBe(8081);

            const task = mockExecuteWithStream.mock.calls[0][0];
            expect(task.environment.PORT).toBe('8080');
            expect(task.environment.REACTOR_PORT).toBe('8081');
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
            mockExecuteWithStream.mockImplementation(async (task, streamOptions) => {
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

        it('should limit logs to 100 entries', async () => {
            let capturedOnStdout: ((data: string) => void) | undefined;

            mockExecuteWithStream.mockImplementation(async (task, streamOptions) => {
                capturedOnStdout = streamOptions?.onStdout;
                return { exitCode: 0 };
            });

            await manager.runProject('test-project');

            // Send more than 100 log entries
            if (capturedOnStdout) {
                for (let i = 0; i < 150; i++) {
                    capturedOnStdout(`Log entry ${i}`);
                }
            }

            const logs = manager.getProjectLogs();
            expect(logs).toBeDefined();
            expect(logs!.length).toBe(100);
            expect(logs![0]).toContain('Log entry 50'); // First kept entry
            expect(logs![99]).toContain('Log entry 149'); // Last entry
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
            expect(running!.studioPort).toBe(5000);
            expect(running!.reactorPort).toBe(5001);
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
                kill: jest.fn((signal) => {
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
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGINT');

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
                kill: jest.fn((signal) => {
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
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGINT');
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
                    studio: { port: 3000 },
                    reactor: { port: 4001 }
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
                studioPort: 3000,
                reactorPort: 4001
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