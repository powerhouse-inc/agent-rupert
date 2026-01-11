# Agents Framework Implementation Plan

## Overview
Refactor the codebase to implement a proper agents framework where:
- AgentBase provides reactor initialization and management
- ReactorPackageAgent owns ReactorPackagesManager
- PowerhouseArchitectAgent handles architect-specific tasks
- AgentsManager coordinates multiple agents
- Server initializes and manages agents through AgentsManager

## Current State Analysis

### Existing Structure
```
src/agents/
├── AgentBase.ts                              # Base class with WBS/message concepts
├── AgentsManager.ts                          # Empty - to be implemented
├── ReactorPackageAgent/
│   ├── ReactorPackageAgent.ts                # Empty subclass of AgentBase
│   └── ReactorPackagesManager.ts             # Manages Powerhouse projects
└── PowerhouseArchitectAgent/
    └── PowerhouseArchitectAgent.ts           # Empty - to be implemented
```

### Current Issues
1. Reactor initialization is in `reactor-setup.ts` separate from agents
2. Server directly manages ReactorPackagesManager instead of using agents
3. No coordination between multiple agents
4. API routes directly access ReactorPackagesManager

## Implementation Plan

### Phase 1: Enhance AgentBase with Reactor Support

#### 1.1 Add Reactor Management to AgentBase
```typescript
// src/agents/AgentBase.ts
import { Reactor, ReactorBuilder } from 'document-drive';
import type { ReactorInstance } from '../types.js';

export abstract class AgentBase {
    protected reactor?: ReactorInstance;
    protected reactorConfig?: ReactorConfig;
    
    constructor(config?: AgentConfig) {
        this.reactorConfig = config?.reactor;
    }
    
    /**
     * Initialize the agent's reactor with custom configuration
     * Each agent can override to customize document models, storage, etc.
     */
    protected async initializeReactor(): Promise<void> {
        // Core reactor initialization logic moved from reactor-setup.ts
        const builder = new ReactorBuilder();
        
        // Add document models (can be customized by subclasses)
        const models = this.getDocumentModels();
        for (const model of models) {
            builder.use(model);
        }
        
        // Configure storage
        const storage = await this.createStorage();
        builder.setStorage(storage);
        
        // Build and store reactor
        this.reactor = await builder.build();
        
        // Connect to remote drives if configured
        if (this.reactorConfig?.remoteDriveUrl) {
            await this.connectRemoteDrives(this.reactorConfig.remoteDriveUrl);
        }
    }
    
    /**
     * Override in subclasses to provide custom document models
     */
    protected abstract getDocumentModels(): DocumentModel[];
    
    /**
     * Override in subclasses to customize storage
     */
    protected abstract createStorage(): Promise<IDriveOperationStorage>;
    
    /**
     * Initialize the agent - must be called before using the agent
     */
    public abstract initialize(): Promise<void>;
    
    /**
     * Shutdown the agent and clean up resources
     */
    public abstract shutdown(): Promise<void>;
    
    protected getReactor(): ReactorInstance {
        if (!this.reactor) {
            throw new Error('Reactor not initialized - call initialize() first');
        }
        return this.reactor;
    }
}
```

### Phase 2: Implement ReactorPackageAgent

#### 2.1 Integrate ReactorPackagesManager
```typescript
// src/agents/ReactorPackageAgent/ReactorPackageAgent.ts
import path from 'path';
import { AgentBase } from "../AgentBase.js";
import { ReactorPackagesManager } from "./ReactorPackagesManager.js";
import { CLIExecutor } from "../../tasks/executors/cli-executor.js";
import { ServiceExecutor } from "../../tasks/executors/service-executor.js";
import { documentModels } from 'powerhouse-agent';
import { driveDocumentModelModule, documentModelDocumentModelModule } from 'document-drive';
import { FilesystemStorage } from 'document-drive/storage/filesystem';

export class ReactorPackageAgent extends AgentBase {
    private packagesManager?: ReactorPackagesManager;
    private cliExecutor: CLIExecutor;
    private serviceExecutor: ServiceExecutor;
    private projectsDir: string;
    
    constructor(projectsDir: string, config?: AgentConfig) {
        super(config);
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
    
    protected getDocumentModels() {
        // ReactorPackageAgent uses powerhouse document models
        return [
            ...documentModels,
            driveDocumentModelModule,
            documentModelDocumentModelModule
        ];
    }
    
    protected async createStorage() {
        // Use filesystem storage for ReactorPackageAgent
        const storagePath = path.join(this.projectsDir, '.ph', 'file-storage');
        return new FilesystemStorage(storagePath);
    }
    
    public async initialize(): Promise<void> {
        // Initialize reactor first
        await this.initializeReactor();
        
        // Create packages manager
        this.packagesManager = new ReactorPackagesManager(
            this.projectsDir,
            this.cliExecutor,
            this.serviceExecutor
        );
    }
    
    public async shutdown(): Promise<void> {
        // Shutdown any running projects
        if (this.packagesManager) {
            const runningProject = this.packagesManager.getRunningProject();
            if (runningProject) {
                await this.packagesManager.shutdownProject();
            }
        }
        
        // Cleanup reactor
        if (this.reactor) {
            await this.reactor.destroy();
        }
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
}
```

### Phase 3: Implement PowerhouseArchitectAgent

#### 3.1 Basic Implementation
```typescript
// src/agents/PowerhouseArchitectAgent/PowerhouseArchitectAgent.ts
import { AgentBase } from "../AgentBase.js";
import { documentModels } from 'powerhouse-agent';
import { MemoryStorage } from 'document-drive';

export class PowerhouseArchitectAgent extends AgentBase {
    protected getDocumentModels() {
        // Architect might use different or additional models
        return [...documentModels];
    }
    
    protected async createStorage() {
        // Could use different storage strategy
        return new MemoryStorage();
    }
    
    public async initialize(): Promise<void> {
        await this.initializeReactor();
        // Initialize architect-specific resources
    }
    
    public async shutdown(): Promise<void> {
        // Cleanup architect resources
        if (this.reactor) {
            await this.reactor.destroy();
        }
    }
    
    // Architect-specific methods
    public async analyzeArchitecture() {
        // TODO: Implement architecture analysis
    }
    
    public async generateBlueprint() {
        // TODO: Implement blueprint generation
    }
}
```

### Phase 4: Implement AgentsManager

#### 4.1 Coordinate Multiple Agents
```typescript
// src/agents/AgentsManager.ts
import { ReactorPackageAgent } from './ReactorPackageAgent/ReactorPackageAgent.js';
import { PowerhouseArchitectAgent } from './PowerhouseArchitectAgent/PowerhouseArchitectAgent.js';
import type { AgentBase } from './AgentBase.js';

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
}
```

### Phase 5: Update Server Integration

#### 5.1 Refactor server.ts
```typescript
// src/server.ts
import { AgentsManager } from './agents/AgentsManager.js';

// Create and initialize agents manager
const agentsManager = new AgentsManager({
    enableReactorPackageAgent: true,
    enableArchitectAgent: true,
    projectsDir: config.powerhouse.projectsDir,
    reactorPackageConfig: {
        reactor: {
            remoteDriveUrl: config.remoteDriveUrl,
            storage: config.storage
        }
    },
    architectConfig: {
        // Architect-specific config
    }
});

// Initialize all agents on server start
async function start() {
    try {
        // Initialize agents (includes reactor initialization)
        await agentsManager.initialize();
        
        // Get agents for routes
        const reactorPackageAgent = agentsManager.getReactorPackageAgent();
        
        // Configure routes with agents
        app.use(createProjectsRouter(reactorPackageAgent, getAutoStartState));
        
        // Start Express server
        app.listen(PORT, () => {
            console.log(`🚀 Server listening on port ${PORT}`);
            console.log(`✅ ReactorPackageAgent: initialized`);
            console.log(`✅ PowerhouseArchitectAgent: initialized`);
        });
        
        // Auto-start project if configured
        if (config.powerhouse.autoStartProject) {
            const result = await reactorPackageAgent.runProject(
                config.powerhouse.autoStartProject
            );
            // ... handle result
        }
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    await agentsManager.shutdown();
    process.exit(0);
});
```

#### 5.2 Update API Routes
```typescript
// src/routes/projects.ts
export function createProjectsRouter(
    agent: ReactorPackageAgent,
    getAutoStartState: () => AutoStartState
): Router {
    const router = Router();
    
    // Use agent methods instead of direct ReactorPackagesManager
    router.get('/projects', async (req, res) => {
        const projects = await agent.listProjects();
        res.json(projects);
    });
    
    router.post('/projects/:name/run', async (req, res) => {
        const result = await agent.runProject(req.params.name);
        res.json(result);
    });
    
    // ... other routes
    
    return router;
}
```

### Phase 6: Clean Up

#### 6.1 Remove/Refactor Files
- Delete `src/reactor-setup.ts` (logic moved to AgentBase)
- Update imports throughout codebase
- Update tests to use agents instead of direct ReactorPackagesManager

## Migration Steps

1. **Step 1: Implement AgentBase reactor support** (non-breaking)
   - Add reactor initialization methods
   - Add abstract methods for customization

2. **Step 2: Implement ReactorPackageAgent** (non-breaking)
   - Integrate ReactorPackagesManager
   - Expose necessary methods for API

3. **Step 3: Implement AgentsManager** (non-breaking)
   - Coordinate agent initialization
   - Provide access methods

4. **Step 4: Update server.ts** (breaking)
   - Use AgentsManager instead of direct initialization
   - Update route initialization

5. **Step 5: Update API routes** (breaking)
   - Use ReactorPackageAgent methods
   - Remove direct ReactorPackagesManager usage

6. **Step 6: Clean up** (cleanup)
   - Remove reactor-setup.ts
   - Update tests
   - Update documentation

## Benefits

1. **Clean Architecture**
   - Each agent manages its own reactor and resources
   - Clear separation of concerns
   - Centralized agent management

2. **Extensibility**
   - Easy to add new agent types
   - Each agent can have custom configuration
   - Flexible reactor customization per agent

3. **Maintainability**
   - Single point of agent initialization
   - Consistent shutdown/cleanup
   - Better error handling

4. **Testability**
   - Agents can be tested independently
   - Mock agents for testing
   - Clear initialization flow

## Testing Strategy

1. **Unit Tests**
   - Test each agent independently
   - Mock reactor for fast tests
   - Test AgentsManager coordination

2. **Integration Tests**
   - Test full initialization flow
   - Test agent interactions
   - Test API routes with agents

## Definition of Done

- [ ] AgentBase has reactor management
- [ ] ReactorPackageAgent integrates ReactorPackagesManager
- [ ] PowerhouseArchitectAgent implemented (basic)
- [ ] AgentsManager coordinates all agents
- [ ] Server uses AgentsManager
- [ ] API routes use agents
- [ ] reactor-setup.ts removed
- [ ] All tests updated and passing
- [ ] TypeScript compilation successful
- [ ] Documentation updated