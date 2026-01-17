export interface ScenarioTaskTemplate<TContext = any> {
  id: string;
  title: string;
  content: (context?: TContext) => string;
  contentText?: string;  // Raw template text
  expectedOutcome?: (context?: TContext) => string;
  expectedOutcomeText?: string;  // Raw template text
}

export interface ScenarioTemplate<TContext = any> {
  id: string;
  title: string;
  preamble?: (context?: TContext) => string;
  preambleText?: string;  // Raw template text
  tasks: ScenarioTaskTemplate<TContext>[];
  expectedOutcome?: (context?: TContext) => string;
  expectedOutcomeText?: string;  // Raw template text
}

export interface SkillTemplate<TContext = any> {
  name: string;
  preamble?: (context?: TContext) => string;
  preambleText?: string;  // Raw template text
  scenarios: ScenarioTemplate<TContext>[];
  expectedOutcome?: (context?: TContext) => string;
  expectedOutcomeText?: string;  // Raw template text
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
  template: string;  // Raw task template text
  expectedOutcome?: string;
}

export interface ScenarioInfo {
  id: string;
  title: string;
  hasPreamble: boolean;
  preambleTemplate?: string;  // Raw preamble template text
  expectedOutcome?: string;
  tasks: TaskInfo[];
}

export interface SkillInfo {
  id: string;
  name: string;
  hasPreamble: boolean;
  preambleTemplate?: string;  // Raw preamble template text
  expectedOutcome?: string;
  scenarios: ScenarioInfo[];
}