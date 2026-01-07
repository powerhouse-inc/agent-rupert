import { isLogLevel } from '@powerhousedao/config';
import { InMemoryCache, ReactorBuilder, logger, MemoryStorage } from 'document-drive';
import { FilesystemStorage } from 'document-drive/storage/filesystem';
import type { IDriveOperationStorage } from 'document-drive/storage/types';
import type { ReactorInstance, StorageOptions } from './types.js';
import { config } from './config.js';

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

export async function initializeReactor(): Promise<ReactorInstance> {
  // Set log level
  const logLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = isLogLevel(logLevel) ? logLevel : 'info';
  
  logger.info('Initializing Powerhouse Reactor...');
  
  // Create cache and storage
  const cache = new InMemoryCache();
  const storage = createStorage(config.storage);
  
  // Build document drive server using ReactorBuilder
  const reactorBuilder = new ReactorBuilder([])
    .withCache(cache)
    .withStorage(storage);
  
  const driveServer = reactorBuilder.build();
  
  // Initialize drive server
  await driveServer.initialize();

  logger.info('✅ Reactor initialized successfully');
  
  // For now, we just return the driveServer
  // We'll add Reactor and ReactorClient when we need them for the queue system
  return {
    driveServer,
    reactor: null as any, // Will be implemented when needed
    client: null as any   // Will be implemented when needed
  };
}