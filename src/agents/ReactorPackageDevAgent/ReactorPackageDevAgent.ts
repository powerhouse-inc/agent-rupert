import { AgentBase, type ILogger, type BaseAgentConfig } from "../AgentBase.js";
import { ReactorPackagesManager, type RunProjectOptions } from "./ReactorPackagesManager.js";
import { CLIExecutor } from "../../tasks/executors/cli-executor.js";
import { ServiceExecutor } from "../../tasks/executors/service-executor.js";
import type { ReactorPackageDevAgentConfig } from "../../types.js";
import type { IAgentBrain } from "../IAgentBrain.js";
import { BrainType, type BrainConfig } from "../BrainFactory.js";
import type { AgentBrainPromptContext } from "../../types/prompt-context.js";
import { createReactorProjectsManagerMcpServer, getReactorMcpToolNames } from "../../tools/reactorMcpServer.js";
import { getSelfReflectionMcpToolNames } from "../../tools/selfReflectionMcpServer.js";
import { AgentClaudeBrain } from "../AgentClaudeBrain.js";
import { AgentSkillOrchestrator } from "../../prompts/AgentSkillOrchestrator.js";
import type { AgentInboxDocument } from "powerhouse-agent/document-models/agent-inbox";

/**
 * Context type for the handle-stakeholder-message skill
 */
interface HandleStakeholderMessageContext {
    stakeholder: {
        name: string;
    };
    thread: {
        id: string;
        topic: string | null;
    };
    message: {
        id: string;
        content: string;
    };
    documents: {
        driveId: string;
        inbox: {
            id: string;
        };
        wbs: {
            id: string;
        };
    };
}

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
    private skillApplication?: AgentSkillOrchestrator;
    
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
                ...getReactorMcpToolNames(),  // Include all ReactorProjectsManager tools
                ...getSelfReflectionMcpToolNames()  // Include self-reflection tools
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
     * Get the default skill names for ReactorPackageDevAgent
     */
    static getDefaultSkillNames(): string[] {
        return [
            'create-reactor-package',
            'document-modeling',
            'document-editor-implementation',
            'handle-stakeholder-message'
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
            vetraConfig: (config as ReactorPackageDevAgentConfig).vetraConfig
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
            this.serviceExecutor,
            this.getConfig().vetraConfig
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
    protected async handleInboxUpdate(documentId: string, operations: any[]): Promise<void> {
        this.logger.info(`${this.config.name}: Processing inbox update with ${operations.length} operations`);
        
        // Initialize skill application if not already done
        if (!this.skillApplication && this.brain) {
            try {
                this.skillApplication = new AgentSkillOrchestrator(
                    this.brain,
                    './build/prompts',
                    { 
                        continueOnError: false,  // Stop if any scenario fails
                        logProgress: true,       // Log progress for debugging
                        maxTurns: 100           // Allow up to 100 turns for skill execution
                    }
                );
                await this.skillApplication.initialize();
                this.logger.info(`${this.config.name}: Initialized AgentSkillApplication for inbox handling`);
            } catch (error) {
                this.logger.error(`${this.config.name}: Failed to initialize AgentSkillApplication`, error as Error);
                return;
            }
        }
        
        // Check if we have the inbox document
        const inbox = this.documents.inbox as AgentInboxDocument | null;
        if (!inbox) {
            this.logger.warn(`${this.config.name}: No inbox document available`);
            return;
        }
        
        // Get the inbox state
        const inboxState = inbox.state.global;
        
        // Find the most recent unread message from a stakeholder
        let latestUnreadMessage: {
            thread: typeof inboxState.threads[0];
            message: typeof inboxState.threads[0]['messages'][0];
            stakeholder: typeof inboxState.stakeholders[0];
        } | null = null;
        
        for (const thread of inboxState.threads) {
            // Skip archived threads
            if (thread.status === 'Archived') continue;
            
            // Find the stakeholder for this thread
            const stakeholder = inboxState.stakeholders.find(s => s.id === thread.stakeholder);
            if (!stakeholder) continue;
            
            // Look for unread incoming messages
            for (const message of thread.messages) {
                if (!message.read && message.flow === 'Incoming') {
                    if (!latestUnreadMessage || message.when > latestUnreadMessage.message.when) {
                        latestUnreadMessage = { thread, message, stakeholder };
                    }
                }
            }
        }
        
        // If we found an unread message, process it with the handle-stakeholder-message skill
        if (latestUnreadMessage && this.skillApplication) {
            this.logger.info(`${this.config.name}: Found unread message from ${latestUnreadMessage.stakeholder.name}`);
            
            // Get drive ID from config or use the first drive's ID
            const driveId = this.config.workDrive.driveUrl || 'default-drive';
            
            // Create context for the handle-stakeholder-message skill
            const context: HandleStakeholderMessageContext = {
                stakeholder: {
                    name: latestUnreadMessage.stakeholder.name
                },
                thread: {
                    id: latestUnreadMessage.thread.id,
                    topic: latestUnreadMessage.thread.topic || ''
                },
                message: {
                    id: latestUnreadMessage.message.id,
                    content: latestUnreadMessage.message.content
                },
                documents: {
                    driveId: driveId,
                    inbox: {
                        id: documentId
                    },
                    wbs: {
                        id: this.config.workDrive.documents.wbs?.documentId || ''
                    }
                }
            };
            
            try {
                // Execute all scenarios in the handle-stakeholder-message skill
                this.logger.info(`${this.config.name}: Executing handle-stakeholder-message skill`);
                const result = await this.skillApplication.executeSkill<HandleStakeholderMessageContext>(
                    'handle-stakeholder-message',
                    context
                );
                
                // Check if all scenarios completed successfully
                if (result.success && result.completedScenarios === result.totalScenarios) {
                    this.logger.info(`${this.config.name}: Successfully handled stakeholder message (${result.completedScenarios}/${result.totalScenarios} scenarios completed)`);
                    
                    // Log details of each scenario
                    for (const scenarioResult of result.scenarioResults) {
                        if (scenarioResult.completed) {
                            this.logger.debug(`  - ${scenarioResult.scenarioId}: ${scenarioResult.completedTasks}/${scenarioResult.totalTasks} tasks`);
                        } else {
                            this.logger.warn(`  - ${scenarioResult.scenarioId}: Failed - ${scenarioResult.error?.message}`);
                        }
                    }
                } else {
                    this.logger.warn(`${this.config.name}: Partially handled stakeholder message (${result.completedScenarios}/${result.totalScenarios} scenarios completed)`);
                }
            } catch (error) {
                this.logger.error(`${this.config.name}: Error executing handle-stakeholder-message skill`, error as Error);
            }
        } else if (!latestUnreadMessage) {
            this.logger.info(`${this.config.name}: No unread messages found in inbox`);
        }
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