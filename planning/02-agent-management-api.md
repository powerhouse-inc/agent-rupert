# Agent Management API Planning

## Overview
Simple read-only endpoints to inspect agent state using existing functionality.

## Endpoints

### GET /agents
**Status:** 🔴 New endpoint  
**Target:** List configured agents and their basic status

#### Tasks
- [ ] Create new agents router
- [ ] Get agent info from AgentsManager
- [ ] Show name, type, and initialized status only

#### Response Structure
```javascript
[
  {
    name: "reactor-dev",
    type: "ReactorPackageDevAgent",
    initialized: true
  }
]
```

### GET /agents/:agentName
**Status:** 🔴 New endpoint  
**Target:** Basic agent information

#### Tasks
- [ ] Return 404 for unknown agents
- [ ] For ReactorPackageDevAgent, include projects info
- [ ] Keep response simple and flat

#### Response Structure (ReactorPackageDevAgent)
```javascript
{
  name: "reactor-dev",
  type: "ReactorPackageDevAgent",
  initialized: true
}
```

### GET /agents/:agentName/properties
**Status:** 🔴 New endpoint  
**Target:** Agent-specific data (polymorphic)

#### Tasks
- [ ] For ReactorPackageDevAgent: return projects and reactor info
- [ ] Use existing getPackagesManager() and getReactor() methods
- [ ] Return empty object for uninitialized agents

#### Response Structure (ReactorPackageDevAgent)
```javascript
{
  type: "reactor-package-dev",
  projects: [/* from packagesManager.listProjects() */],
  runningProject: /* from packagesManager.getRunningProject() */,
  projectsDirectory: /* from packagesManager.getProjectsDir() */
}
```

### GET /agents/:agentName/properties/projects
**Status:** 🔴 New endpoint  
**Target:** Direct access to projects list (ReactorPackageDevAgent only)

#### Tasks
- [ ] Return 404 for non-reactor agents
- [ ] Call packagesManager.listProjects()
- [ ] Return array directly

### GET /agents/:agentName/properties/reactor
**Status:** 🔴 New endpoint  
**Target:** Reactor state (ReactorPackageDevAgent only, when running)

#### Tasks
- [ ] Return 404 if no project running
- [ ] Use existing reactor getters
- [ ] Include models and drives

## Implementation Notes
- Use existing AgentsManager and agent methods
- No new agent methods needed
- Simple property access, no complex navigation
- Return 404 for invalid paths rather than errors

## Progress Tracking

| Endpoint | Status | Notes |
|----------|--------|-------|
| GET /agents | ⬜ Not Started | |
| GET /agents/:name | ⬜ Not Started | |
| GET /agents/:name/properties | ⬜ Not Started | |
| GET /agents/:name/properties/projects | ⬜ Not Started | |
| GET /agents/:name/properties/reactor | ⬜ Not Started | |