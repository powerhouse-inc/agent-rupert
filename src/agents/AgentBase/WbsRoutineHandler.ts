import { WorkBreakdownStructureDocument, Goal, actions } from "powerhouse-agent/document-models/work-breakdown-structure";
import { WorkItemParams, WorkItemType } from "./AgentRoutine.js";
import type { IDocumentDriveServer } from "document-drive";
import type { SkillsRepository } from "../../prompts/SkillsRepository.js";
import type { SkillInfo, ScenarioInfo, TaskInfo } from "../../prompts/types.js";

export class WbsRoutineHandler {
    
    /**
     * Get the next work item from the WBS document
     * Finds the next eligible goal, marks it as IN_PROGRESS, and returns an idle work item
     * TODO: Implement actual WBS goal processing to return appropriate work items
     */
    public static async getNextWorkItem(
        wbs: WorkBreakdownStructureDocument,
        reactor: IDocumentDriveServer,
        skillsRepository: SkillsRepository
    ): Promise<{ type: WorkItemType, params: WorkItemParams } | null> {
        // Find the next goal to work on (returns ancestor chain)
        const goalChain = this.findNextGoal(wbs);
        
        if (goalChain && goalChain.length > 0) {
            // The actual goal is the last element in the chain
            const nextGoal = goalChain[goalChain.length - 1];
            
            if (nextGoal.status === "TODO") {
                try {
                    // Mark the goal as IN_PROGRESS
                    await this.markInProgress(nextGoal, wbs.header.id, reactor);
                    console.log(`Marked goal ${nextGoal.id} as IN_PROGRESS: ${nextGoal.description}`);
                    
                    // Log the full ancestor chain for context
                    const chainDescription = goalChain.map(g => g.description).join(' > ');
                    console.log(`Goal chain: ${chainDescription}`);
                    
                    // Collect and log context information if repository is available
                    if (skillsRepository) {
                        // Debug: Log goal instructions
                        console.log('\n=== Goal Instructions Debug ===');
                        goalChain.forEach((goal, index) => {
                            console.log(`Goal ${index}: ${goal.description}`);
                            if (goal.instructions) {
                                console.log(`  - workType: ${goal.instructions.workType || 'undefined'}`);
                                console.log(`  - workId: ${goal.instructions.workId || 'undefined'}`);
                                console.log(`  - comments: ${goal.instructions.comments || 'undefined'}`);
                            } else {
                                console.log('  - No instructions');
                            }
                        });
                        console.log('================================\n');
                        
                        const contextInfo = this.collectContextInfo(wbs, goalChain, skillsRepository);
                        if (contextInfo) {
                            console.log('\n=== Task Context Information ===');
                            console.log('Skill:', contextInfo.skillInfo?.name || 'None');
                            console.log('Scenario:', contextInfo.scenarioInfo?.title || 'None');
                            console.log('Current Task:', contextInfo.taskInfo?.title || 'None');
                            console.log('Preceding Tasks:', contextInfo.precedingTasksInfo.map(t => t.title).join(', ') || 'None');
                            console.log('================================\n');
                        } else {
                            console.log('No context information available for this goal chain');
                        }
                    }
                } catch (error) {
                    console.error(`Failed to mark goal ${nextGoal.id} as IN_PROGRESS:`, error);
                    // Continue even if marking fails - we still want to return a work item
                }
            }
        }
        
        // For now, still return an idle work item
        // In the future, this would create appropriate work items based on the goal's instructions
        return {
            type: 'idle',
            params: {}
        };
    }

    /**
     * Find the next goal to work on by traversing the goal tree
     * Returns the ancestor chain with the first eligible leaf node as the final element
     * 
     * @param wbs - The Work Breakdown Structure document
     * @returns Array of goals from root ancestor to the eligible leaf, or null if none found
     */
    public static findNextGoal(wbs: WorkBreakdownStructureDocument): Goal[] | null {
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

        // Traverse goals in order to find the first eligible leaf
        for (const goal of goals) {
            if (isLeafGoal(goal) && isEligibleForWork(goal)) {
                return getAncestorChain(goal);
            }
        }

        return null;
    }

    /**
     * Collect context information from the goal chain
     * Traverses the chain to extract skill, scenario, and task information
     * 
     * @param wbs - The Work Breakdown Structure document
     * @param goalChain - Array of goals from root to leaf
     * @param skillRepository - Repository to look up skill information
     * @returns Object containing skill, scenario, and task context or null
     */
    public static collectContextInfo(
        wbs: WorkBreakdownStructureDocument,
        goalChain: Goal[],
        skillRepository: SkillsRepository
    ): {
        skillInfo: SkillInfo | null,
        scenarioInfo: ScenarioInfo | null,
        precedingTasksInfo: TaskInfo[],
        taskInfo: TaskInfo | null
    } | null {
        if (!goalChain || goalChain.length === 0) {
            return null;
        }

        let skillInfo: SkillInfo | null = null;
        let scenarioInfo: ScenarioInfo | null = null;
        let taskInfo: TaskInfo | null = null;
        const precedingTasksInfo: TaskInfo[] = [];

        // Traverse the goal chain to collect work information
        for (const goal of goalChain) {
            if (!goal.instructions || !goal.instructions.workType || !goal.instructions.workId) {
                continue;
            }

            const { workType, workId } = goal.instructions;

            switch (workType) {
                case 'SKILL':
                    // Get skill information from repository
                    // Try to find skill by workId (could be prefix like "CRP" or full name)
                    let skill = skillRepository.getSkillInformation(workId);
                    
                    // If not found by direct ID, try to find by prefix
                    if (!skill) {
                        // Get all skills and find one that matches the prefix
                        const allSkills = skillRepository.getSkills();
                        for (const skillName of allSkills) {
                            const skillData = skillRepository.getSkillInformation(skillName);
                            if (skillData) {
                                // Check if any scenario ID starts with the workId prefix
                                const hasMatchingPrefix = skillData.scenarios.some(s => 
                                    s.id && s.id.startsWith(workId + '.')
                                );
                                if (hasMatchingPrefix || skillData.id === workId) {
                                    skill = skillData;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (skill) {
                        skillInfo = skill;
                    }
                    break;

                case 'SCENARIO':
                    // Find scenario within the skill
                    if (skillInfo) {
                        const scenario = skillInfo.scenarios.find(s => s.id === workId);
                        if (scenario) {
                            scenarioInfo = scenario;
                        }
                    }
                    break;

                case 'TASK':
                    // Find task within the scenario
                    if (scenarioInfo) {
                        const taskIndex = scenarioInfo.tasks.findIndex(t => t.id === workId);
                        if (taskIndex !== -1) {
                            // Collect all preceding tasks
                            precedingTasksInfo.push(...scenarioInfo.tasks.slice(0, taskIndex));
                            // Set the current task
                            taskInfo = scenarioInfo.tasks[taskIndex];
                        }
                    }
                    break;
            }
        }

        // Return null if we don't have at least skill info
        if (!skillInfo) {
            return null;
        }

        return {
            skillInfo,
            scenarioInfo,
            precedingTasksInfo,
            taskInfo
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

}