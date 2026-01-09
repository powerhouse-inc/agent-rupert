#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const PROJECT_NAME = 'persistent-test-project';
const TEST_PROJECTS_DIR = path.resolve(process.cwd(), '..', 'test-projects');
const PROJECT_PATH = path.join(TEST_PROJECTS_DIR, PROJECT_NAME);

async function prepareTestProject() {
    console.log('🚀 Preparing persistent test project for Claude CLI testing...\n');
    
    try {
        // Ensure test-projects directory exists
        console.log(`📁 Ensuring test projects directory exists at: ${TEST_PROJECTS_DIR}`);
        await fs.mkdir(TEST_PROJECTS_DIR, { recursive: true });
        
        // Check if persistent-test-project already exists
        const projectExists = await fs.access(PROJECT_PATH)
            .then(() => true)
            .catch(() => false);
        
        if (projectExists) {
            console.log(`🗑️  Removing existing ${PROJECT_NAME}...`);
            await fs.rm(PROJECT_PATH, { recursive: true, force: true });
            console.log('   ✓ Existing project removed\n');
        }
        
        // Initialize new project using ph init
        console.log(`📦 Initializing new Powerhouse project: ${PROJECT_NAME}`);
        console.log(`   Location: ${PROJECT_PATH}`);
        
        const initCommand = `ph init ${PROJECT_NAME}`;
        const { stdout, stderr } = await execAsync(initCommand, {
            cwd: TEST_PROJECTS_DIR,
            timeout: 120000 // 2 minute timeout
        });
        
        if (stdout) {
            console.log('   Output:', stdout.trim());
        }
        if (stderr) {
            console.log('   Info:', stderr.trim());
        }
        
        // Verify project was created successfully
        const verifyExists = await fs.access(PROJECT_PATH)
            .then(() => true)
            .catch(() => false);
        
        if (!verifyExists) {
            throw new Error(`Project directory was not created at ${PROJECT_PATH}`);
        }
        
        // Verify key files exist
        const filesToCheck = [
            'package.json',
            'powerhouse.config.json'
        ];
        
        console.log('\n📋 Verifying project structure:');
        for (const file of filesToCheck) {
            const filePath = path.join(PROJECT_PATH, file);
            const fileExists = await fs.access(filePath)
                .then(() => true)
                .catch(() => false);
            
            if (fileExists) {
                console.log(`   ✓ ${file}`);
            } else {
                console.log(`   ✗ ${file} (missing)`);
            }
        }
        
        // Read and display package.json info
        const packageJsonPath = path.join(PROJECT_PATH, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        console.log(`\n📦 Project info:`);
        console.log(`   Name: ${packageJson.name}`);
        console.log(`   Version: ${packageJson.version || 'N/A'}`);
        
        // Read and display powerhouse.config.json info
        const configPath = path.join(PROJECT_PATH, 'powerhouse.config.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
        console.log(`\n⚙️  Powerhouse config:`);
        console.log(`   Studio port: ${config.studio?.port || 'default'}`);
        console.log(`   Switchboard port: ${config.switchboard?.port || 'default'}`);
        
        console.log('\n✅ Persistent test project prepared successfully!');
        console.log(`📍 Project location: ${PROJECT_PATH}`);
        console.log('\n💡 Next steps:');
        console.log('   1. Run tests with: pnpm test:integration');
        console.log('   2. Or manually start the project with: cd ../test-projects/persistent-test-project && ph vetra');
        console.log('   3. The project will persist between test runs for faster testing\n');
        
    } catch (error) {
        console.error('\n❌ Failed to prepare test project:', error);
        
        if (error instanceof Error && error.message.includes('ph: command not found')) {
            console.error('\n⚠️  The "ph" CLI tool is not installed or not in PATH.');
            console.error('   Please install Powerhouse CLI first.');
        }
        
        process.exit(1);
    }
}

// Run the script
prepareTestProject().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});