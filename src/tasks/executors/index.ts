// Main CLI Executor export
export { CLIExecutor } from './cli-executor.js';
export type { 
    CLIExecutorOptions, 
    CLIExecutorResult,
    StreamOptions,
    CLIStreamEvent 
} from './cli-executor.js';

// Backward compatibility aliases
export { CLIExecutor as CLIExecutorEnhanced } from './cli-executor.js';
export { CLIExecutor as CLIExecutorStream } from './cli-executor.js';

// Error types
export * from './errors.js';