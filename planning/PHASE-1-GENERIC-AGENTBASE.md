# Phase 1: Generic AgentBase Refactor

## Overview
Refactor the AgentBase class to use generic types for brain implementation, enabling type-safe brain access and laying the foundation for specialized agent classes.

## Status: 🔴 Not Started

## Tasks

### 1. Update AgentBase Class Signature
- [ ] Change class signature to `AgentBase<TBrain extends IAgentBrain = IAgentBrain, TConfig extends BaseAgentConfig = BaseAgentConfig>`
- [ ] Update `protected brain?: IAgentBrain` to `protected brain?: TBrain`
- [ ] Update all brain references to use generic type
- [ ] Test that existing code still compiles

**Files to modify:**
- `src/agents/AgentBase.ts`

### 2. Add Abstract Brain Creation Method
- [ ] Add abstract method: `protected abstract createBrain(config: BrainConfig): TBrain | null`
- [ ] Update `initializeBrain()` to call `createBrain()`
- [ ] Remove static `getBrainConfig()` in favor of instance method

**Files to modify:**
- `src/agents/AgentBase.ts`

### 3. Create ClaudeAgentBase Class
- [ ] Create new file: `src/agents/ClaudeAgentBase.ts`
- [ ] Extend `AgentBase<AgentClaudeBrain, TConfig>`
- [ ] Implement `createBrain()` to return `AgentClaudeBrain`
- [ ] Add protected helper methods:
  - `registerTool(tool: ClaudeAgentTool): void`
  - `unregisterTool(name: string): void`
  - `getRegisteredTools(): ClaudeAgentTool[]`

**Files to create:**
- `src/agents/ClaudeAgentBase.ts`

### 4. Add Tool Registration Lifecycle
- [ ] Add `protected registerTools(): void` method (called after brain init)
- [ ] Add `protected cleanupTools(): void` method (called before shutdown)
- [ ] Integrate lifecycle methods into agent initialization flow

**Files to modify:**
- `src/agents/ClaudeAgentBase.ts`

### 5. Update Type Exports
- [ ] Export new types from agent module
- [ ] Update index files to include ClaudeAgentBase
- [ ] Ensure backward compatibility with existing imports

**Files to modify:**
- `src/agents/index.ts` (if exists)

## Testing Checklist
- [ ] AgentBase still works with existing agents
- [ ] Generic type constraints are enforced
- [ ] ClaudeAgentBase can be instantiated
- [ ] Brain type is correctly inferred in subclasses
- [ ] No breaking changes to existing functionality

## Migration Notes
- This phase should be backward compatible
- Existing agents can continue extending AgentBase directly
- ClaudeAgentBase is additive, not a replacement yet

## Dependencies
- None (this is the foundation phase)

## Risks
- **Risk**: Breaking existing agent implementations
  - **Mitigation**: Keep default generic types, extensive testing
- **Risk**: Complex type inference issues
  - **Mitigation**: Use explicit type parameters where needed

## Success Criteria
- [x] All existing tests pass
- [ ] AgentBase accepts generic brain type
- [ ] ClaudeAgentBase class exists and is functional
- [ ] Tool registration lifecycle is defined
- [ ] No breaking changes to existing code

## Notes
_Add implementation notes here as work progresses_

---
**Last Updated**: 2024-01-14