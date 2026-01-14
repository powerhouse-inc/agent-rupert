# Phase 4: Agent Migration

## Overview
Migrate existing agents (CreativeWriterAgent, PowerhouseArchitectAgent, ReactorPackageDevAgent) to extend the new ClaudeAgentBase class and utilize the tool infrastructure.

## Status: 🔴 Not Started

## Prerequisites
- [x] Phase 1 completed (Generic AgentBase refactor)
- [x] Phase 2 completed (Tool Infrastructure)
- [ ] Phase 3 completed (ReactorPackagesManager MCP Exposure)

## Tasks

### 1. Migrate CreativeWriterAgent
- [ ] Change to extend `ClaudeAgentBase`
- [ ] Cast config internally as `CreativeWriterConfig`
- [ ] Remove static `getBrainConfig()` method
- [ ] Implement `createBrain()` method
- [ ] Override `registerTools()` if needed
- [ ] Update prompt template handling
- [ ] Test creative writing functionality

**File to update:**
- `src/agents/CreativeWriterAgent/CreativeWriterAgent.ts`

```typescript
export class CreativeWriterAgent extends ClaudeAgentBase {
  protected getConfig(): CreativeWriterConfig {
    return this.config as CreativeWriterConfig;
  }
  
  protected createBrain(config: BrainConfig): AgentClaudeBrain {
    return new AgentClaudeBrain({
      apiKey: config.apiKey,
      workingDirectory: './agent-workspace/creative-writer',
      model: 'haiku'
    });
  }
  
  protected registerTools(): void {
    super.registerTools(); // Get base tools
    // Add any creative-writing specific tools
  }
}
```

### 2. Migrate PowerhouseArchitectAgent
- [ ] Change to extend `ClaudeAgentBase`
- [ ] Cast config internally as `PowerhouseArchitectConfig`
- [ ] Remove static `getBrainConfig()` method
- [ ] Implement `createBrain()` method
- [ ] Override `registerTools()` if needed
- [ ] Maintain document management capabilities
- [ ] Test architect functionality

**File to update:**
- `src/agents/PowerhouseArchitectAgent/PowerhouseArchitectAgent.ts`

```typescript
export class PowerhouseArchitectAgent extends ClaudeAgentBase {
  protected getConfig(): PowerhouseArchitectConfig {
    return this.config as PowerhouseArchitectConfig;
  }
  
  protected createBrain(config: BrainConfig): AgentClaudeBrain {
    return new AgentClaudeBrain({
      apiKey: config.apiKey,
      workingDirectory: './agent-workspace/powerhouse-architect',
      model: 'sonnet' // More capable model for architecture
    });
  }
}
```

### 3. Migrate ReactorPackageDevAgent
- [ ] Change to extend `ClaudeAgentBase`
- [ ] Cast config internally as `ReactorPackageDevAgentConfig`
- [ ] Remove static `getBrainConfig()` method
- [ ] Implement `createBrain()` method
- [ ] Override `registerTools()` to add Reactor tools
- [ ] Ensure ReactorPackagesManager integration
- [ ] Test project management functionality

**File to update:**
- `src/agents/ReactorPackageDevAgent/ReactorPackageDevAgent.ts`

```typescript
export class ReactorPackageDevAgent extends ClaudeAgentBase {
  private packagesManager: ReactorPackagesManager;
  
  protected getConfig(): ReactorPackageDevAgentConfig {
    return this.config as ReactorPackageDevAgentConfig;
  }
  
  protected createBrain(config: BrainConfig): AgentClaudeBrain {
    return new AgentClaudeBrain({
      apiKey: config.apiKey,
      workingDirectory: './agent-workspace/reactor-package',
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
      model: 'haiku'
    });
  }
  
  protected registerTools(): void {
    super.registerTools(); // MCP tools
    
    // Register Reactor-specific tools
    this.registerTool(new InitProjectTool());
    this.registerTool(new RunProjectTool());
    // ... all other Reactor tools
  }
  
  public getPackagesManager(): ReactorPackagesManager {
    return this.packagesManager;
  }
}
```

### 4. Update AgentsManager
- [ ] Update agent instantiation logic
- [ ] Ensure brain creation works
- [ ] Update type checking
- [ ] Maintain backward compatibility
- [ ] Test multi-agent coordination

**File to update:**
- `src/agents/AgentsManager.ts`

### 5. Update BrainFactory
- [ ] Remove agent-specific brain creation
- [ ] Simplify factory pattern
- [ ] Update brain type handling
- [ ] Clean up unused code

**File to update:**
- `src/agents/BrainFactory.ts`

### 6. Update Agent Tests
- [ ] Update unit tests for each agent
- [ ] Test tool registration
- [ ] Test brain creation
- [ ] Verify MCP integration
- [ ] Check Reactor tools work

**Files to update:**
- `tests/unit/brain-factory.test.ts`
- `tests/unit/agent-claude-brain.test.ts`
- Integration test files

### 7. Update Documentation
- [ ] Update agent creation guide
- [ ] Document tool registration process
- [ ] Add migration guide for custom agents
- [ ] Update API documentation

## Testing Checklist
- [ ] CreativeWriterAgent functions correctly
- [ ] PowerhouseArchitectAgent manages documents
- [ ] ReactorPackageDevAgent manages projects
- [ ] All agents can register tools
- [ ] MCP servers work with all agents
- [ ] Backward compatibility maintained
- [ ] Tests pass for all agents

## Migration Strategy
1. **Phase A**: Create ClaudeAgentBase alongside existing agents
2. **Phase B**: Migrate one agent at a time
3. **Phase C**: Update tests incrementally
4. **Phase D**: Remove deprecated code
5. **Phase E**: Update documentation

## Breaking Changes
- Static `getBrainConfig()` removed from agents
- Agents must implement `createBrain()`
- Tool registration happens in `registerTools()`
- Brain configuration moved to instance methods

## Rollback Plan
- Keep original agent files backed up
- Use feature flags for gradual rollout
- Maintain compatibility layer temporarily
- Document rollback procedures

## Dependencies
- Phase 1: Generic AgentBase refactor
- Phase 2: Tool infrastructure
- Phase 3: ReactorPackagesManager MCP exposure
- Existing agent functionality preserved
- Test coverage maintained

## Risks
- **Risk**: Breaking existing agent functionality
  - **Mitigation**: Comprehensive testing, gradual migration
- **Risk**: Performance degradation
  - **Mitigation**: Profile before and after migration
- **Risk**: Complex debugging with new architecture
  - **Mitigation**: Enhanced logging and debugging tools

## Success Criteria
- [ ] All agents successfully migrated
- [ ] No functionality lost
- [ ] Tools accessible from all agents
- [ ] Tests passing at 100%
- [ ] Documentation updated
- [ ] Performance maintained or improved

## Post-Migration Cleanup
- [ ] Remove deprecated static methods
- [ ] Clean up unused brain factory code
- [ ] Remove old type definitions
- [ ] Archive migration documentation
- [ ] Update example code

## Notes
_Add implementation notes here as work progresses_

---
**Last Updated**: 2025-01-14