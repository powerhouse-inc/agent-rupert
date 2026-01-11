# Service Boot Sequence Implementation - Status Summary

## Overview
Implementation of a boot phase for ServiceExecutor where services transition from 'booting' to 'running' only after matching readiness patterns. This ensures services are truly ready before considering them started.

## Completed Work

### ✅ Phase 1: Types and Interfaces
- Added `ServiceStatus` type: `'booting' | 'running' | 'stopping' | 'stopped' | 'failed'`
- Created `ReadinessConfig` interface with pattern matching
- Added `EndpointCaptureGroup` for capturing ports/URLs from service output
- Updated `ServiceHandle` with readiness data and endpoints Map

### ✅ Phase 2: ServiceExecutor Implementation
- Implemented boot phase lifecycle management
- Added readiness pattern matching with regex
- Captures endpoints (ports/URLs) from service output
- Transitions from 'booting' to 'running' when patterns match
- Emits events: `service-booting`, `service-ready`, `boot-timeout`
- Falls back to running state on timeout (configurable)

### ✅ Phase 3.5: Port Release Verification
- Implemented `monitorPortReleaseUponTermination` flag per endpoint
- Uses `lsof` command to check port availability on Unix systems
- Process group termination using `detached: true` and negative PID
- 500ms delay before port checking to allow OS cleanup
- Events: `checking-port-release`, `ports-released`, `port-release-timeout`

### ✅ Phase 4: Testing
- Comprehensive integration tests for readiness patterns (15 tests)
- Port release verification tests (7 test suites)
- Timing constants for reliable test execution
- All 31 tests passing consistently (1 skipped for SIGKILL behavior)
- Test time optimized from ~20s to ~17s

## Current Task: Phase 3 - PowerhouseProjectsManager Integration

### Problem
PowerhouseProjectsManager currently uses polling to detect when Powerhouse vetra is ready:
- `waitForDriveUrl()` polls every 1 second checking logs for "Drive URL:"
- Manual regex matching in output handler
- No use of ServiceExecutor's new readiness features

### Solution Needed
Update PowerhouseProjectsManager to use readiness patterns:

1. **Configure readiness patterns in runProject():**
```typescript
const runTask: ServiceTask = createServiceTask({
    // ... existing config ...
    readiness: {
        patterns: [
            {
                regex: 'Connect Studio running on port (\\d+)',
                name: 'connect-port',
                endpoints: [{
                    endpointName: 'connect-studio',
                    endpointDefaultHostUrl: 'http://localhost',
                    endpointCaptureGroup: 1,
                    monitorPortReleaseUponTermination: true
                }]
            },
            {
                regex: 'Switchboard listening on port (\\d+)',
                name: 'switchboard-port',
                endpoints: [{
                    endpointName: 'vetra-switchboard',
                    endpointDefaultHostUrl: 'http://localhost',
                    endpointCaptureGroup: 1,
                    monitorPortReleaseUponTermination: true
                }]
            },
            {
                regex: 'Drive URL:\\s*(https?://[^\\s]+)',
                name: 'drive-url',
                endpoints: [{
                    endpointName: 'drive-url',
                    endpointDefaultHostUrl: '', // Full URL captured
                    endpointCaptureGroup: 1,
                    monitorPortReleaseUponTermination: false
                }]
            }
        ],
        timeout: 60000 // 1 minute timeout
    }
});
```

2. **Listen for service-ready event:**
```typescript
// Remove polling-based waitForDriveUrl
// Listen for service-ready event instead
this.serviceExecutor.once('service-ready', (event) => {
    if (event.handle.id === serviceHandle.id) {
        const driveUrl = event.handle.endpoints?.get('drive-url');
        if (driveUrl && this.runningProject) {
            this.runningProject.driveUrl = driveUrl;
            this.runningProject.isFullyStarted = true;
            // Update GraphQL...
        }
    }
});
```

3. **Remove/deprecate waitForDriveUrl() method**

4. **Update output handler** to remove manual Drive URL detection

### Blockers
- Need to observe actual `ph vetra` output patterns to get regex right
- File watcher limit issues preventing test runs (ENOSPC error)
- WebSocket port 24678 conflict

### Next Steps
1. **Resolve environment issues:**
   - Clear up file watchers or restart to free them
   - Kill processes using port 24678
   - OR: Use the test fixtures to simulate patterns

2. **Get correct output patterns:**
   - Option A: Fix environment and run `ph vetra --watch` 
   - Option B: Check existing logs/tests for patterns
   - Option C: Use conservative patterns based on current code

3. **Implement the changes:**
   - Update `runProject()` with readiness config
   - Replace polling with event listeners
   - Update tests

4. **Test the integration:**
   - Unit tests with mocked ServiceExecutor
   - Integration test with real ph command

## Key Files
- `src/powerhouse/PowerhouseProjectsManager.ts` - Needs update
- `src/tasks/executors/service-executor.ts` - Already complete
- `src/tasks/types.ts` - Already complete
- `tests/unit/PowerhouseProjectsManager.test.ts` - Needs update
- `tests/integration/powerhouse-projects-manager.test.ts` - Needs update

## Definition of Done
- [x] Phase 1: Types implemented
- [x] Phase 2: ServiceExecutor implemented  
- [x] Phase 3.5: Port release verification
- [ ] Phase 3: PowerhouseProjectsManager uses readiness
- [x] Phase 4: Tests (except PowerhouseProjectsManager tests)
- [x] All integration tests passing
- [x] TypeScript compiles
- [ ] No more polling in PowerhouseProjectsManager