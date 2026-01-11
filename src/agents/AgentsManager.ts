import { ReactorPackageAgent } from './ReactorPackageAgent/ReactorPackageAgent.js';
import { PowerhouseArchitectAgent } from './PowerhouseArchitectAgent/PowerhouseArchitectAgent.js';
import type { AgentBase, ILogger } from './AgentBase.js';
import type { AgentConfig } from './AgentBase.js';

export interface AgentsConfig {
    enableReactorPackageAgent?: boolean;
    enableArchitectAgent?: boolean;
    projectsDir: string;
    reactorPackageConfig?: AgentConfig;
    architectConfig?: AgentConfig;
    logger?: ILogger;
}

/**
 * Manages and coordinates multiple agents in the system
 */
export class AgentsManager {
    private agents: Map<string, AgentBase> = new Map();
    private reactorPackageAgent?: ReactorPackageAgent;
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
        if (this.config.enableReactorPackageAgent) {
            this.logger.info("AgentsManager: Initializing ReactorPackageAgent");
            this.reactorPackageAgent = new ReactorPackageAgent(
                this.config.projectsDir,
                this.logger,
                this.config.reactorPackageConfig
            );
            await this.reactorPackageAgent.initialize();
            this.logger.info("AgentsManager: ReactorPackageAgent initialized successfully");
            this.agents.set('reactor-package', this.reactorPackageAgent);
        }
        
        // Initialize PowerhouseArchitectAgent
        if (this.config.enableArchitectAgent) {
            this.logger.info("AgentsManager: Initializing PowerhouseArchitectAgent");
            this.architectAgent = new PowerhouseArchitectAgent(
                this.logger,
                this.config.architectConfig
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
    getReactorPackageAgent(): ReactorPackageAgent {
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
}