import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { pathToFileURL } from 'url';
import { SkillsRepositoryBase } from './SkillsRepositoryBase.js';
import type { 
  ScenarioTemplate, 
  SkillTemplate, 
  ScenarioTaskTemplate,
} from './types.js';

/**
 * File-based implementation of Skills Repository
 * Loads templates from JavaScript files on the filesystem
 */
export class FileSkillsRepository extends SkillsRepositoryBase {
  private basePath: string;
  
  constructor(basePath: string = './build/prompts') {
    super();
    this.basePath = path.resolve(basePath);
  }

  /**
   * Override generateScenarioKey for file-based paths
   */
  generateScenarioKey(skill: string, id: string): string {
    return skill === 'default' ? id : `${skill}/${id}`;
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
      this.loaded = true;
      return;
    }

    // Load all scenario templates
    await Promise.all(jsFiles.map(file => this.loadScenarioTemplate(file)));

    // Load all skill preambles
    const preambleFiles = await glob('**/.preamble.js', {
      cwd: this.basePath,
      absolute: false
    });
    await Promise.all(preambleFiles.map(file => this.loadSkillPreamble(file)));

    // Load all skill expected outcomes  
    const resultFiles = await glob('**/.result.js', {
      cwd: this.basePath,
      absolute: false
    });
    await Promise.all(resultFiles.map(file => this.loadSkillExpectedOutcome(file)));

    this.loaded = true;
    console.log(`Loaded ${this.skills.size} skills with ${this.scenarioTemplates.size} scenarios`);
  }

  /**
   * Load a single scenario module
   */
  private async loadScenarioTemplate(relativePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, relativePath);
    
    try {
      // Import the ES module
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      
      // Get the default export which contains our scenario template
      const template = module.default;
      
      // Validate that it has the expected structure
      if (!template || !template.id || !template.title || !template.tasks) {
        console.warn(`Invalid scenario structure in ${relativePath}`);
        return;
      }

      // Extract skill from path
      const skill = this.getSkillFromPath(relativePath);
      
      // Store in main templates map
      const scenarioKey = this.generateScenarioKey(skill, template.id);
      this.scenarioTemplates.set(scenarioKey, template);
      
      // Store metadata for quick lookup
      this.scenarioMetaData.set(scenarioKey, {
        id: template.id,
        title: template.title,
        skill: skill,
        taskCount: template.tasks.length,
        filePath: relativePath
      });

      // Also add to skill-specific collection
      if (!this.skills.has(skill)) {
        this.skills.set(skill, {
          name: skill,
          scenarios: []
        });
      }
      this.skills.get(skill)!.scenarios.push(template);
      
    } catch (error) {
      console.error(`Failed to load scenario ${relativePath}:`, error);
    }
  }

  /**
   * Load skill preamble function
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
      skill.preambleText = preambleDoc.preambleText;
      skill.preambleVars = preambleDoc.preambleVars;
      
    } catch (error) {
      console.error(`Failed to load skill preamble ${relativePath}:`, error);
    }
  }

  /**
   * Load skill expected outcome function
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
      skill.expectedOutcomeText = resultDoc.expectedOutcomeText;
      skill.expectedOutcomeVars = resultDoc.expectedOutcomeVars;
      
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
}