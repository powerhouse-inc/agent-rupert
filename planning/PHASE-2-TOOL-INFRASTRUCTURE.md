# Phase 2: Tool Infrastructure

## Overview
Create the foundational tool classes and interfaces that will enable agents to expose functionality as Claude SDK tools using Zod schemas for type safety.

## Status: 🔴 Not Started

## Prerequisites
- [ ] Phase 1 completed (Generic AgentBase refactor)

## Tasks

### 1. Create Base Tool Interface
- [ ] Define `ClaudeAgentTool` interface
- [ ] Define `ToolResult` type
- [ ] Define `ToolError` type
- [ ] Add tool metadata types (category, permissions, etc.)

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
- [ ] Create abstract base class for tools
- [ ] Implement schema validation
- [ ] Add error handling wrapper
- [ ] Add logging support
- [ ] Implement tool context injection

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
- [ ] `createTool()` - Generic tool creator
- [ ] `createMcpTool()` - MCP-specific tool creator
- [ ] `createProjectTool()` - Project management tool creator
- [ ] Add tool validation helpers

**File to create:**
- `src/tools/factory.ts`

### 4. Implement Tool Registry
- [ ] Create `ToolRegistry` class
- [ ] Add tool registration/unregistration
- [ ] Add tool discovery methods
- [ ] Implement tool categorization
- [ ] Add permission checking

**File to create:**
- `src/tools/registry.ts`

### 5. Create Tool Context System
- [ ] Define `ToolContext` interface
- [ ] Include agent reference
- [ ] Include brain reference
- [ ] Add execution metadata
- [ ] Add permission context

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
- [ ] Add `toolRegistry: ToolRegistry` property
- [ ] Implement `registerTool()` method
- [ ] Implement `unregisterTool()` method
- [ ] Create MCP server from registered tools
- [ ] Pass MCP server to SDK query

**Files to update:**
- `src/agents/ClaudeAgentBase.ts`

## Testing Checklist
- [ ] Tool interface is properly typed
- [ ] Schema validation works correctly
- [ ] Tool factory creates valid tools
- [ ] Registry can store and retrieve tools
- [ ] Context is properly passed to tools
- [ ] Error handling works as expected

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
- [ ] Tool base class is functional
- [ ] Tools can be created with type safety
- [ ] Tool registry manages tools effectively
- [ ] Tools integrate with ClaudeAgentBase
- [ ] Example tool works end-to-end

## Notes
_Add implementation notes here as work progresses_

---
**Last Updated**: 2024-01-14