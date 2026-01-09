/**
 * Example usage of the AgentProjectsClient GraphQL client
 * 
 * This demonstrates how to use the GraphQL client to manage
 * AgentProjects through GraphQL mutations and queries.
 */

import { AgentProjectsClient } from '../src/graphql/AgentProjectsClient.js';
import { ProjectStatus, LogLevel, LogSource } from '../src/graphql/types.js';

// Initialize the client with configuration
const client = new AgentProjectsClient({
    endpoint: 'http://localhost:4001/graphql',
    headers: {
        // Optional: Add authentication if needed
        // 'Authorization': 'Bearer your-token-here'
    },
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 30000
});

async function exampleUsage() {
    try {
        // 1. Create a new project
        console.log('Creating a new project...');
        const createResult = await client.createProject({
            name: 'my-powerhouse-project',
            path: '/projects/my-powerhouse-project',
            port: 3100,
            autoStart: true,
            commandTimeout: 60000
        });
        
        if (createResult.success) {
            console.log('✅ Project created:', createResult.document?.name);
        }

        const projectId = createResult.document?.id || 'my-powerhouse-project';

        // 2. Update project status to RUNNING
        console.log('Starting the project...');
        await client.updateProjectStatus(projectId, ProjectStatus.RUNNING);

        // 3. Update runtime information with PID and Drive URL
        console.log('Updating runtime information...');
        await client.updateProjectRuntime(projectId, {
            pid: process.pid,
            startedAt: new Date().toISOString(),
            driveUrl: 'http://localhost:4001/drives/abc123'
        });

        // 4. Add log entries
        console.log('Adding log entries...');
        await client.addLogEntry(
            projectId,
            LogLevel.INFO,
            'Project started successfully',
            LogSource.SYSTEM,
            { version: '1.0.0' }
        );

        await client.addLogEntry(
            projectId,
            LogLevel.INFO,
            'Vetra server listening on port 4001',
            LogSource.APPLICATION
        );

        // 5. Fetch project details
        console.log('Fetching project details...');
        const project = await client.getProject(projectId);
        
        if (project) {
            console.log('Project Status:', project.status);
            console.log('Runtime:', project.runtime);
            console.log('Logs:', project.logs.length, 'entries');
        }

        // 6. List all projects
        console.log('Listing all projects...');
        const allProjects = await client.getAllProjects();
        console.log(`Found ${allProjects.length} projects`);

        // 7. Stop the project
        console.log('Stopping the project...');
        await client.stopProject(projectId);

        // 8. Update configuration
        console.log('Updating project configuration...');
        await client.updateProjectConfig(projectId, {
            port: 3200,
            autoStart: false
        });

        // 9. Handle offline/queue scenario
        console.log('\n--- Demonstrating Queue Management ---');
        
        // Check current queue size
        console.log('Queue size:', client.getQueueSize());
        
        // If there are queued mutations (e.g., from network issues)
        // you can manually flush them when connection is restored
        await client.flushQueue();
        
        console.log('✅ All operations completed successfully!');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Integration with PowerhouseProjectsManager
async function integratedExample() {
    const { PowerhouseProjectsManager } = await import('../src/powerhouse/PowerhouseProjectsManager.js');
    const { config } = await import('../src/config.js');
    
    // Create manager with GraphQL integration
    const manager = new PowerhouseProjectsManager(
        '../projects',
        undefined,
        config.graphql
    );
    
    // When you init/run/stop projects through the manager,
    // it will automatically sync with GraphQL!
    
    console.log('Initializing project with GraphQL sync...');
    const initResult = await manager.init('test-project');
    
    if (initResult.success) {
        console.log('Project initialized and synced to GraphQL');
        
        // Run the project
        const runResult = await manager.runProject('test-project', {
            connectPort: 3000,
            switchboardPort: 4001,
            startupTimeout: 60000
        });
        
        if (runResult.success) {
            console.log('Project running and status updated in GraphQL');
            console.log('Drive URL:', runResult.driveUrl);
        }
    }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('=== AgentProjectsClient GraphQL Example ===\n');
    exampleUsage().catch(console.error);
}