import { WorkBreakdownStructureDocument, Goal, actions } from "powerhouse-agent/document-models/work-breakdown-structure";
import { WorkItemParams, WorkItemType } from "./AgentRoutine.js";
import type { IDocumentDriveServer } from "document-drive";
import type { ISkillsRepository } from "../../prompts/ISkillsRepository.js";
import type { SkillTemplate, ScenarioTemplate, ScenarioTaskTemplate } from "../../prompts/types.js";
import { MemorySkillsRepository } from "../../prompts/MemorySkillsRepository.js";
import { PromptDriver } from "../../prompts/PromptDriver.js";
import type { IAgentBrain } from "../IAgentBrain.js";

export class WbsRoutineHandler {
    
    /**
     * Get the next work item from the WBS document
     * Finds the next eligible goal, marks it as IN_PROGRESS, and returns an idle work item
     * TODO: Implement actual WBS goal processing to return appropriate work items
     */
    public static async getNextWorkItem(
        wbs: WorkBreakdownStructureDocument,
        reactor: IDocumentDriveServer,
        skillsRepository: ISkillsRepository
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
                        
                        const contextInfo = this.getGoalChainSkillTemplates(goalChain, skillsRepository);
                        if (contextInfo) {
                            console.log('\n=== Task Context Information ===');
                            console.log('Skill:', contextInfo.skillTemplate?.name || 'None');
                            console.log('Scenario:', contextInfo.scenarioTemplate?.title || 'None');
                            console.log('Current Task:', contextInfo.taskTemplate?.title || 'None');
                            console.log('Preceding Tasks:', contextInfo.precedingTaskTemplates.map(t => t.title).join(', ') || 'None');
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
     * Get skill templates from the goal chain
     * Traverses the chain to extract skill, scenario, and task templates
     * 
     * @param goalChain - Array of goals from root to leaf
     * @param skillRepository - Repository to look up skill templates
     * @returns Object containing skill, scenario, and task templates or null
     */
    public static getGoalChainSkillTemplates(
        goalChain: Goal[],
        skillRepository: ISkillsRepository
    ): {
        skillTemplate: SkillTemplate | null,
        scenarioTemplate: ScenarioTemplate | null,
        precedingTaskTemplates: ScenarioTaskTemplate[],
        taskTemplate: ScenarioTaskTemplate | null
    } | null {
        if (!goalChain || goalChain.length === 0) {
            return null;
        }

        let skillTemplate: SkillTemplate | null = null;
        let scenarioTemplate: ScenarioTemplate | null = null;
        let taskTemplate: ScenarioTaskTemplate | null = null;
        const precedingTaskTemplates: ScenarioTaskTemplate[] = [];

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
                    
                    // If not found by direct ID, try to find by prefix
                    if (!skill) {
                        // Get all skills and find one that matches the prefix
                        const allSkills = skillRepository.getSkills();
                        for (const skillName of allSkills) {
                            const skillData = skillRepository.getSkillTemplate(skillName);
                            if (skillData) {
                                // Check if any scenario ID starts with the workId prefix
                                const hasMatchingPrefix = skillData.scenarios.some(s => 
                                    s.id && s.id.startsWith(workId + '.')
                                );
                                // Also check if the skill name itself matches
                                if (hasMatchingPrefix || skillName === workId) {
                                    skill = skillData;
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
                    // Find task template within the scenario
                    if (scenarioTemplate) {
                        const taskIndex = scenarioTemplate.tasks.findIndex(t => t.id === workId);
                        if (taskIndex !== -1) {
                            // Collect all preceding task templates
                            precedingTaskTemplates.push(...scenarioTemplate.tasks.slice(0, taskIndex));
                            // Set the current task template
                            taskTemplate = scenarioTemplate.tasks[taskIndex];
                        }
                    }
                    break;
            }
        }

        // Return null if we don't have at least skill template
        if (!skillTemplate) {
            return null;
        }

        return {
            skillTemplate,
            scenarioTemplate,
            precedingTaskTemplates,
            taskTemplate
        };
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
        skillRepository: ISkillsRepository,
        brain: IAgentBrain
    ): PromptDriver | null {
        // Get the templates from the goal chain
        const templates = this.getGoalChainSkillTemplates(goalChain, skillRepository);
        if (!templates || !templates.skillTemplate) {
            return null;
        }

        // Create a filtered skill template with only the relevant scenario
        let filteredSkillTemplate: SkillTemplate;
        
        if (templates.scenarioTemplate) {
            // Create a skill with just the one scenario
            filteredSkillTemplate = {
                ...templates.skillTemplate,
                scenarios: [templates.scenarioTemplate]
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

        // Create and return the PromptDriver
        return new PromptDriver(brain, memoryRepository);
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