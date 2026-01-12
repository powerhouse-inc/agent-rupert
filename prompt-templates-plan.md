# Prompt Templates Implementation Plan

## Overview
Create a generic, reusable template parsing system using Handlebars that can process MD templates for different purposes (agent brains, tasks, etc.) with type-safe configuration data.

## Implementation Steps

### Phase 1: Core Infrastructure

#### Step 1: Install Handlebars [✅]
```bash
pnpm add handlebars @types/handlebars
```

#### Step 2: Create generic PromptParser class [✅]
**File:** `src/utils/PromptParser.ts`
- Generic class `PromptParser<TContext>`
- Methods: `parse()` and `parseMultiple()`
- Register default Handlebars helpers
- Read templates relative to project root

#### Step 3: Define AgentBrainPromptContext interface [✅]
**File:** `src/types/prompt-context.ts`
- Server configuration fields
- Agent configuration fields
- Runtime state fields
- Type definitions for different agent types

### Phase 2: Brain Integration

#### Step 4: Update IAgentBrain interface [✅]
**File:** `src/agents/IAgentBrain.ts`
- Add `setSystemPrompt(prompt: string): void`
- Add `getSystemPrompt(): string | undefined`

#### Step 5: Implement system prompt methods in brain classes [✅]
**Files:** 
- `src/agents/AgentBrain.ts`
- `src/agents/AgentClaudeBrain.ts`
- Store and use system prompt in operations

#### Step 6: Update BrainFactory [✅]
**File:** `src/agents/BrainFactory.ts`
- Make `create()` method async
- Accept `promptTemplatePaths` and `promptContext` parameters
- Process templates and set system prompt on brain

### Phase 3: Agent Configuration

#### Step 7: Add static methods to agent classes [✅]
**Files:**
- `src/agents/ReactorPackageDevAgent/ReactorPackageDevAgent.ts`
  - `getPromptTemplatePaths(): string[]`
  - `buildPromptContext(config, serverConfig): AgentBrainPromptContext`
- `src/agents/PowerhouseArchitectAgent/PowerhouseArchitectAgent.ts`
  - Same methods for PowerhouseArchitectAgent
- `src/agents/AgentBase.ts`
  - Base implementation of both methods

#### Step 8: Update AgentsManager [✅]
**File:** `src/agents/AgentsManager.ts`
- Pass server port to agents
- Call agent static methods for templates and context
- Use async BrainFactory.create() with templates
- Add runtime MCP servers to context

### Phase 4: Templates

#### Step 9: Create initial template files [✅]
**Files:**
- `prompts/AgentBase.md` - Base template with Powerhouse fundamentals
- `prompts/ReactorPackageDevAgent.md` - Document model development expertise
- `prompts/PowerhouseArchitectAgent.md` - Document-driven architecture

### Phase 5: Testing

#### Step 10: Add tests [ ]
**Files:**
- `tests/unit/prompt-parser.test.ts` - Test PromptParser
- `tests/unit/prompt-templates.test.ts` - Test template processing
- Test context building and template compilation

## Architecture Details

### Generic PromptParser Class
```typescript
export class PromptParser<TContext> {
  parse(templatePath: string, context: TContext): Promise<string>
  parseMultiple(templatePaths: string[], context: TContext): Promise<string>
}
```

### Context Type for Agent Brains
```typescript
interface AgentBrainPromptContext {
  // Server config
  serverPort: number;
  anthropicApiKey: boolean;
  
  // Agent config
  agentName: string;
  agentType: string;
  workingDirectory?: string;
  
  // Agent-specific
  projectsDir?: string;
  defaultProjectName?: string;
  vetraConfig?: object;
  
  // Runtime state
  timestamp: string;
  mcpServers: string[];
  allowedTools?: string[];
  model?: string;
  driveUrl?: string;
  documentIds?: object;
}
```

### Integration Flow
1. Agent defines template paths via static method
2. Agent builds context from config via static method
3. AgentsManager calls BrainFactory with templates and context
4. BrainFactory uses PromptParser to process templates
5. System prompt set on brain instance
6. Brain uses system prompt in operations

## Benefits
- **Generic & Reusable**: Same parser for different prompt types
- **Type-safe**: Generic ensures correct context data
- **Maintainable**: Prompts in readable MD files
- **Flexible**: Dynamic content based on configuration
- **Extensible**: Easy to add new template types

## Future Extensions
- Task prompts: `PromptParser<TaskPromptContext>`
- Workflow prompts: `PromptParser<WorkflowPromptContext>`
- Custom Handlebars helpers per use case

## Progress Tracking

Legend:
- [ ] Not started
- [🔄] In progress
- [✅] Completed
- [❌] Blocked

Last Updated: 2024-01-13