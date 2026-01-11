import { Router } from 'express';
import type { ReactorInstance } from '../types.js';

export function createModelsRouter(getReactorInstance: () => ReactorInstance | null): Router {
  const router = Router();

  router.get('/models', (_req, res) => {
    const reactorInstance = getReactorInstance();
    
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

  return router;
}