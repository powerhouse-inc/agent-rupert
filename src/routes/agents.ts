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

  // GET /agents/reactor-dev/projects - Get projects list for ReactorPackageDevAgent
  router.get('/reactor-dev/projects', async (req, res) => {
    const agent = agentsService.getAgent('reactor-dev');
    if (!agent || !agent.initialized) {
      return res.status(404).json({ error: 'ReactorPackageDevAgent not available' });
    }
    
    const projects = await agentsService.getProjects();
    const packagesManager = agentsService.getPackagesManager();
    const runningProject = packagesManager?.getRunningProject();
    
    res.json({
      projectsDirectory: packagesManager?.getProjectsDir(),
      totalProjects: projects.length,
      runningProject: runningProject?.name || null,
      projects: projects.map(p => ({
        ...p,
        running: p.name === runningProject?.name
      }))
    });
  });

  return router;
}