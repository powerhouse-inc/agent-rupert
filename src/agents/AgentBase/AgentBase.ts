
import { IDocumentDriveServer, InMemoryCache, MemoryStorage, ReactorBuilder, driveDocumentModelModule } from 'document-drive';
import type { IDriveOperationStorage } from 'document-drive/storage/types';
import type { BaseAgentConfig } from '../../types.js';
import { documentModels } from 'powerhouse-agent';
import { documentModelDocumentModelModule } from 'document-model';
import { FilesystemStorage } from 'document-drive/storage/filesystem';
import type { IAgentBrain } from '../IAgentBrain.js';
import type { BrainConfig } from '../BrainFactory.js';
import type { AgentBrainPromptContext } from '../../types/prompt-context.js';
import type { SkillInfo, ScenarioInfo } from '../../prompts/types.js';
import { PromptDriver, type SkillExecutionResult, type ScenarioExecutionResult, type TaskResponse } from '../../prompts/PromptDriver.js';
import { SequentialSkillFlow } from '../../prompts/flows/SequentialSkillFlow.js';
import type { ISkillFlow } from '../../prompts/flows/ISkillFlow.js';
import type { IScenarioFlow } from '../../prompts/flows/IScenarioFlow.js';
import { SequentialScenarioFlow } from '../../prompts/flows/SequentialScenarioFlow.js';
import { AgentClaudeBrain } from '../AgentClaudeBrain.js';
import { createSelfReflectionMcpServer } from '../../tools/selfReflectionMcpServer.js';
import { PromptParser } from '../../utils/PromptParser.js';
import type { TemplateWithVars } from '../../prompts/types.js';
import { AgentRoutine } from './AgentRoutine.js';

// Logger interface for dependency injection
export interface ILogger {
    info(message: string): void;
    error(message: string, error?: any): void;
    warn(message: string): void;
    debug(message: string): void;
}

// Re-export BaseAgentConfig type for convenience
export type { BaseAgentConfig } from '../../types.js';

export class AgentBase<TBrain extends IAgentBrain = IAgentBrain> {
    protected reactor?: IDocumentDriveServer;
    protected config: BaseAgentConfig;
    protected logger: ILogger;
    protected brain?: TBrain;
    protected defaultPromptDriver?: PromptDriver;
    protected routine?: AgentRoutine;
    protected documentIds: {
        inbox: string | null;
        wbs: string | null;
    } = {
        inbox: null,
        wbs: null,
    };
    
    /**
     * Get the brain configuration for this agent type
     * @param _apiKey Optional Anthropic API key
     * @returns BrainConfig or null if no brain is needed
     */
    static getBrainConfig(_apiKey?: string): BrainConfig | null {
        // Default implementation returns null (no brain)
        // Subclasses should override this to provide their specific configuration
        return null;
    }
    
    /**
     * Get the prompt template paths for this agent type
     * @returns Array of template file paths or empty array if no templates
     */
    static getSystemPromptTemplatePaths(): string[] {
        // Default implementation returns base template only
        return ['prompts/agent-profiles/AgentBase.md'];
    }
    
    /**
     * Get the default skill names for this agent type
     * @returns Array of default skill names this agent should have access to
     */
    static getDefaultSkillNames(): string[] {
        // Default implementation returns empty array (no skills)
        return [];
    }
    
    /**
     * Build the prompt context for this agent
     * @param config Agent configuration
     * @param serverPort Server port number
     * @param mcpServers List of MCP server names
     * @returns Prompt context data
     */
    static buildSystemPromptContext(
        config: BaseAgentConfig,
        serverPort: number,
        mcpServers: string[] = []
    ): AgentBrainPromptContext {
        // Base implementation builds minimal context
        return {
            serverPort,
            anthropicApiKey: false, // Will be set by subclass or manager
            agentName: config.name,
            agentType: 'ReactorPackageDevAgent', // Will be overridden by subclasses
            timestamp: new Date().toISOString(),
            mcpServers,
            model: 'haiku',
            driveUrl: config.workDrive?.driveUrl || undefined,
            documentIds: {
                inbox: config.workDrive?.documents?.inbox?.documentId || undefined,
                wbs: config.workDrive?.documents?.wbs?.documentId || undefined
            },
            storageType: config.workDrive?.reactorStorage?.type
        };
    }
    
    constructor(config: BaseAgentConfig, logger: ILogger, brain?: TBrain) {
        this.config = config;
        this.logger = logger;
        this.brain = brain;
        
        // Set logger on brain if provided
        if (brain) {
            brain.setLogger(logger);
        }
        
        this.logger.info(`${config.name}: Initialized${brain ? ' with brain' : ''}`);
    }
    
    /**
     * Initialize the agent's reactor with custom configuration
     * Each agent can override to customize document models, storage, etc.
     */
    private async initializeReactor(): Promise<void> {
        this.logger.info(`${this.config.name}: Starting reactor initialization`);
        
        // Core reactor initialization logic moved from reactor-setup.ts
        // Get document models (can be customized by subclasses)
        const models = this.getDocumentModels();
        this.logger.debug(`${this.config.name}: Loaded ${models.length} document models`);
        
        // Create ReactorBuilder with document models
        const builder = new ReactorBuilder(models as any)
            .withCache(await this.createCache())
            .withStorage(await this.createStorage());
        
        // Build reactor
        const driveServer = builder.build();
        await driveServer.initialize();
        this.logger.info(`${this.config.name}: Reactor built and initialized`);
        
        // Store reactor instance
        this.reactor = driveServer;
        
        // Connect to remote drives if configured
        if (this.config.workDrive.driveUrl) {
            await this.connectRemoteDrive(this.config.workDrive.driveUrl);
        }
        
        // Set up minimal document event listeners for initial document retrieval
        this.setupInitialDocumentListeners();
    }
    
    /**
     * Set up minimal event listeners to capture initial document IDs before AgentRoutine is created
     */
    private setupInitialDocumentListeners(): void {
        if (!this.reactor) return;
        
        const { inbox, wbs } = this.config.workDrive.documents;
        
        // Set document IDs from config
        if (inbox?.documentId) {
            this.documentIds.inbox = inbox.documentId;
        }
        if (wbs?.documentId) {
            this.documentIds.wbs = wbs.documentId;
        }
        
        // Try to initialize routine if we have both IDs
        this.tryInitializeRoutine();
    }
    
    /**
     * Connect to a remote drive
     */
    private async connectRemoteDrive(remoteDriveUrl: string): Promise<void> {
        if (!this.reactor) {
            throw new Error('Reactor not initialized');
        }
        
        // Temporarily suppress console errors from the document-drive library
        const originalConsoleError = console.error;
        const originalProcessStderr = process.stderr.write;
        
        try {
            this.logger.info(`${this.config.name}: Connecting to remote drive: ${remoteDriveUrl}`);
            
            // Suppress error logging during addRemoteDrive
            console.error = () => {};
            process.stderr.write = () => true;
            
            await this.reactor.addRemoteDrive(remoteDriveUrl, {
                sharingType: "public",
                availableOffline: true,
                listeners: [
                    {
                        block: true,
                        callInfo: {
                            data: remoteDriveUrl,
                            name: "switchboard-push",
                            transmitterType: "SwitchboardPush",
                        },
                        filter: {
                            branch: ["main"],
                            documentId: ["*"],
                            documentType: ["*"],
                            scope: ["global"],
                        },
                        label: "Switchboard Sync",
                        listenerId: crypto.randomUUID(),
                        system: true,
                    },
                ],
                triggers: [],
            });
            this.logger.info(`${this.config.name}: ✅ Successfully connected to remote drive`);
        } catch (error) {
            // Extract meaningful error message
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const isConnectionRefused = errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection refused');
            const isDriveNotFound = errorMessage.includes("Couldn't find drive info");
            
            if (isConnectionRefused) {
                this.logger.warn(`${this.config.name}: 💡 Remote drive service not available - continuing in local mode`);
            } else if (isDriveNotFound) {
                this.logger.warn(`${this.config.name}: 💡 Remote drive not found - continuing in local mode`);
            } else {
                this.logger.warn(`${this.config.name}: 💡 Unable to connect to remote drive - continuing in local mode`);
            }
            // Don't throw - allow agent to continue without remote drive
        } finally {
            // Restore console logging
            console.error = originalConsoleError;
            process.stderr.write = originalProcessStderr;
        }
    }
    
    protected getDocumentModels(): any[] {
            // ReactorPackageAgent uses powerhouse document models
            return [
                ...documentModels,
                driveDocumentModelModule,
                documentModelDocumentModelModule
            ];
    }
    
    /**
     * Override in subclasses to provide custom cache (optional)
     * Defaults to InMemoryCache
     */
    protected async createCache(): Promise<any> {
        return new InMemoryCache();
    }
    
    /**
     * Override in subclasses to customize storage
     */
    protected async createStorage(): Promise<IDriveOperationStorage> {
        const storage = this.config.workDrive.reactorStorage;
        if (storage?.type === 'filesystem' && storage.filesystemPath) {
            this.logger.info(`${this.config.name}: Using filesystem storage at ${storage.filesystemPath}`);
            return new FilesystemStorage(storage.filesystemPath);
        } else {
            this.logger.info(`${this.config.name}: Using in-memory storage`);
            return new MemoryStorage();
        }
    }
    
    /**
     * Initialize the agent - must be called before using the agent
     */
    public async initialize(): Promise<void> {
        this.logger.info(`${this.config.name}: Beginning initialization`);
        await this.initializeReactor();
        
        // Initialize PromptDriver if brain is available
        if (this.brain) {
            this.defaultPromptDriver = new PromptDriver(this.brain, './build/prompts', this.logger);
            await this.defaultPromptDriver.initialize();
            
            const skillNames = (this.constructor as typeof AgentBase).getDefaultSkillNames();
            this.logger.info(`${this.config.name}: PromptDriver initialized with skills: ${skillNames.join(', ')}`);
        }
        
        // Register self-reflection MCP server if brain supports it
        if (this.brain && this.brain instanceof AgentClaudeBrain) {
            const serverConfig = createSelfReflectionMcpServer(this, this.logger);
            (this.brain as AgentClaudeBrain).addMcpServer('self_reflection', serverConfig);
            this.logger.info(`${this.config.name}: Self-reflection MCP server registered`);
        }
        
        this.logger.info(`${this.config.name}: Initialization complete`);
        
        // Try to initialize routine if we have document IDs
        await this.tryInitializeRoutine();
    }
    
    /**
     * Try to initialize AgentRoutine if we have both document IDs
     */
    private async tryInitializeRoutine(): Promise<void> {
        // Skip if already initialized or missing IDs
        if (this.routine || !this.documentIds.inbox || !this.documentIds.wbs) {
            if (!this.routine && (!this.documentIds.inbox || !this.documentIds.wbs)) {
                this.logger.info(`${this.config.name}: AgentRoutine not initialized - missing document IDs`);
            }
            return;
        }
        
        try {
            this.routine = new AgentRoutine(
                this,
                this.documentIds.inbox,
                this.documentIds.wbs,
                this.logger
            );
            
            await this.routine.initialize();
            this.logger.info(`${this.config.name}: AgentRoutine initialized`);
            this.routine.start();

        } catch (error) {
            this.logger.error(`${this.config.name}: Failed to initialize AgentRoutine`, error);
            this.routine = undefined;
        }
    }
    
    /**
     * Shutdown the agent and clean up resources
     */
    public async shutdown(): Promise<void> {
        this.logger.info(`${this.config.name}: Shutting down`);
        return Promise.resolve();
    }
    

    public getName(): string {
        return this.config.name;
    }
    
    /**
     * Execute a complete skill with all its scenarios
     * @param skillName The name of the skill to execute
     * @param context Optional context to pass to the skill templates
     * @param options Execution options
     * @returns Skill execution result with all scenario results
     */
    public async executeSkill<TContext = any>(
        skillName: string,
        context?: TContext,
        options?: {
            maxTurns?: number;
            sessionId?: string;
            sendSkillPreamble?: boolean;
        }
    ): Promise<SkillExecutionResult> {
        if (!this.defaultPromptDriver) {
            throw new Error('PromptDriver not initialized - agent needs a brain to execute skills');
        }
        
        // Get scenarios for the skill with context
        const scenarios = this.defaultPromptDriver.getRepository().getScenariosBySkill(skillName, context || {} as TContext);
        
        // Create a sequential skill flow
        const flow = new SequentialSkillFlow(skillName, scenarios);
        
        // Execute the skill using PromptDriver
        return this.defaultPromptDriver.executeSkillFlow(
            skillName,
            flow,
            context || {} as TContext,
            options
        );
    }

    /**
     * Execute a skill with a custom flow
     * @param skillName The name of the skill to execute
     * @param flow Custom skill flow implementation
     * @param context Context to pass to the templates
     * @param options Execution options
     * @returns Skill execution result
     */
    public async executeSkillWithFlow<TContext = any>(
        skillName: string,
        flow: ISkillFlow,
        context?: TContext,
        options?: {
            maxTurns?: number;
            sessionId?: string;
            sendSkillPreamble?: boolean;
        }
    ): Promise<SkillExecutionResult> {
        if (!this.defaultPromptDriver) {
            throw new Error('PromptDriver not initialized - agent needs a brain to execute skills');
        }
        
        return this.defaultPromptDriver.executeSkillFlow(
            skillName,
            flow,
            context || {} as TContext,
            options
        );
    }
    
    /**
     * Execute a specific scenario within a skill
     * @param skillName The name of the skill containing the scenario
     * @param scenarioId The ID of the scenario to execute
     * @param context Optional context to pass to the scenario templates
     * @param options Execution options
     * @returns Scenario execution result with all task responses
     */
    public async executeScenario<TContext = any>(
        skillName: string,
        scenarioId: string,
        context?: TContext,
        options?: {
            maxTurns?: number;
            sessionId?: string;
        }
    ): Promise<ScenarioExecutionResult> {
        if (!this.defaultPromptDriver) {
            throw new Error('PromptDriver not initialized - agent needs a brain to execute scenarios');
        }
        
        // Build the scenario key
        const scenarioKey = `${skillName}/${scenarioId}`;
        
        // Get the scenario from repository
        const scenario = this.defaultPromptDriver.getRepository().getScenarioByKey(scenarioKey, context || {} as TContext);
        if (!scenario) {
            throw new Error(`Scenario not found: ${scenarioKey}`);
        }
        
        // Create a sequential scenario flow
        const flow = new SequentialScenarioFlow(scenario);
        
        // Execute the scenario using PromptDriver
        return this.defaultPromptDriver.executeScenarioFlow<TContext>(
            scenarioKey,
            flow,
            context || {} as TContext,
            options
        );
    }

    /**
     * Execute a scenario with a custom flow
     * @param skillName The name of the skill containing the scenario
     * @param scenarioId The ID of the scenario to execute
     * @param flow Custom scenario flow implementation
     * @param context Context to pass to the templates
     * @param options Execution options
     * @returns Scenario execution result
     */
    public async executeScenarioWithFlow<TContext = any>(
        skillName: string,
        scenarioId: string,
        flow: IScenarioFlow,
        context?: TContext,
        options?: {
            maxTurns?: number;
            sessionId?: string;
        }
    ): Promise<ScenarioExecutionResult> {
        if (!this.defaultPromptDriver) {
            throw new Error('PromptDriver not initialized - agent needs a brain to execute scenarios');
        }
        
        const scenarioKey = `${skillName}/${scenarioId}`;
        
        return this.defaultPromptDriver.executeScenarioFlow<TContext>(
            scenarioKey,
            flow,
            context || {} as TContext,
            options
        );
    }
    
    /**
     * Execute a specific task within a scenario
     * @param skillName The name of the skill containing the scenario
     * @param scenarioId The ID of the scenario containing the task
     * @param taskId The ID of the task to execute
     * @param context Optional context to pass to the task template
     * @param options Execution options
     * @returns Task response with the result
     */
    public async executeTask<TContext = any>(
        skillName: string,
        scenarioId: string,
        taskId: string,
        context?: TContext,
        options?: {
            maxTurns?: number;
            sessionId?: string;
            captureSession?: boolean;
        }
    ): Promise<TaskResponse> {
        if (!this.defaultPromptDriver) {
            throw new Error('PromptDriver not initialized - agent needs a brain to execute tasks');
        }
        
        // Build the scenario key
        const scenarioKey = this.defaultPromptDriver.getRepository().generateScenarioKey(skillName, scenarioId);
        
        // Get the scenario from repository
        const scenario = this.defaultPromptDriver.getRepository().getScenarioByKey(scenarioKey, context || {});
        if (!scenario) {
            throw new Error(`Scenario not found: ${scenarioKey}`);
        }
        
        // Find the specific task
        const task = scenario.tasks.find(t => t.id === taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId} in scenario ${scenarioKey}`);
        }
        
        // Execute the single task using PromptDriver's message sending
        return this.defaultPromptDriver.executeTask(
            task,
            {
                maxTurns: options?.maxTurns || this.defaultPromptDriver.getMaxTurns(),
                sessionId: options?.sessionId || undefined,
                captureSession: options?.captureSession || undefined,
            }
        );
    }
    
    /**
     * Get the brain instance
     */
    public getBrain(): TBrain | undefined {
        return this.brain;
    }
    
    /**
     * Get the prompt driver instance
     */
    public getPromptDriver(): PromptDriver | undefined {
        return this.defaultPromptDriver;
    }
    
    /**
     * Get the reactor instance
     */
    public getReactor(): IDocumentDriveServer | undefined {
        return this.reactor;
    }
    
    //
    public getReactorDriveUrl(): string | null {
        return this.config.workDrive.driveUrl;
    }

    /**
     * Get the agent configuration
     */
    protected getConfig(): BaseAgentConfig {
        return this.config;
    }
    
    /**
     * Get the skills available to this agent instance
     */
    public getSkills(): SkillInfo[] {
        if (!this.defaultPromptDriver) {
            return [];
        }
        
        // Get all skills from the repository
        const repository = this.defaultPromptDriver.getRepository();
        const skillNames = (this.constructor as typeof AgentBase).getDefaultSkillNames();
        
        const skills: SkillInfo[] = [];
        for (const skillName of skillNames) {
            const skillInfo = repository.getSkillInformation(skillName);
            if (skillInfo) {
                skills.push(skillInfo);
            }
        }
        
        return skills;
    }
    
    /**
     * Get detailed information about a specific skill
     */
    public getSkillDetails(skillName: string): SkillInfo | null {
        if (!this.defaultPromptDriver) {
            return null;
        }
        return this.defaultPromptDriver.getRepository().getSkillInformation(skillName) || null;
    }
    
    /**
     * Get detailed information about a specific scenario
     */
    public getScenarioDetails(skillName: string, scenarioId: string): ScenarioInfo | null {
        const skill = this.getSkillDetails(skillName);
        if (!skill) return null;
        return skill.scenarios.find(s => s.id === scenarioId) || null;
    }
    
    /**
     * Search for scenarios by keyword
     */
    public searchScenarios(query: string, skillName?: string): Array<{skill: string, scenario: ScenarioInfo, matchContext: string}> {
        const results: Array<{skill: string, scenario: ScenarioInfo, matchContext: string}> = [];
        const skillsToSearch = skillName 
            ? this.getSkills().filter(s => s.name === skillName)
            : this.getSkills();
        
        for (const skill of skillsToSearch) {
            for (const scenario of skill.scenarios) {
                // Search in title, preamble, and tasks
                const searchText = JSON.stringify(scenario).toLowerCase();
                if (searchText.includes(query.toLowerCase())) {
                    // Extract match context (surrounding text)
                    const index = searchText.indexOf(query.toLowerCase());
                    const start = Math.max(0, index - 50);
                    const end = Math.min(searchText.length, index + query.length + 50);
                    const matchContext = searchText.substring(start, end);
                    
                    results.push({
                        skill: skill.name,
                        scenario,
                        matchContext
                    });
                }
            }
        }
        return results;
    }
    
    /**
     * Get the complete inbox document state as JSON
     * Note: This method will retrieve the document state from the reactor
     */
    public async getInboxState(): Promise<any> {
        const reactor = this.getReactor();
        if (!reactor) return null;
        
        const inboxId = this.documentIds.inbox;
        if (!inboxId) return null;
        
        try {
            const doc = await reactor.getDocument(inboxId);
            return doc?.state || null;
        } catch (error) {
            this.logger.error(`${this.config.name}: Failed to get inbox state`, error);
            return null;
        }
    }
    
    /**
     * Get the complete WBS document state as JSON  
     * Note: This method will retrieve the document state from the reactor
     */
    public async getWbsState(): Promise<any> {
        const reactor = this.getReactor();
        if (!reactor) return null;
        
        const wbsId = this.documentIds.wbs;
        if (!wbsId) return null;
        
        try {
            const doc = await reactor.getDocument(wbsId);
            return doc?.state || null;
        } catch (error) {
            this.logger.error(`${this.config.name}: Failed to get WBS state`, error);
            return null;
        }
    }
    
    /**
     * Get profile templates with extracted variables
     */
    public async getProfileTemplates(): Promise<(TemplateWithVars | undefined)[]> {
        const templatePaths = (this.constructor as typeof AgentBase).getSystemPromptTemplatePaths();
        const parser = new PromptParser<AgentBrainPromptContext>();
        return await parser.getMultipleTemplatesWithVars(templatePaths);
    }
    
    /**
     * List all registered MCP endpoints
     */
    public listMcpEndpoints(): { name: string; type: string; url?: string }[] {
        if (!this.brain || !(this.brain instanceof AgentClaudeBrain)) {
            return [];
        }
        
        const brain = this.brain as AgentClaudeBrain;
        const serverNames = brain.listMcpServers();
        
        return serverNames.map(name => {
            const server = brain.getMcpServer(name);
            const endpoint: { name: string; type: string; url?: string } = {
                name,
                type: server?.type || 'unknown'
            };
            
            // Include URL for HTTP-type endpoints
            if (server?.type === 'http' && server?.url) {
                endpoint.url = server.url;
            }
            
            return endpoint;
        });
    }
    
    /**
     * Add a new SDK MCP endpoint
     */
    public addMcpEndpoint(name: string, url: string): boolean {
        if (!this.brain || !(this.brain instanceof AgentClaudeBrain)) {
            this.logger.warn(`${this.config.name}: Cannot add MCP endpoint - no Claude brain available`);
            return false;
        }
        
        try {
            const brain = this.brain as AgentClaudeBrain;
            brain.addMcpServer(name, { type: 'http', url });
            this.logger.info(`${this.config.name}: Added MCP endpoint '${name}'`);
            return true;
        } catch (error) {
            this.logger.error(`${this.config.name}: Failed to add MCP endpoint '${name}'`, error);
            return false;
        }
    }
    
    /**
     * Remove an MCP endpoint
     * Note: This requires enhancing AgentClaudeBrain with a removeMcpServer method
     */
    public removeMcpEndpoint(_name: string): boolean {
        if (!this.brain || !(this.brain instanceof AgentClaudeBrain)) {
            this.logger.warn(`${this.config.name}: Cannot remove MCP endpoint - no Claude brain available`);
            return false;
        }
        
        // For now, we can't remove servers as AgentClaudeBrain doesn't have this method
        // This would need to be implemented in AgentClaudeBrain
        this.logger.warn(`${this.config.name}: MCP endpoint removal not yet implemented`);
        return false;
    }
    
}