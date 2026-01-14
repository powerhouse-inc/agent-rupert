import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// IMPORTANT: Load environment variables BEFORE importing config
dotenv.config();

import { config } from './config.js';
import { AgentsService } from './services/AgentsService.js';
import {
  createHealthRouter,
  createInfoRouter,
  createAgentsRouter
} from './routes/index.js';

const app: express.Application = express();
const PORT = config.serverPort;

// Create the centralized agents service
const agentsService = new AgentsService();

// Store server instance for cleanup
let server: any = null;


app.use(cors());
app.use(express.json());

// Prettify JSON responses
app.set('json spaces', 2);

// Mount route handlers
app.use(createInfoRouter(agentsService));
app.use('/agents', createAgentsRouter(agentsService));
app.use(createHealthRouter(agentsService));


async function start() {
  // Start Express server FIRST so API endpoints are immediately available
  server = app.listen(PORT);
  
  server.on('listening', () => {
    console.log(`🚀 Powerhouse Agent running: http://localhost:${PORT}/`);
    agentsService.initialize(config);
  });
  
  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Please stop the other process or use a different port.`);
    } else {
      console.error('❌ Failed to start server:', error);
    }
    process.exit(1);
  });
}

start();

// Graceful shutdown handling
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n📛 Received ${signal}, starting graceful shutdown...`);
  
  // Set a maximum time for graceful shutdown
  const shutdownTimeout = setTimeout(() => {
    console.error('⏱️ Shutdown timeout exceeded, forcing exit...');
    process.exit(1);
  }, 30000); // 30 seconds max
  
  try {
    // Close the HTTP server first
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('📪 HTTP server closed');
          resolve();
        });
      });
    }
    
    // Then shutdown agents (includes shutting down running projects)
    await agentsService.shutdown();
    
    // Clear the timeout since we completed successfully
    clearTimeout(shutdownTimeout);
    
    console.log('👋 Graceful shutdown complete');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
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