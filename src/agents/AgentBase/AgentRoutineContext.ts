import { Goal } from "powerhouse-agent/document-models/work-breakdown-structure";
import { PromptDriver } from "../../prompts/PromptDriver.js";

export class AgentRoutineContext {
    private driver: PromptDriver;

    private skill: {
        name: string;
        preambleSent: boolean;
    };

    private scenario: {
        id: string;
        preambleSent: boolean;
    };

    private tasks: {
        id: string;
        preambleSent: boolean;
        completed: boolean;
    }[];

    constructor(goalChain: Goal[], priorTasks: string[], driver: PromptDriver, resolvedSkillName: string) {
        this.skill = {
            name: resolvedSkillName,
            preambleSent: false,
        };

        this.scenario = {
            id: goalChain.find(g => g.instructions?.workType === 'SCENARIO')?.instructions?.workId || 'UNKNOWN',
            preambleSent: false,
        };

        this.tasks = priorTasks.map(t => ({
            id: t,
            preambleSent: false,
            completed: true,
        }));

        this.tasks.push(...goalChain.filter(g => g.instructions?.workType === "TASK").map(g => ({ 
            id: g.instructions?.workId || 'UNKNOWN',
            preambleSent: false,
            completed: false,
        })));

        this.driver = driver;
    }

    /**
     * Get required variables for the current scenario
     */
    public getRequiredVariables(): string[] {
        return this.driver.getRepository().getScenarioRequiredVariables(this.skill.name, this.scenario.id);
    }

    /**
     * Collect required variables (placeholder for now)
     * TODO: Implement actual variable collection from documents
     */
    private async collectVariables(): Promise<Record<string, any>> {
        const requiredVars = this.getRequiredVariables();
        const variables: Record<string, any> = {};
        
        // TODO

        return variables;
    }

    /**
     * Setup context by sending preambles and completed tasks overview
     */
    public async setup(sessionId: string | null = null): Promise<void> {
        // Collect variables first
        const variables = await this.collectVariables();
        
        if (sessionId) {
            this.driver.continueSession(sessionId);
        }

        // Send skill preamble if not sent
        if (!this.skill.preambleSent) {
            await this.driver.sendSkillPreamble(this.skill.name, variables);
            this.skill.preambleSent = true;
        }
        
        // Send scenario preamble if not sent
        if (!this.scenario.preambleSent) {
            await this.driver.sendScenarioBriefing(this.skill.name, this.scenario.id, variables);
            this.scenario.preambleSent = true;
        }
        
        // Send overview of completed tasks
        const completedTasks = this.tasks.filter(t => t.completed);
        if (completedTasks.length > 0) {
            // Wait with the implementation of this
            //await this.sendCompletedTasksOverview(, completedTasks, variables);
            // Mark all completed tasks as having preamble sent
            completedTasks.forEach(t => t.preambleSent = true);
        }
    }

    /**
     * Get the prompt driver for execution
     */
    public getPromptDriver(): PromptDriver {
        return this.driver;
    }

    /**
     * Get skill information
     */
    public getSkill(): { name: string; preambleSent: boolean } {
        return this.skill;
    }
    
    /**
     * Get scenario information
     */
    public getScenario(): { id: string; preambleSent: boolean } {
        return this.scenario;
    }
    
    /**
     * Check if this context matches another context
     */
    public needsContextChange(other: AgentRoutineContext): 'none' | 'scenario' | 'full' {
        if (this.getSkill().name === other.getSkill().name) {
            if (this.getScenario().id === other.getScenario().id) {
                return 'none';
            } else {
                return 'scenario';
            }
        }

        return 'full';
    }
    
    /**
     * Check if this context matches a goal chain
     * @deprecated Use matchesContext instead
     */
    public matchesGoalChain(goalChain: Goal[]): boolean {
        // Compare skill and scenario IDs
        const newSkill = goalChain.find(g => g.instructions?.workType === 'SKILL')?.instructions?.workId;
        const newScenario = goalChain.find(g => g.instructions?.workType === 'SCENARIO')?.instructions?.workId;
        
        return this.skill.name === newSkill && this.scenario.id === newScenario;
    }

    /**
     * Track task completion
     */
    public markTaskComplete(taskId: string): void {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = true;
        }
    }

    /**
     * Check if all tasks are complete
     */
    public isComplete(): boolean {
        return this.tasks.every(t => t.completed);
    }
}