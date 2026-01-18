# AgentRoutineContext Integration Plan

## Overview
This plan outlines the integration of AgentRoutineContext into AgentRoutine to manage stateful execution of WBS goal-driven skills and scenarios.

## Architecture

### Core Concept
- **AgentRoutine** orchestrates and manages context lifecycle
- **AgentRoutineContext** handles variable collection, setup messaging, and provides execution context
- Execution flows through the context's PromptDriver once context is established

## Implementation Steps

### Step 1: Add Context Property to AgentRoutine
```typescript
class AgentRoutine {
    private currentContext: AgentRoutineContext | null = null;
    // ... existing properties
}
```

### Step 2: AgentRoutine Assesses Context Needs
```typescript
private async ensureContext(goalChain: Goal[]): Promise<AgentRoutineContext> {
    // Check if we need a new context
    if (!this.currentContext || !this.currentContext.matchesGoalChain(goalChain)) {
        // Create new context
        const promptDriver = this.createFilteredPromptDriver(goalChain);
        const priorCompletedTasks = this.getPriorCompletedTasks(goalChain); // from WBS tracking
        
        this.currentContext = new AgentRoutineContext(
            goalChain,
            priorCompletedTasks,
            promptDriver
        );
        
        // Setup the context (collect variables, send preambles & completed tasks overview)
        await this.currentContext.setup(this.agent.getBrain());
    }
    return this.currentContext;
}
```

### Step 3: Enhanced AgentRoutineContext
```typescript
class AgentRoutineContext {
    // ... existing properties
    
    // Collect required variables (placeholder for now)
    private async collectVariables(): Promise<Record<string, any>> {
        const requiredVars = this.getRequiredVariables();
        const variables: Record<string, any> = {};
        
        // TODO: Implement variable collection
        // - documents.* from reactor/drive
        // - message.* from inbox  
        // - thread.* from inbox
        // - stakeholder.* from inbox
        
        return variables;
    }
    
    // Setup context by sending preambles and completed tasks overview
    public async setup(brain: IAgentBrain): Promise<void> {
        // Collect variables first
        const variables = await this.collectVariables();
        
        // Send skill preamble if not sent
        if (!this.skill.preambleSent) {
            await this.sendSkillPreamble(brain, variables);
            this.skill.preambleSent = true;
        }
        
        // Send scenario preamble if not sent
        if (!this.scenario.preambleSent) {
            await this.sendScenarioPreamble(brain, variables);
            this.scenario.preambleSent = true;
        }
        
        // Send overview of completed tasks
        const completedTasks = this.tasks.filter(t => t.completed);
        if (completedTasks.length > 0) {
            await this.sendCompletedTasksOverview(brain, completedTasks, variables);
        }
        
        // Mark all completed tasks as having preamble sent
        completedTasks.forEach(t => t.preambleSent = true);
    }
    
    // Send overview of what's already been done
    private async sendCompletedTasksOverview(
        brain: IAgentBrain, 
        completedTasks: Array<{id: string, completed: boolean}>,
        variables: Record<string, any>
    ): Promise<void> {
        const message = `The following tasks have already been completed:\n${
            completedTasks.map(t => `- ${t.id}`).join('\n')
        }\n\nContinuing with the remaining tasks...`;
        
        // Send to brain
        await brain.sendMessage(message);
    }
    
    // Get the prompt driver for execution
    public getPromptDriver(): PromptDriver {
        return this.driver;
    }
    
    // Check if this context matches a goal chain
    public matchesGoalChain(goalChain: Goal[]): boolean {
        // Compare skill, scenario, and task IDs
        const newSkill = goalChain.find(g => g.instructions?.workType === 'SKILL')?.instructions?.workId;
        const newScenario = goalChain.find(g => g.instructions?.workType === 'SCENARIO')?.instructions?.workId;
        
        return this.skill.name === newSkill && this.scenario.id === newScenario;
    }
    
    // Track task completion
    public markTaskComplete(taskId: string): void {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) task.completed = true;
    }
    
    // Check if all tasks are complete
    public isComplete(): boolean {
        return this.tasks.every(t => t.completed);
    }
}
```

### Step 4: AgentRoutine Execution Flow
```typescript
// In AgentRoutine
private async executeWorkItems() {
    // If we have WBS goals to process
    if (this.hasWbsGoals()) {
        const goalChain = this.getCurrentGoalChain();
        
        // 1. Ensure we have the right context (creates and sets up if needed)
        const context = await this.ensureContext(goalChain);
        
        // 2. Execute work items through the context's PromptDriver
        const promptDriver = context.getPromptDriver();
        
        // Execute next task/scenario/skill through PromptDriver
        const result = await promptDriver.executeNext({
            // execution parameters
        });
        
        // 3. Track completion in context
        if (result.taskCompleted) {
            context.markTaskComplete(result.taskId);
        }
        
        // 4. Check if complete
        if (context.isComplete()) {
            this.markGoalComplete(goalChain);
            this.currentContext = null;
        }
    } else {
        // Fall back to existing work item execution
        this.executeTraditionalWorkItem();
    }
}
```

## Key Responsibilities

### AgentRoutine
- Decides when new context is needed
- Creates filtered PromptDriver for context  
- Provides list of prior completed tasks
- Executes through context's PromptDriver
- Manages context lifecycle

### AgentRoutineContext
- Collects required variables (placeholder for now)
- Sends setup messages (skill preamble, scenario preamble, completed tasks overview)
- Provides PromptDriver for execution
- Tracks what has been sent
- Tracks task completion

## Setup Flow
When `context.setup()` is called:
1. Collect all required variables
2. Send skill preamble (if not sent)
3. Send scenario preamble (if not sent)  
4. Send overview of completed tasks (so the agent knows what's already done)
5. Mark setup elements as sent to avoid repetition

## Benefits
- Context is self-contained with its own variable collection
- Completed tasks overview provides continuity when resuming work
- All context-specific logic is encapsulated in AgentRoutineContext
- AgentRoutine focuses on orchestration and lifecycle

## Future Enhancements
1. Implement full variable collection from documents
2. Add context persistence for recovery after crashes
3. Support for parallel contexts (multiple active goal chains)
4. Integration with WBS document for progress tracking
5. Error handling and retry logic for failed setup