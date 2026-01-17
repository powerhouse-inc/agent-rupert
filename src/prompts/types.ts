export interface ScenarioTaskTemplate<TContext = any> {
  id: string;
  title: string;
  content: (context?: TContext) => string;
  expectedOutcome?: (context?: TContext) => string;
}

export interface ScenarioTemplate<TContext = any> {
  id: string;
  title: string;
  preamble?: (context?: TContext) => string;
  tasks: ScenarioTaskTemplate<TContext>[];
  expectedOutcome?: (context?: TContext) => string;
}

export interface SkillTemplate<TContext = any> {
  name: string;
  preamble?: (context?: TContext) => string;
  scenarios: ScenarioTemplate<TContext>[];
  expectedOutcome?: (context?: TContext) => string;
}

// Rendered versions without functions
export interface RenderedScenarioTask {
  id: string;
  title: string;
  content: string;
  expectedOutcome?: string;
}

export interface RenderedScenario {
  id: string;
  title: string;
  preamble?: string;
  tasks: RenderedScenarioTask[];
  expectedOutcome?: string;
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
  expectedOutcome?: string;
}

export interface ScenarioInfo {
  id: string;
  title: string;
  hasPreamble: boolean;
  expectedOutcome?: string;
  tasks: TaskInfo[];
}

export interface SkillInfo {
  id: string;
  name: string;
  hasPreamble: boolean;
  expectedOutcome?: string;
  scenarios: ScenarioInfo[];
}