# Service Boot Sequence Implementation Plan

## Overview
This document tracks the implementation of a boot phase for ServiceExecutor, where services transition from 'booting' to 'running' only after matching readiness patterns. This ensures services are truly ready before considering them started, solving the PowerhouseProjectsManager integration test issues.

## Problem Statement
- Services currently start immediately in 'running' status without verification
- No reliable way to detect when a service is actually ready to accept connections
- PowerhouseProjectsManager relies on polling to detect Drive URL
- Integration tests are flaky due to timing issues with service startup

## Solution
Implement a two-phase startup process:
1. **Boot Phase**: Service starts in 'booting' status, monitoring output for readiness patterns
2. **Running Phase**: After readiness detected, service transitions to 'running' status

## Phase 1: Update Types and Interfaces
**Status:** ✅ Completed

### Objectives
- Define new service status states including 'booting'
- Add readiness configuration to ServiceTask
- Update ServiceHandle to track boot phase data
- Maintain backward compatibility

### Tasks
- [x] Update `src/tasks/types.ts`
  - [x] Add explicit ServiceStatus type: `'booting' | 'running' | 'stopping' | 'stopped' | 'failed'`
  - [x] Add ReadinessConfig interface:
    ```typescript
    interface ReadinessConfig {
      patterns: ReadinessPattern[];
      timeout?: number; // Boot phase timeout in ms (default: 30000)
    }
    
    interface ReadinessPattern {
      regex: string;
      flags?: string; // Regex flags (default: '')
      stream?: 'stdout' | 'stderr' | 'any'; // Which stream to monitor (default: 'any')
      name?: string; // Optional name for the pattern
      endpoints?: EndpointCaptureGroup[]
    }

    interface EndpointCaptureGroup {
      endpointName: string; // E.g. vetra-switchboard, vetra-connect, etc.
      endpointDefaultHostUrl: string; // E.g. http://localhost
      endpointCaptureGroup: number; // Which capture group contains the port/path (1-based)
      monitorPortReleaseUponTermination: boolean;
    }
    ```
  - [x] Update ServiceTask interface to include optional readiness field
  - [x] Update ServiceHandle interface:
    - Add `bootedAt?: Date` field
    - Add `readinessMatches?: Map<string, string[]>` for captured groups
    - Add `endpoints?: Map<string, string>` for constructed endpoint URLs
    - Update status to use ServiceStatus type
  - [x] Update existing type guards and factory functions

### Implementation Notes
- ServiceStatus should be an explicit type, not just a string
- ReadinessConfig is optional to maintain backward compatibility
- Services without readiness config transition immediately to 'running'
- Capture groups are always stored when patterns match (by pattern name or index)
- Endpoint URLs are constructed from capture groups and default host URLs

## Phase 2: Update ServiceExecutor
**Status:** ✅ Completed

### Objectives
- Implement boot phase lifecycle management
- Add readiness pattern matching logic
- Handle boot timeout with appropriate fallback
- Emit new events for boot phase transitions

### Tasks
- [ ] Update `src/tasks/executors/service-executor.ts`
  
  **Boot Phase Management:**
  - [x] Add boot-related fields to RunningService interface:
    - `bootTimeout?: NodeJS.Timeout`
    - `readinessConfig?: ReadinessConfig`
    - `readinessMatchers?: Array<{ pattern: RegExp, stream: string, name?: string }>`
    - `readinessMatched: boolean`
  
  **Core Methods:**
  - [x] Implement `checkReadiness()` method:
    - Check data against readiness patterns
    - Store capture groups if configured
    - Return true if all patterns matched
  - [x] Implement `transitionToRunning()` method:
    - Update handle status to 'running'
    - Set bootedAt timestamp
    - Clear boot timeout
    - Emit 'service-ready' event
  - [x] Implement `handleBootTimeout()` method:
    - Log warning about timeout
    - Emit 'boot-timeout' event
    - Optionally transition to 'running' anyway (configurable)
  
  **Update Existing Methods:**
  - [x] Modify `start()` method:
    - Initialize with 'booting' status if readiness configured
    - Compile regex patterns for efficient matching
    - Set up boot timeout if configured
    - Emit 'service-booting' event
  - [x] Update output handlers (stdout/stderr):
    - During boot phase, check readiness on each output
    - Transition to running when patterns match
    - Continue normal logging regardless of phase
  - [x] Update `stop()` method:
    - Clear boot timeout if still pending
    - Handle stopping during boot phase
  
  **Event Emission:**
  - [x] Add new events:
    - `service-booting`: { handle, readinessConfig }
    - `service-ready`: { handle, bootDuration, readinessMatches }
    - `boot-timeout`: { handle, timeout }
    - `readiness-match`: { handle, pattern, matches }

### Implementation Details

**Readiness Checking Algorithm:**
```typescript
private checkReadiness(service: RunningService, stream: 'stdout' | 'stderr', data: string): boolean {
  if (!service.readinessConfig || service.readinessMatched) {
    return service.readinessMatched;
  }
  
  for (const matcher of service.readinessMatchers) {
    if (matcher.stream !== 'any' && matcher.stream !== stream) {
      continue;
    }
    
    const match = data.match(matcher.pattern);
    if (match) {
      // Always store captured groups
      service.handle.readinessMatches.set(matcher.name || index, match.slice(1));
      
      // Build endpoint URLs if configured
      if (matcher.endpoints) {
        for (const endpoint of matcher.endpoints) {
          const capturedValue = match[endpoint.endpointCaptureGroup];
          if (capturedValue) {
            // Construct full URL or use captured value directly
            const fullUrl = endpoint.endpointDefaultHostUrl 
              ? `${endpoint.endpointDefaultHostUrl}:${capturedValue}`
              : capturedValue;
            service.handle.endpoints.set(endpoint.endpointName, fullUrl);
          }
        }
      }
      // Mark pattern as matched
      // Check if all patterns matched
      // Return true if all ready
    }
  }
  return false;
}
```

**Boot Timeout Handling:**
- Configurable behavior: fail vs. continue
- Default: Continue running with warning
- Clear timeout on successful readiness
- Clear timeout on service stop

### Testing Requirements
- [x] Unit tests for readiness pattern matching
- [x] Unit tests for boot timeout scenarios  
- [x] Unit tests for capture group storage
- [x] Integration tests with real service output
- [x] Tests for multiple pattern requirements
- [x] Tests for stream-specific patterns
- All 15 integration tests passing!

## Phase 3: Update PowerhouseProjectsManager
**Status:** 🔲 Not Started

### Objectives
- Use readiness patterns to detect Drive URL
- Remove polling-based waitForDriveUrl
- Handle boot phase events properly

### Tasks
- Update runProject to configure readiness
- Listen for service-ready event
- Extract Drive URL from capture groups
- Update tests for new behavior

## Phase 3.5: Port Release Verification
**Status:** 🔲 Not Started

### Objectives
- Ensure captured endpoint ports are properly released when service stops
- Prevent port conflicts when restarting services
- Add verification mechanism to confirm ports are available

### Problem Statement
When a service is stopped, the ports it was using (captured in `endpoints` Map) need to be verified as released before the service can be restarted or another service can use the same ports. This is critical for:
- Preventing "port already in use" errors
- Ensuring clean service lifecycle management
- Enabling reliable service restarts

### Tasks
- [ ] Add port checking utilities to ServiceExecutor
  - [ ] Create `checkPortAvailable(port: number): Promise<boolean>` method
  - [ ] Extract port numbers from endpoint URLs
  - [ ] Support both TCP and UDP port checking
  
- [ ] Update `stop()` method to verify port release
  - [ ] After process termination, check all captured endpoint ports
  - [ ] Implement retry mechanism with configurable timeout
  - [ ] Emit 'ports-released' event when all ports are free
  - [ ] Emit 'port-release-failed' event if ports remain in use
  
- [ ] Add configuration options
  ```typescript
  interface PortReleaseOptions {
    verifyPortRelease?: boolean; // Enable port verification (default: true)
    portReleaseTimeout?: number; // Max time to wait for ports (default: 5000ms)
    portCheckInterval?: number; // Interval between checks (default: 100ms)
    portCheckRetries?: number; // Max retries (default: 50)
  }
  ```
  
- [ ] Update ServiceExecutorOptions
  - [ ] Add `portReleaseOptions?: PortReleaseOptions`
  - [ ] Set sensible defaults for production use
  
- [ ] Implement port extraction logic
  - [ ] Parse URLs from `service.handle.endpoints`
  - [ ] Extract port numbers from various URL formats:
    - `http://localhost:3000` → 3000
    - `https://localhost:4001/drives/xyz` → 4001
    - `ws://127.0.0.1:8080` → 8080
    - Full URLs without port use default (80 for http, 443 for https)
  
- [ ] Add event emissions
  - [ ] `'checking-port-release'`: { handle, ports: number[] }
  - [ ] `'port-released'`: { handle, port: number }
  - [ ] `'ports-released'`: { handle, ports: number[], duration: number }
  - [ ] `'port-release-timeout'`: { handle, unavailablePorts: number[] }

### Implementation Approach

**Port Checking Method:**
```typescript
private async checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Use ss or netstat to check if port is in use
    // ss is faster and more modern, netstat is more widely available
    const command = process.platform === 'linux' ? 'ss' : 'netstat';
    const args = process.platform === 'linux' 
      ? ['-tulnH', '|', 'grep', `:${port}\\b`]  // ss: Check TCP/UDP listening ports
      : ['-an', '|', 'grep', `:${port}\\b.*LISTEN`]; // netstat: Check listening ports
    
    exec(`${command} ${args.join(' ')}`, (error, stdout) => {
      if (error) {
        // Command failed or no matching ports found
        resolve(true); // Port is available
      } else {
        // Output contains the port, so it's in use
        resolve(false); // Port is in use
      }
    });
  });
}

// Alternative simpler method using Node's net module to check binding
private async checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false); // Port in use
        } else {
          resolve(true); // Other error, assume available
        }
      })
      .once('listening', () => {
        tester.close(() => resolve(true)); // Port available
      })
      .listen(port, '0.0.0.0'); // Check all interfaces
  });
}
```

**Port Release Verification Flow:**
1. Service stop initiated
2. Process terminated (SIGTERM/SIGKILL)
3. Extract ports from captured endpoints
4. Begin port release verification loop
5. Check each port for availability
6. Retry if ports still in use (OS may take time to release)
7. Emit success event when all ports free
8. Emit timeout event if max retries exceeded

### Testing Requirements
- [ ] Unit tests for port extraction from URLs
- [ ] Unit tests for checkPortAvailable method
- [ ] Integration test: Start service, capture ports, stop, verify release
- [ ] Integration test: Port release timeout scenario
- [ ] Integration test: Restart service after port verification
- [ ] Test with multiple services using different ports
- [ ] Test port conflict detection

### Success Criteria
- ✅ All captured endpoint ports verified as released after service stop
- ✅ Port release verification completes within timeout
- ✅ Services can be restarted without port conflicts
- ✅ Clear events for monitoring port release process
- ✅ Graceful handling of ports that won't release (with timeout)

### Risk Mitigation
- **Risk**: OS may take variable time to release ports
  - **Mitigation**: Implement retry with exponential backoff
- **Risk**: Port check might interfere with other processes
  - **Mitigation**: Make verification optional via config
- **Risk**: False positives in port availability check
  - **Mitigation**: Try to bind to port as verification method
- **Risk**: Performance impact of checking multiple ports
  - **Mitigation**: Check ports in parallel, not sequentially

## Phase 4: Testing
**Status:** 🔲 Not Started

### Objectives
- Comprehensive test coverage for boot phase
- Update existing tests for new behavior
- Add integration tests for real scenarios

### Tasks
- Unit tests for ServiceExecutor boot phase
- Integration tests for service readiness
- Update PowerhouseProjectsManager tests
- Performance tests for pattern matching

## Definition of Done
The definition of done must be checked before committing work:

- [ ] Implementation is finished
- [ ] All unit tests are passing
- [ ] All integration tests are passing
- [ ] TypeScript compiles without errors
- [ ] pnpm build shows no issues
- [ ] Planning document is updated with latest status
- [ ] Code is documented with JSDoc comments
- [ ] No console.log statements left in code (use proper logging)
- [ ] All TODO comments are resolved or tracked

## Success Metrics
- Services reliably detect readiness before accepting traffic
- No more polling needed for Drive URL detection
- Integration tests pass consistently without timing issues
- Boot phase timeout prevents hanging on failed starts
- Clear event stream for monitoring service lifecycle

## Risk Mitigation
- **Risk**: Regex patterns might be expensive for large outputs
  - **Mitigation**: Compile patterns once, limit buffer size
- **Risk**: Boot timeout might be too short for slow systems
  - **Mitigation**: Make timeout configurable with sensible defaults
- **Risk**: Breaking change for existing service users
  - **Mitigation**: Make readiness optional, default behavior unchanged
- **Risk**: Complex patterns might never match
  - **Mitigation**: Boot timeout ensures service continues or fails predictably

## Notes
- Consider adding health check support in future phases
- Could extend to support TCP/HTTP readiness probes later
- Pattern matching should be efficient for high-volume output
- Consider max buffer size for boot phase output