export interface ScenarioTask {
  id: string;
  title: string;
  content: string;
}

export interface PromptScenario {
  id: string;
  title: string;
  preamble?: string;
  tasks: ScenarioTask[];
}

export interface ScenarioSkill {
  name: string;
  scenarios: PromptScenario[];
}

export interface ScenarioMetadata {
  id: string;
  title: string;
  skill: string;
  taskCount: number;
  filePath: string;
}