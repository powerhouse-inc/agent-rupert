import { isLogLevel } from '@powerhousedao/config';
import { InMemoryCache, ReactorBuilder, logger, MemoryStorage } from 'document-drive';
import { FilesystemStorage } from 'document-drive/storage/filesystem';
import type { IDriveOperationStorage } from 'document-drive/storage/types';
// Temporarily use empty array due to library circular import issue
import { documentModels } from 'powerhouse-agent';
import { driveDocumentModelModule } from 'document-drive';
import { documentModelDocumentModelModule, PHDocument } from 'document-model';
import type { ReactorInstance, StorageOptions } from './types.js';
import type { ReactorPackagesManager } from './agents/ReactorPackageAgent/ReactorPackagesManager.js';
import type { AgentProjectsClient } from './graphql/AgentProjectsClient.js';
// Don't import config here - we'll load it after dotenv

/**
 * Sync all projects from ReactorPackagesManager to GraphQL
 */
async function syncProjectsToGraphQL(
  projectsManager: ReactorPackagesManager,
  graphqlClient: AgentProjectsClient,
  documentId: string,
  driveId?: string
): Promise<void> {
  const projects = await projectsManager.listProjects();
  const runningProject = projectsManager.getRunningProject();
  
  logger.info(`Syncing ${projects.length} projects to GraphQL (document: ${documentId})`);
  
  let successCount = 0;
  let errorCount = 0;
  
  // If we don't have a driveId, we can't sync
  if (!driveId) {
    logger.warn('No drive ID available, skipping GraphQL sync');
    return;
  }
  
  for (const project of projects) {
    try {
      logger.info(`Syncing project: ${project.name} (${project.path})`);
      
      // These are document operations, so we need to call them directly with the correct format
      // For now, let's use a direct GraphQL call instead of the client methods
      const registerMutation = `
        mutation RegisterProject($driveId: String, $docId: PHID, $input: AgentProjects_RegisterProjectInput) {
          AgentProjects_registerProject(driveId: $driveId, docId: $docId, input: $input)
        }
      `;
      
      const registerVariables = {
        driveId,
        docId: documentId,
        input: {
          id: project.name,
          name: project.name,
          path: project.path,
          connectPort: project.connectPort || 3000,
          switchboardPort: project.switchboardPort || 4001,
          startupTimeout: 60000,
          autoStart: false,
          currentStatus: runningProject?.name === project.name ? 'RUNNING' : 'STOPPED'
        }
      };
      
      // Make the actual GraphQL call using fetch directly for now
      try {
        const response = await fetch('http://localhost:4001/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: registerMutation,
            variables: registerVariables
          })
        });
        
        const result = await response.json();
        if (result.errors) {
          throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
        }
        
        logger.info(`✅ Project ${project.name} registered successfully (operation: ${result.data.AgentProjects_registerProject})`);
        
        // If this is the running project, also update runtime info
        if (runningProject && runningProject.name === project.name) {
          const updateRuntimeMutation = `
            mutation UpdateRuntime($driveId: String, $docId: PHID, $input: AgentProjects_UpdateRuntimeInfoInput) {
              AgentProjects_updateRuntimeInfo(driveId: $driveId, docId: $docId, input: $input)
            }
          `;
          
          const runtimeVariables = {
            driveId,
            docId: documentId,
            input: {
              projectId: project.name,
              pid: runningProject.process?.pid || 0,
              startedAt: runningProject.startedAt.toISOString(),
              driveUrl: runningProject.driveUrl,
              connectPort: runningProject.connectPort,
              switchboardPort: runningProject.switchboardPort
            }
          };
          
          const runtimeResponse = await fetch('http://localhost:4001/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: updateRuntimeMutation,
              variables: runtimeVariables
            })
          });
          
          const runtimeResult = await runtimeResponse.json();
          if (!runtimeResult.errors) {
            logger.info(`✅ Runtime info updated for ${project.name}`);
          }
        }
        
        successCount++;
      } catch (error) {
        logger.error(`Failed to sync project ${project.name}:`, error);
        errorCount++;
      }
    } catch (error) {
      // This outer catch is redundant now, but kept for safety
      errorCount++;
      logger.error(`Unexpected error syncing project ${project.name}:`, error);
    }
  }
  
  logger.info(`Sync completed: ${successCount} succeeded, ${errorCount} failed`);
}

export const createStorage = (options: StorageOptions): IDriveOperationStorage => {
  switch (options.type) {
    case 'filesystem':
      logger.info(`Initializing filesystem storage at '${options.filesystemPath}'.`);
      return new FilesystemStorage(options.filesystemPath!);
    default:
      logger.info('Initializing memory storage.');
      return new MemoryStorage();
  }
};

export async function initializeReactor(
  projectsManager?: ReactorPackagesManager,
  graphqlClient?: AgentProjectsClient
): Promise<ReactorInstance> {
  // Import config after dotenv has been loaded
  const { config } = await import('./config.js');
  
  // Extract drive ID from remote drive URL if available
  let driveId: string | undefined;
  if (config.remoteDriveUrl) {
    const match = config.remoteDriveUrl.match(/\/d\/([^\/]+)/);
    if (match) {
      driveId = match[1];
      logger.info(`Extracted drive ID from remote URL: ${driveId}`);
    }
  }
  
  // Set log level
  const logLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = isLogLevel(logLevel) ? logLevel : 'info';
  
  logger.info('Initializing Powerhouse Reactor...');
  
  // Log if GraphQL sync is available
  if (projectsManager && graphqlClient) {
    logger.info('GraphQL sync enabled - projects will be synced when agent-projects documents are added');
  } else if (projectsManager || graphqlClient) {
    logger.warn('Partial GraphQL sync configuration - both projectsManager and graphqlClient required');
  }
  
  // Create cache and storage
  const cache = new InMemoryCache();
  const storage = createStorage(config.storage);
  
  // Build document drive server using ReactorBuilder with document models
  const reactorBuilder = new ReactorBuilder([driveDocumentModelModule, documentModelDocumentModelModule, ...documentModels] as any)
    .withCache(cache)
    .withStorage(storage);
  
  const driveServer = reactorBuilder.build();
  
  // Initialize drive server
  await driveServer.initialize();

  // Connect to remote drive if configured
  if (config.remoteDriveUrl) {
    try {
      logger.info(`🔗 Connecting to remote drive: ${config.remoteDriveUrl}`);
      await driveServer.addRemoteDrive(config.remoteDriveUrl, {
        sharingType: "public",
        availableOffline: true,
        listeners: [
          {
            block: true,
            callInfo: {
              data: config.remoteDriveUrl,
              name: "switchboard-push",
              transmitterType: "SwitchboardPush",
            },
            filter: {
              branch: ["main"],
              documentId: ["*"],
              documentType: ["powerhouse/claude-chat"],
              scope: ["global"],
            },
            label: "Switchboard Sync",
            listenerId: crypto.randomUUID(),
            system: true,
          },
        ],
        triggers: [],
      });

      driveServer.on('operationsAdded', (documentId, operations) => {
        //console.log("operations added", documentId, operations);
      });

      driveServer.on('documentAdded', async (document: PHDocument) => {
        console.log("document added", document);
        
        // Check if this is an agent-projects document and we have sync capabilities
        const docType = document.header.documentType;
        const docId = document.header.id;
        
        if (docType === 'powerhouse/agent-projects' && projectsManager && graphqlClient) {
          logger.info(`📊 Agent-projects document detected (ID: ${docId}), syncing local projects to GraphQL...`);
          
          try {
            await syncProjectsToGraphQL(projectsManager, graphqlClient, docId, driveId);
          } catch (error) {
            logger.error('Failed to sync projects to GraphQL:', error);
          }
        }
      });

      logger.info(`✅ Successfully connected to remote drive`);
    } catch (error) {
      logger.error(`❌ Failed to connect to remote drive ${config.remoteDriveUrl}:`, error);
    }
  }

  // Add general document listener for local documents (not just remote)
  if (projectsManager && graphqlClient) {
    driveServer.on('documentAdded', async (document: PHDocument) => {
      const docType = document.header.documentType;
      const docId = document.header.id;
      
      if (docType === 'powerhouse/agent-projects') {
        logger.info(`📊 Local agent-projects document detected (ID: ${docId}), syncing projects to GraphQL...`);
        
        try {
          await syncProjectsToGraphQL(projectsManager, graphqlClient, docId, driveId);
        } catch (error) {
          logger.error('Failed to sync projects to GraphQL:', error);
        }
      }
    });
  }

  logger.info(`✅ Reactor initialized successfully with ${driveServer.getDocumentModelModules().length} document models`);
  
  // For now, we just return the driveServer
  // We'll add Reactor and ReactorClient when we need them for the queue system
  return {
    driveServer,
    reactor: null as any, // Will be implemented when needed
    client: null as any   // Will be implemented when needed
  };
}