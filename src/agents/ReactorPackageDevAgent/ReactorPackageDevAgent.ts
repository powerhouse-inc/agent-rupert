import { AgentBase, type ILogger, type BaseAgentConfig } from "../AgentBase.js";
import { ReactorPackagesManager, type RunProjectOptions } from "./ReactorPackagesManager.js";
import { CLIExecutor } from "../../tasks/executors/cli-executor.js";
import { ServiceExecutor } from "../../tasks/executors/service-executor.js";
import type { ReactorPackageDevAgentConfig } from "../../types.js";
import type { IAgentBrain } from "../IAgentBrain.js";
import { BrainType, type BrainConfig } from "../BrainFactory.js";
import type { AgentBrainPromptContext } from "../../types/prompt-context.js";
import { createReactorProjectsManagerMcpServer, getReactorMcpToolNames } from "../../tools/reactorMcpServer.js";
import { AgentClaudeBrain } from "../AgentClaudeBrain.js";

/**
 *  The ReactorPackageAgent uses ReactorPackagesManager with a number of associated tools
 */
export class ReactorPackageDevAgent extends AgentBase<IAgentBrain> {
    protected getConfig(): ReactorPackageDevAgentConfig {
        return this.config as ReactorPackageDevAgentConfig;
    }
    
    /**
     * Create the brain for this agent
     */
    protected createBrain(config: BrainConfig): IAgentBrain | null {
        // For now, return null - will be implemented when migrating to ClaudeAgentBase
        return null;
    }
    
    private packagesManager?: ReactorPackagesManager;
    private cliExecutor: CLIExecutor;
    private serviceExecutor: ServiceExecutor;
    private projectsDir: string;
    
    /**
     * Get the brain configuration for ReactorPackageDevAgent
     * Uses Claude SDK brain for advanced capabilities
     */
    static getBrainConfig(apiKey?: string): BrainConfig | null {
        if (!apiKey) return null;
        
        return {
            type: BrainType.CLAUDE_SDK,  // Use new SDK for advanced capabilities
            apiKey,
            workingDirectory: './agent-workspace/reactor-package',
            allowedTools: [
                'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob',
                'mcp__agent-manager-drive__*',  // Allow all MCP tools from agent-manager-drive
                ...getReactorMcpToolNames()  // Include all ReactorProjectsManager tools
            ],
            fileSystemPaths: {
                allowedReadPaths: [process.cwd()],
                allowedWritePaths: ['./agent-workspace/reactor-package']
            },
            model: 'haiku',
            maxTurns: 100
        };
    }
    
    /**
     * Get the prompt template paths for ReactorPackageDevAgent
     */
    static getPromptTemplatePaths(): string[] {
        return [
            'prompts/agent-profiles/AgentBase.md',
            'prompts/agent-profiles/ReactorPackageDevAgent.md'
        ];
    }
    
    /**
     * Build the prompt context for ReactorPackageDevAgent
     */
    static buildPromptContext(
        config: BaseAgentConfig,
        serverPort: number,
        mcpServers: string[] = []
    ): AgentBrainPromptContext {
        const baseContext = AgentBase.buildPromptContext(config, serverPort, mcpServers);
        
        return {
            ...baseContext,
            agentType: 'ReactorPackageDevAgent',
            projectsDir: (config as ReactorPackageDevAgentConfig).reactorPackages.projectsDir,
            defaultProjectName: (config as ReactorPackageDevAgentConfig).reactorPackages.defaultProjectName,
            vetraConfig: (config as ReactorPackageDevAgentConfig).vetraConfig,
            capabilities: [
                'reactor-package-management',
                'project-initialization',
                'service-execution',
                'cli-command-execution'
            ]
        };
    }
    
    constructor(config: ReactorPackageDevAgentConfig, logger: ILogger, brain?: IAgentBrain) {
        super(config, logger, brain);
        this.projectsDir = (config as ReactorPackageDevAgentConfig).reactorPackages.projectsDir;
        
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
        this.logger.info(`${this.config.name}: Creating ReactorPackagesManager for ${this.projectsDir}`);
        this.packagesManager = new ReactorPackagesManager(
            this.projectsDir,
            this.cliExecutor,
            this.serviceExecutor
        );

        this.logger.info(`${this.config.name}: ReactorPackagesManager created successfully`);
        
        // Create and register MCP server if we have a Claude brain
        if (this.brain && this.brain instanceof AgentClaudeBrain) {
            this.logger.info(`${this.config.name}: Creating ReactorProjectsManager MCP server`);
            const reactorServer = createReactorProjectsManagerMcpServer(this.packagesManager, this.logger);
            (this.brain as AgentClaudeBrain).addSdkMcpServer('reactor_prjmgr', reactorServer);
            this.logger.info(`${this.config.name}: ReactorProjectsManager MCP server registered`);
        }
    }
    
    public async shutdown(): Promise<void> {
        // Shutdown any running projects
        if (this.packagesManager) {
            const runningProject = this.packagesManager.getRunningProject();
            if (runningProject) {
                this.logger.info(`${this.config.name}: Shutting down running project: ${runningProject.name}`);
                await this.packagesManager.shutdownProject();
            }
        }
    
        await super.shutdown();
    }
    
    // Expose key ReactorPackagesManager methods
    public async initProject(name: string) {
        if (!this.packagesManager) throw new Error('Agent not initialized');
        return this.packagesManager.init(name);
    }
    
    public async runProject(name: string, options?: RunProjectOptions) {
        if (!this.packagesManager) throw new Error('Agent not initialized');
        return this.packagesManager.runProject(name, options);
    }
    
    public async shutdownProject() {
        if (!this.packagesManager) throw new Error('Agent not initialized');
        return this.packagesManager.shutdownProject();
    }
    
    public getRunningProject() {
        if (!this.packagesManager) throw new Error('Agent not initialized');
        return this.packagesManager.getRunningProject();
    }
    
    public async listProjects() {
        if (!this.packagesManager) throw new Error('Agent not initialized');
        return this.packagesManager.listProjects();
    }
    
    // Additional methods for API access
    public getPackagesManager(): ReactorPackagesManager {
        if (!this.packagesManager) throw new Error('Agent not initialized');
        return this.packagesManager;
    }
    
    public getReactor() {
        return super.getReactor();
    }
    
    /**
     * Handle updates to the inbox document
     * This is where new tasks/requests from stakeholders arrive
     */
    protected async handleInboxUpdate(_documentId: string, operations: any[]): Promise<void> {
        this.logger.info(`${this.config.name}: Processing inbox update with ${operations.length} operations`);
        
        // Use brain to describe the operations if available
        if (this.brain) {
            try {
                const description = await this.brain.describeInboxOperations(operations);
                this.logger.info(`${this.config.name}: Brain analysis: ${description}`);
            } catch (error) {
                this.logger.warn(`${this.config.name}: Failed to get brain analysis of inbox operations`);
            }
        }
        
        // TODO: Process inbox operations
        // - Extract new tasks/requests
        // - Create work items in WBS
        // - Trigger task execution based on priority
    }
    
    /**
     * Handle updates to the WBS document
     * This is where work progress and status changes are tracked
     */
    protected async handleWbsUpdate(_documentId: string, operations: any[]): Promise<void> {
        this.logger.info(`${this.config.name}: Processing WBS update with ${operations.length} operations`);
        
        // Use brain to describe the operations if available
        if (this.brain) {
            try {
                const description = await this.brain.describeWbsOperations(operations);
                this.logger.info(`${this.config.name}: Brain analysis: ${description}`);
            } catch (error) {
                this.logger.warn(`${this.config.name}: Failed to get brain analysis of WBS operations`);
            }
        }
        
        // TODO: Process WBS operations
        // - Check for completed tasks
        // - Update project status
        // - Trigger next steps based on dependencies
    }
}