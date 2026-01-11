import { Router } from 'express';
import { defaultConfig } from '../defaultConfig.js';
import { ReactorPackagesManager } from '../agents/ReactorPackageDevAgent/ReactorPackagesManager.js';

interface AutoStartState {
  status: 'idle' | 'starting' | 'running' | 'failed';
  error: string | null;
}

export function createProjectsRouter(
  getProjectsManager: () => ReactorPackagesManager | null,
  getAutoStartState: () => AutoStartState
): Router {
  const router = Router();
  
  // Helper to ensure projects manager is available
  const requireProjectsManager = (res: any) => {
    const manager = getProjectsManager();
    if (!manager) {
      res.status(503).json({ 
        error: 'Projects manager not available', 
        message: 'Agent is still initializing. Please try again in a moment.' 
      });
      return null;
    }
    return manager;
  };

  router.get('/projects', async (_req, res) => {
    try {
      const projectsManager = requireProjectsManager(res);
      if (!projectsManager) return;
      
      const projects = await projectsManager.listProjects();
      const runningProject = projectsManager.getRunningProject();
      
      const projectsWithStatus = projects.map(project => ({
        ...project,
        running: runningProject?.name === project.name
      }));
      
      res.json({
        projects: projectsWithStatus,
        projectsDirectory: projectsManager.getProjectsDir(),
        totalProjects: projects.length,
        runningProject: runningProject?.name || null
      });
    } catch (error) {
      console.error('Error listing projects:', error);
      res.status(500).json({
        error: 'Failed to list projects',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/projects/running', (_req, res) => {
    const projectsManager = requireProjectsManager(res);
    if (!projectsManager) return;
    const runningProject = projectsManager.getRunningProject();
    const autoStartState = getAutoStartState();
    
    if (!runningProject && autoStartState.status === 'starting') {
      return res.json({
        running: false,
        status: 'starting',
        message: `Project "${defaultConfig.agents.reactorPackageDev.reactorPackages.defaultProjectName}" is being initialized...`,
        project: defaultConfig.agents.reactorPackageDev.reactorPackages.defaultProjectName
      });
    }
    
    if (!runningProject && autoStartState.status === 'failed') {
      return res.json({
        running: false,
        status: 'failed',
        message: autoStartState.error || 'Project failed to start',
        project: defaultConfig.agents.reactorPackageDev.reactorPackages.defaultProjectName
      });
    }
    
    if (!runningProject) {
      return res.json({
        running: false,
        status: 'idle',
        message: 'No project configured at startup. Set POWERHOUSE_PROJECT environment variable.'
      });
    }
    
    const uptime = Date.now() - runningProject.startedAt.getTime();
    
    res.json({
      running: true,
      name: runningProject.name,
      path: runningProject.path,
      connectPort: runningProject.connectPort,
      switchboardPort: runningProject.switchboardPort,
      driveUrl: runningProject.driveUrl || null,
      isFullyStarted: runningProject.isFullyStarted,
      startedAt: runningProject.startedAt.toISOString(),
      uptime
    });
  });

  router.get('/projects/running/status', (_req, res) => {
    const projectsManager = requireProjectsManager(res);
    if (!projectsManager) return;
    const runningProject = projectsManager.getRunningProject();
    const autoStartState = getAutoStartState();
    
    if (!runningProject) {
      let status = 'not-running';
      if (autoStartState.status === 'starting') status = 'starting';
      else if (autoStartState.status === 'failed') status = 'failed';
      else if (autoStartState.status === 'idle') status = 'not-configured';
      
      return res.json({
        status,
        project: defaultConfig.agents.reactorPackageDev.reactorPackages.defaultProjectName || null,
        driveUrl: null,
        ready: false,
        uptime: 0,
        ports: null,
        error: autoStartState.status === 'failed' ? autoStartState.error : null
      });
    }
    
    const uptime = Date.now() - runningProject.startedAt.getTime();
    const status = runningProject.isFullyStarted ? 'ready' : 'starting';
    
    res.json({
      status,
      project: runningProject.name,
      driveUrl: runningProject.driveUrl || null,
      ready: runningProject.isFullyStarted,
      uptime,
      ports: {
        connect: runningProject.connectPort,
        switchboard: runningProject.switchboardPort
      }
    });
  });

  router.get('/projects/running/logs', (req, res) => {
    const projectsManager = requireProjectsManager(res);
    if (!projectsManager) return;
    
    const logs = projectsManager.getProjectLogs();
    const runningProject = projectsManager.getRunningProject();
    
    if (!logs || !runningProject) {
      return res.status(404).json({
        error: 'No project is currently running'
      });
    }
    
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const tail = req.query.tail === 'true';
    
    let resultLogs = logs;
    
    if (limit && limit > 0) {
      resultLogs = logs.slice(-limit);
    }
    
    if (tail) {
      resultLogs = logs.slice(-10);
    }
    
    res.json({
      logs: resultLogs,
      count: resultLogs.length,
      totalAvailable: logs.length,
      projectName: runningProject.name
    });
  });

  router.get('/projects/running/drive-url', (_req, res) => {
    const projectsManager = requireProjectsManager(res);
    if (!projectsManager) return;
    const runningProject = projectsManager.getRunningProject();
    
    if (!runningProject) {
      return res.json({
        driveUrl: null,
        message: 'No project is currently running'
      });
    }
    
    if (!runningProject.driveUrl) {
      return res.json({
        driveUrl: null,
        message: 'Drive URL not yet available',
        project: runningProject.name
      });
    }
    
    res.json({
      driveUrl: runningProject.driveUrl,
      project: runningProject.name
    });
  });

  return router;
}