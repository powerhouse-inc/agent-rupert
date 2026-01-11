import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ReactorPackagesManager } from '../../src/agents/ReactorPackageDevAgent/ReactorPackagesManager';
import { CLIExecutor } from '../../src/tasks/executors/cli-executor.js';
import { ClaudeCodeExecutor } from '../../src/tasks/executors/claude-code-executor.js';
import { createClaudeCodeTask } from '../../src/tasks/types.js';

describe('ClaudeCodeExecutor Integration Tests', () => {
    let testProjectsDir: string;
    let manager: ReactorPackagesManager;
    let claudeCodeExecutor: ClaudeCodeExecutor;
    let projectName: string;
    let projectPath: string;
    
    // Track whether project setup succeeded for conditional cleanup
    let projectSetupSucceeded = false;
    
    beforeAll(async () => {
        // Use the persistent test project directory
        testProjectsDir = path.resolve(process.cwd(), '..', 'test-projects');
        projectName = 'persistent-test-project';
        projectPath = path.join(testProjectsDir, projectName);
        
        // Enable verbose output for long-running tests
        process.stderr.write(`\n🔧 Using persistent test project at: ${projectPath}\n`);
        
        // Check if persistent test project exists
        const projectExists = await fs.access(projectPath)
            .then(() => true)
            .catch(() => false);
        
        if (!projectExists) {
            throw new Error(
                `Persistent test project not found at ${projectPath}.\n` +
                `Please run 'pnpm prepare-test-project' first to set up the test environment.`
            );
        }
        
        // Create CLI executor with real commands
        const cliExecutor = new CLIExecutor({
            timeout: 120000, // 2 minutes timeout
            retryAttempts: 0 // No retries for integration tests
        });
        
        // Create ReactorPackagesManager pointing to test-projects dir
        manager = new ReactorPackagesManager(testProjectsDir, cliExecutor);
        
        process.stderr.write("🚀 Starting persistent test Powerhouse project...\n");
        
        // Use unique ports based on timestamp to avoid conflicts
        const timestamp_num = Date.now();
        const customConnectPort = 5000 + (timestamp_num % 1000);
        const customSwitchboardPort = 6000 + (timestamp_num % 1000);
        
        process.stderr.write(`  ℹ️ Using ports: connect=${customConnectPort}, switchboard=${customSwitchboardPort}\n`);
        
        const runResult = await manager.runProject(projectName, {
            connectPort: customConnectPort,
            switchboardPort: customSwitchboardPort
        });
        
        if (!runResult.success) {
            // If we can't run the project (e.g., ph vetra not available), skip the tests
            throw new Error(`Failed to run project: ${runResult.error}`);
        }
        
        projectSetupSucceeded = true;
        
        // Wait for the project to be fully started
        process.stderr.write("  ⏳ Waiting for project to be ready...\n");
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Create the ClaudeCodeExecutor instance
        claudeCodeExecutor = new ClaudeCodeExecutor(manager, {
            timeout: 60000, // 1 minute timeout for claude commands
            maxPromptLength: 10000,
            claudeCommand: 'claude' // Use the real claude CLI
        });
        
        process.stderr.write("✅ Test setup complete - persistent project is running\n");
    }, 180000); // 3 minute timeout for setup
    
    afterAll(async () => {
        process.stderr.write("\n🧹 Cleaning up ClaudeCodeExecutor integration tests...\n");
        
        // Only attempt shutdown if setup succeeded
        if (projectSetupSucceeded && manager) {
            const runningProject = manager.getRunningProject();
            if (runningProject) {
                process.stderr.write("📍 Shutting down test project...\n");
                const shutdownResult = await manager.shutdownProject();
                
                if (shutdownResult.success) {
                    process.stderr.write("  ✓ Project shutdown successful\n");
                } else {
                    process.stderr.write(`  ⚠️ Project shutdown failed: ${shutdownResult.error}\n`);
                }
                
                // Wait for processes to fully terminate
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // Note: Persistent test project remains at: ../test-projects/persistent-test-project
        process.stderr.write(`📁 Persistent test project remains at: ${projectPath}\n`);
    }, 60000); // 1 minute timeout for cleanup
    
    it('should verify project is running and check Claude CLI version', async () => {
        // Verify project is running
        const runningProject = manager.getRunningProject();
        expect(runningProject).not.toBeNull();
        expect(runningProject?.name).toBe(projectName);
        expect(runningProject?.path).toBe(projectPath);
        
        // Verify through ClaudeCodeExecutor
        expect(claudeCodeExecutor.hasRunningProject()).toBe(true);
        const executorProject = claudeCodeExecutor.getRunningProject();
        expect(executorProject).toEqual(runningProject);
        
        // Check Claude CLI version using the executor
        const versionTask = createClaudeCodeTask({
            title: 'Check Claude CLI Version',
            prompt: '-v',  // Just pass the version flag
            instructions: 'Check if Claude CLI is installed and get version'
        });
        
        process.stderr.write("\n📍 Testing Claude CLI version check...\n");
        
        try {
            const result = await claudeCodeExecutor.execute(versionTask);
            
            // Basic result structure validation
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('startedAt');
            expect(result).toHaveProperty('completedAt');
            expect(result).toHaveProperty('duration');
            expect(result.projectName).toBe(projectName);
            expect(result.projectPath).toBe(projectPath);
            
            if (result.success) {
                process.stderr.write(`  ✓ Claude CLI is installed\n`);
                if (result.output) {
                    process.stderr.write(`  ℹ️ Version output: ${result.output.trim()}\n`);
                }
                expect(result.output).toBeDefined();
            } else {
                // Claude CLI is not installed - this is expected in many environments
                process.stderr.write(`  ⚠️ Claude CLI is not installed or not accessible\n`);
                if (result.error) {
                    process.stderr.write(`  ℹ️ Error: ${result.error}\n`);
                }
                expect(result.error).toBeDefined();
                
                // Check if the error indicates command not found
                if (result.error && (
                    result.error.includes('command not found') || 
                    result.error.includes('not found') ||
                    result.error.includes('ENOENT')
                )) {
                    process.stderr.write(`  ℹ️ This is expected if Claude CLI is not installed\n`);
                }
            }
            
            // Verify timing properties regardless of success
            expect(result.duration).toBeGreaterThan(0);
            expect(result.startedAt).toBeInstanceOf(Date);
            expect(result.completedAt).toBeInstanceOf(Date);
            expect(result.completedAt.getTime() - result.startedAt.getTime()).toBe(result.duration);
            
        } catch (error) {
            // This might happen if there's a validation error
            process.stderr.write(`  ❌ Unexpected error during version check: ${error}\n`);
            throw error;
        }
    }, 30000); // 30 second timeout
});