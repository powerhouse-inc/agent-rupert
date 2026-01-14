# Phase 1: Generic AgentBase Refactor

## Overview
Refactor the AgentBase class to use a generic type for brain implementation (removing the TConfig generic), enabling type-safe brain access and laying the foundation for specialized agent classes. Each agent will maintain its own config type internally rather than as a generic parameter.

## Status: ✅ Complete

## Tasks

### 1. Update AgentBase Class Signature
- [x] Change class signature to `AgentBase<TBrain extends IAgentBrain = IAgentBrain>`
- [x] Remove `TConfig extends BaseAgentConfig` generic parameter
- [x] Keep `protected config: BaseAgentConfig` (subclasses can cast as needed)
- [x] Update `protected brain?: IAgentBrain` to `protected brain?: TBrain`
- [x] Update all brain references to use generic type
- [x] Test that existing code still compiles

**Files to modify:**
- `src/agents/AgentBase.ts`

### 2. Add Abstract Brain Creation Method
- [x] Add abstract method: `protected abstract createBrain(config: BrainConfig): TBrain | null`
- [x] Update `initializeBrain()` to call `createBrain()`
- [x] Remove static `getBrainConfig()` in favor of instance method (marked as deprecated)

**Files to modify:**
- `src/agents/AgentBase.ts`

### 3. Create ClaudeAgentBase Class
- [x] Create new file: `src/agents/ClaudeAgentBase.ts`
- [x] Extend `AgentBase<AgentClaudeBrain>` (no TConfig generic)
- [x] Subclasses will handle their own config types internally
- [x] Implement `createBrain()` to return `AgentClaudeBrain`
- [x] Add protected helper methods:
  - `registerTool(tool: ClaudeAgentTool): void`
  - `unregisterTool(name: string): void`
  - `getRegisteredTools(): ClaudeAgentTool[]`

**Files to create:**
- `src/agents/ClaudeAgentBase.ts`

### 4. Add Tool Registration Lifecycle
- [x] Add `protected registerTools(): void` method (called after brain init)
- [x] Add `protected cleanupTools(): void` method (called before shutdown)
- [x] Integrate lifecycle methods into agent initialization flow

**Files to modify:**
- `src/agents/ClaudeAgentBase.ts`

### 5. Update Type Exports
- [x] Export new types from agent module
- [ ] Update index files to include ClaudeAgentBase (if index exists)
- [x] Ensure backward compatibility with existing imports

**Files to modify:**
- `src/agents/index.ts` (if exists)

## Testing Checklist
- [x] AgentBase still works with existing agents
- [x] Generic type constraints are enforced
- [x] ClaudeAgentBase can be instantiated
- [x] Brain type is correctly inferred in subclasses
- [x] No breaking changes to existing functionality

## Migration Notes
- This phase should be backward compatible
- Existing agents can continue extending AgentBase directly
- ClaudeAgentBase is additive, not a replacement yet
- Agents handle their own config types internally (no TConfig generic)
- Simpler generic signature reduces complexity

## Dependencies
- None (this is the foundation phase)

## Risks
- **Risk**: Breaking existing agent implementations
  - **Mitigation**: Keep default generic types, extensive testing
- **Risk**: Complex type inference issues
  - **Mitigation**: Use explicit type parameters where needed

## Success Criteria
- [x] All existing tests pass
- [x] AgentBase accepts generic brain type
- [x] ClaudeAgentBase class exists and is functional
- [x] Tool registration lifecycle is defined
- [x] No breaking changes to existing code

## Notes
### Implementation Details:
- Successfully refactored AgentBase to use `<TBrain extends IAgentBrain>` generic
- Removed TConfig generic parameter - agents now cast config internally using `getConfig()` method
- Created ClaudeAgentBase with tool registration infrastructure
- Updated all existing agents (CreativeWriter, PowerhouseArchitect, ReactorPackageDev) to work with new structure
- All agents now implement `createBrain()` method (returning null for now until Phase 5 migration)
- Tool registration lifecycle hooks added to ClaudeAgentBase (registerTools, cleanupTools)
- TypeScript compilation successful with no breaking changes

---
**Last Updated**: 2024-01-14