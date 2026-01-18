/**
 * Structure for template variables extracted from Handlebars templates
 */
export interface TemplateVars {
  text: string;    // Original template text with Handlebars placeholders
  vars: string[];  // Extracted variable names (e.g., ["documents.driveId", "thread.id"])
}

export interface ScenarioTaskTemplate<TContext = any> {
  id: string;
  title: string;
  content: (context?: TContext) => string;
  contentText?: string;  // Raw template text
  contentVars?: TemplateVars;  // Variable structure
  expectedOutcome?: (context?: TContext) => string;
  expectedOutcomeText?: string;  // Raw template text
  expectedOutcomeVars?: TemplateVars;  // Variable structure
}

export interface ScenarioTemplate<TContext = any> {
  id: string;
  title: string;
  preamble?: (context?: TContext) => string;
  preambleText?: string;  // Raw template text
  preambleVars?: TemplateVars;  // Variable structure
  tasks: ScenarioTaskTemplate<TContext>[];
  expectedOutcome?: (context?: TContext) => string;
  expectedOutcomeText?: string;  // Raw template text
  expectedOutcomeVars?: TemplateVars;  // Variable structure
}

export interface SkillTemplate<TContext = any> {
  name: string;
  preamble?: (context?: TContext) => string;
  preambleText?: string;  // Raw template text
  preambleVars?: TemplateVars;  // Variable structure
  scenarios: ScenarioTemplate<TContext>[];
  expectedOutcome?: (context?: TContext) => string;
  expectedOutcomeText?: string;  // Raw template text
  expectedOutcomeVars?: TemplateVars;  // Variable structure
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