# GraphQL Projects Sync Implementation Plan

## Overview
Implement synchronization of PowerhouseProjectsManager projects to GraphQL when a `powerhouse/agent-projects` document is added to the reactor.

## Implementation Steps

### Step 1: Update reactor-setup.ts Function Signature
- [x] Modify `initializeReactor()` to accept optional parameters
- [x] Add `PowerhouseProjectsManager` parameter
- [x] Add `AgentProjectsClient` parameter
- [x] Update return type if needed (not needed, kept same)
- [x] Add type imports for both classes
- [x] Add logging to indicate when GraphQL sync is enabled

### Step 2: Update server.ts to Pass Dependencies
- [x] Import `AgentProjectsClient` in server.ts
- [x] Create GraphQL client instance using config
- [x] Pass `projectsManager` to `initializeReactor()`
- [x] Pass GraphQL client to `initializeReactor()`
- [x] Add logging to indicate GraphQL client configuration status

### Step 3: Add Document Event Listener
- [x] Import GraphQL types in reactor-setup.ts
- [x] Add `documentAdded` event listener after existing listeners
- [x] Check if document type is `powerhouse/agent-projects`
- [x] Log when agent-projects document is detected
- [x] Add listener for both remote and local documents
- [x] Extract document type and ID from various possible structures

### Step 4: Implement Project Sync Logic
- [x] Create helper function `syncProjectsToGraphQL()`
- [x] Get all projects from `projectsManager.listProjects()`
- [x] Get running project from `projectsManager.getRunningProject()`
- [x] Iterate through each project

### Step 5: Implement GraphQL Mutations Per Project
- [x] Call `registerProject(path)` for each project
- [x] Call `updateProjectConfig()` with ports and settings
- [x] For running project:
  - [x] Call `updateProjectStatus(RUNNING)`
  - [x] Call `updateProjectRuntime()` with PID and driveUrl
- [x] Add log entry for sync completion

### Step 6: Add Error Handling
- [x] Wrap each mutation in try-catch
- [x] Log warnings for failed mutations
- [x] Continue processing other projects on failure
- [x] Return summary of sync results (success/error counts)

### Step 7: Testing
- [ ] Test with no projects
- [ ] Test with multiple stopped projects
- [ ] Test with one running project
- [ ] Test with GraphQL endpoint unavailable
- [ ] Verify mutations are sent correctly

## Mutation Sequence

```typescript
// For each project:
1. await graphqlClient.registerProject(project.path)
2. await graphqlClient.updateProjectConfig(project.name, {
     port: project.connectPort,
     autoStart: false,
     commandTimeout: 60000
   })
3. if (project is running) {
     await graphqlClient.updateProjectStatus(project.name, ProjectStatus.RUNNING)
     await graphqlClient.updateProjectRuntime(project.name, {
       pid: runningProject.process?.pid,
       startedAt: runningProject.startedAt,
       driveUrl: runningProject.driveUrl
     })
   }
4. await graphqlClient.addLogEntry(
     project.name,
     LogLevel.INFO,
     'Project synchronized to GraphQL',
     LogSource.SYSTEM
   )
```

## Files to Modify

1. **src/reactor-setup.ts**
   - Add parameters to initializeReactor()
   - Add documentAdded event listener
   - Implement sync logic

2. **src/server.ts**
   - Create GraphQL client instance
   - Pass dependencies to initializeReactor()

## Progress Notes

### Completed
- **Step 1** (Completed): Updated reactor-setup.ts function signature
  - Added optional parameters for projectsManager and graphqlClient
  - Added appropriate type imports
  - Added logging to indicate sync status
  - Function signature: `initializeReactor(projectsManager?, graphqlClient?)`

- **Step 2** (Completed): Updated server.ts to pass dependencies
  - Imported AgentProjectsClient
  - Created GraphQL client instance using config settings
  - Passed both projectsManager and graphqlClient to initializeReactor()
  - Added logging to show GraphQL endpoint configuration

- **Step 3** (Completed): Added document event listeners
  - Imported GraphQL types (ProjectStatus, LogLevel, LogSource)
  - Added documentAdded event listeners in two places:
    - Inside remote drive connection for remote documents
    - Outside for local documents
  - Checking for 'powerhouse/agent-projects' document type
  - Extracting document ID and type from various possible structures
  - Logging when agent-projects documents are detected

- **Steps 4, 5 & 6** (Completed): Implemented sync logic and error handling
  - Created `syncProjectsToGraphQL()` helper function
  - Implemented all GraphQL mutations in sequence:
    - registerProject for each project
    - updateProjectConfig with ports
    - updateProjectStatus (RUNNING or STOPPED)
    - updateProjectRuntime for running projects
    - addLogEntry for sync tracking
  - Added comprehensive error handling with try-catch
  - Continue processing other projects on individual failures
  - Track and log success/error counts

### Next Steps
- Step 7: Testing the implementation

## Success Criteria

- [x] Plan documented and ready for implementation
- [ ] All projects are synced when agent-projects document is added
- [ ] Running project status is correctly reflected
- [ ] Drive URLs are captured and synced
- [ ] Errors don't crash the reactor
- [ ] Sync completes within reasonable time (<5 seconds for 10 projects)

## Notes

- Using `registerProject` instead of `createProject` as requested
- Not handling `operationsAdded` events in this phase
- Sync is one-way: local projects → GraphQL
- Document ID can be used for future reference/updates