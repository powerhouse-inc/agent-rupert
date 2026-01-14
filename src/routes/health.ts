import { Router } from 'express';
import type { AgentsService } from '../services/AgentsService.js';

export function createHealthRouter(agentsService: AgentsService): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const reactor = agentsService.getReactor();
    const packagesManager = agentsService.getPackagesManager();
    const runningProject = packagesManager?.getRunningProject();
    const agents = agentsService.getAgents();
    
    res.json({
      status: 'ok',
      message: 'Powerhouse Agent is running',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - agentsService.getServiceInfo().startTime.getTime(),
      agents: {
        total: agents.length,
        initialized: agents.filter(a => a.initialized).length
      },
      reactor: reactor ? 'initialized' : 'not initialized',
      project: runningProject ? {
        name: runningProject.name,
        ready: runningProject.isFullyStarted,
        ports: {
          connect: runningProject.connectPort,
          switchboard: runningProject.switchboardPort
        },
        endpoints: {
          vetraConnect: `http://localhost:${runningProject.connectPort}`,
          switchboard: `http://localhost:${runningProject.switchboardPort}`,
          mcp: `http://localhost:${runningProject.switchboardPort}/mcp`
        },
        driveUrl: runningProject.driveUrl || null
      } : null
    });
  });

  return router;
}