import { Goal } from "powerhouse-agent/document-models/work-breakdown-structure";
import { PromptDriver } from "../../prompts/PromptDriver.js";
import type { IAgentBrain } from "../IAgentBrain.js";

export class AgentRoutineContext {
    private driver: PromptDriver;
    private sessionId: string | null = null;

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

    constructor(goalChain: Goal[], priorTasks: string[], driver: PromptDriver) {
        this.skill = {
            name: goalChain.find(g => g.instructions?.workType === 'SKILL')?.instructions?.workId || 'default',
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
        
        // TODO: Implement variable collection
        // - documents.* from reactor/drive
        // - message.* from inbox  
        // - thread.* from inbox
        // - stakeholder.* from inbox
        
        console.log(`Need to collect ${requiredVars.length} variables:`, requiredVars);
        
        return variables;
    }

    /**
     * Setup context by sending preambles and completed tasks overview
     */
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
            
            // Mark all completed tasks as having preamble sent
            completedTasks.forEach(t => t.preambleSent = true);
        }
    }

    /**
     * Send skill preamble
     */
    private async sendSkillPreamble(brain: IAgentBrain, variables: Record<string, any>): Promise<void> {
        const preamble = this.driver.getRepository().getSkillPreamble(this.skill.name, variables);
        if (preamble) {
            console.log(`Sending skill preamble for ${this.skill.name}`);
            // TODO: Actually send to brain when brain interface supports it
            // await brain.sendMessage(preamble);
        }
    }

    /**
     * Send scenario preamble
     */
    private async sendScenarioPreamble(brain: IAgentBrain, variables: Record<string, any>): Promise<void> {
        const scenarioKey = this.driver.getRepository().generateScenarioKey(this.skill.name, this.scenario.id);
        const scenario = this.driver.getRepository().getScenarioByKey(scenarioKey, variables);
        if (scenario?.preamble) {
            console.log(`Sending scenario preamble for ${this.scenario.id}`);
            // TODO: Actually send to brain when brain interface supports it
            // await brain.sendMessage(scenario.preamble);
        }
    }

    /**
     * Send overview of what's already been done
     */
    private async sendCompletedTasksOverview(
        brain: IAgentBrain, 
        completedTasks: Array<{id: string, completed: boolean, preambleSent: boolean}>,
        variables: Record<string, any>
    ): Promise<void> {
        const message = `The following tasks have already been completed:\n${
            completedTasks.map(t => `- ${t.id}`).join('\n')
        }\n\nContinuing with the remaining tasks...`;
        
        console.log('Sending completed tasks overview:', message);
        // TODO: Actually send to brain when brain interface supports it
        // await brain.sendMessage(message);
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
    public matchesContext(other: AgentRoutineContext): boolean {
        // Compare if they represent the same skill and scenario
        return this.getSkill().name === other.getSkill().name && 
               this.getScenario().id === other.getScenario().id;
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