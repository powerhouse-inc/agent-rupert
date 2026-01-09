import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PowerhouseProjectsManager } from '../../src/powerhouse/PowerhouseProjectsManager.js';
import { CLIExecutor } from '../../src/tasks/executors/cli-executor.js';

describe('PowerhouseProjectsManager Integration Tests', () => {
    let testProjectsDir: string;
    let manager: PowerhouseProjectsManager;
    
    beforeAll(async () => {
        // Create test projects directory in ../test-projects for easy inspection
        // Using a timestamp to avoid conflicts between test runs
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        testProjectsDir = path.resolve(process.cwd(), '..', 'test-projects', `integration-${timestamp}`);
        
        // Enable verbose output for long-running tests
        process.stderr.write(`\n🔧 Test projects directory: ${testProjectsDir}\n`);
        
        // Ensure the directory exists
        await fs.mkdir(testProjectsDir, { recursive: true });
        
        // Create manager instance with real CLI executor
        const cliExecutor = new CLIExecutor({
            timeout: 120000, // 2 minutes timeout for real ph init
            retryAttempts: 0 // No retries for integration tests
        });
        
        manager = new PowerhouseProjectsManager(testProjectsDir, cliExecutor);
    });

    afterAll(async () => {
        // Note: Not cleaning up automatically to allow inspection
        // The test artifacts are preserved at: ../test-projects/integration-{timestamp}
    });

    describe('Comprehensive PowerhouseProjectsManager integration', () => {
        it('should test all manager methods with a real project', async () => {
            const projectName = 'test-powerhouse-project';
            const projectPath = path.join(testProjectsDir, projectName);
            
            process.stderr.write("\n📍 Step 1: Verify getProjectsDir() returns correct path\n");
            const projectsDir = manager.getProjectsDir();
            expect(projectsDir).toBe(testProjectsDir);
            
            process.stderr.write("📍 Step 2: Initialize a new project\n");
            const initResult = await manager.init(projectName);
            
            // Verify initialization succeeded
            expect(initResult.success).toBe(true);
            expect(initResult.projectPath).toBe(projectPath);
            expect(initResult.error).toBeUndefined();
            
            // Verify the project directory exists
            const projectExists = await fs.access(projectPath)
                .then(() => true)
                .catch(() => false);
            expect(projectExists).toBe(true);
            
            // Verify key Powerhouse files exist
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageJsonExists = await fs.access(packageJsonPath)
                .then(() => true)
                .catch(() => false);
            expect(packageJsonExists).toBe(true);
            
            // Read and verify package.json content
            const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            expect(packageJson.name).toBe(projectName);
            
            // Verify powerhouse.config.json exists
            const configPath = path.join(projectPath, 'powerhouse.config.json');
            const configExists = await fs.access(configPath)
                .then(() => true)
                .catch(() => false);
            expect(configExists).toBe(true);
            
            // Read and verify powerhouse.config.json content
            const configContent = await fs.readFile(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            expect(config).toHaveProperty('studio');
            
            process.stderr.write("📍 Step 3: List projects and verify our project appears\n");
            const projects = await manager.listProjects();
            expect(projects).toHaveLength(1);
            expect(projects[0].name).toBe(projectName);
            expect(projects[0].path).toBe(projectPath);
            
            process.stderr.write("📍 Step 4: Test that duplicate initialization fails\n");
            const duplicateResult = await manager.init(projectName);
            expect(duplicateResult.success).toBe(false);
            expect(duplicateResult.error).toContain('already exists');
            
            process.stderr.write("📍 Step 5: Verify no project is running initially\n");
            let runningProject = manager.getRunningProject();
            expect(runningProject).toBeNull();
            
            process.stderr.write("📍 Step 6: Run the project with custom ports\n");
            const customConnectPort = 3333;
            const customSwitchboardPort = 4444;
            const runResult = await manager.runProject(projectName, customConnectPort, customSwitchboardPort);
            
            // Note: This might fail if ph vetra is not available or ports are in use
            // But we still test the method execution
            if (runResult.success) {
                expect(runResult.projectName).toBe(projectName);
                expect(runResult.connectPort).toBe(customConnectPort);
                expect(runResult.switchboardPort).toBe(customSwitchboardPort);
                
                process.stderr.write("📍 Step 7: Verify project is now running\n");
                runningProject = manager.getRunningProject();
                expect(runningProject).not.toBeNull();
                if (runningProject) {
                    expect(runningProject.name).toBe(projectName);
                    expect(runningProject.path).toBe(projectPath);
                    expect(runningProject.connectPort).toBe(customConnectPort);
                    expect(runningProject.switchboardPort).toBe(customSwitchboardPort);
                    expect(runningProject.startedAt).toBeInstanceOf(Date);
                    expect(runningProject.logs).toBeDefined();
                    
                    process.stderr.write("📍 Step 8: Try to run another project (should fail)\n");
                    const secondRunResult = await manager.runProject(projectName);
                    expect(secondRunResult.success).toBe(false);
                    expect(secondRunResult.error).toContain('already running');
                    
                    process.stderr.write("📍 Step 9: Get project logs (might be empty initially)\n");
                    const logs = manager.getProjectLogs();
                    expect(logs).toBeDefined();
                    expect(Array.isArray(logs)).toBe(true);
                    
                    process.stderr.write("📍 Step 10: Shutdown the project\n");
                    const shutdownResult = await manager.shutdownProject();
                    expect(shutdownResult.success).toBe(true);
                    expect(shutdownResult.error).toBeUndefined();
                    
                    process.stderr.write("📍 Step 11: Verify project is no longer running\n");
                    runningProject = manager.getRunningProject();
                    expect(runningProject).toBeNull();
                    
                    process.stderr.write("📍 Step 12: Try to shutdown when no project is running\n");
                    const secondShutdownResult = await manager.shutdownProject();
                    expect(secondShutdownResult.success).toBe(false);
                    expect(secondShutdownResult.error).toContain('No project is currently running');
                }
            } else {
                // If running the project failed (e.g., ph vetra not available),
                // at least verify the error handling
                expect(runResult.error).toBeDefined();
                
                // Test shutdown when no project is running
                const shutdownResult = await manager.shutdownProject();
                expect(shutdownResult.success).toBe(false);
                expect(shutdownResult.error).toContain('No project is currently running');
            }
            
            process.stderr.write("📍 Step 13: Test running a non-existent project\n");
            const nonExistentResult = await manager.runProject('non-existent-project');
            expect(nonExistentResult.success).toBe(false);
            expect(nonExistentResult.error).toContain('not found');
            
            process.stderr.write("📍 Step 14: Test initializing with invalid project names\n");
            const invalidNameResult = await manager.init('');
            expect(invalidNameResult.success).toBe(false);
            expect(invalidNameResult.error).toContain('cannot be empty');
            
            const invalidCharsResult = await manager.init('test@project!');
            expect(invalidCharsResult.success).toBe(false);
            expect(invalidCharsResult.error).toContain('can only contain');
            
            process.stderr.write("📍 Step 15: Create a second project to test multiple projects listing\n");
            const secondProjectName = 'second-test-project';
            const secondInitResult = await manager.init(secondProjectName);
            
            if (secondInitResult.success) {
                // List projects again - should now have 2
                const allProjects = await manager.listProjects();
                expect(allProjects.length).toBeGreaterThanOrEqual(2);
                
                const projectNames = allProjects.map(p => p.name);
                expect(projectNames).toContain(projectName);
                expect(projectNames).toContain(secondProjectName);
            }
            
            process.stderr.write("📍 Step 16: Test getProjectLogs when no project is running\n");
            const logsWhenNotRunning = manager.getProjectLogs();
            expect(logsWhenNotRunning).toBeUndefined();
            
        }, 180000); // 3 minute timeout for comprehensive test
    });
});