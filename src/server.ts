import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// IMPORTANT: Load environment variables BEFORE importing config
dotenv.config();

import { initializeReactor } from './reactor-setup.js';
import type { ReactorInstance } from './types.js';
import { createCLITask } from './tasks/types.js';
import { CLIExecutor } from './tasks/executors/cli-executor.js';
import { PowerhouseProjectsManager } from './powerhouse/PowerhouseProjectsManager.js';
import { AgentProjectsClient } from './graphql/AgentProjectsClient.js';
import { config } from './config.js';

const app: express.Application = express();
const PORT = config.port;

let reactorInstance: ReactorInstance | null = null;

// Create shared CLI executor instance
const cliExecutor = new CLIExecutor({
  timeout: 120000, // 2 minutes default timeout
  retryAttempts: 0 // No retries by default
});

// Initialize PowerhouseProjectsManager with configured directory and GraphQL config
const projectsManager = new PowerhouseProjectsManager(
  config.powerhouse.projectsDir,
  cliExecutor,
  config.graphql
);

// Create GraphQL client instance for reactor sync
const graphqlClient = config.graphql ? new AgentProjectsClient({
  endpoint: config.graphql.endpoint,
  headers: config.graphql.authToken ? { Authorization: `Bearer ${config.graphql.authToken}` } : {},
  retryAttempts: config.graphql.retryAttempts,
  retryDelay: config.graphql.retryDelay,
  timeout: config.graphql.timeout
}) : null;

if (graphqlClient) {
  console.log(`📊 GraphQL client configured for endpoint: ${config.graphql.endpoint}`);
} else {
  console.log('📊 GraphQL client not configured - project sync disabled');
}

// Track auto-start status
let autoStartStatus: 'idle' | 'starting' | 'running' | 'failed' = 'idle';
let autoStartError: string | null = null;

/**
 * Auto-start the configured Powerhouse project if specified
 */
async function startConfiguredProject(): Promise<void> {
  const { project, connectPort, switchboardPort, startupTimeout } = config.powerhouse;
  
  if (!project) {
    console.log('📦 No Powerhouse project configured for auto-start');
    autoStartStatus = 'idle';
    return;
  }
  
  console.log(`\n🚀 Auto-starting Powerhouse project: ${project}`);
  console.log('================================');
  autoStartStatus = 'starting';
  autoStartError = null;
  
  try {
    // Clean up any orphaned processes from previous runs
    await projectsManager.cleanupOrphanedProcesses();
    
    // Check if project exists
    const projects = await projectsManager.listProjects();
    const projectExists = projects.some(p => p.name === project);
    
    if (!projectExists) {
      console.log(`📝 Project "${project}" not found, initializing it now...`);
      
      // Initialize the project
      const initResult = await projectsManager.init(project);
      
      if (initResult.success) {
        console.log(`✅ Project "${project}" initialized successfully at ${initResult.projectPath}`);
      } else {
        console.error(`❌ Failed to initialize project "${project}": ${initResult.error}`);
        console.log('⚠️ Server will continue without auto-started project\n');
        autoStartStatus = 'failed';
        autoStartError = initResult.error || 'Failed to initialize project';
        return;
      }
    } else {
      console.log(`✓ Project "${project}" found in ${config.powerhouse.projectsDir}`);
    }
    
    // Prepare run options
    // Note: Avoid port 6000 as it's blocked by browsers (X11 port)
    const runOptions = {
      connectPort: connectPort || 5000,
      switchboardPort: switchboardPort || 6100,  // Changed from 6000 to avoid browser restrictions
      startupTimeout
    };
    
    console.log(`📝 Starting with options:`);
    console.log(`   Connect Port: ${runOptions.connectPort}`);
    console.log(`   Switchboard Port: ${runOptions.switchboardPort}`);
    console.log(`   Startup Timeout: ${runOptions.startupTimeout}ms`);
    
    // Run the project
    const result = await projectsManager.runProject(project, runOptions);
    
    if (result.success) {
      console.log(`✅ Project "${project}" started successfully`);
      if (result.driveUrl) {
        console.log(`🌐 Drive URL: ${result.driveUrl}`);
      } else {
        console.log(`⏳ Drive URL not captured within timeout (project may still be starting)`);
      }
      console.log(`📡 Connect Studio: http://localhost:${result.connectPort}`);
      console.log(`📡 Switchboard: http://localhost:${result.switchboardPort}`);
      autoStartStatus = 'running';
    } else {
      console.error(`❌ Failed to start project "${project}": ${result.error}`);
      console.log('⚠️ Server will continue without auto-started project');
      autoStartStatus = 'failed';
      autoStartError = result.error || 'Failed to start project';
    }
  } catch (error) {
    console.error(`❌ Error during project auto-start:`, error);
    console.log('⚠️ Server will continue without auto-started project');
    autoStartStatus = 'failed';
    autoStartError = error instanceof Error ? error.message : 'Unknown error during project auto-start';
  }
  
  console.log('================================\n');
}

app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  const drives = reactorInstance ? await reactorInstance.driveServer.getDrives() : [];
  const runningProject = projectsManager.getRunningProject();
  
  res.json({
    status: 'ok',
    message: 'Powerhouse Agent is running',
    timestamp: new Date().toISOString(),
    reactor: reactorInstance ? 'initialized' : 'not initialized',
    drives: drives.length,
    remoteDrives: drives.filter((drive: any) => drive.state?.remote).length,
    models: reactorInstance ? reactorInstance.driveServer.getDocumentModelModules().length : 0,
    powerhouseProject: {
      configured: !!config.powerhouse.project,
      running: !!runningProject,
      name: runningProject?.name || config.powerhouse.project || null,
      ready: runningProject?.isFullyStarted || false,
      driveUrl: runningProject?.driveUrl || null
    }
  });
});

app.get('/', (_req, res) => {
  const runningProject = projectsManager.getRunningProject();
  res.json({
    name: 'Powerhouse Agent',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check with project status',
      'GET /models - List available document models',
      'GET /drives - List connected drives',
      'GET /projects - List all Powerhouse projects',
      'GET /projects/running - Get running project info',
      'GET /projects/running/status - Quick project status',
      'GET /projects/running/logs - Get project logs (?limit=N&tail=true)',
      'GET /projects/running/drive-url - Get project Drive URL',
      'GET /stats - Agent statistics (coming soon)',
      'GET /events - Recent events (coming soon)'
    ],
    powerhouseProject: {
      running: !!runningProject,
      name: runningProject?.name || null
    }
  });
});

app.get('/models', (_req, res) => {
  if (!reactorInstance) {
    return res.status(503).json({
      error: 'Reactor not initialized'
    });
  }

  const models = reactorInstance.driveServer.getDocumentModelModules().map(module => ({
    id: module.documentModel.global.id,
    name: module.documentModel.global.name,
    extension: module.documentModel.global.extension,
    author: module.documentModel.global.author,
    description: module.documentModel.global.description
  }));

  res.json({
    count: models.length,
    models
  });
});

app.get('/drives', async (_req, res) => {
  if (!reactorInstance) {
    return res.status(503).json({
      error: 'Reactor not initialized'
    });
  }

  try {
    const driveIds = await reactorInstance.driveServer.getDrives();
    const driveDetails = await Promise.all(
      driveIds.map(async (driveId: string) => {
        try {
          const drive = await reactorInstance!.driveServer.getDrive(driveId);
          return drive;
        } catch (error) {
          return {
            id: driveId,
            name: 'Error loading drive',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    res.json({
      count: driveIds.length,
      drives: driveDetails
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve drives',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ===== Powerhouse Projects API Endpoints =====

/**
 * GET /projects - List all available Powerhouse projects
 */
app.get('/projects', async (_req, res) => {
  try {
    const projects = await projectsManager.listProjects();
    const runningProject = projectsManager.getRunningProject();
    
    // Add running status to each project
    const projectsWithStatus = projects.map(project => ({
      ...project,
      running: runningProject?.name === project.name
    }));
    
    res.json({
      projects: projectsWithStatus,
      projectsDirectory: projectsManager.getProjectsDir(),
      totalProjects: projects.length,
      runningProject: runningProject?.name || null
    });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({
      error: 'Failed to list projects',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /projects/running - Get information about the running project
 */
app.get('/projects/running', (_req, res) => {
  const runningProject = projectsManager.getRunningProject();
  
  // If no project is running but auto-start is in progress
  if (!runningProject && autoStartStatus === 'starting') {
    return res.json({
      running: false,
      status: 'starting',
      message: `Project "${config.powerhouse.project}" is being initialized...`,
      project: config.powerhouse.project
    });
  }
  
  // If auto-start failed
  if (!runningProject && autoStartStatus === 'failed') {
    return res.json({
      running: false,
      status: 'failed',
      message: autoStartError || 'Project failed to start',
      project: config.powerhouse.project
    });
  }
  
  // If no project configured
  if (!runningProject) {
    return res.json({
      running: false,
      status: 'idle',
      message: 'No project configured at startup. Set POWERHOUSE_PROJECT environment variable.'
    });
  }
  
  const uptime = Date.now() - runningProject.startedAt.getTime();
  
  res.json({
    running: true,
    name: runningProject.name,
    path: runningProject.path,
    connectPort: runningProject.connectPort,
    switchboardPort: runningProject.switchboardPort,
    driveUrl: runningProject.driveUrl || null,
    isFullyStarted: runningProject.isFullyStarted,
    startedAt: runningProject.startedAt.toISOString(),
    uptime
  });
});

/**
 * GET /projects/running/status - Quick status check for the running project
 */
app.get('/projects/running/status', (_req, res) => {
  const runningProject = projectsManager.getRunningProject();
  
  // Handle various auto-start states when no project is running
  if (!runningProject) {
    let status = 'not-running';
    if (autoStartStatus === 'starting') status = 'starting';
    else if (autoStartStatus === 'failed') status = 'failed';
    else if (autoStartStatus === 'idle') status = 'not-configured';
    
    return res.json({
      status,
      project: config.powerhouse.project || null,
      driveUrl: null,
      ready: false,
      uptime: 0,
      ports: null,
      error: autoStartStatus === 'failed' ? autoStartError : null
    });
  }
  
  const uptime = Date.now() - runningProject.startedAt.getTime();
  const status = runningProject.isFullyStarted ? 'ready' : 'starting';
  
  res.json({
    status,
    project: runningProject.name,
    driveUrl: runningProject.driveUrl || null,
    ready: runningProject.isFullyStarted,
    uptime,
    ports: {
      connect: runningProject.connectPort,
      switchboard: runningProject.switchboardPort
    }
  });
});

/**
 * GET /projects/running/logs - Get logs from the running project
 */
app.get('/projects/running/logs', (req, res) => {
  const logs = projectsManager.getProjectLogs();
  const runningProject = projectsManager.getRunningProject();
  
  if (!logs || !runningProject) {
    return res.status(404).json({
      error: 'No project is currently running'
    });
  }
  
  // Parse query parameters
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const tail = req.query.tail === 'true';
  
  // Get logs based on parameters
  let resultLogs = logs;
  
  if (limit && limit > 0) {
    // Return last N logs
    resultLogs = logs.slice(-limit);
  }
  
  // For tail mode, we could implement a marker system in the future
  // For now, just return the latest logs
  if (tail) {
    // In a real implementation, this would track the last position
    // and only return new logs since then
    resultLogs = logs.slice(-10); // Return last 10 logs for tail mode
  }
  
  res.json({
    logs: resultLogs,
    count: resultLogs.length,
    totalAvailable: logs.length,
    projectName: runningProject.name
  });
});

/**
 * GET /projects/running/drive-url - Get the Drive URL of the running project
 */
app.get('/projects/running/drive-url', (_req, res) => {
  const runningProject = projectsManager.getRunningProject();
  
  if (!runningProject) {
    return res.json({
      driveUrl: null,
      message: 'No project is currently running'
    });
  }
  
  if (!runningProject.driveUrl) {
    return res.json({
      driveUrl: null,
      message: 'Drive URL not yet available',
      project: runningProject.name
    });
  }
  
  res.json({
    driveUrl: runningProject.driveUrl,
    project: runningProject.name
  });
});

async function start() {
  try {
    // Initialize reactor with project manager and GraphQL client for sync
    reactorInstance = await initializeReactor(projectsManager, graphqlClient || undefined);
    
    // Demo: Execute a CLI task on startup
    console.log('\n🔧 Demonstrating CLI Task Execution...');
    const cliExecutor = new CLIExecutor({
      timeout: 5000,
      retryAttempts: 1
    });

    // Set up event listeners to show task progress
    cliExecutor.on('started', (event) => {
      console.log(`   ▶ Task started (PID: ${event.pid})`);
    });
    
    cliExecutor.on('stdout', (event) => {
      console.log(`   📤 Output: ${event.data.trim()}`);
    });
    
    cliExecutor.on('completed', (event) => {
      console.log(`   ✅ Task completed in ${event.result.duration}ms`);
    });

    // Create and execute a demo task
    const demoTask = createCLITask({
      title: 'System Info Check',
      instructions: 'Get system information on startup',
      command: process.platform === 'win32' ? 'echo' : 'uname',
      args: process.platform === 'win32' ? 
        ['System:', process.platform, '| Node:', process.version] : 
        ['-a'],
      environment: {
        TASK_CONTEXT: 'server_startup'
      }
    });

    try {
      console.log(`   📋 Executing task: "${demoTask.title}"`);
      console.log(`   📝 Instructions: ${demoTask.instructions}`);
      console.log(`   💻 Command: ${demoTask.command} ${demoTask.args.join(' ')}`);
      
      const result = await cliExecutor.execute(demoTask);
      
      if (result.stdout) {
        console.log(`   📊 Result: ${result.stdout.trim()}`);
      }
      
      console.log(`   ⏱️ Execution time: ${result.duration}ms`);
      console.log('   ✨ CLI Task framework is operational!\n');
    } catch (error) {
      console.error('   ❌ Demo task failed:', error instanceof Error ? error.message : error);
      console.log('   ⚠️ CLI Task framework encountered an error but server will continue\n');
    }
    
    // Start Express server FIRST so API endpoints are immediately available
    app.listen(PORT, () => {
      console.log(`🚀 Powerhouse Agent server listening on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`📍 Projects API: http://localhost:${PORT}/projects`);
      console.log(`⚡ Reactor status: initialized`);
      console.log(`🔨 Task framework: ready`);
      
      // Auto-start configured Powerhouse project AFTER server is running
      // This runs asynchronously so the server is immediately available
      startConfiguredProject().then(() => {
        const runningProject = projectsManager.getRunningProject();
        if (runningProject) {
          console.log(`\n✅ Powerhouse project "${runningProject.name}" is now running`);
          console.log(`📍 Project status: http://localhost:${PORT}/projects/running`);
          if (runningProject.driveUrl) {
            console.log(`🌐 Drive URL: ${runningProject.driveUrl}`);
          }
        }
      }).catch((error) => {
        console.error('\n❌ Failed to auto-start project:', error);
        console.log(`📍 Check status at: http://localhost:${PORT}/projects/running`);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown handling
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n📛 Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Shutdown running Powerhouse project if any
    const runningProject = projectsManager.getRunningProject();
    if (runningProject) {
      console.log(`🛑 Shutting down Powerhouse project: ${runningProject.name}`);
      const shutdownResult = await projectsManager.shutdownProject();
      if (shutdownResult.success) {
        console.log(`✅ Project shutdown successful`);
      } else {
        console.error(`⚠️ Project shutdown failed: ${shutdownResult.error}`);
      }
    }
    
    // Add any other cleanup here (database connections, etc.)
    console.log('👋 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

export default app;