import { Router } from 'express';
import type { AgentsService } from '../services/AgentsService.js';

export function createHealthRouter(agentsService: AgentsService): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const agents = agentsService.getAgents();
    const serviceInfo = agentsService.getServiceInfo();
    
    res.json({
      status: 'ok',
      message: 'Powerhouse Agent is running',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - serviceInfo.startTime.getTime(),
      agents: {
        total: agents.length,
        initialized: agents.filter(a => a.initialized).length
      }
    });
  });

  return router;
}