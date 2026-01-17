import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { pathToFileURL } from 'url';
import { 
  ScenarioTemplate, 
  SkillTemplate, 
  ScenarioMetadata,
  ScenarioTaskTemplate,
  RenderedScenario,
  RenderedScenarioTask,
  SkillInfo,
} from './types.js';

export class SkillsRepository {
  private basePath: string;
  private skills: Map<string, SkillTemplate> = new Map();
  private scenarioTemplates: Map<string, ScenarioTemplate> = new Map();
  private scenarioMetaData: Map<string, ScenarioMetadata> = new Map();
  
  constructor(basePath: string = './build/prompts') {
    this.basePath = path.resolve(basePath);
  }

  /**
   * Load all scenario JS modules from the repository
   */
  async loadSkills(): Promise<void> {
    // Clear existing data
    this.skills.clear();
    this.scenarioTemplates.clear();
    this.scenarioMetaData.clear();

    // Ensure base path exists
    if (!await fs.pathExists(this.basePath)) {
      throw new Error(`Prompt repository path does not exist: ${this.basePath}`);
    }

    // Find all JS files, excluding handlebars-helpers.js, preambles and results (we'll load those separately)
    const pattern = '**/*.js';
    const jsFiles = await glob(pattern, {
      cwd: this.basePath,
      absolute: false,
      ignore: ['handlebars-helpers.js', '**/.preamble.js', '**/.result.js']
    });

    if (jsFiles.length === 0) {
      console.warn(`No scenario files found in ${this.basePath}`);
      return;
    }

    // Sort files alphabetically to ensure consistent loading order
    // This ensures scenarios like 00.categorize, 01.wbs-update, 02.send-reply are loaded in order
    jsFiles.sort();

    // Load each JS module
    for (const relativePath of jsFiles) {
      await this.loadScenarioTemplate(relativePath);
    }
    
    // Load skill preambles
    const preambleFiles = await glob('**/.preamble.js', {
      cwd: this.basePath,
      absolute: false
    });
    
    for (const preamblePath of preambleFiles) {
      await this.loadSkillPreamble(preamblePath);
    }
    
    // Load skill expected outcomes (.result.js files)
    const resultFiles = await glob('**/.result.js', {
      cwd: this.basePath,
      absolute: false
    });
    
    for (const resultPath of resultFiles) {
      await this.loadSkillExpectedOutcome(resultPath);
    }
  }

  /**
   * Load a single scenario module
   */
  private async loadScenarioTemplate(relativePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, relativePath);
    
    try {
      // Import the ES module using dynamic import
      // Convert to file URL for Windows compatibility
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      
      // Get the default export which contains our prompt structure
      const promptDoc = module.default;
      
      // Validate structure
      if (!promptDoc || !promptDoc.id || !promptDoc.title || !Array.isArray(promptDoc.tasks)) {
        console.warn(`Invalid scenario structure in ${relativePath}`);
        return;
      }

      // Store the functions directly, not rendered content
      const content: ScenarioTemplate = {
        id: promptDoc.id,
        title: promptDoc.title,
        preamble: promptDoc.preamble ? promptDoc.preamble : undefined,
        expectedOutcome: promptDoc.expectedOutcome ? promptDoc.expectedOutcome : undefined,
        tasks: promptDoc.tasks.map((task: any) => ({
          id: task.id,
          title: task.title,
          content: task.content,  // Store the function itself
          expectedOutcome: task.expectedOutcome ? task.expectedOutcome : undefined
        }))
      };

      // Determine skill from directory structure
      const skill = this.getSkillFromPath(relativePath);
      
      // Store the scenario
      const scenarioKey = this.generateScenarioKey(skill, content.id);
      this.scenarioTemplates.set(scenarioKey, content);

      // Update skill
      if (!this.skills.has(skill)) {
        this.skills.set(skill, {
          name: skill,
          scenarios: []
        });
      }
      this.skills.get(skill)!.scenarios.push(content);

      // Store metadata
      this.scenarioMetaData.set(scenarioKey, {
        id: content.id,
        title: content.title,
        skill,
        taskCount: content.tasks.length,
        filePath: fullPath
      });

    } catch (error) {
      console.error(`Failed to load scenario file ${relativePath}:`, error);
    }
  }

  /**
   * Load a skill preamble module
   */
  private async loadSkillPreamble(relativePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, relativePath);
    
    try {
      // Import the ES module
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      
      // Get the default export which contains our preamble
      const preambleDoc = module.default;
      
      // Validate structure
      if (!preambleDoc || !preambleDoc.skill || !preambleDoc.preamble) {
        console.warn(`Invalid preamble structure in ${relativePath}`);
        return;
      }
      
      // Get or create skill
      const skillName = preambleDoc.skill;
      if (!this.skills.has(skillName)) {
        this.skills.set(skillName, {
          name: skillName,
          scenarios: []
        });
      }
      
      // Add preamble to skill
      const skill = this.skills.get(skillName)!;
      skill.preamble = preambleDoc.preamble;
      
    } catch (error) {
      console.error(`Failed to load skill preamble ${relativePath}:`, error);
    }
  }

  /**
   * Load a skill expected outcome module
   */
  private async loadSkillExpectedOutcome(relativePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, relativePath);
    
    try {
      // Import the ES module
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      
      // Get the default export which contains our expected outcome
      const resultDoc = module.default;
      
      // Validate structure
      if (!resultDoc || !resultDoc.skill || !resultDoc.expectedOutcome) {
        console.warn(`Invalid result structure in ${relativePath}`);
        return;
      }
      
      // Get or create skill
      const skillName = resultDoc.skill;
      if (!this.skills.has(skillName)) {
        this.skills.set(skillName, {
          name: skillName,
          scenarios: []
        });
      }
      
      // Add expected outcome to skill
      const skill = this.skills.get(skillName)!;
      skill.expectedOutcome = resultDoc.expectedOutcome;
      
    } catch (error) {
      console.error(`Failed to load skill expected outcome ${relativePath}:`, error);
    }
  }

  /**
   * Extract skill from file path
   */
  private getSkillFromPath(relativePath: string): string {
    const dir = path.dirname(relativePath);
    return dir === '.' ? 'default' : dir.replace(/\\/g, '/');
  }

  /**
   * Generate a unique key for a scenario
   */
  generateScenarioKey(skill: string, id: string): string {
    return skill === 'default' ? id : `${skill}/${id}`;
  }

  /**
   * Get all loaded scenarios
   */
  getAllScenarios(): ScenarioTemplate[] {
    return Array.from(this.scenarioTemplates.values());
  }

  /**
   * Get a scenario by skill and ID with optional context rendering
   */
  getScenario<TContext = any>(
    skill: string, 
    id: string, 
    context?: TContext
  ): RenderedScenario | undefined {
    const scenarioKey = this.generateScenarioKey(skill, id);
    const scenario = this.scenarioTemplates.get(scenarioKey);
    if (!scenario) return undefined;
    return this.renderScenarioWithContext(scenario, context);
  }

  /**
   * Get a specific scenario by key with optional context rendering
   */
  getScenarioByKey<TContext = any>(
    scenarioKey: string,
    context?: TContext
  ): RenderedScenario | undefined {
    const scenario = this.scenarioTemplates.get(scenarioKey);
    if (!scenario) return undefined;
    return this.renderScenarioWithContext(scenario, context);
  }

  /**
   * Get all skills
   */
  getSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Get scenario IDs for a specific skill
   */
  getScenarioIdsBySkill(skill: string): string[] {
    const skillTemplate = this.skills.get(skill);
    if (!skillTemplate) return [];
    return skillTemplate.scenarios.map(scenario => scenario.id);
  }

  /**
   * Get skill information (no functions, just metadata)
   */
  getSkillInformation(skill: string): SkillInfo | undefined {
    const skillTemplate = this.skills.get(skill);
    if (!skillTemplate) return undefined;
    
    // Extract the prefix from the first scenario's ID (e.g., "CRP.00" -> "CRP")
    let skillId = skill; // Default to skill name if we can't extract prefix
    if (skillTemplate.scenarios.length > 0 && skillTemplate.scenarios[0].id) {
      const match = skillTemplate.scenarios[0].id.match(/^([A-Z]+)\./);
      if (match) {
        skillId = match[1];
      }
    }
    
    return {
      id: skillId,  // Use the extracted prefix as the id
      name: skillTemplate.name,
      hasPreamble: !!skillTemplate.preamble,  // Check if skill preamble function exists
      expectedOutcome: skillTemplate.expectedOutcome ? skillTemplate.expectedOutcome() : undefined,  // Render without context
      scenarios: skillTemplate.scenarios.map(scenario => ({
        id: scenario.id,
        title: scenario.title,
        hasPreamble: !!scenario.preamble,  // Check if scenario preamble function exists
        expectedOutcome: scenario.expectedOutcome ? scenario.expectedOutcome() : undefined,  // Render without context
        tasks: scenario.tasks.map(task => ({
          id: task.id,
          title: task.title,
          expectedOutcome: task.expectedOutcome ? task.expectedOutcome() : undefined  // Render without context
        }))
      }))
    };
  }

  /**
   * Get all scenarios in a skill with optional context rendering
   */
  getScenariosBySkill<TContext = any>(
    skill: string,
    context?: TContext
  ): RenderedScenario[] {
    const scenarios = this.skills.get(skill)?.scenarios || [];
    return scenarios.map(s => this.renderScenarioWithContext(s, context));
  }
  
  /**
   * Internal: Get raw scenario template for classes that handle their own context injection
   * @internal
   */
  getScenarioTemplateInternal(scenarioKey: string): ScenarioTemplate | undefined {
    return this.scenarioTemplates.get(scenarioKey);
  }
  
  /**
   * Internal: Get raw scenario templates for a skill
   * @internal
   */
  getScenarioTemplatesBySkillInternal(skill: string): ScenarioTemplate[] {
    return this.skills.get(skill)?.scenarios || [];
  }

  /**
   * Get skill preamble with optional context rendering
   */
  getSkillPreamble<TContext = any>(
    skill: string,
    context?: TContext
  ): string | undefined {
    const preambleFunc = this.skills.get(skill)?.preamble;
    if (!preambleFunc) return undefined;
    return preambleFunc(context);
  }


  /**
   * Get metadata for all scenarios
   */
  getAllMetadata(): ScenarioMetadata[] {
    return Array.from(this.scenarioMetaData.values());
  }

  /**
   * Get metadata for a specific scenario
   */
  getScenarioMetadata(scenarioKey: string): ScenarioMetadata | undefined {
    return this.scenarioMetaData.get(scenarioKey);
  }

  /**
   * Search for scenarios by ID pattern with optional context
   */
  findScenariosByPattern<TContext = any>(
    pattern: string,
    context?: TContext
  ): RenderedScenario[] {
    const regex = new RegExp(pattern, 'i');
    return this.getAllScenarios()
      .filter(s => regex.test(s.id))
      .map(s => this.renderScenarioWithContext(s, context));
  }

  /**
   * Get next scenario in sequence (e.g., DM.00 -> DM.01) with optional context
   */
  getNextScenario<TContext = any>(
    currentKey: string,
    context?: TContext
  ): RenderedScenario | undefined {
    const current = this.scenarioTemplates.get(currentKey);
    if (!current) return undefined;

    // Parse current ID to find next
    const match = current.id.match(/^([A-Z]+)\.(\d+)$/);
    if (!match) return undefined;

    const prefix = match[1];
    const currentNum = parseInt(match[2], 10);
    const nextId = `${prefix}.${String(currentNum + 1).padStart(2, '0')}`;

    // Try to find in same skill first
    const metadata = this.getScenarioMetadata(currentKey);
    if (metadata) {
      const nextInSkill = this.getScenario(metadata.skill, nextId, context);
      if (nextInSkill) return nextInSkill;
    }

    // Try default skill
    return this.getScenarioByKey(nextId, context);
  }

  /**
   * Get a specific task from a scenario with optional context rendering
   */
  getScenarioTask<TContext = any>(
    scenarioKey: string,
    taskId: string,
    context?: TContext
  ): RenderedScenarioTask | undefined {
    const scenario = this.scenarioTemplates.get(scenarioKey);
    const task = scenario?.tasks.find((t: ScenarioTaskTemplate) => t.id === taskId);
    if (!task) return undefined;
    return this.renderTaskWithContext(task, context);
  }

  /**
   * Check if repository has been loaded
   */
  isLoaded(): boolean {
    return this.scenarioTemplates.size > 0;
  }

  /**
   * Reload all scenarios from disk
   */
  async reload(): Promise<void> {
    await this.loadSkills();
  }

  /**
   * Internal: Render a scenario with context
   */
  private renderScenarioWithContext<TContext = any>(
    scenario: ScenarioTemplate,
    context?: TContext
  ): RenderedScenario {
    return {
      id: scenario.id,
      title: scenario.title,
      preamble: scenario.preamble ? scenario.preamble(context) : undefined,
      expectedOutcome: scenario.expectedOutcome ? scenario.expectedOutcome(context) : undefined,
      tasks: scenario.tasks.map(task => this.renderTaskWithContext(task, context))
    };
  }

  /**
   * Internal: Render a task with context
   */
  private renderTaskWithContext<TContext = any>(
    task: ScenarioTaskTemplate,
    context?: TContext
  ): RenderedScenarioTask {
    return {
      id: task.id,
      title: task.title,
      content: task.content(context),
      expectedOutcome: task.expectedOutcome ? task.expectedOutcome(context) : undefined
    };
  }
}