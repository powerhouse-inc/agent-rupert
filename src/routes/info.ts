import { Router } from 'express';
import type { AgentsService } from '../services/AgentsService.js';

export function createInfoRouter(agentsService: AgentsService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const serviceInfo = agentsService.getServiceInfo();
    
    res.json({
      ...serviceInfo,
      endpoints: [
        'GET / - Service info and endpoints',
        'GET /agents - List all configured agents',
        'GET /agents/:name - Get specific agent info',
        'GET /agents/:name/properties - Get agent-specific properties',
        'GET /health - Health check and status'
      ]
    });
  });

  return router;
}