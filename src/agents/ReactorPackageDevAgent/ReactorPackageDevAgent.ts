import { AgentBase, type ILogger, type BaseAgentConfig } from "../AgentBase/AgentBase.js";
import { ReactorPackagesManager, type RunProjectOptions } from "./ReactorPackagesManager.js";
import { FusionProjectsManager, type RunFusionProjectOptions } from "./FusionProjectsManager.js";
import { CLIExecutor } from "../../tasks/executors/cli-executor.js";
import { ServiceExecutor } from "../../tasks/executors/service-executor.js";
import type { ReactorPackageDevAgentConfig } from "../../types.js";
import type { IAgentBrain } from "../IAgentBrain.js";
import { BrainType, type BrainConfig } from "../BrainFactory.js";
import type { AgentBrainPromptContext } from "../../types/prompt-context.js";
import { createReactorProjectsManagerMcpServer, getReactorMcpToolNames } from "../../tools/reactorMcpServer.js";
import { createFusionProjectsManagerMcpServer, getFusionMcpToolNames } from "../../tools/fusionMcpServer.js";
import { getSelfReflectionMcpToolNames } from "../../tools/selfReflectionMcpServer.js";
import { AgentClaudeBrain } from "../AgentClaudeBrain.js";

/**
 *  The ReactorPackageAgent uses ReactorPackagesManager with a number of associated tools
 */
export class ReactorPackageDevAgent extends AgentBase<IAgentBrain> {
    protected getConfig(): ReactorPackageDevAgentConfig {
        return this.config as ReactorPackageDevAgentConfig;
    }
    
    private reactorPackagesManager?: ReactorPackagesManager;
    private fusionManager?: FusionProjectsManager;
    private cliExecutor: CLIExecutor;
    private serviceExecutor: ServiceExecutor;
    private reactorPackagesDir: string;
    private fusionProjectsDir: string;
    
    /**
     * Get the brain configuration for ReactorPackageDevAgent
     * Uses Claude SDK brain for advanced capabilities
     */
    static getBrainConfig(apiKey?: string): BrainConfig | null {
        if (!apiKey) return null;
        
        return {
            type: BrainType.CLAUDE_SDK,  // Use new SDK for advanced capabilities
            apiKey,
            workingDirectory: '../projects',
            allowedTools: [
                'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob',
                'mcp__agent-manager-drive__*',  // Allow all MCP tools from agent-manager-drive
                'mcp__active-project-vetra__*',
                ...getReactorMcpToolNames(),  // Include all ReactorProjectsManager tools
                ...getFusionMcpToolNames(),   // Include all FusionProjectsManager tools
                ...getSelfReflectionMcpToolNames()  // Include self-reflection tools
            ],
            fileSystemPaths: {
                allowedReadPaths: [process.cwd(), '../projects'],
                allowedWritePaths: ['../projects']
            },
            model: 'haiku',
            maxTurns: 50
        };
    }
    
    /**
     * Get the prompt template paths for ReactorPackageDevAgent
     */
    static getSystemPromptTemplatePaths(): string[] {
        return [
            'prompts/agent-profiles/AgentBase.md',
            'prompts/agent-profiles/ReactorPackageDevAgent.md'
        ];
    }
    
    /**
     * Get the default skill names for ReactorPackageDevAgent
     */
    static getDefaultSkillNames(): string[] {
        return [
            'reactor-package-project-management',
            'document-modeling',
            'document-editor-creation',
            'fusion-project-management',
            'fusion-development',
            'handle-stakeholder-message'
        ];
    }
    
    /**
     * Build the prompt context for ReactorPackageDevAgent
     */
    static buildSystemPromptContext(
        config: BaseAgentConfig,
        serverPort: number,
        mcpServers: string[] = []
    ): AgentBrainPromptContext {
        const baseContext = AgentBase.buildSystemPromptContext(config, serverPort, mcpServers);
        
        return {
            ...baseContext,
            agentType: 'ReactorPackageDevAgent',
            projectsDir: (config as ReactorPackageDevAgentConfig).reactorPackages.projectsDir,
            defaultProjectName: (config as ReactorPackageDevAgentConfig).reactorPackages.defaultProjectName,
            vetraConfig: (config as ReactorPackageDevAgentConfig).vetraConfig
        };
    }
    
    constructor(config: ReactorPackageDevAgentConfig, logger: ILogger, brain?: IAgentBrain) {
        super(config, logger, brain);
        this.reactorPackagesDir = (config as ReactorPackageDevAgentConfig).reactorPackages.projectsDir;
        this.fusionProjectsDir = '../projects/fusion'; // Default fusion projects directory
        
        // Initialize executors
        this.cliExecutor = new CLIExecutor({
            timeout: 60000,
            retryAttempts: 1
        });
        
        this.serviceExecutor = new ServiceExecutor({
            maxLogSize: 500,
            defaultGracefulShutdownTimeout: 10000
        });
    }
    
    public async initialize(): Promise<void> {
        // Initialize reactor first
        await super.initialize();
        
        // Create packages manager
        this.logger.info(`${this.config.name}: Creating ReactorPackagesManager for ${this.reactorPackagesDir}`);
        this.reactorPackagesManager = new ReactorPackagesManager(
            this.reactorPackagesDir,
            this.cliExecutor,
            this.serviceExecutor,
            this.getConfig().vetraConfig
        );

        this.logger.info(`${this.config.name}: ReactorPackagesManager created successfully`);
        
        // Create fusion manager
        this.logger.info(`${this.config.name}: Creating FusionProjectsManager for ${this.fusionProjectsDir}`);
        this.fusionManager = new FusionProjectsManager(
            this.fusionProjectsDir,
            this.cliExecutor,
            this.serviceExecutor
        );
        
        this.logger.info(`${this.config.name}: FusionProjectsManager created successfully`);
        
        // Create and register MCP servers if we have a Claude brain
        if (this.brain && this.brain instanceof AgentClaudeBrain) {
            // Register ReactorProjectsManager MCP server
            this.logger.info(`${this.config.name}: Creating ReactorProjectsManager MCP server`);
            const reactorServerConfig = createReactorProjectsManagerMcpServer(this.reactorPackagesManager, this, this.logger);
            (this.brain as AgentClaudeBrain).addMcpServer('reactor-prjmgr', reactorServerConfig);
            this.logger.info(`${this.config.name}: ReactorProjectsManager MCP server registered`);
            
            // Register FusionProjectsManager MCP server
            this.logger.info(`${this.config.name}: Creating FusionProjectsManager MCP server`);
            const fusionServerConfig = createFusionProjectsManagerMcpServer(this.fusionManager, this.logger);
            (this.brain as AgentClaudeBrain).addMcpServer('fusion-prjmgr', fusionServerConfig);
            this.logger.info(`${this.config.name}: FusionProjectsManager MCP server registered`);
        }
    }
    
    public async shutdown(): Promise<void> {
        // Shutdown any running Fusion projects
        if (this.fusionManager) {
            const runningFusionProject = this.fusionManager.getRunningProject();
            if (runningFusionProject) {
                this.logger.info(`${this.config.name}: Shutting down running Fusion project: ${runningFusionProject.name}`);
                await this.fusionManager.shutdownProject();
            }
        }
        
        // Shutdown any running Reactor projects
        if (this.reactorPackagesManager) {
            const runningReactorPackage = this.reactorPackagesManager.getRunningProject();
            if (runningReactorPackage) {
                this.logger.info(`${this.config.name}: Shutting down running Reactor project: ${runningReactorPackage.name}`);
                await this.reactorPackagesManager.shutdownProject();
            }
        }
    
        await super.shutdown();
    }
    
    // Additional methods for API access
    public getPackagesManager(): ReactorPackagesManager {
        if (!this.reactorPackagesManager) throw new Error('Agent not initialized');
        return this.reactorPackagesManager;
    }
    
    public getReactor() {
        return super.getReactor();
    }

    public setWorkDir(path: string) {
        if (this.brain instanceof AgentClaudeBrain) {
            this.brain.setWorkDir(path);
        }
    }
}