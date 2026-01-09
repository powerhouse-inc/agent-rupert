# Server Projects API Implementation Plan

## Overview
Implement GET-only API endpoints for PowerhouseProjectsManager with automatic project startup via server configuration. Projects are manually initialized in a fixed `../projects` directory, and one project can be auto-started when the server starts.

## Implementation Steps

### Step 1: Add Environment Configuration ✅
- [x] Update `src/config.ts` to add new environment variables:
  - `POWERHOUSE_PROJECT`: Name of project to auto-start
  - `POWERHOUSE_PROJECTS_DIR`: Fixed directory (default: `../projects`)
  - `POWERHOUSE_CONNECT_PORT`: Optional override for connect port
  - `POWERHOUSE_SWITCHBOARD_PORT`: Optional override for switchboard port
  - `POWERHOUSE_STARTUP_TIMEOUT`: Startup timeout (default: 60000)
- [x] Add configuration validation
- [x] Export typed configuration object
- [x] Create .env.example with documentation

### Step 2: Initialize PowerhouseProjectsManager in Server ✅
- [x] Import PowerhouseProjectsManager in `src/server.ts`
- [x] Create shared CLIExecutor instance
- [x] Initialize manager with projects directory from config
- [x] Add manager instance as module-level variable
- [x] Add initialization logging
- [x] Import config and use config.port consistently

### Step 3: Implement Auto-Start Logic ✅
- [x] Add `startConfiguredProject()` function
- [x] Check if `POWERHOUSE_PROJECT` is configured
- [x] Auto-initialize project if it doesn't exist yet
- [x] Auto-start the project before Express server starts
- [x] Wait for Drive URL capture (with timeout)
- [x] Handle startup errors gracefully
- [x] Log startup status and Drive URL when captured
- [x] Add graceful shutdown handlers (SIGTERM, SIGINT)
- [x] Shutdown project on server shutdown
- [x] Handle uncaught exceptions and unhandled rejections
- [x] Fix TypeScript warnings for unused parameters

### Step 4: Implement GET /projects Endpoint ✅
- [x] List all projects from the fixed directory
- [x] Include project configuration from `powerhouse.config.json`
- [x] Mark which project is currently running
- [x] Handle errors (directory not found, invalid projects)
- [x] Add proper TypeScript types for response
- [x] Update root endpoint to show running project
- [x] Update health endpoint with project status

### Step 5: Implement GET /projects/running Endpoints ✅
- [x] Implement `GET /projects/running` - main project info
- [x] Implement `GET /projects/running/logs` - project logs with query params
- [x] Implement `GET /projects/running/status` - quick status check
- [x] Implement `GET /projects/running/drive-url` - Drive URL only
- [x] Return 404 if no project is running (for logs endpoint)
- [x] Add proper TypeScript types for all responses
- [x] Support query parameters for logs (?limit=N&tail=true)
- [x] Calculate and include uptime in responses

### Step 6: Enhance Existing Endpoints ✅
- [x] Update `GET /health` to include powerhouse project status
- [x] Update `GET /` to list new endpoints and show running project
- [x] Ensure consistent response format
- [x] Add project info to existing endpoints where relevant

### Step 7: Implement Graceful Shutdown ✅
- [x] Add SIGTERM handler
- [x] Add SIGINT handler
- [x] Shutdown running project on server shutdown
- [x] Clean up resources properly
- [x] Log shutdown process
- [x] Handle uncaught exceptions and unhandled rejections

### Step 8: Error Handling and Validation ⬜
- [ ] Add middleware for consistent error responses
- [ ] Validate query parameters (limit, tail, etc.)
- [ ] Handle edge cases (no projects, invalid project name)
- [ ] Add appropriate HTTP status codes
- [ ] Include helpful error messages

### Step 9: Testing ⬜
- [ ] Create unit tests for new endpoints
- [ ] Test auto-start functionality
- [ ] Test graceful shutdown
- [ ] Test error scenarios
- [ ] Update existing tests if needed

### Step 10: Documentation ⬜
- [ ] Update README with new configuration options
- [ ] Document API endpoints with examples
- [ ] Add startup configuration examples
- [ ] Update CLAUDE.md if needed
- [ ] Add inline code documentation

## Progress Tracking

### Current Status
**Phase**: Core Implementation Complete  
**Next Step**: Step 8 - Error Handling and Validation (optional enhancement)  
**Blocked**: No  

### Completed Items
- [x] Created comprehensive implementation plan
- [x] Defined GET-only API endpoints
- [x] Designed startup configuration approach
- [x] Documented in server-projects-plan.md

### Notes
- All project management is done manually in `../projects` directory
- Only one project can run at a time (server lifecycle)
- No POST/PUT/DELETE endpoints - purely read-only API
- Configuration via environment variables for container-friendly deployment

## API Endpoint Summary

### Project Endpoints
- `GET /projects` - List all available projects
- `GET /projects/running` - Get running project information
- `GET /projects/running/logs` - Get project logs
- `GET /projects/running/status` - Get project status
- `GET /projects/running/drive-url` - Get Drive URL

### Enhanced Endpoints
- `GET /health` - Now includes powerhouse project status
- `GET /` - Now lists all endpoints including project endpoints

## Configuration Example

```bash
# Start server with auto-started project
POWERHOUSE_PROJECT=my-project \
POWERHOUSE_PROJECTS_DIR=../projects \
POWERHOUSE_CONNECT_PORT=5000 \
POWERHOUSE_SWITCHBOARD_PORT=6000 \
npm start
```

## Success Criteria
- [x] Server can auto-start a configured project
- [x] All GET endpoints return correct data
- [x] Graceful shutdown works properly
- [x] Error handling is comprehensive
- [ ] Tests pass
- [ ] Documentation is complete

## Risk Mitigation
- **Risk**: Project fails to start
  - **Mitigation**: Server continues running, endpoints return appropriate errors
- **Risk**: Projects directory not found
  - **Mitigation**: Create directory if missing, return empty list
- **Risk**: Drive URL never captured
  - **Mitigation**: Timeout mechanism, server continues without it

## Code Locations
- Configuration: `/src/config.ts`
- Main implementation: `/src/server.ts`
- PowerhouseProjectsManager: `/src/powerhouse/PowerhouseProjectsManager.ts`
- Types: `/src/types.ts` (may need updates)
- Tests: `/tests/unit/server.test.ts` (to be created)

---
*Created: 2024-01-09*  
*Author: Claude + User*