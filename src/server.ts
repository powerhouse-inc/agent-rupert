import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeReactor } from './reactor-setup.js';
import type { ReactorInstance } from './types.js';
import { createCLITask } from './tasks/types.js';
import { CLIExecutor } from './tasks/executors/cli-executor.js';

dotenv.config();

const app: express.Application = express();
const PORT = process.env.PORT || 3100;

let reactorInstance: ReactorInstance | null = null;

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  const drives = reactorInstance ? await reactorInstance.driveServer.getDrives() : [];
  res.json({
    status: 'ok',
    message: 'Powerhouse Agent is running',
    timestamp: new Date().toISOString(),
    reactor: reactorInstance ? 'initialized' : 'not initialized',
    drives: drives.length,
    remoteDrives: drives.filter((drive: any) => drive.state?.remote).length,
    models: reactorInstance ? reactorInstance.driveServer.getDocumentModelModules().length : 0
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Powerhouse Agent',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check',
      'GET /models - List available document models',
      'GET /drives - List connected drives',
      'GET /stats - Agent statistics (coming soon)',
      'GET /events - Recent events (coming soon)'
    ]
  });
});

app.get('/models', (req, res) => {
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

app.get('/drives', async (req, res) => {
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

async function start() {
  try {
    // Initialize reactor
    reactorInstance = await initializeReactor();
    
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
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Powerhouse Agent server listening on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`⚡ Reactor status: initialized`);
      console.log(`🔨 Task framework: ready`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;