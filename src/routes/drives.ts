import { Router } from 'express';
import type { ReactorInstance } from '../types.js';

export function createDrivesRouter(getReactorInstance: () => ReactorInstance | null): Router {
  const router = Router();

  router.get('/drives', async (_req, res) => {
    const reactorInstance = getReactorInstance();
    
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
            const drive = await reactorInstance.driveServer.getDrive(driveId);
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

  return router;
}