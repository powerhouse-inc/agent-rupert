# AgentRoutine Implementation Plan

## Overview
Refactoring agent work execution from reactive event-driven (AgentBase) to proactive queue-based (AgentRoutine) system.

## Implementation Steps

### Step 1: Move Document Management from AgentBase to AgentRoutine ✅
- [x] Add AgentBase reference to AgentRoutine constructor
- [ ] Move `setupDocumentEventListeners()` from AgentBase to AgentRoutine
- [ ] Move `updateInbox()` logic from AgentBase to AgentRoutine
- [ ] Move `updateWbs()` logic from AgentBase to AgentRoutine
- [ ] Move `documents` property from AgentBase to AgentRoutine
- [ ] Update AgentBase to delegate document operations to AgentRoutine
- [ ] Remove `nextUpdatePending` and `processing` flags from AgentBase

### Step 2: Implement Core Loop
- [ ] Implement `start()` method with iteration timer
- [ ] Implement `stop()` method with graceful shutdown
- [ ] Add proper idle time management between iterations
- [ ] Add status management (ready/running/stopping)

### Step 3: Complete Work Execution
- [ ] Implement `executeNextWorkItem()` method
- [ ] Map work items to AgentBase.executeSkill/Scenario/Task()
- [ ] Implement `hasWorkPending()` to check queue status
- [ ] Define and implement `IterationResult` interface
- [ ] Handle work item status transitions (queued → in-progress → succeeded/failed)

### Step 4: Implement Queue Methods
- [ ] Complete `queueSkill()` with Promise tracking
- [ ] Complete `queueScenario()` with Promise tracking  
- [ ] Complete `queueTask()` with Promise tracking
- [ ] Add Promise resolution when work items complete
- [ ] Implement work item validation in `validateWorkItemParams()`

### Step 5: Complete Handler Integration
- [ ] Implement `InboxRoutineHandler.getNextWorkItem()`
- [ ] Implement `InboxRoutineHandler.hasUnreadMessages()`
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
Starting Step 1 - Moving document management from AgentBase to AgentRoutine