export interface ScenarioTaskTemplate<TContext = any> {
  id: string;
  title: string;
  content: (context?: TContext) => string;
}

export interface ScenarioTemplate<TContext = any> {
  id: string;
  title: string;
  preamble?: (context?: TContext) => string;
  tasks: ScenarioTaskTemplate<TContext>[];
}

export interface SkillTemplate<TContext = any> {
  name: string;
  preamble?: (context?: TContext) => string;
  scenarios: ScenarioTemplate<TContext>[];
}

// Rendered versions without functions
export interface RenderedScenarioTask {
  id: string;
  title: string;
  content: string;
}

export interface RenderedScenario {
  id: string;
  title: string;
  preamble?: string;
  tasks: RenderedScenarioTask[];
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

// Information types (no functions)
export interface TaskInfo {
  id: string;
  title: string;
}

export interface ScenarioInfo {
  id: string;
  title: string;
  tasks: TaskInfo[];
}

export interface SkillInfo {
  name: string;
  scenarios: ScenarioInfo[];
}