# Phase 2: Tool Infrastructure

## Overview
Create the foundational tool classes and interfaces that will enable agents to expose functionality as Claude SDK tools using Zod schemas for type safety.

## Status: ✅ Complete

## Prerequisites
- [x] Phase 1 completed (Generic AgentBase refactor)

## Tasks

### 1. Create Base Tool Interface
- [x] Define `ClaudeAgentTool` interface
- [x] Define `ToolResult` type
- [x] Define `ToolError` type
- [x] Add tool metadata types (category, permissions, etc.)

**File to create:**
- `src/tools/types.ts`

```typescript
interface ClaudeAgentTool {
  name: string;
  description: string;
  category: 'system' | 'project' | 'mcp' | 'custom';
  schema: z.ZodSchema;
  execute: (args: any, context: ToolContext) => Promise<ToolResult>;
}
```

### 2. Implement ClaudeAgentToolBase Class
- [x] Create abstract base class for tools
- [x] Implement schema validation
- [x] Add error handling wrapper
- [x] Add logging support
- [x] Implement tool context injection

**File to implement:**
- `src/tools/claudeAgentToolBase.ts`

```typescript
export abstract class ClaudeAgentToolBase implements ClaudeAgentTool {
  abstract name: string;
  abstract description: string;
  abstract category: string;
  abstract schema: z.ZodSchema;
  
  protected abstract executeInternal(args: any, context: ToolContext): Promise<any>;
  
  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    // Validation, error handling, logging
  }
}
```

### 3. Create Tool Factory Functions
- [x] `createTool()` - Generic tool creator
- [x] `createMcpTool()` - MCP-specific tool creator
- [x] `createProjectTool()` - Project management tool creator
- [x] Add tool validation helpers

**File to create:**
- `src/tools/factory.ts`

### 4. Implement Tool Registry
- [x] Create `ToolRegistry` class
- [x] Add tool registration/unregistration
- [x] Add tool discovery methods
- [x] Implement tool categorization
- [x] Add permission checking

**File to create:**
- `src/tools/registry.ts`

### 5. Create Tool Context System
- [x] Define `ToolContext` interface
- [x] Include agent reference
- [x] Include brain reference
- [x] Add execution metadata
- [x] Add permission context

**File to update:**
- `src/tools/types.ts`

```typescript
interface ToolContext {
  agent: AgentBase;
  brain: IAgentBrain;
  logger: ILogger;
  permissions: ToolPermissions;
  metadata: ExecutionMetadata;
}
```

### 6. Add Tool Integration to ClaudeAgentBase
- [x] Add `toolRegistry: ToolRegistry` property
- [x] Implement `registerTool()` method
- [x] Implement `unregisterTool()` method
- [ ] Create MCP server from registered tools (Phase 3)
- [ ] Pass MCP server to SDK query (Phase 3)

**Files to update:**
- `src/agents/ClaudeAgentBase.ts`

## Testing Checklist
- [x] Tool interface is properly typed
- [x] Schema validation works correctly
- [x] Tool factory creates valid tools
- [x] Registry can store and retrieve tools
- [x] Context is properly passed to tools
- [x] Error handling works as expected

## Example Tool Implementation
```typescript
class ExampleTool extends ClaudeAgentToolBase {
  name = 'example_tool';
  description = 'An example tool';
  category = 'custom';
  schema = z.object({
    input: z.string().describe('Input parameter')
  });
  
  protected async executeInternal(args: { input: string }, context: ToolContext) {
    context.logger.info(`Executing with: ${args.input}`);
    return { success: true, result: args.input.toUpperCase() };
  }
}
```

## Dependencies
- `zod` - For schema validation
- `@anthropic-ai/claude-agent-sdk` - For SDK integration

## Risks
- **Risk**: Complex type inference with Zod schemas
  - **Mitigation**: Provide type helpers and examples
- **Risk**: Tool execution performance
  - **Mitigation**: Implement caching where appropriate

## Success Criteria
- [x] Tool base class is functional
- [x] Tools can be created with type safety
- [x] Tool registry manages tools effectively
- [x] Tools integrate with ClaudeAgentBase
- [x] Example tool works end-to-end

## Notes
### Implementation Details:
- Successfully created comprehensive tool infrastructure with Zod validation
- Implemented `ClaudeAgentToolBase` with automatic validation, error handling, and metadata tracking
- Created factory functions for different tool types (simple, MCP, project, system)
- Added advanced factories for retryable and cached tools
- Implemented `ToolRegistry` with categorization, permissions, and agent filtering
- Integrated tools with `ClaudeAgentBase` using the registry pattern
- Created comprehensive test suite with 11 passing tests
- Added `zod` as a dependency for schema validation
- Tool context system provides full access to agent, brain, logger, and permissions
- Ready for Phase 3 (MCP Tool Exposure)

### Key Files Created:
- `src/tools/types.ts` - Type definitions
- `src/tools/claudeAgentToolBase.ts` - Base class implementation
- `src/tools/factory.ts` - Factory functions
- `src/tools/registry.ts` - Tool registry
- `src/tools/index.ts` - Module exports
- `tests/unit/tools/tool-infrastructure.test.ts` - Test suite

---
**Last Updated**: 2024-01-14