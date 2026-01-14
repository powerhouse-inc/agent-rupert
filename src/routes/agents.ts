import { Router } from 'express';
import type { AgentsService } from '../services/AgentsService.js';

export function createAgentsRouter(agentsService: AgentsService): Router {
  const router = Router();

  // GET /agents - List all agents with basic info
  router.get('/', (_req, res) => {
    const agents = agentsService.getAgents();
    res.json(agents);
  });

  // GET /agents/:name - Get specific agent basic info
  router.get('/:name', (req, res) => {
    const agent = agentsService.getAgent(req.params.name);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
  });

  // GET /agents/:name/properties - Get agent-specific properties (polymorphic)
  router.get('/:name/properties', (req, res) => {
    const properties = agentsService.getAgentProperties(req.params.name);
    if (!properties) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(properties);
  });

  return router;
}