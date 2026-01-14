# API Refactor Preparation - AgentsService Class

## Overview
Create a centralized AgentsService class that encapsulates all top-level server functionality, making it easier to expose via API endpoints.

## Current Architecture Problems
- Server logic scattered across multiple files (server.ts, AgentInitializer.ts, AgentsManager.ts)
- Global state management through module-level variables
- Tight coupling between Express routes and agent management
- Difficult to test and extend

## Proposed Architecture
```
AgentsService (new)
    ├── AgentsManager (existing, enhanced)
    ├── ServerConfig (existing)
    └── API Surface (methods for endpoints)
```

## AgentsService Class Design

### Core Responsibilities
1. **Lifecycle Management** - Start, initialize, shutdown
2. **Agent Discovery** - List agents, get status
3. **Configuration** - Manage server and agent configs
4. **State Access** - Provide controlled access to agent states

### Phase 1 Interface
```typescript
class AgentsService {
    // Lifecycle
    async initialize(config: ServerConfig): Promise<void>
    async shutdown(): Promise<void>
    
    // Agent Discovery  
    getAgents(): CommonAgentInfo[]  // Returns base properties only
    getAgent(name: string): CommonAgentInfo | undefined  // Base properties
    isInitialized(): boolean
    
    // Agent State Access (Polymorphic)
    getAgentProperties(name: string): AgentInfo | undefined  // Full type-specific properties
    
    // Service Metadata
    getServiceInfo(): ServiceInfo
}
```

### Data Structures
```typescript
// Base class for all agents
interface CommonAgentInfo {
    name: string
    type: string
    initialized: boolean
    error?: string
}

// Specific agent implementations
interface ReactorPackageDevAgentInfo extends CommonAgentInfo {
    type: 'ReactorPackageDevAgent'
    projectsDirectory?: string
    runningProject?: string
    projectCount?: number
}

interface PowerhouseArchitectAgentInfo extends CommonAgentInfo {
    type: 'PowerhouseArchitectAgent'
    // Add architect-specific properties when implemented
}

// Union type for all agent types
type AgentInfo = ReactorPackageDevAgentInfo | PowerhouseArchitectAgentInfo

interface ServiceInfo {
    name: string
    version: string
    startTime: Date
}
```

## Implementation Plan

### Step 1: Create AgentsService Class
**File:** `src/services/AgentsService.ts`

**Tasks:**
- [ ] Create class with ServerConfig dependency
- [ ] Move AgentsManager instantiation inside
- [ ] Implement initialize() method
- [ ] Implement shutdown() method
- [ ] Add error handling and logging

### Step 2: Refactor AgentInitializer
**File:** `src/agents/AgentInitializer.ts`

**Tasks:**
- [ ] Remove global agentsManager variable
- [ ] Convert initialization logic to be used by AgentsService
- [ ] Remove auto-start logic (move to AgentsService)
- [ ] Clean up exports

### Step 3: Update AgentsManager
**File:** `src/agents/AgentsManager.ts`

**Tasks:**
- [ ] Update getAgentsInfo() to return CommonAgentInfo[]
- [ ] Add getAgentByName() method returning CommonAgentInfo
- [ ] Add getAgentProperties() method returning type-specific AgentInfo
- [ ] Implement polymorphic logic for ReactorPackageDevAgentInfo
- [ ] Implement polymorphic logic for PowerhouseArchitectAgentInfo

### Step 4: Update Server.ts
**File:** `src/server.ts`

**Tasks:**
- [ ] Create single AgentsService instance
- [ ] Replace AgentInitializer calls with AgentsService
- [ ] Update helper functions to use AgentsService
- [ ] Simplify route initialization

### Step 5: Update Routes
**Files:** `src/routes/*.ts`

**Tasks:**
- [ ] Update info router to use AgentsService.getServiceInfo()
- [ ] Update routes to access agents via AgentsService
- [ ] Remove direct dependencies on AgentInitializer
- [ ] Add new /agents routes for agent discovery

## Benefits
- **Single source of truth** - All agent operations go through AgentsService
- **Testability** - Can mock/stub AgentsService for testing
- **API-ready** - Methods map directly to endpoints
- **Extensibility** - Easy to add new agent types
- **Maintainability** - Clear separation of concerns

## Example Usage
```typescript
// In server.ts
const agentsService = new AgentsService();
await agentsService.initialize(config);

// In route handler - returns CommonAgentInfo[]
app.get('/agents', (req, res) => {
    res.json(agentsService.getAgents());
});

// Returns CommonAgentInfo (base properties)
app.get('/agents/:name', (req, res) => {
    const agent = agentsService.getAgent(req.params.name);
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
});

// Returns full AgentInfo (type-specific properties)
app.get('/agents/:name/properties', (req, res) => {
    const properties = agentsService.getAgentProperties(req.params.name);
    if (!properties) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(properties);
});

// Service info
app.get('/', (req, res) => {
    res.json(agentsService.getServiceInfo());
});

// In shutdown handler
process.on('SIGTERM', async () => {
    await agentsService.shutdown();
    process.exit(0);
});
```

## Testing Strategy
- Unit tests for AgentsService methods
- Mock AgentsManager for isolation
- Integration tests with real agents
- API endpoint tests

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| Design AgentsService interface | ✅ Complete | |
| Create AgentsService class | ⬜ Not Started | |
| Refactor AgentInitializer | ⬜ Not Started | |
| Update AgentsManager | ⬜ Not Started | |
| Update server.ts | ⬜ Not Started | |
| Update routes | ⬜ Not Started | |
| Write unit tests | ⬜ Not Started | |
| Write integration tests | ⬜ Not Started | |

## Next Steps
1. Review and approve this plan
2. Create AgentsService.ts with basic structure
3. Implement initialize() and shutdown() methods
4. Add agent discovery methods
5. Test with existing server.ts