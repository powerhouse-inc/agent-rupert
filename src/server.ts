import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// IMPORTANT: Load environment variables BEFORE importing config
dotenv.config();

import { config } from './config.js';
import { initializeAgentsAndStartProject, getAgentsManager, shutdownAgents, getAutoStartState } from './agents/AgentInitializer.js';
import {
  createHealthRouter,
  createModelsRouter,
  createDrivesRouter,
  createProjectsRouter,
  createInfoRouter
} from './routes/index.js';

const app: express.Application = express();
const PORT = config.serverPort;


// Helper function to get reactor instance (may be null if agents not initialized)
const getReactorInstance = () => {
  const agentsManager = getAgentsManager();
  if (agentsManager?.hasReactorPackageAgent()) {
    try {
      return agentsManager.getReactorPackageAgent().getReactor();
    } catch {
      return null;
    }
  }
  return null;
};

// Helper function to get packages manager (may be null if agents not initialized)
const getPackagesManager = () => {
  const agentsManager = getAgentsManager();
  if (agentsManager?.hasReactorPackageAgent()) {
    try {
      return agentsManager.getReactorPackageAgent().getPackagesManager();
    } catch {
      return null;
    }
  }
  return null;
};


app.use(cors());
app.use(express.json());

// Mount basic route handlers (work without agents)
app.use(createInfoRouter(getPackagesManager));
app.use(createHealthRouter(getReactorInstance, getPackagesManager));
app.use(createModelsRouter(getReactorInstance));
app.use(createDrivesRouter(getReactorInstance));
app.use(createProjectsRouter(getPackagesManager, getAutoStartState));


async function start() {
  try {
    // Start Express server FIRST so API endpoints are immediately available
    app.listen(PORT, () => {
      console.log(`🚀 Powerhouse Agent running: http://localhost:${PORT}/`);
      initializeAgentsAndStartProject(config);
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
    await shutdownAgents();
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