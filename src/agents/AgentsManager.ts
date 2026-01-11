import { ReactorPackageAgent } from './ReactorPackageAgent/ReactorPackageAgent.js';
import { PowerhouseArchitectAgent } from './PowerhouseArchitectAgent/PowerhouseArchitectAgent.js';
import type { AgentBase } from './AgentBase.js';
import type { AgentConfig } from './AgentBase.js';

export interface AgentsConfig {
    enableReactorPackageAgent?: boolean;
    enableArchitectAgent?: boolean;
    projectsDir: string;
    reactorPackageConfig?: AgentConfig;
    architectConfig?: AgentConfig;
}

/**
 * Manages and coordinates multiple agents in the system
 */
export class AgentsManager {
    private agents: Map<string, AgentBase> = new Map();
    private reactorPackageAgent?: ReactorPackageAgent;
    private architectAgent?: PowerhouseArchitectAgent;
    
    constructor(private config: AgentsConfig) {}
    
    /**
     * Initialize all configured agents
     */
    async initialize(): Promise<void> {
        // Initialize ReactorPackageAgent
        if (this.config.enableReactorPackageAgent) {
            this.reactorPackageAgent = new ReactorPackageAgent(
                this.config.projectsDir,
                this.config.reactorPackageConfig
            );
            await this.reactorPackageAgent.initialize();
            this.agents.set('reactor-package', this.reactorPackageAgent);
        }
        
        // Initialize PowerhouseArchitectAgent
        if (this.config.enableArchitectAgent) {
            this.architectAgent = new PowerhouseArchitectAgent(
                this.config.architectConfig
            );
            await this.architectAgent.initialize();
            this.agents.set('architect', this.architectAgent);
        }
    }
    
    /**
     * Shutdown all agents
     */
    async shutdown(): Promise<void> {
        for (const [name, agent] of this.agents) {
            try {
                await agent.shutdown();
            } catch (error) {
                console.error(`Error shutting down agent ${name}:`, error);
            }
        }
        this.agents.clear();
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