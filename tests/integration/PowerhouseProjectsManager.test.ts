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

    describe('Real ph init integration', () => {
        it('should initialize a real Powerhouse project and confirm it exists', async () => {
            const projectName = 'test-powerhouse-project';
            const projectPath = path.join(testProjectsDir, projectName);
            
            // Initialize the project using PowerhouseProjectsManager
            const result = await manager.init(projectName);
            
            // Check that initialization succeeded
            expect(result.success).toBe(true);
            expect(result.projectPath).toBe(projectPath);
            expect(result.error).toBeUndefined();
            
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
            
            // List projects and verify our project appears
            const projects = await manager.listProjects();
            expect(projects).toHaveLength(1);
            expect(projects[0].name).toBe(projectName);
            expect(projects[0].path).toBe(projectPath);
        }, 120000); // 2 minute timeout for this test
    });
});