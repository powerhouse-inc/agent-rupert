import { Router } from 'express';
import type { ReactorInstance } from '../types.js';
import { PowerhouseProjectsManager } from '../powerhouse/PowerhouseProjectsManager.js';
import { config } from '../config.js';

export function createHealthRouter(
  getReactorInstance: () => ReactorInstance | null,
  projectsManager: PowerhouseProjectsManager
): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const reactorInstance = getReactorInstance();
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

  return router;
}