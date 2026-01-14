# Skills API Planning

## Overview
Simple endpoints to list available skills and scenarios that have been built.

## Endpoints

### GET /skills
**Status:** 🔴 New endpoint  
**Target:** List built skills from build/prompts directory

#### Tasks
- [ ] Read build/prompts directory
- [ ] List skill names (directory names)
- [ ] Count scenarios per skill

#### Response Structure
```javascript
[
  {
    name: "document-modeling",
    scenarioCount: 2
  },
  {
    name: "create-reactor-package",
    scenarioCount: 4
  }
]
```

### GET /skills/:skillName
**Status:** 🔴 New endpoint  
**Target:** List scenarios in a skill

#### Tasks
- [ ] Read skill directory in build/prompts
- [ ] List JSON files (scenarios)
- [ ] Return 404 for unknown skills

#### Response Structure
```javascript
{
  skill: "create-reactor-package",
  scenarios: [
    {
      id: "00.verify-ready-state",
      title: "Verify system is ready for new project"
    },
    {
      id: "01.initialize-project", 
      title: "Initialize a new Reactor project"
    }
  ]
}
```

## Implementation Notes
- Read from build/prompts only (not source)
- Simple file system operations
- No execution capabilities (just discovery)

## Progress Tracking

| Endpoint | Status | Notes |
|----------|--------|-------|
| GET /skills | ⬜ Not Started | |
| GET /skills/:name | ⬜ Not Started | |