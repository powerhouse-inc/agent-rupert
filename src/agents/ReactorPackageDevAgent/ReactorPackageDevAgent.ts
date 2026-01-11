import { AgentBase, type ILogger } from "../AgentBase.js";
import { ReactorPackagesManager, type RunProjectOptions } from "./ReactorPackagesManager.js";
import { CLIExecutor } from "../../tasks/executors/cli-executor.js";
import { ServiceExecutor } from "../../tasks/executors/service-executor.js";
import type { ReactorPackageDevAgentConfig } from "../../types.js";

/**
 *  The ReactorPackageAgent uses ReactorPackagesManager with a number of associated tools
 */
export class ReactorPackageDevAgent extends AgentBase<ReactorPackageDevAgentConfig> {
    private packagesManager?: ReactorPackagesManager;
    private cliExecutor: CLIExecutor;
    private serviceExecutor: ServiceExecutor;
    private projectsDir: string;
    
    constructor(config: ReactorPackageDevAgentConfig, logger: ILogger) {
        super(config, logger);
        this.projectsDir = config.reactorPackages.projectsDir;
        
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
    protected handleInboxUpdate(_documentId: string, operations: any[]): void {
        this.logger.info(`${this.config.name}: Processing inbox update with ${operations.length} operations`);
        // TODO: Process inbox operations
        // - Extract new tasks/requests
        // - Create work items in WBS
        // - Trigger task execution based on priority
    }
    
    /**
     * Handle updates to the WBS document
     * This is where work progress and status changes are tracked
     */
    protected handleWbsUpdate(_documentId: string, operations: any[]): void {
        this.logger.info(`${this.config.name}: Processing WBS update with ${operations.length} operations`);
        // TODO: Process WBS operations
        // - Check for completed tasks
        // - Update project status
        // - Trigger next steps based on dependencies
    }
}