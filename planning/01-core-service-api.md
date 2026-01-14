# Core Service API Planning

## Overview
Basic service information endpoints using existing functionality.

## Endpoints

### GET /
**Status:** 🟡 Exists but needs update  
**Current:** Returns static endpoint list  
**Target:** Add dynamic agent information  

#### Tasks
- [ ] Get agent list from AgentsManager
- [ ] Show which agents are initialized
- [ ] Keep existing endpoint list format
- [ ] Add service version from package.json

#### Response Structure
```javascript
{
  service: "powerhouse-agent-service",
  version: "<from-package.json>",
  agents: [
    { ... }
  ],
  endpoints: [/* existing list */]
}
```

## Implementation Notes
- Minimal changes to existing routers
- Reuse existing helper functions
- No new dependencies needed

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| Update / endpoint | ⬜ Not Started | |
| Update /health endpoint | ⬜ Not Started | |
| Test changes | ⬜ Not Started | |