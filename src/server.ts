import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeReactor } from './reactor-setup.js';
import type { ReactorInstance } from './types.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3100;

let reactorInstance: ReactorInstance | null = null;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Powerhouse Agent is running',
    timestamp: new Date().toISOString(),
    reactor: reactorInstance ? 'initialized' : 'not initialized',
    drives: reactorInstance ? reactorInstance.driveServer.getDrives().length : 0
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Powerhouse Agent',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check',
      'GET /stats - Agent statistics (coming soon)',
      'GET /events - Recent events (coming soon)'
    ]
  });
});

async function start() {
  try {
    // Initialize reactor
    reactorInstance = await initializeReactor();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Powerhouse Agent server listening on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`⚡ Reactor status: initialized`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;