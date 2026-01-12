# AgentClaudeBrain Implementation Plan

## Overview
This plan outlines the implementation of `AgentClaudeBrain` using the `@anthropic-ai/claude-agent-sdk` as an alternative to the existing `AgentBrain` class. The new implementation will support MCP server integration (particularly with Vetra) and provide autonomous agent capabilities.

## Implementation Steps

### Phase 1: Core Architecture Refactoring ✅

#### Step 1.1: Extract IAgentBrain Interface [✅]
**File:** `src/agents/IAgentBrain.ts`
```typescript
export interface IAgentBrain {
  /**
   * Describe WBS operations in natural language
   * Analyzes the operations and returns a human-readable description
   */
  describeWbsOperations(operations: any[]): Promise<string>;

  /**
   * Describe inbox operations in natural language
   * Analyzes the operations and returns a human-readable description
   */
  describeInboxOperations(operations: any[]): Promise<string>;
}
```

#### Step 1.2: Update Existing AgentBrain [✅]
**File:** `src/agents/AgentBrain.ts`
- Add `implements IAgentBrain` to the class declaration
- Keep existing implementation unchanged
- Remove direct Anthropic SDK exposure (getAnthropic method)

#### Step 1.3: Create BrainFactory [✅]
**File:** `src/agents/BrainFactory.ts`
```typescript
import { IAgentBrain } from './IAgentBrain';
import { AgentBrain } from './AgentBrain';
import { AgentClaudeBrain } from './AgentClaudeBrain';
import Anthropic from '@anthropic-ai/sdk';

export enum BrainType {
  STANDARD = 'standard',    // Uses @anthropic-ai/sdk
  CLAUDE_SDK = 'claude-sdk' // Uses @anthropic-ai/claude-agent-sdk
}

export interface BrainConfig {
  type: BrainType;
  apiKey: string;
  
  // Standard brain config
  model?: string;
  
  // Claude SDK brain config
  vetraMcpUrl?: string;
  workingDirectory?: string;
  allowedTools?: string[];
  fileSystemPaths?: {
    allowedReadPaths?: string[];
    allowedWritePaths?: string[];
  };
  maxTurns?: number;
}

export class BrainFactory {
  static create(config: BrainConfig): IAgentBrain {
    switch (config.type) {
      case BrainType.STANDARD:
        const anthropic = new Anthropic({ apiKey: config.apiKey });
        return new AgentBrain(anthropic);
      
      case BrainType.CLAUDE_SDK:
        return new AgentClaudeBrain({
          apiKey: config.apiKey,
          vetraMcpUrl: config.vetraMcpUrl,
          workingDirectory: config.workingDirectory || './agent-workspace',
          allowedTools: config.allowedTools,
          fileSystemPaths: config.fileSystemPaths,
          model: config.model as any,
          maxTurns: config.maxTurns
        });
      
      default:
        throw new Error(`Unknown brain type: ${config.type}`);
    }
  }
}
```

#### Step 1.4: Update AgentsManager [✅]
**File:** `src/agents/AgentsManager.ts`
- Remove single shared brain instance
- Create individual brain instances per agent using BrainFactory
- Update constructor to accept brain configuration per agent
- Pass brain instances to each agent during initialization

#### Step 1.5: Update AgentBase [✅]
**File:** `src/agents/AgentBase.ts`
- Change brain property type from `AgentBrain` to `IAgentBrain`
- Update constructor to accept `IAgentBrain` instead of `AgentBrain`

### Phase 2: AgentClaudeBrain Implementation ✅

#### Step 2.1: Install Dependencies [✅]
```bash
pnpm add @anthropic-ai/claude-agent-sdk
```

#### Step 2.2: Create AgentClaudeBrain Class [✅]
**File:** `src/agents/AgentClaudeBrain.ts`
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { HookJSONOutput, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { IAgentBrain } from './IAgentBrain';
import * as path from 'path';

export interface AgentClaudeBrainConfig {
  apiKey: string;
  vetraMcpUrl?: string;
  workingDirectory: string;
  allowedTools?: string[];
  fileSystemPaths?: {
    allowedReadPaths?: string[];
    allowedWritePaths?: string[];
  };
  model?: 'opus' | 'sonnet' | 'haiku';
  maxTurns?: number;
}

export class AgentClaudeBrain implements IAgentBrain {
  private config: AgentClaudeBrainConfig;

  constructor(config: AgentClaudeBrainConfig) {
    this.config = config;
    // Set API key for the SDK
    process.env.ANTHROPIC_API_KEY = config.apiKey;
  }

  async describeWbsOperations(operations: any[]): Promise<string> {
    // Implementation using query()
  }

  async describeInboxOperations(operations: any[]): Promise<string> {
    // Implementation using query()
  }

  private async *queryStream(prompt: string): AsyncIterable<SDKMessage> {
    // Stream implementation
  }

  private createFileSystemHooks(): any {
    // File system access control hooks
  }
}
```

#### Step 2.3: Implement MCP Server Connection [✅]
- Configure HTTP-based MCP connection for Vetra
- Handle connection errors gracefully
- Support optional MCP server (work without it if not available)

#### Step 2.4: Implement File System Hooks [✅]
- Create PreToolUse hooks for file operations
- Validate paths against allowed read/write paths
- Log file system operations for audit

#### Step 2.5: Implement Core Methods [✅]
- Implement `describeWbsOperations` using Agent SDK
- Implement `describeInboxOperations` using Agent SDK
- Handle streaming responses and extract text content

### Phase 3: Configuration & Environment ⏳

#### Step 3.1: Update Configuration Types [ ]
**File:** `src/types.ts`
- Add brain configuration types
- Update agent configs to include brain settings

#### Step 3.2: Update Environment Variables [ ]
**File:** `.env.example`
```env
# Brain Configuration
BRAIN_TYPE=claude-sdk  # or 'standard'
ANTHROPIC_API_KEY=sk-ant-...

# Claude SDK Specific
AGENT_WORKING_DIR=/path/to/agent/workspace
AGENT_ALLOWED_TOOLS=Read,Write,Edit,Grep,Glob,Bash
AGENT_MODEL=haiku
AGENT_MAX_TURNS=100

# File System Restrictions (comma-separated paths)
AGENT_ALLOWED_READ_PATHS=/home/agent,/tmp
AGENT_ALLOWED_WRITE_PATHS=/home/agent/outputs

# Vetra Integration
VETRA_MCP_SERVER_URL=http://localhost:4001/mcp
```

#### Step 3.3: Update Config Loader [ ]
**File:** `src/config.ts`
- Add brain configuration loading
- Support per-agent brain configuration
- Provide sensible defaults

### Phase 4: Integration & Testing ⏳

#### Step 4.1: Update Agent Initialization [ ]
- Modify ReactorPackageDevAgent to work with IAgentBrain
- Modify PowerhouseArchitectAgent to work with IAgentBrain
- Test both brain implementations with each agent

#### Step 4.2: Create Integration Tests [ ]
**File:** `tests/integration/brain-factory.test.ts`
- Test BrainFactory with both brain types
- Test brain switching capability
- Test MCP server connection

#### Step 4.3: Test Vetra MCP Integration [ ]
- Start Vetra with MCP server enabled
- Connect AgentClaudeBrain to Vetra's MCP endpoint
- Test document operations through MCP

#### Step 4.4: Migration Guide [ ]
**File:** `docs/brain-migration.md`
- Document how to switch between brain types
- Provide configuration examples
- List limitations and considerations

### Phase 5: Documentation & Cleanup ⏳

#### Step 5.1: Update README [ ]
- Document new brain architecture
- Add configuration examples
- Include MCP setup instructions

#### Step 5.2: Add JSDoc Comments [ ]
- Document all new interfaces and classes
- Add usage examples in comments
- Document configuration options

#### Step 5.3: Clean Up Deprecated Code [ ]
- Remove unused imports
- Update type imports throughout codebase
- Ensure all agents use IAgentBrain interface

## Configuration Examples

### Standard Brain (Backward Compatible)
```typescript
const brain = BrainFactory.create({
  type: BrainType.STANDARD,
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-haiku-20240307'
});
```

### Claude SDK Brain with Dynamic MCP Server Management
```typescript
// Create brain with optional agent manager MCP server
const brain = BrainFactory.create({
  type: BrainType.CLAUDE_SDK,
  apiKey: process.env.ANTHROPIC_API_KEY!,
  agentManagerMcpUrl: 'http://localhost:3100/mcp',  // Optional
  workingDirectory: './agent-workspace',
  allowedTools: ['Read', 'Write', 'Edit', 'Grep', 'Glob'],
  fileSystemPaths: {
    allowedReadPaths: ['/home/agent', '/tmp'],
    allowedWritePaths: ['/home/agent/outputs']
  },
  model: 'haiku',
  maxTurns: 100
});

// Dynamically add MCP servers (e.g., when Vetra starts)
if (brain instanceof AgentClaudeBrain) {
  brain.addMcpServer('vetra', {
    type: 'http',
    url: 'http://localhost:4001/mcp',
    headers: { 'Authorization': 'Bearer token' }
  });
  
  // List servers
  console.log(brain.listMcpServers()); // ['agent-manager', 'vetra']
  
  // Remove server when done
  brain.removeMcpServer('vetra');
}
```

## Key Design Decisions

1. **Interface Extraction**: `IAgentBrain` provides a contract that both implementations must follow, ensuring compatibility.

2. **Factory Pattern**: `BrainFactory` centralizes brain creation logic and makes it easy to switch between implementations.

3. **Per-Agent Brains**: Each agent gets its own brain instance, allowing different agents to use different brain types or configurations.

4. **Programmatic Configuration**: Following SDK best practices with `settingSources: []` to avoid filesystem config dependencies.

5. **MCP Server Integration**: Dynamic management of HTTP-based MCP servers. Vetra MCP integration handled by ReactorPackageDevAgent when projects start.

6. **Backward Compatibility**: Existing AgentBrain continues to work unchanged, allowing gradual migration.

## Success Criteria

- [ ] Both brain implementations work with existing agents
- [ ] Vetra MCP server connection successful
- [ ] File system restrictions enforced
- [ ] No breaking changes to existing functionality
- [ ] Configuration easily switchable via environment variables
- [ ] All tests passing

## Risk Mitigation

1. **API Key Management**: Ensure API key is properly set for SDK (via environment variable)
2. **MCP Connection Failures**: Gracefully handle when Vetra MCP server is unavailable
3. **File System Access**: Strict validation of file paths to prevent unauthorized access
4. **Token Usage**: Monitor token usage as Agent SDK may use more tokens than direct API
5. **Breaking Changes**: Maintain backward compatibility through interface abstraction

## Progress Tracking

Legend: 
- [ ] Not started
- [🔄] In progress  
- [✅] Completed
- [❌] Blocked

Last Updated: 2024-01-12

## Notes

- The Claude Agent SDK expects `ANTHROPIC_API_KEY` in environment variables
- MCP servers can be connected via HTTP, SSE, or stdio protocols
- The SDK spawns a subprocess, so proper process management is important
- File system hooks should be thoroughly tested to prevent security issues