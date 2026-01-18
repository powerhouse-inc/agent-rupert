import { Goal } from "powerhouse-agent/document-models/work-breakdown-structure";
import { PromptDriver } from "../../prompts/PromptDriver.js";

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

    public getRequiredVariables(): string[] {
        return this.driver.getRepository().getScenarioRequiredVariables(this.skill.name, this.scenario.id);
    }

    
}