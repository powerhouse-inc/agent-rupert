import { ReactorPackageDevAgent } from './ReactorPackageDevAgent/ReactorPackageDevAgent.js';
import { PowerhouseArchitectAgent } from './PowerhouseArchitectAgent/PowerhouseArchitectAgent.js';
import type { AgentBase, ILogger } from './AgentBase.js';
import type { ReactorPackageDevAgentConfig, PowerhouseArchitectAgentConfig } from '../types.js';
import { BrainFactory, type BrainConfig } from './BrainFactory.js';
import type { IAgentBrain } from './IAgentBrain.js';
import type { CommonAgentInfo } from '../services/AgentsService.js';

export interface AgentsConfig {
    enableReactorPackageAgent?: boolean;
    enableArchitectAgent?: boolean;
    reactorPackageConfig?: ReactorPackageDevAgentConfig;
    architectConfig?: PowerhouseArchitectAgentConfig;
    anthropicApiKey?: string | null;
    agentManagerMcpUrl?: string;  // Optional Agent Manager MCP server URL
    serverPort?: number;  // Server port for prompt context
    logger?: ILogger;
}

/**
 * Manages and coordinates multiple agents in the system
 */
export class AgentsManager {
    private agents: Map<string, AgentBase> = new Map();
    private reactorPackageAgent?: ReactorPackageDevAgent;
    private architectAgent?: PowerhouseArchitectAgent;
    private logger: ILogger;
    
    constructor(private config: AgentsConfig) {
        this.logger = config.logger || this.createDefaultLogger();
    }
    
    private createDefaultLogger(): ILogger {
        return {
            info: (message: string) => console.log(message),
            error: (message: string, error?: any) => console.error(message, error),
            warn: (message: string) => console.warn(message),
            debug: (message: string) => console.log(message)
        };
    }
    
    /**
     * Initialize all configured agents
     */
    async initialize(): Promise<void> {
        // Initialize ReactorPackageAgent
        if (this.config.enableReactorPackageAgent && this.config.reactorPackageConfig) {
            this.logger.info("AgentsManager: Initializing ReactorPackageAgent");
            
            // Get agent-specific brain configuration
            let brain: IAgentBrain | undefined;
            const brainConfig = ReactorPackageDevAgent.getBrainConfig(this.config.anthropicApiKey || undefined);
            
            if (brainConfig) {
                try {
                    // Add agent manager MCP URL if provided
                    if (this.config.agentManagerMcpUrl) {
                        brainConfig.agentManagerMcpUrl = this.config.agentManagerMcpUrl;
                    }
                    
                    // Get template paths and build context
                    const templatePaths = ReactorPackageDevAgent.getPromptTemplatePaths();
                    const promptContext = ReactorPackageDevAgent.buildPromptContext(
                        this.config.reactorPackageConfig,
                        this.config.serverPort || 3100,
                        this.config.agentManagerMcpUrl ? ['agent-manager-drive'] : []
                    );
                    // Override anthropicApiKey flag
                    promptContext.anthropicApiKey = !!this.config.anthropicApiKey;
                    
                    // Create brain with templates and context
                    brain = await BrainFactory.create(
                        brainConfig, 
                        this.logger,
                        templatePaths,
                        promptContext
                    );
                    this.logger.info(`AgentsManager: Created ${brainConfig.type} brain for ReactorPackageAgent with system prompt`);
                } catch (error) {
                    this.logger.error("AgentsManager: Failed to create brain for ReactorPackageAgent:", error);
                }
            }
            
            this.reactorPackageAgent = new ReactorPackageDevAgent(
                this.config.reactorPackageConfig,
                this.logger,
                brain
            );
            await this.reactorPackageAgent.initialize();
            this.logger.info("AgentsManager: ReactorPackageAgent initialized successfully");
            this.agents.set('reactor-package', this.reactorPackageAgent);
        }
        
        // Initialize PowerhouseArchitectAgent
        if (this.config.enableArchitectAgent && this.config.architectConfig) {
            this.logger.info("AgentsManager: Initializing PowerhouseArchitectAgent");
            
            // Get agent-specific brain configuration
            let brain: IAgentBrain | undefined;
            const brainConfig = PowerhouseArchitectAgent.getBrainConfig(this.config.anthropicApiKey || undefined);
            
            if (brainConfig) {
                try {
                    // Add agent manager MCP URL if provided
                    if (this.config.agentManagerMcpUrl) {
                        brainConfig.agentManagerMcpUrl = this.config.agentManagerMcpUrl;
                    }
                    
                    // Get template paths and build context
                    const templatePaths = PowerhouseArchitectAgent.getPromptTemplatePaths();
                    const promptContext = PowerhouseArchitectAgent.buildPromptContext(
                        this.config.architectConfig,
                        this.config.serverPort || 3100,
                        this.config.agentManagerMcpUrl ? ['agent-manager-drive'] : []
                    );
                    // Override anthropicApiKey flag
                    promptContext.anthropicApiKey = !!this.config.anthropicApiKey;
                    
                    // Create brain with templates and context
                    brain = await BrainFactory.create(
                        brainConfig, 
                        this.logger,
                        templatePaths,
                        promptContext
                    );
                    this.logger.info(`AgentsManager: Created ${brainConfig.type} brain for PowerhouseArchitectAgent with system prompt`);
                } catch (error) {
                    this.logger.error("AgentsManager: Failed to create brain for PowerhouseArchitectAgent:", error);
                }
            }
            
            this.architectAgent = new PowerhouseArchitectAgent(
                this.config.architectConfig,
                this.logger,
                brain
            );
            await this.architectAgent.initialize();
            this.logger.info("AgentsManager: PowerhouseArchitectAgent initialized successfully");
            this.agents.set('architect', this.architectAgent);
        }
    }
    
    /**
     * Shutdown all agents
     */
    async shutdown(): Promise<void> {
        this.logger.info("AgentsManager: Beginning shutdown of all agents");
        for (const [name, agent] of this.agents) {
            try {
                this.logger.info(`AgentsManager: Shutting down agent: ${name}`);
                await agent.shutdown();
                this.logger.info(`AgentsManager: Agent ${name} shutdown complete`);
            } catch (error) {
                this.logger.error(`AgentsManager: Error shutting down agent ${name}:`, error);
            }
        }
        this.agents.clear();
        this.logger.info("AgentsManager: All agents shutdown complete");
    }
    
    /**
     * Get ReactorPackageAgent for API routes
     */
    getReactorPackageAgent(): ReactorPackageDevAgent {
        if (!this.reactorPackageAgent) {
            throw new Error('ReactorPackageAgent not initialized');
        }
        return this.reactorPackageAgent;
    }
    
    /**
     * Get PowerhouseArchitectAgent
     */
    getArchitectAgent(): PowerhouseArchitectAgent {
        if (!this.architectAgent) {
            throw new Error('PowerhouseArchitectAgent not initialized');
        }
        return this.architectAgent;
    }
    
    /**
     * Get any agent by name
     */
    getAgent(name: string): AgentBase | undefined {
        return this.agents.get(name);
    }
    
    /**
     * Check if ReactorPackageAgent is enabled
     */
    hasReactorPackageAgent(): boolean {
        return !!this.reactorPackageAgent;
    }
    
    /**
     * Check if PowerhouseArchitectAgent is enabled
     */
    hasArchitectAgent(): boolean {
        return !!this.architectAgent;
    }
    
    /**
     * Get basic information about all configured agents
     */
    getAgentsInfo(): CommonAgentInfo[] {
        const agents = [];
        
        // Check ReactorPackageAgent
        if (this.config.enableReactorPackageAgent) {
            const reactorConfig = this.config.reactorPackageConfig;
            const agentInfo: CommonAgentInfo = {
                name: 'reactor-dev',
                type: 'ReactorPackageDevAgent',
                initialized: this.reactorPackageAgent !== undefined
            };
            
            if (reactorConfig?.workDrive) {
                agentInfo.managerDrive = {
                    url: reactorConfig.workDrive.driveUrl,
                    documents: {
                        inbox: reactorConfig.workDrive.documents?.inbox,
                        wbs: reactorConfig.workDrive.documents?.wbs
                    }
                };
            }
            
            agents.push(agentInfo);
        }
        
        // Check ArchitectAgent
        if (this.config.enableArchitectAgent) {
            const architectConfig = this.config.architectConfig;
            const agentInfo: CommonAgentInfo = {
                name: 'architect',
                type: 'PowerhouseArchitectAgent',
                initialized: this.architectAgent !== undefined
            };
            
            if (architectConfig?.workDrive) {
                agentInfo.managerDrive = {
                    url: architectConfig.workDrive.driveUrl,
                    documents: {
                        inbox: architectConfig.workDrive.documents?.inbox,
                        wbs: architectConfig.workDrive.documents?.wbs
                    }
                };
            }
            
            agents.push(agentInfo);
        }
        
        return agents;
    }
}