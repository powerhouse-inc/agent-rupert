# MCP Discovery API Planning

## Overview
Simple endpoints to discover MCP tools available through agents.

## Endpoints

### GET /mcp-tools
**Status:** 🔴 New endpoint  
**Target:** List all MCP tools across all agents

#### Tasks
- [ ] Get MCP servers from each agent's brain (if exists)
- [ ] For ReactorPackageDevAgent, list reactor_prjmgr tools
- [ ] Show which agent provides each tool

#### Response Structure
```javascript
[
  {
    tool: "mcp__reactor_prjmgr__init_project",
    agent: "reactor-dev",
    server: "reactor_prjmgr"
  },
  {
    tool: "mcp__reactor_prjmgr__list_projects",
    agent: "reactor-dev",
    server: "reactor_prjmgr"
  }
  // ... other tools
]
```

### GET /agents/:agentName/mcp-servers
**Status:** 🔴 New endpoint  
**Target:** List MCP servers for specific agent

#### Tasks
- [ ] Check if agent has brain
- [ ] Get MCP server list from brain
- [ ] Return empty array if no brain/servers

#### Response Structure
```javascript
[
  {
    name: "reactor_prjmgr",
    toolCount: 8
  }
]
```

## Implementation Notes
- Use existing brain.listMcpServers() method
- ReactorPackageDevAgent already registers reactor_prjmgr
- Keep it simple - just discovery, no execution

## Progress Tracking

| Endpoint | Status | Notes |
|----------|--------|-------|
| GET /mcp-tools | ⬜ Not Started | |
| GET /agents/:name/mcp-servers | ⬜ Not Started | |