import { AgentsManager } from '../agents/AgentsManager.js';
import type { ServerConfig } from '../types.js';
import type { ILogger } from '../agents/AgentBase/AgentBase.js';
import { driveUrlToMcpUrl } from '../utils/url-utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get package.json version
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));

// Document info for agents
export interface AgentDocumentInfo {
    documentType: string;
    documentId: string | null;
}

// Base interface for all agents
export interface CommonAgentInfo {
    name: string;
    type: string;
    initialized: boolean;
    error?: string;
    skills?: string[];  // List of skill names this agent has access to
    mcpEndpoints?: Array<{ 
        name: string; 
        type: string;
        url?: string;  // URL for HTTP-type endpoints
    }>;  // List of MCP endpoints registered with the agent
    managerDrive?: {
        url: string | null;
        documents: {
            inbox?: AgentDocumentInfo;
            wbs?: AgentDocumentInfo;
        };
    };
}

// Specific agent implementations
export interface ReactorPackageDevAgentInfo extends CommonAgentInfo {
    type: 'ReactorPackageDevAgent';
    projectsDirectory?: string;
    runningProject?: {
        name: string;
        ready: boolean;
        ports: {
            connect: number;
            switchboard: number;
        };
        endpoints: {
            vetraConnect: string;
            switchboard: string;
            mcp: string;
        };
        driveUrl: string | null;
    };
}

export interface PowerhouseArchitectAgentInfo extends CommonAgentInfo {
    type: 'PowerhouseArchitectAgent';
    // Add architect-specific properties when implemented
}

// Union type for all agent types
export type AgentInfo = ReactorPackageDevAgentInfo | PowerhouseArchitectAgentInfo;

export interface ServiceInfo {
    service: string;
    version: string;
    startTime: Date;
}

/**
 * Centralized service for managing agents and server functionality
 */
export class AgentsService {
    private agentsManager: AgentsManager | null = null;
    private startTime: Date;
    private logger: ILogger;
    private autoStartProject: string | null = null;

    constructor() {
        this.startTime = new Date();
        this.logger = this.createDefaultLogger();
    }

    private createDefaultLogger(): ILogger {
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
     * Initialize the service with configuration and start agents
     */
    async initialize(config: ServerConfig): Promise<void> {
        try {
            this.logger.info('🔧 Initializing agents...');
            
            // Create and configure agents manager
            const reactorPackageDev = config.agents.reactorPackageDev;
            const powerhouseArchitect = config.agents.powerhouseArchitect;
            
            // Transform drive URL to MCP URL
            const agentManagerDriveUrl = reactorPackageDev.workDrive.driveUrl || undefined;
            const agentManagerMcpUrl = driveUrlToMcpUrl(agentManagerDriveUrl);
            
            if (agentManagerMcpUrl) {
                this.logger.info(`🔗 Agent Manager MCP server: ${agentManagerMcpUrl}`);
            }
            
            this.agentsManager = new AgentsManager({
                enableReactorPackageAgent: true,
                enableArchitectAgent: false,
                reactorPackageConfig: reactorPackageDev,
                architectConfig: powerhouseArchitect,
                anthropicApiKey: config.anthropicApiKey,
                agentManagerMcpUrl,
                serverPort: config.serverPort,
                logger: this.logger
            });
            
            // Initialize the agents
            await this.agentsManager.initialize();
            
            // Auto-start project if configured
            if (reactorPackageDev.reactorPackages?.defaultProjectName) {
                this.autoStartProject = reactorPackageDev.reactorPackages.defaultProjectName;
                if (reactorPackageDev.reactorPackages?.autoStartDefaultProject) {
                    await this.startDefaultProject();
                } else {
                    this.logger.info(`📦 No Powerhouse project configured for auto-start`);
                }
            }
            
            this.logger.info('✅ Agents initialized successfully');
        } catch (error) {
            this.logger.error('❌ Failed to initialize agents:', error);
            throw error;
        }
    }

    /**
     * Start the default project if configured
     */
    private async startDefaultProject(): Promise<void> {
        if (!this.agentsManager || !this.autoStartProject) {
            return;
        }

        try {
            this.logger.info(`📦 Auto-starting project: ${this.autoStartProject}`);
            
            const agent = this.agentsManager.getReactorPackageAgent();
            if (!agent) {
                this.logger.error('❌ ReactorPackageAgent not available');
                return;
            }

            const result = await agent.runProject(this.autoStartProject);

            if (result.success) {
                this.logger.info(`✅ Project ${this.autoStartProject} started successfully`);
            } else {
                this.logger.error(`❌ Failed to start project: ${result.error}`);
            }
        } catch (error) {
            this.logger.error(`❌ Error starting project ${this.autoStartProject}:`, error);
        }
    }

    /**
     * Shutdown all agents gracefully
     */
    async shutdown(): Promise<void> {
        this.logger.info('🛑 AgentsService: Starting shutdown sequence');
        
        if (this.agentsManager) {
            try {
                await this.agentsManager.shutdown();
                this.logger.info('✅ AgentsService: All agents shutdown complete');
            } catch (error) {
                this.logger.error('❌ AgentsService: Error during agent shutdown:', error);
                throw error;
            } finally {
                this.agentsManager = null;
            }
        } else {
            this.logger.info('ℹ️ AgentsService: No agents to shutdown');
        }
    }

    /**
     * Get list of all agents with common properties
     */
    getAgents(): CommonAgentInfo[] {
        if (!this.agentsManager) {
            return [];
        }
        return this.agentsManager.getAgentsInfo();
    }

    /**
     * Get specific agent by name with common properties
     */
    getAgent(name: string): CommonAgentInfo | undefined {
        const agents = this.getAgents();
        return agents.find(a => a.name === name);
    }

    /**
     * Check if the service is initialized
     */
    isInitialized(): boolean {
        return this.agentsManager !== null;
    }

    /**
     * Get full agent properties (polymorphic based on agent type)
     * Note: This is synchronous and returns cached data. For async operations,
     * use the agent directly.
     */
    getAgentProperties(name: string): AgentInfo | undefined {
        if (!this.agentsManager) {
            return undefined;
        }

        const baseInfo = this.getAgent(name);
        if (!baseInfo) {
            return undefined;
        }

        // Get type-specific properties based on agent type
        if (name === 'reactor-dev' && this.agentsManager.hasReactorPackageAgent()) {
            const agent = this.agentsManager.getReactorPackageAgent();
            const packagesManager = agent.getPackagesManager();
            const running = packagesManager?.getRunningProject();
            
            const info: ReactorPackageDevAgentInfo = {
                ...baseInfo,
                type: 'ReactorPackageDevAgent',
                projectsDirectory: packagesManager?.getProjectsDir(),
                runningProject: running ? {
                    name: running.name,
                    ready: running.isFullyStarted,
                    ports: {
                        connect: running.connectPort,
                        switchboard: running.switchboardPort
                    },
                    endpoints: {
                        vetraConnect: `http://localhost:${running.connectPort}`,
                        switchboard: `http://localhost:${running.switchboardPort}`,
                        mcp: `http://localhost:${running.switchboardPort}/mcp`
                    },
                    driveUrl: running.driveUrl || null
                } : undefined
            };
            return info;
        }

        if (name === 'architect' && this.agentsManager.hasArchitectAgent()) {
            const info: PowerhouseArchitectAgentInfo = {
                ...baseInfo,
                type: 'PowerhouseArchitectAgent'
                // Add architect-specific properties when implemented
            };
            return info;
        }

        return baseInfo as AgentInfo;
    }

    /**
     * Get service information
     */
    getServiceInfo(): ServiceInfo {
        return {
            service: 'powerhouse-agent-service',
            version: packageJson.version,
            startTime: this.startTime
        };
    }

    /**
     * Get the reactor instance if available
     */
    getReactor() {
        if (this.agentsManager?.hasReactorPackageAgent()) {
            try {
                return this.agentsManager.getReactorPackageAgent().getReactor();
            } catch {
                return null;
            }
        }
        return null;
    }

    /**
     * Get the packages manager if available
     */
    getPackagesManager() {
        if (this.agentsManager?.hasReactorPackageAgent()) {
            try {
                return this.agentsManager.getReactorPackageAgent().getPackagesManager();
            } catch {
                return null;
            }
        }
        return null;
    }

    /**
     * Get full SkillInfo structures for an agent
     */
    async getAgentSkillsAndProfile(name: string) {
        if (!this.agentsManager) {
            return null;
        }

        try {
            let agent = null;
            if (name === 'reactor-dev' && this.agentsManager.hasReactorPackageAgent()) {
                agent = this.agentsManager.getReactorPackageAgent();
            } else if (name === 'architect' && this.agentsManager.hasArchitectAgent()) {
                agent = this.agentsManager.getArchitectAgent();
            }
            
            if (!agent) {
                return null;
            }
            
            const skills = agent.getSkills();
            const profileTemplates = await agent.getProfileTemplates();
            
            return {
                skills,
                profile: profileTemplates
            };
        } catch (error) {
            this.logger.error(`Failed to get skills and profile for agent ${name}:`, error);
            return null;
        }
    }

    /**
     * Get projects list for ReactorPackageDevAgent
     */
    async getProjects() {
        const packagesManager = this.getPackagesManager();
        if (!packagesManager) {
            return [];
        }
        try {
            return await packagesManager.listProjects();
        } catch {
            return [];
        }
    }
}