import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// IMPORTANT: Load environment variables BEFORE importing config
dotenv.config();

import { config } from './config.js';
import { AgentsManager } from './agents/AgentsManager.js';
import {
  createHealthRouter,
  createModelsRouter,
  createDrivesRouter,
  createProjectsRouter,
  createInfoRouter
} from './routes/index.js';

const app: express.Application = express();
const PORT = config.port;

// Create and configure agents manager
const agentsManager = new AgentsManager({
  enableReactorPackageAgent: true,
  enableArchitectAgent: false, // Disabled until fully implemented
  projectsDir: config.powerhouse.projectsDir,
  reactorPackageConfig: {
    reactor: {
      remoteDriveUrl: config.remoteDriveUrl,
      storage: config.storage
    }
  }
});

// Track auto-start status
let autoStartStatus: 'idle' | 'starting' | 'running' | 'failed' = 'idle';
let autoStartError: string | null = null;

// Helper function to get auto-start state
const getAutoStartState = () => ({
  status: autoStartStatus,
  error: autoStartError
});

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
  
  if (!agentsManager.hasReactorPackageAgent()) {
    console.log('⚠️ ReactorPackageAgent not enabled, cannot auto-start project');
    autoStartStatus = 'failed';
    autoStartError = 'ReactorPackageAgent not enabled';
    return;
  }
  
  const reactorPackageAgent = agentsManager.getReactorPackageAgent();
  
  console.log(`\n🚀 Auto-starting Powerhouse project: ${project}`);
  console.log('================================');
  autoStartStatus = 'starting';
  autoStartError = null;
  
  try {
    // Check if project exists
    const projects = await reactorPackageAgent.listProjects();
    const projectExists = projects.some(p => p.name === project);
    
    if (!projectExists) {
      console.log(`📝 Project "${project}" not found, initializing it now...`);
      
      // Initialize the project
      const initResult = await reactorPackageAgent.initProject(project);
      
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
    const result = await reactorPackageAgent.runProject(project, runOptions);
    
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

// Mount route handlers (will be configured after agents are initialized)
let routesConfigured = false;

async function start() {
  try {
    // Initialize all agents (includes reactor initialization)
    await agentsManager.initialize();
    
    // Get the ReactorPackageAgent for route configuration
    const reactorPackageAgent = agentsManager.getReactorPackageAgent();
    
    // Configure routes with agents
    if (!routesConfigured) {
      app.use(createInfoRouter(reactorPackageAgent.getPackagesManager()));
      app.use(createHealthRouter(() => reactorPackageAgent.getReactor(), reactorPackageAgent.getPackagesManager()));
      app.use(createModelsRouter(() => reactorPackageAgent.getReactor()));
      app.use(createDrivesRouter(() => reactorPackageAgent.getReactor()));
      app.use(createProjectsRouter(reactorPackageAgent.getPackagesManager(), getAutoStartState));
      routesConfigured = true;
    }
    
    // Start Express server FIRST so API endpoints are immediately available
    app.listen(PORT, () => {
      console.log(`🚀 Powerhouse Agent server listening on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`📍 Projects API: http://localhost:${PORT}/projects`);
      console.log(`✅ ReactorPackageAgent: initialized`);
      console.log(`⚡ Reactor status: initialized`);
      console.log(`🔨 Task framework: ready`);
      
      // Auto-start configured Powerhouse project AFTER server is running
      // This runs asynchronously so the server is immediately available
      startConfiguredProject().then(() => {
        const reactorPackageAgent = agentsManager.getReactorPackageAgent();
        const runningProject = reactorPackageAgent.getRunningProject();
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
    // Shutdown all agents (includes shutting down running projects)
    await agentsManager.shutdown();
    
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