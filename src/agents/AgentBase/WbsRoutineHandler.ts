import { WorkBreakdownStructureDocument, Goal, actions } from "powerhouse-agent/document-models/work-breakdown-structure";
import { WorkItemParams, WorkItemType } from "./WorkItemTypes.js";
import { AgentRoutineContext } from "./AgentRoutineContext.js";
import type { IDocumentDriveServer } from "document-drive";
import type { ISkillsRepository } from "../../prompts/ISkillsRepository.js";
import type { SkillTemplate, ScenarioTemplate, ScenarioTaskTemplate } from "../../prompts/types.js";
import { MemorySkillsRepository } from "../../prompts/MemorySkillsRepository.js";
import { PromptDriver } from "../../prompts/PromptDriver.js";
import type { IAgentBrain } from "../IAgentBrain.js";

interface WorkItemResolution {
    skillName: string;
    scenarioId: string;
    taskId: string;
    confidence: 'explicit' | 'inferred' | 'constructed';
    source: {
        skill: 'wbs' | 'scenario_prefix' | 'task_prefix' | 'repository_scan';
        scenario: 'wbs' | 'task_prefix' | 'repository_scan';
        task: 'wbs';
    };
}


export class WbsRoutineHandler {
    
    /**
     * Get the next work item from the WBS document
     * Finds the next eligible goal, marks it as IN_PROGRESS, and returns an idle work item
     * TODO: Implement actual WBS goal processing to return appropriate work items
     */
    public static async getNextWorkItem(
        wbs: WorkBreakdownStructureDocument,
        reactor: IDocumentDriveServer,
        skillsRepository: ISkillsRepository,
        brain: IAgentBrain
    ): Promise<{ 
        type: WorkItemType, 
        params: WorkItemParams,
        callbacks?: {
            onSuccess?: () => void | Promise<void>;
            onFailure?: () => void | Promise<void>;
        }
    } | null> {
        // Find the next goal to work on (returns ancestor chain with siblings)
        const result = this.findNextGoal(wbs);
        
        if (result && result.goalChain.length > 0) {
            const { goalChain, precedingSiblings, followingSiblings } = result;
            const nextGoal = goalChain[goalChain.length - 1];
            
            if (nextGoal.status !== "IN_PROGRESS") {
                //console.log("Marking next goal in progress", nextGoal);
                await this.markInProgress(nextGoal, wbs.header.id, reactor);
            }

            // Resolve work item using intelligent resolution
            const resolution = this.resolveWorkItem(goalChain, skillsRepository);
            
            if (!resolution) {
                console.warn("Could not resolve work item from goal chain");
                return { type: 'idle', params: {} };
            }
            
            //console.log(`Resolved work item: ${resolution.skillName}/${resolution.scenarioId}/${resolution.taskId} (${resolution.confidence})`);
            //console.log(`  Source: skill=${resolution.source.skill}, scenario=${resolution.source.scenario}, task=${resolution.source.task}`);
            
            // Create filtered PromptDriver for this resolution
            const driver = this.createDriverForResolution(
                resolution,
                goalChain, 
                precedingSiblings,
                followingSiblings,
                skillsRepository, 
                brain
            );
            
            if (driver) {
                // Get prior completed tasks (TODO: implement actual tracking from WBS)
                const priorCompletedTasks: string[] = [];
                
                // Create context for this goal chain with resolved skill name
                const routineContext = new AgentRoutineContext(
                    goalChain,
                    priorCompletedTasks,
                    driver,
                    resolution.skillName
                );
                
                // Return a task work item with the resolved skill name
                return {
                    type: 'task',
                    params: {
                        skillName: resolution.skillName,
                        scenarioId: resolution.scenarioId,
                        taskId: resolution.taskId,
                        context: {
                            wbsId: wbs.header.id,
                            goals: {
                                skill: goalChain.find(g => g.instructions?.workType == 'SKILL') || null,
                                scenario: goalChain.find(g => g.instructions?.workType == 'SCENARIO') || null,
                                task: goalChain.find(g => g.instructions?.workType == 'TASK') || null,
                                precedingTasks: precedingSiblings,
                                followingTasks: followingSiblings,
                            },
                            resolution: resolution,
                        },
                        routineContext: routineContext,
                        options: {
                            maxTurns: 75,
                            captureSession: false
                        }
                    },
                    callbacks: {
                        onSuccess: async () => {
                            await this.markCompleted(nextGoal, wbs.header.id, reactor);
                        },
                        onFailure: async () => {
                            await this.markBlocked(nextGoal, wbs.header.id, reactor);
                        },
                    }
                };
            }
            
            console.warn("Could not create PromptDriver for resolved work item");
            return { type: 'idle', params: {} }
        }
        
        // Return idle work item if no WBS goal to work on
        return {
            type: 'idle',
            params: {}
        };
    }


    /**
     * Resolve a complete work item from the goal chain
     * Always derives scenario and skill from the task ID, ignoring workIds on scenario/skill goals
     */
    private static resolveWorkItem(
        goalChain: Goal[],
        skillsRepository: ISkillsRepository
    ): WorkItemResolution | null {
        // Extract task goal from chain
        const taskGoal = goalChain.find(g => g.instructions?.workType === "TASK");
        
        // Task is required - without it we can't execute anything
        if (!taskGoal?.instructions?.workId) {
            console.warn("No task work ID found in goal chain");
            return null;
        }
        
        const taskId = taskGoal.instructions.workId;
        
        // Always derive everything from the task ID by scanning the repository
        const scanResult = this.findWorkItemInRepository(taskId, skillsRepository);
        
        if (!scanResult) {
            console.warn(`Could not find task ${taskId} in any skill repository`);
            return null;
        }
        
        // Return the resolution based entirely on repository scan
        return {
            skillName: scanResult.skillName,
            scenarioId: scanResult.scenarioId,
            taskId: scanResult.taskId,
            confidence: 'constructed',
            source: {
                skill: 'repository_scan',
                scenario: 'repository_scan',
                task: 'wbs'
            }
        };
    }


    /**
     * Scan the entire repository to find where a task belongs
     */
    private static findWorkItemInRepository(
        taskId: string,
        skillsRepository: ISkillsRepository
    ): WorkItemResolution | null {
        for (const skillName of skillsRepository.getSkills()) {
            const skill = skillsRepository.getSkillTemplate(skillName);
            if (!skill) continue;
            
            for (const scenario of skill.scenarios) {
                const task = scenario.tasks.find(t => t.id === taskId);
                if (task) {
                    return {
                        skillName,
                        scenarioId: scenario.id,
                        taskId: task.id,
                        confidence: 'constructed',
                        source: {
                            skill: 'repository_scan',
                            scenario: 'repository_scan',
                            task: 'wbs'
                        }
                    };
                }
            }
        }
        return null;
    }

    /**
     * Find the next goal to work on by traversing the goal tree
     * Returns the ancestor chain with the first eligible leaf node as the final element,
     * plus its preceding and following sibling goals
     * 
     * @param wbs - The Work Breakdown Structure document
     * @returns Object with goal chain and siblings, or null if none found
     */
    public static findNextGoal(wbs: WorkBreakdownStructureDocument): {
        goalChain: Goal[],
        precedingSiblings: Goal[],
        followingSiblings: Goal[]
    } | null {
        const goals = wbs.state.global.goals;
        if (!goals || goals.length === 0) {
            return null;
        }

        // Helper function to check if a goal is a leaf node
        const isLeafGoal = (goal: Goal): boolean => {
            // A goal is a leaf if no other goals have it as their parentId
            return !goals.some(g => g.parentId === goal.id);
        };

        // Helper function to check if a goal is eligible for work
        const isEligibleForWork = (goal: Goal): boolean => {
            return !goal.isDraft && 
                   (goal.status === 'TODO' || goal.status === 'IN_PROGRESS');
        };

        // Helper function to build the ancestor chain for a goal
        const getAncestorChain = (goal: Goal): Goal[] => {
            const chain: Goal[] = [];
            let current: Goal | undefined = goal;
            
            // Build chain from leaf to root
            while (current) {
                chain.unshift(current); // Add to beginning to maintain root-to-leaf order
                if (current.parentId) {
                    current = goals.find(g => g.id === current!.parentId);
                } else {
                    current = undefined;
                }
            }
            
            return chain;
        };

        // Traverse sorted goals to find the first eligible leaf
        for (let index=0; index<goals.length; index++) {
            const goal = goals[index];
            //console.log("Considering goal: ", goal.description);
            if (isLeafGoal(goal) && isEligibleForWork(goal)) {
                //console.log(" > Goal selected", goal);
                const goalChain = getAncestorChain(goal);
                
                // Find sibling goals (same parent, same workType)
                const parentId = goal.parentId;
                
                const children = goals.filter(g => g.parentId === parentId);
                
                const precedingSiblings: Goal[] = [];
                const followingSiblings: Goal[] = [];
                let encounteredCurrent = false;

                for (const c of children) {
                    if (c.id === goal.id) {
                        encounteredCurrent = true;
                    } else if (encounteredCurrent) {
                        followingSiblings.push(c);
                    } else {
                        precedingSiblings.push(c);
                    }
                }
                
                //console.log(" Siblings", precedingSiblings.map(s => s.instructions?.workId), followingSiblings.map(s => s.instructions?.workId));

                return {
                    goalChain,
                    precedingSiblings,
                    followingSiblings
                };
            } else {
                if (isLeafGoal(goal)) {
                    //console.log(" - Not eligible");
                } else {
                    //console.log(" - Not a leaf goal");
                }
            }
        }

        return null;
    }

    /**
     * Get skill templates from the goal chain
     * Traverses the chain to extract skill, scenario, and task templates
     * 
     * @param goalChain - Array of goals from root to leaf
     * @param skillRepository - Repository to look up skill templates
     * @returns Object containing skill, scenario, and task templates or null
     */
    public static getGoalChainSkillTemplates(
        goalChain: Goal[],
        precedingSiblings: Goal[],
        followingSiblings: Goal[],
        skillRepository: ISkillsRepository
    ): {
        skillName: string | null,
        skillTemplate: SkillTemplate | null,
        scenarioTemplate: ScenarioTemplate | null,
        precedingTaskTemplates: ScenarioTaskTemplate[],
        currentTaskTemplate: ScenarioTaskTemplate | null,
        followingTaskTemplates: ScenarioTaskTemplate[],
        wbsTaskIds: Set<string>,
    } | null {
        if (!goalChain || goalChain.length === 0) {
            return null;
        }

        let skillName: string | null = null;
        let skillTemplate: SkillTemplate | null = null;
        let scenarioTemplate: ScenarioTemplate | null = null;
        let currentTaskTemplate: ScenarioTaskTemplate | null = null;
        const precedingTaskTemplates: ScenarioTaskTemplate[] = [];
        const followingTaskTemplates: ScenarioTaskTemplate[] = [];
        
        // Collect all task IDs from WBS goal chain and siblings
        const wbsTaskIds = new Set<string>();
        for (const goal of goalChain) {
            if (goal.instructions?.workType === 'TASK' && goal.instructions.workId) {
                wbsTaskIds.add(goal.instructions.workId);
            }
        }
        
        // Add task IDs from preceding siblings
        for (const goal of precedingSiblings) {
            if (goal.instructions?.workId) {
                wbsTaskIds.add(goal.instructions.workId);
            }
        }
        
        // Add task IDs from following siblings
        for (const goal of followingSiblings) {
            if (goal.instructions?.workId) {
                wbsTaskIds.add(goal.instructions.workId);
            }
        }

        // Traverse the goal chain to collect work templates
        for (const goal of goalChain) {
            if (!goal.instructions || !goal.instructions.workType || !goal.instructions.workId) {
                continue;
            }

            const { workType, workId } = goal.instructions;

            switch (workType) {
                case 'SKILL':
                    // Get skill template from repository
                    // Try to find skill by workId (could be prefix like "CRP" or full name)
                    let skill = skillRepository.getSkillTemplate(workId);
                    
                    // If found directly, use the workId as the skill name
                    if (skill) {
                        skillName = workId;
                        skillTemplate = skill;
                    } else {
                        // If not found by direct ID, try to find by prefix
                        const allSkills = skillRepository.getSkills();
                        for (const resolvedSkillName of allSkills) {
                            const skillData = skillRepository.getSkillTemplate(resolvedSkillName);
                            if (skillData) {
                                // Check if any scenario ID starts with the workId prefix
                                const hasMatchingPrefix = skillData.scenarios.some(s => 
                                    s.id && s.id.startsWith(workId + '.')
                                );
                                // Also check if the skill name itself matches
                                if (hasMatchingPrefix || resolvedSkillName === workId) {
                                    skill = skillData;
                                    skillName = resolvedSkillName; // Store the actual resolved skill name
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (skill) {
                        skillTemplate = skill;
                    }
                    break;

                case 'SCENARIO':
                    // Find scenario template within the skill
                    if (skillTemplate) {
                        const scenario = skillTemplate.scenarios.find(s => s.id === workId);
                        if (scenario) {
                            scenarioTemplate = scenario;
                        }
                    }
                    break;

                case 'TASK':
                    // Process tasks after we have the scenario
                    // We'll handle this in a second pass after we have all the templates
                    break;
            }
        }

        // Return null if we don't have at least skill template
        if (!skillTemplate) {
            return null;
        }

        // Now categorize tasks if we have a scenario
        if (scenarioTemplate && wbsTaskIds.size > 0) {
            // Find the first WBS task to determine current task
            let currentTaskId: string | null = null;
            for (const goal of goalChain) {
                if (goal.instructions?.workType === 'TASK' && goal.instructions.workId) {
                    currentTaskId = goal.instructions.workId;
                    break;  // Take the first task as current
                }
            }
            
            if (currentTaskId) {
                const currentIndex = scenarioTemplate.tasks.findIndex(t => t.id === currentTaskId);
                if (currentIndex !== -1) {
                    // Current task
                    currentTaskTemplate = scenarioTemplate.tasks[currentIndex];
                    
                    // Preceding tasks (that are also in WBS)
                    for (let i = 0; i < currentIndex; i++) {
                        if (wbsTaskIds.has(scenarioTemplate.tasks[i].id)) {
                            precedingTaskTemplates.push(scenarioTemplate.tasks[i]);
                        }
                    }
                    
                    // Following tasks (that are also in WBS)
                    for (let i = currentIndex + 1; i < scenarioTemplate.tasks.length; i++) {
                        if (wbsTaskIds.has(scenarioTemplate.tasks[i].id)) {
                            followingTaskTemplates.push(scenarioTemplate.tasks[i]);
                        }
                    }
                }
            }
        }

        return {
            skillName,
            skillTemplate,
            scenarioTemplate,
            precedingTaskTemplates,
            currentTaskTemplate,
            followingTaskTemplates,
            wbsTaskIds
        };
    }

    /**
     * Create a PromptDriver with resolution-based templates
     * Uses the resolved work item to create a properly filtered driver
     */
    private static createDriverForResolution(
        resolution: WorkItemResolution,
        _goalChain: Goal[],
        precedingSiblings: Goal[],
        followingSiblings: Goal[],
        skillRepository: ISkillsRepository,
        brain: IAgentBrain
    ): PromptDriver | null {
        // Get the skill template
        const skillTemplate = skillRepository.getSkillTemplate(resolution.skillName);
        if (!skillTemplate) {
            console.warn(`Skill template not found for: ${resolution.skillName}`);
            return null;
        }
        
        // Find the scenario
        const scenarioTemplate = skillTemplate.scenarios.find(s => s.id === resolution.scenarioId);
        if (!scenarioTemplate) {
            console.warn(`Scenario ${resolution.scenarioId} not found in skill ${resolution.skillName}`);
            return null;
        }
        
        // Find the current task and categorize siblings
        const currentTaskIndex = scenarioTemplate.tasks.findIndex(t => t.id === resolution.taskId);
        if (currentTaskIndex === -1) {
            console.warn(`Task ${resolution.taskId} not found in scenario ${resolution.scenarioId}`);
            return null;
        }
        
        // Get sibling task IDs from WBS goals
        const siblingTaskIds = new Set<string>();
        [...precedingSiblings, ...followingSiblings].forEach(goal => {
            if (goal.instructions?.workId) {
                siblingTaskIds.add(goal.instructions.workId);
            }
        });
        
        // Filter tasks to include current + WBS siblings
        const filteredTasks = scenarioTemplate.tasks.filter((task, index) => {
            return index === currentTaskIndex || siblingTaskIds.has(task.id);
        });
        
        // Create filtered scenario and skill
        const filteredScenario: ScenarioTemplate = {
            ...scenarioTemplate,
            tasks: filteredTasks
        };
        
        const filteredSkillTemplate: SkillTemplate = {
            ...skillTemplate,
            scenarios: [filteredScenario]
        };
        
        // Create memory repository with filtered skill
        const memoryRepository = new MemorySkillsRepository(
            [filteredSkillTemplate],
            []
        );
        
        return new PromptDriver(brain, memoryRepository);
    }

    /**
     * Create a PromptDriver with only the templates needed for the goal chain
     * 
     * @param goalChain - Array of goals from root to leaf
     * @param skillRepository - Repository to look up skill templates
     * @param brain - The agent brain to use for the PromptDriver
     * @returns PromptDriver with filtered templates or null if no templates found
     */
    public static createGoalChainPromptDriver(
        goalChain: Goal[],
        precedingSiblings: Goal[],
        followingSiblings: Goal[],
        skillRepository: ISkillsRepository,
        brain: IAgentBrain
    ): { driver: PromptDriver, skillName: string } | null {
        // Get the templates from the goal chain and siblings
        const templates = this.getGoalChainSkillTemplates(
            goalChain, 
            precedingSiblings, 
            followingSiblings, 
            skillRepository
        );

        if (!templates || !templates.skillTemplate || !templates.skillName) {
            console.warn(`WbsRoutineHandler failed to get goal chain skill templates.`);
            return null;
        }

        // Create a filtered skill template with only the relevant scenario and tasks
        let filteredSkillTemplate: SkillTemplate;
        
        if (templates.scenarioTemplate) {
            // Combine all tasks in the correct order: preceding, current, following
            const allWbsTasks: ScenarioTaskTemplate[] = [
                ...templates.precedingTaskTemplates,
                ...(templates.currentTaskTemplate ? [templates.currentTaskTemplate] : []),
                ...templates.followingTaskTemplates
            ];
            
            // Create a filtered scenario with all WBS tasks
            const filteredScenario: ScenarioTemplate = {
                ...templates.scenarioTemplate,
                tasks: allWbsTasks
            };
            
            // Create a skill with just the filtered scenario
            filteredSkillTemplate = {
                ...templates.skillTemplate,
                scenarios: [filteredScenario]
            };
        } else {
            // Use the skill as-is if no specific scenario
            filteredSkillTemplate = templates.skillTemplate;
        }

        // Create a memory repository with just this skill
        const memoryRepository = new MemorySkillsRepository(
            [filteredSkillTemplate],
            [] // No additional scenarios needed
        );

        // Create and return the PromptDriver with the resolved skill name
        return {
            driver: new PromptDriver(brain, memoryRepository),
            skillName: templates.skillName
        };
    }

    /**
     * Mark a goal as IN_PROGRESS in the WBS document
     * This will update the goal status and propagate the change up to ancestors
     * 
     * @param goal - The goal to mark as in progress
     * @param wbsDocumentId - The ID of the WBS document containing the goal
     * @param reactor - The reactor instance to submit the action
     * @returns Promise that resolves when the operation is complete
     */
    public static async markInProgress(
        goal: Goal,
        wbsDocumentId: string,
        reactor: IDocumentDriveServer
    ): Promise<void> {
        // Create the markInProgress action
        const action = actions.markInProgress({
            id: goal.id
        });

        // Submit the action to the reactor
        const result = await reactor.addAction(wbsDocumentId, action);
        
        // Check if the operation was successful
        if (!result || result.error) {
            throw new Error(
                `Failed to mark goal ${goal.id} as IN_PROGRESS: ${
                    result?.error?.message || 'Unknown error'
                }`
            );
        }
    }

    /**
     * Mark a goal as DONE (completed) in the WBS document
     * This will update the goal status and propagate the change up to ancestors
     * 
     * @param goal - The goal to mark as completed
     * @param wbsDocumentId - The ID of the WBS document containing the goal
     * @param reactor - The reactor instance to submit the action
     * @returns Promise that resolves when the operation is complete
     */
    public static async markCompleted(
        goal: Goal,
        wbsDocumentId: string,
        reactor: IDocumentDriveServer
    ): Promise<void> {
        //console.log(`Marking goal ${goal.id} as DONE: ${goal.description}`);
        
        let skipUpdate = false;
        const currentWbs = await reactor.getDocument(wbsDocumentId) as WorkBreakdownStructureDocument;
        const currentGoal = currentWbs.state.global.goals.find(g => g.id === goal.id);

        if (currentGoal) {
            if (currentGoal.status !== "IN_PROGRESS") {
                //console.log(" Processed goal status is no longer IN_PROGRESS. Skipping status update.", currentGoal);
                skipUpdate = true;
            }
        }

        if (!skipUpdate) {
            // Create the markCompleted action
            const action = actions.markCompleted({
                id: goal.id
            });

            // Submit the action to the reactor
            const result = await reactor.addAction(wbsDocumentId, action);
            
            // Check if the operation was successful
            if (!result || result.error) {
                throw new Error(
                    `Failed to mark goal ${goal.id} as COMPLETED: ${
                        result?.error?.message || 'Unknown error'
                    }`
                );
            }
        }        
    }

    /**
     * Mark a goal as BLOCKED in the WBS document
     * This will update the goal status to indicate it cannot proceed
     * 
     * @param goal - The goal to mark as blocked
     * @param wbsDocumentId - The ID of the WBS document containing the goal
     * @param reactor - The reactor instance to submit the action
     * @returns Promise that resolves when the operation is complete
     */
    public static async markBlocked(
        goal: Goal,
        wbsDocumentId: string,
        reactor: IDocumentDriveServer
    ): Promise<void> {
        console.log(`Marking goal ${goal.id} as BLOCKED: ${goal.description}`);
        
        // Create the reportBlocked action
        const action = actions.reportBlocked({
            id: goal.id,
            type: "OTHER",
            comment: "Failed to execute the WBS task produced by WbsRoutineHandler."
        });

        // Submit the action to the reactor
        const result = await reactor.addAction(wbsDocumentId, action);
        
        // Check if the operation was successful
        if (!result || result.error) {
            throw new Error(
                `Failed to mark goal ${goal.id} as BLOCKED: ${
                    result?.error?.message || 'Unknown error'
                }`
            );
        }
    }

}