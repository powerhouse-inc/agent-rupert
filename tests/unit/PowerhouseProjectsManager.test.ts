import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
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

    beforeEach(async () => {
        // Suppress console.warn and console.log in tests
        originalConsoleWarn = console.warn;
        originalConsoleLog = console.log;
        console.warn = jest.fn();
        console.log = jest.fn();
        
        // Create a temporary directory for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ph-test-'));
        
        // Reset mocks
        jest.clearAllMocks();
        
        // Create mock CLI executor for init
        mockExecute = jest.fn();
        mockCLIExecutor = {
            execute: mockExecute
        };
        
        // Create minimal mock Service executor
        mockServiceExecutor = {
            start: jest.fn(),
            stop: jest.fn(),
            on: jest.fn(),
            once: jest.fn(),
            removeListener: jest.fn()
        };
        
        // Create manager instance with temp directory and mock executors
        manager = new PowerhouseProjectsManager(tempDir, mockCLIExecutor, mockServiceExecutor);
    });

    afterEach(async () => {
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
                    JSON.stringify({ version: '1.0.0' })
                );
                
                return {
                    exitCode: 0,
                    stdout: 'Project initialized successfully',
                    stderr: ''
                };
            });

            const result = await manager.init(projectName);

            expect(result.success).toBe(true);
            expect(result.projectPath).toBe(projectPath);
            expect(result.error).toBeUndefined();
            
            // Verify the executor was called correctly
            expect(mockExecute).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'ph',
                    args: ['init', projectName],
                    workingDirectory: tempDir
                })
            );
        });

        it('should reject empty project names', async () => {
            const result = await manager.init('');
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Project name cannot be empty');
            expect(mockExecute).not.toHaveBeenCalled();
        });

        it('should reject invalid project names', async () => {
            const result = await manager.init('test@project!');
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('only contain letters, numbers, hyphens, and underscores');
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

        it('should handle ph init failure', async () => {
            const projectName = 'failed-project';
            
            // Mock failed execution
            mockExecute.mockResolvedValue({
                exitCode: 1,
                stdout: '',
                stderr: 'Error: Failed to initialize project'
            });

            const result = await manager.init(projectName);

            expect(result.success).toBe(false);
            expect(result.error).toContain('ph init failed');
            expect(result.error).toContain('Failed to initialize project');
        });
    });

    describe('listProjects', () => {
        it('should return empty array when no projects exist', async () => {
            const projects = await manager.listProjects();
            expect(projects).toEqual([]);
        });

        it('should list all valid Powerhouse projects', async () => {
            // Create some test projects
            const project1Path = path.join(tempDir, 'project1');
            const project2Path = path.join(tempDir, 'project2');
            const notAProjectPath = path.join(tempDir, 'not-a-project');
            
            await fs.mkdir(project1Path, { recursive: true });
            await fs.writeFile(
                path.join(project1Path, 'powerhouse.config.json'),
                JSON.stringify({ studio: { port: 3000 } })
            );
            
            await fs.mkdir(project2Path, { recursive: true });
            await fs.writeFile(
                path.join(project2Path, 'powerhouse.config.json'),
                JSON.stringify({ reactor: { port: 4000 } })
            );
            
            // Create a directory that's not a project
            await fs.mkdir(notAProjectPath, { recursive: true });
            
            const projects = await manager.listProjects();
            
            expect(projects).toHaveLength(2);
            expect(projects).toContainEqual({
                name: 'project1',
                path: project1Path,
                connectPort: 3000,
                switchboardPort: undefined
            });
            expect(projects).toContainEqual({
                name: 'project2',
                path: project2Path,
                connectPort: undefined,
                switchboardPort: 4000
            });
        });

        it('should handle invalid config files gracefully', async () => {
            const projectPath = path.join(tempDir, 'bad-config');
            await fs.mkdir(projectPath, { recursive: true });
            await fs.writeFile(
                path.join(projectPath, 'powerhouse.config.json'),
                'invalid json {'
            );
            
            const projects = await manager.listProjects();
            expect(projects).toEqual([]);
        });
    });

    describe('getProjectsDir', () => {
        it('should return the projects directory path', () => {
            const projectsDir = manager.getProjectsDir();
            expect(projectsDir).toBe(tempDir);
        });
    });

    describe('getRunningProject', () => {
        it('should return null when no project is running', () => {
            const running = manager.getRunningProject();
            expect(running).toBeNull();
        });
    });

    describe('isProjectReady', () => {
        it('should return false when no project is running', () => {
            const ready = manager.isProjectReady();
            expect(ready).toBe(false);
        });
    });

    describe('getProjectLogs', () => {
        it('should return undefined when no project is running', () => {
            const logs = manager.getProjectLogs();
            expect(logs).toBeUndefined();
        });
    });

    describe('shutdownProject', () => {
        it('should fail when no project is running', async () => {
            const result = await manager.shutdownProject();
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('No project is currently running');
        });
    });
});