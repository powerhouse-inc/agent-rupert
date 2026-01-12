import { AgentsManager } from './AgentsManager.js';
import type { ServerConfig } from '../types.js';
import type { ILogger } from './AgentBase.js';
import { driveUrlToMcpUrl } from '../utils/url-utils.js';

let agentsManager: AgentsManager | null = null;

// Auto-start status management
let autoStartStatus: 'idle' | 'starting' | 'running' | 'failed' = 'idle';
let autoStartError: string | null = null;

// Create a logger that prefixes all messages properly
function createLogger(): ILogger {
  return {
    info: (message: string) => console.log(message),
    error: (message: string, error?: any) => {
      if (error) {
        console.error(message, error);
      } else {
        console.error(message);
      }
    },
    warn: (message: string) => console.warn(message),
    debug: (message: string) => console.log(message)
  };
}

/**
 * Initialize agents asynchronously after server is running
 */
export async function initializeAgents(config: ServerConfig): Promise<void> {
  const logger = createLogger();
  
  try {
    logger.info('🔧 Initializing agents...');
    
    // Create and configure agents manager with logger
    const reactorPackageDev = config.agents.reactorPackageDev;
    const powerhouseArchitect = config.agents.powerhouseArchitect;
    
    // Transform drive URL to MCP URL
    const agentManagerDriveUrl = reactorPackageDev.workDrive.driveUrl || undefined;
    const agentManagerMcpUrl = driveUrlToMcpUrl(agentManagerDriveUrl);
    
    if (agentManagerMcpUrl) {
      logger.info(`🔗 Agent Manager MCP server: ${agentManagerMcpUrl}`);
    }
    
    agentsManager = new AgentsManager({
      enableReactorPackageAgent: true,
      enableArchitectAgent: true,
      reactorPackageConfig: reactorPackageDev,
      architectConfig: powerhouseArchitect,
      anthropicApiKey: config.anthropicApiKey,
      agentManagerMcpUrl,
      serverPort: config.serverPort,
      logger
    });
    
    // Initialize all agents (includes reactor initialization)
    await agentsManager.initialize();
    
  } catch (error) {
    logger.error('❌ Failed to initialize agents:', error);
    // Don't throw - server should continue to run without agents
  }
}

/**
 * Get the agents manager instance (may be null if not initialized)
 */
export function getAgentsManager(): AgentsManager | null {
  return agentsManager;
}

/**
 * Check if agents are initialized
 */
export function areAgentsInitialized(): boolean {
  return agentsManager !== null;
}

/**
 * Auto-start the configured Powerhouse project if specified
 */
async function startConfiguredProject(config: ServerConfig): Promise<void> {
  const reactorPackageDev = config.agents.reactorPackageDev;
  const { autoStartDefaultProject, defaultProjectName } = reactorPackageDev.reactorPackages;
  const { connectPort, switchboardPort, startupTimeout } = reactorPackageDev.vetraConfig;
  
  const project = autoStartDefaultProject ? defaultProjectName : null;
  
  if (!project) {
    console.log('📦 No Powerhouse project configured for auto-start');
    autoStartStatus = 'idle';
    return;
  }
  
  if (!agentsManager?.hasReactorPackageAgent()) {
    console.log('⚠️ ReactorPackageAgent not available, cannot auto-start project');
    autoStartStatus = 'failed';
    autoStartError = 'ReactorPackageAgent not available';
    return;
  }
  
  const reactorPackageAgent = agentsManager.getReactorPackageAgent();
  
  console.log(`\n🚀 Auto-starting Powerhouse project: ${project}`);
  console.log('================================');
  autoStartStatus = 'starting';
  autoStartError = null;
  
  try {
    // Check if project exists
    const projects = await reactorPackageAgent.listProjects();
    const projectExists = projects.some((p: any) => p.name === project);
    
    if (!projectExists) {
      console.log(`📝 Project "${project}" not found, initializing it now...`);
      
      // Initialize the project
      const initResult = await reactorPackageAgent.initProject(project);
      
      if (initResult.success) {
        console.log(`✅ Project "${project}" initialized successfully at ${initResult.projectPath}`);
      } else {
        console.error(`❌ Failed to initialize project "${project}": ${initResult.error}`);
        console.log('⚠️ Server will continue without auto-started project\n');
        autoStartStatus = 'failed';
        autoStartError = initResult.error || 'Failed to initialize project';
        return;
      }
    } else {
      console.log(`✓ Project "${project}" found in ${reactorPackageDev.reactorPackages.projectsDir}`);
    }
    
    // Prepare run options
    // Note: Avoid port 6000 as it's blocked by browsers (X11 port)
    const runOptions = {
      connectPort: connectPort || 5000,
      switchboardPort: switchboardPort || 6100,  // Changed from 6000 to avoid browser restrictions
      startupTimeout
    };
    
    console.log(`📝 Starting with options:`);
    console.log(`   Connect Port: ${runOptions.connectPort}`);
    console.log(`   Switchboard Port: ${runOptions.switchboardPort}`);
    console.log(`   Startup Timeout: ${runOptions.startupTimeout}ms`);
    
    // Run the project
    const result = await reactorPackageAgent.runProject(project, runOptions);
    
    if (result.success) {
      console.log(`✅ Project "${project}" started successfully`);
      console.log(`  📡 Vetra Studio: http://localhost:${result.connectPort}`);
      console.log(`  📡 Vetra Switchboard: http://localhost:${result.switchboardPort}`);
      console.log(`  📡 Vetra MCP: ${result.mcpServer}`);
      if (result.driveUrl) {
        console.log(`  🌐 Drive URL: ${result.driveUrl}`);
      } else {
        console.log(`  ⏳ Drive URL not captured within timeout (project may still be starting)`);
      }
      
      autoStartStatus = 'running';
    } else {
      console.error(`❌ Failed to start project "${project}": ${result.error}`);
      console.log('⚠️ Server will continue without auto-started project');
      autoStartStatus = 'failed';
      autoStartError = result.error || 'Failed to start project';
    }
    
  } catch (error) {
    console.error(`❌ Error during project auto-start:`, error);
    console.log('⚠️ Server will continue without auto-started project');
    autoStartStatus = 'failed';
    autoStartError = error instanceof Error ? error.message : 'Unknown error during project auto-start';
  }
  
  console.log('================================\n');
}

/**
 * Initialize agents and auto-start project
 */
export async function initializeAgentsAndStartProject(config: ServerConfig): Promise<void> {
  await initializeAgents(config);
  
  // Auto-start configured Powerhouse project AFTER agents are initialized
  try {
    await startConfiguredProject(config);
  } catch (error) {
    console.error('\n❌ Failed to auto-start project:', error);
  }
}

/**
 * Get auto-start state
 */
export function getAutoStartState(): { status: 'idle' | 'starting' | 'running' | 'failed'; error: string | null } {
  return {
    status: autoStartStatus,
    error: autoStartError
  };
}

/**
 * Shutdown all agents
 */
export async function shutdownAgents(): Promise<void> {
  if (agentsManager) {
    await agentsManager.shutdown();
    agentsManager = null;
  }
}