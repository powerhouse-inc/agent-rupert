# Vetra Initialization Plan: Drive URL Capture Integration

## Overview
Move the Drive URL capture logic from the integration test into the `runProject` method of PowerhouseProjectsManager to ensure vetra is fully started before returning and to capture the Drive URL for use by consumers.

## Implementation Steps

### Step 1: Enhance Interfaces ✅
- [x] Update `RunningProject` interface:
  - Add `driveUrl?: string` field
  - Add `isFullyStarted: boolean` field
  - Document new fields with JSDoc comments
- [x] Update `RunProjectResult` interface:
  - Add `driveUrl?: string` field
  - ~~Add optional `startupTimeout?: number` parameter~~ (moved to RunProjectOptions)
- [x] Consider adding configuration interface for startup options
  - Added `RunProjectOptions` interface with connectPort, switchboardPort, and startupTimeout

### Step 2: Implement Drive URL Detection in Log Capture ✅
- [x] Enhance `onStdout` callback to detect "Drive URL:" pattern
- [x] Enhance `onStderr` callback to detect "Drive URL:" pattern
- [x] Extract and store URL when found
- [x] Set `isFullyStarted` flag when Drive URL is captured
- [x] Increase log buffer size from 100 to 500 during startup phase

### Step 3: Create Helper Methods ✅
- [x] Implement `waitForDriveUrl(timeout: number): Promise<string | null>`
  - Poll logs every 1 second
  - Return URL when found
  - Return null on timeout
- [x] Implement `isProjectReady(): boolean`
  - Check if Drive URL exists
  - Return readiness status
- [x] Add `getStartupLogs(): string[]` for debugging
- [x] Add comprehensive tests for all helper methods

### Step 4: Integrate Startup Verification into runProject ✅
- [x] Add startup timeout configuration (default: 60 seconds)
- [x] After starting process, call `waitForDriveUrl()`
- [x] Include Drive URL in return result
- [x] Handle timeout gracefully (warn but don't fail)
- [x] Ensure proper error handling and cleanup
- [x] Support backwards compatibility with legacy signature
- [x] Add tests for new behavior

### Step 5: Update getRunningProject Method ✅
- [x] Include `driveUrl` in returned object
- [x] Include `isFullyStarted` status
- [x] Update JSDoc documentation

### Step 6: Update Integration Tests ✅
- [x] Remove Drive URL polling logic from PowerhouseProjectsManager.test.ts
- [x] Update test to check `runResult.driveUrl`
- [x] Verify URL is captured automatically
- [x] Add test for timeout scenario (handled gracefully)
- [x] Update ClaudeCodeExecutor integration test if needed

### Step 7: Documentation and Polish ⬜
- [ ] Update README with new behavior
- [ ] Add inline documentation for new features
- [ ] Add usage examples
- [ ] Consider adding event emitters for milestones

## Progress Tracking

### Current Status
**Phase**: Implementation Complete  
**Next Step**: Step 7 - Documentation and Polish  
**Blocked**: No  

### Completed Items
- [x] Analyzed current Drive URL capture in integration test
- [x] Reviewed runProject method implementation
- [x] Created comprehensive implementation plan
- [x] Documented plan in vetra-init-plan.md

### Notes
- Drive URL typically appears in vetra child process output
- Current log limit of 100 may be insufficient during startup
- Integration test shows URL appears within 10-30 seconds typically
- Consider capturing both Connect Studio URL and Drive URL for completeness

## Testing Strategy
1. Unit tests for new helper methods
2. Integration test with real `ph vetra` command
3. Test timeout scenarios
4. Test multiple project scenarios
5. Verify backward compatibility

## Success Criteria
- [x] Plan documented and structured
- [x] Drive URL automatically captured during `runProject`
- [x] Vetra fully started before `runProject` returns
- [x] Integration tests simplified and more reliable
- [x] No breaking changes to existing API (removed legacy signatures per request)
- [x] Proper error handling and timeout management

## Risk Mitigation
- **Risk**: Drive URL format changes in future vetra versions
  - **Mitigation**: Use flexible regex pattern, add version detection
- **Risk**: Startup takes longer than expected
  - **Mitigation**: Configurable timeout, async wait options
- **Risk**: Log buffer overflow during startup
  - **Mitigation**: Increase buffer size, implement circular buffer

## Code Locations
- Main implementation: `/src/powerhouse/PowerhouseProjectsManager.ts`
- Integration test: `/tests/integration/PowerhouseProjectsManager.test.ts`
- Unit tests: `/tests/unit/PowerhouseProjectsManager.test.ts`
- Types: Defined within PowerhouseProjectsManager.ts

---
*Last Updated: [Current Date]*  
*Author: Claude + User*