import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// IMPORTANT: Load environment variables BEFORE importing config
dotenv.config();

import { initializeReactor } from './reactor-setup.js';
import type { ReactorInstance } from './types.js';
import { CLIExecutor } from './tasks/executors/cli-executor.js';
import { PowerhouseProjectsManager } from './powerhouse/PowerhouseProjectsManager.js';
import { AgentProjectsClient } from './graphql/AgentProjectsClient.js';
import { config } from './config.js';
import {
  createHealthRouter,
  createModelsRouter,
  createDrivesRouter,
  createProjectsRouter,
  createInfoRouter
} from './routes/index.js';

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
  cliExecutor
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

// Helper function to get reactor instance
const getReactorInstance = () => reactorInstance;

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
  
  console.log(`\n🚀 Auto-starting Powerhouse project: ${project}`);
  console.log('================================');
  autoStartStatus = 'starting';
  autoStartError = null;
  
  try {
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

// Mount route handlers
app.use(createInfoRouter(projectsManager));
app.use(createHealthRouter(getReactorInstance, projectsManager));
app.use(createModelsRouter(getReactorInstance));
app.use(createDrivesRouter(getReactorInstance));
app.use(createProjectsRouter(projectsManager, getAutoStartState));

async function start() {
  try {
    // Initialize reactor with project manager and GraphQL client for sync
    reactorInstance = await initializeReactor(projectsManager, graphqlClient || undefined);
    
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