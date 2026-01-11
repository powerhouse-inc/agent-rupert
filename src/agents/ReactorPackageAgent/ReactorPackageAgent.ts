import { AgentBase, type AgentConfig, type ILogger } from "../AgentBase.js";
import { ReactorPackagesManager, type RunProjectOptions } from "./ReactorPackagesManager.js";
import { CLIExecutor } from "../../tasks/executors/cli-executor.js";
import { ServiceExecutor } from "../../tasks/executors/service-executor.js";

/**
 *  The ReactorPackageAgent uses ReactorPackagesManager with a number of associated tools
 */
export class ReactorPackageAgent extends AgentBase {
    private packagesManager?: ReactorPackagesManager;
    private cliExecutor: CLIExecutor;
    private serviceExecutor: ServiceExecutor;
    private projectsDir: string;
    
    constructor(projectsDir: string, logger: ILogger, config?: AgentConfig) {
        super('ReactorPackageAgent', logger, config);
        this.projectsDir = projectsDir;
        
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
        this.logger.info(`${this.name}: Creating ReactorPackagesManager for ${this.projectsDir}`);
        this.packagesManager = new ReactorPackagesManager(
            this.projectsDir,
            this.cliExecutor,
            this.serviceExecutor
        );
        this.logger.info(`${this.name}: ReactorPackagesManager created successfully`);
    }
    
    public async shutdown(): Promise<void> {
        // Shutdown any running projects
        if (this.packagesManager) {
            const runningProject = this.packagesManager.getRunningProject();
            if (runningProject) {
                this.logger.info(`${this.name}: Shutting down running project: ${runningProject.name}`);
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
}