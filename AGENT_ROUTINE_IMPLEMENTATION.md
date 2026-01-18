# AgentRoutine Implementation Plan

## Overview
Refactoring agent work execution from reactive event-driven (AgentBase) to proactive queue-based (AgentRoutine) system.

## Implementation Steps

### Step 1: Move Document Management from AgentBase to AgentRoutine ✅
- [x] Add AgentBase reference to AgentRoutine constructor
- [x] Move `setupDocumentEventListeners()` from AgentBase to AgentRoutine
- [x] Move `updateInbox()` logic from AgentBase to AgentRoutine
- [x] Move `updateWbs()` logic from AgentBase to AgentRoutine
- [x] Move `documents` property to both (AgentBase keeps reference, AgentRoutine manages)
- [x] Update AgentBase to delegate document operations to AgentRoutine
- [x] Remove `nextUpdatePending` and `processing` flags from AgentBase (now in AgentRoutine)

### Step 2: Implement Core Loop ✅
- [x] Implement `start()` method with iteration timer
- [x] Implement `stop()` method with graceful shutdown
- [x] Add proper idle time management between iterations
- [x] Add status management (ready/running/stopping)

### Step 3: Complete Work Execution ✅
- [x] Implement `executeNextWorkItem()` method
- [x] Map work items to AgentBase.executeSkill/Scenario/Task()
- [x] Implement `hasWorkPending()` to check queue status
- [x] Define and implement `IterationResult` interface
- [x] Handle work item status transitions (queued → in-progress → succeeded/failed)

### Step 4: Implement Queue Methods ✅
- [x] Complete `queueSkill()` with Promise tracking
- [x] Complete `queueScenario()` with Promise tracking  
- [x] Complete `queueTask()` with Promise tracking
- [x] Add Promise resolution when work items complete
- [x] Implement work item validation in `validateWorkItemParams()`

### Step 5: Complete Handler Integration
- [ ] Implement `InboxRoutineHandler.getNextWorkItem()`
- [x] Implement `InboxRoutineHandler.hasUnreadMessages()` (completed earlier)
- [ ] Implement `WbsRoutineHandler.getNextWorkItem()`
- [ ] Map inbox messages to appropriate skill/scenario/task
- [ ] Map WBS goals to executable work items

### Step 6: Add Logging and Events
- [ ] Add comprehensive logging throughout AgentRoutine
- [ ] Emit events for work item state changes
- [ ] Add event listeners for debugging/monitoring
- [ ] Add metrics collection (execution time, queue depth, etc.)

### Step 7: Integration Testing
- [ ] Create unit tests for AgentRoutine
- [ ] Test inbox message processing through queue
- [ ] Test WBS goal execution through queue
- [ ] Test graceful shutdown scenarios
- [ ] Test error handling and recovery

## Benefits When Complete
- Predictable execution order and timing
- Better resource management with queuing
- Ability to prioritize and schedule work
- Clean separation between work identification and execution
- Foundation for more advanced scheduling algorithms

## Current Status
Steps 3 & 4 Complete - Work execution and queue methods fully implemented with Promise tracking.
- Work items are executed through AgentBase methods
- Queue methods return Promises that resolve/reject when work completes
- Full status transitions and error handling in place
Ready to proceed with Step 5 - Complete Handler Integration.