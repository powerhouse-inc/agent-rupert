export interface ScenarioTaskTemplate<TContext = any> {
  id: string;
  title: string;
  content: (context?: TContext) => string;
  contentText?: string;  // Raw template text
  contentVars?: any;  // Variable structure
  expectedOutcome?: (context?: TContext) => string;
  expectedOutcomeText?: string;  // Raw template text
  expectedOutcomeVars?: any;  // Variable structure
}

export interface ScenarioTemplate<TContext = any> {
  id: string;
  title: string;
  preamble?: (context?: TContext) => string;
  preambleText?: string;  // Raw template text
  preambleVars?: any;  // Variable structure
  tasks: ScenarioTaskTemplate<TContext>[];
  expectedOutcome?: (context?: TContext) => string;
  expectedOutcomeText?: string;  // Raw template text
  expectedOutcomeVars?: any;  // Variable structure
}

export interface SkillTemplate<TContext = any> {
  name: string;
  preamble?: (context?: TContext) => string;
  preambleText?: string;  // Raw template text
  preambleVars?: any;  // Variable structure
  scenarios: ScenarioTemplate<TContext>[];
  expectedOutcome?: (context?: TContext) => string;
  expectedOutcomeText?: string;  // Raw template text
  expectedOutcomeVars?: any;  // Variable structure
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

// Template with variables structure
export interface TemplateWithVars {
  text: string;
  vars?: string[];
  sections?: Array<{
    type: string;
    params: string;
    vars?: string[];
    sections?: any[];
  }>;
}

// Information types (no functions)
export interface TaskInfo {
  id: string;
  title: string;
  template: TemplateWithVars | string;  // Can be string for backwards compatibility
  expectedOutcome?: TemplateWithVars | string;
}

export interface ScenarioInfo {
  id: string;
  title: string;
  hasPreamble: boolean;
  preambleTemplate?: TemplateWithVars | string;
  expectedOutcome?: TemplateWithVars | string;
  tasks: TaskInfo[];
}

export interface SkillInfo {
  id: string;
  name: string;
  hasPreamble: boolean;
  preambleTemplate?: TemplateWithVars | string;
  expectedOutcome?: TemplateWithVars | string;
  scenarios: ScenarioInfo[];
}