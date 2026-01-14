import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { pathToFileURL } from 'url';
import { 
  PromptScenario, 
  ScenarioSkill, 
  ScenarioMetadata,
  ScenarioTask
} from './types.js';

export class PromptRepository {
  private scenarios: Map<string, PromptScenario> = new Map();
  private skills: Map<string, ScenarioSkill> = new Map();
  private metadata: Map<string, ScenarioMetadata> = new Map();
  private basePath: string;

  constructor(basePath: string = './build/prompts') {
    this.basePath = path.resolve(basePath);
  }

  /**
   * Load all scenario JS modules from the repository
   */
  async load(): Promise<void> {
    // Clear existing data
    this.scenarios.clear();
    this.skills.clear();
    this.metadata.clear();

    // Ensure base path exists
    if (!await fs.pathExists(this.basePath)) {
      throw new Error(`Prompt repository path does not exist: ${this.basePath}`);
    }

    // Find all JS files
    const pattern = '**/*.js';
    const jsFiles = await glob(pattern, {
      cwd: this.basePath,
      absolute: false
    });

    if (jsFiles.length === 0) {
      console.warn(`No scenario files found in ${this.basePath}`);
      return;
    }

    // Load each JS module
    for (const relativePath of jsFiles) {
      await this.loadScenarioFile(relativePath);
    }
  }

  /**
   * Load a single scenario module
   */
  private async loadScenarioFile(relativePath: string): Promise<void> {
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

      // Create a static version for storage (render with empty context)
      // The tasks have content functions that need to be called
      const content: PromptScenario = {
        id: promptDoc.id,
        title: promptDoc.title,
        preamble: promptDoc.preamble ? 
          (typeof promptDoc.preamble === 'function' ? promptDoc.preamble({}) : promptDoc.preamble) : 
          undefined,
        tasks: promptDoc.tasks.map((task: any) => ({
          id: task.id,
          title: task.title,
          content: typeof task.content === 'function' ? task.content({}) : task.content
        }))
      };

      // Determine skill from directory structure
      const skill = this.getSkillFromPath(relativePath);
      
      // Store the scenario
      const scenarioKey = this.generateScenarioKey(skill, content.id);
      this.scenarios.set(scenarioKey, content);

      // Update skill
      if (!this.skills.has(skill)) {
        this.skills.set(skill, {
          name: skill,
          scenarios: []
        });
      }
      this.skills.get(skill)!.scenarios.push(content);

      // Store metadata
      this.metadata.set(scenarioKey, {
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
   * Load and render a scenario with context
   */
  async loadScenarioWithContext(relativePath: string, context: any = {}): Promise<PromptScenario | null> {
    const fullPath = path.join(this.basePath, relativePath);
    
    try {
      // Import the module
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      
      // Check if module has a render function
      if (module.render && typeof module.render === 'function') {
        // Use the render function which applies context
        return module.render(context);
      } else if (module.default) {
        // Fall back to default export with manual rendering
        const promptDoc = module.default;
        return {
          id: promptDoc.id,
          title: promptDoc.title,
          preamble: promptDoc.preamble ? 
            (typeof promptDoc.preamble === 'function' ? promptDoc.preamble(context) : promptDoc.preamble) : 
            undefined,
          tasks: promptDoc.tasks.map((task: any) => ({
            id: task.id,
            title: task.title,
            content: typeof task.content === 'function' ? task.content(context) : task.content
          }))
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to load scenario with context ${relativePath}:`, error);
      return null;
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
  getAllScenarios(): PromptScenario[] {
    return Array.from(this.scenarios.values());
  }

  /**
   * Get a specific scenario by key
   */
  getScenario(key: string): PromptScenario | undefined {
    return this.scenarios.get(key);
  }

  /**
   * Get a scenario by skill and ID
   */
  getScenarioBySkillAndId(skill: string, id: string): PromptScenario | undefined {
    const key = this.generateScenarioKey(skill, id);
    return this.scenarios.get(key);
  }

  /**
   * Get all skills
   */
  getSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Get all scenarios in a skill
   */
  getScenariosBySkill(skill: string): PromptScenario[] {
    return this.skills.get(skill)?.scenarios || [];
  }

  /**
   * Get metadata for all scenarios
   */
  getAllMetadata(): ScenarioMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get metadata for a specific scenario
   */
  getMetadata(key: string): ScenarioMetadata | undefined {
    return this.metadata.get(key);
  }

  /**
   * Search for scenarios by ID pattern
   */
  findScenariosByPattern(pattern: string): PromptScenario[] {
    const regex = new RegExp(pattern, 'i');
    return this.getAllScenarios().filter(s => regex.test(s.id));
  }

  /**
   * Get next scenario in sequence (e.g., DM.00 -> DM.01)
   */
  getNextScenario(currentKey: string): PromptScenario | undefined {
    const current = this.getScenario(currentKey);
    if (!current) return undefined;

    // Parse current ID to find next
    const match = current.id.match(/^([A-Z]+)\.(\d+)$/);
    if (!match) return undefined;

    const prefix = match[1];
    const currentNum = parseInt(match[2], 10);
    const nextId = `${prefix}.${String(currentNum + 1).padStart(2, '0')}`;

    // Try to find in same skill first
    const metadata = this.getMetadata(currentKey);
    if (metadata) {
      const nextInSkill = this.getScenarioBySkillAndId(metadata.skill, nextId);
      if (nextInSkill) return nextInSkill;
    }

    // Try default skill
    return this.getScenario(nextId);
  }

  /**
   * Get a specific task from a scenario
   */
  getTask(scenarioKey: string, taskId: string): ScenarioTask | undefined {
    const scenario = this.getScenario(scenarioKey);
    return scenario?.tasks.find(t => t.id === taskId);
  }

  /**
   * Check if repository has been loaded
   */
  isLoaded(): boolean {
    return this.scenarios.size > 0;
  }

  /**
   * Reload all scenarios from disk
   */
  async reload(): Promise<void> {
    await this.load();
  }
}