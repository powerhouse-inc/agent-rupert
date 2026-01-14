export interface ScenarioTask {
  id: string;
  title: string;
  content: (context?: any) => string;
}

export interface PromptScenario {
  id: string;
  title: string;
  preamble?: (context?: any) => string;
  tasks: ScenarioTask[];
}

export interface ScenarioSkill {
  name: string;
  preamble?: (context?: any) => string;
  scenarios: PromptScenario[];
}

export interface SkillPreamble {
  skill: string;
  preamble: (context?: any) => string;
}

export interface ScenarioMetadata {
  id: string;
  title: string;
  skill: string;
  taskCount: number;
  filePath: string;
}