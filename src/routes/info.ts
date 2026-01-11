import { Router } from 'express';
import { ReactorPackagesManager } from '../agents/ReactorPackageDevAgent/ReactorPackagesManager.js';

export function createInfoRouter(getProjectsManager: () => ReactorPackagesManager | null): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const projectsManager = getProjectsManager();
    const runningProject = projectsManager?.getRunningProject();
    
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
      ReactorPackage: {
        running: !!runningProject,
        name: runningProject?.name || null
      }
    });
  });

  return router;
}