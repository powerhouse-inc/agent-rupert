import { SkillsRepositoryBase } from './SkillsRepositoryBase.js';
import type { SkillTemplate, ScenarioTemplate } from './types.js';

/**
 * Immutable memory-based implementation of Skills Repository
 * Stores templates directly in memory without file loading
 * Templates cannot be modified after initialization
 */
export class MemorySkillsRepository extends SkillsRepositoryBase {
  private readonly skillTemplates: ReadonlyArray<SkillTemplate>;
  private readonly additionalScenarios: ReadonlyArray<ScenarioTemplate>;

  /**
   * Create an immutable memory-based skills repository
   * @param skillTemplates - Array of skill templates to store
   * @param scenarioTemplates - Optional array of additional standalone scenario templates
   */
  constructor(
    skillTemplates: SkillTemplate[] = [],
    scenarioTemplates: ScenarioTemplate[] = []
  ) {
    super();
    this.skillTemplates = Object.freeze([...skillTemplates]);
    this.additionalScenarios = Object.freeze([...scenarioTemplates]);
    // Automatically load skills on construction
    this.initializeTemplates();
  }

  /**
   * Initialize templates into the repository
   * This is called automatically during construction
   */
  private initializeTemplates(): void {
    // Register all skill templates
    for (const skillTemplate of this.skillTemplates) {
      const skillName = skillTemplate.name;
      this.registerSkill(skillName, skillTemplate);
    }

    // Register any additional standalone scenarios
    for (const scenario of this.additionalScenarios) {
      // Try to find the skill this scenario belongs to based on ID prefix
      let skillName = 'unknown';
      
      // Extract skill prefix from scenario ID if possible (e.g., "CRP.00" -> "CRP")
      const match = scenario.id.match(/^([A-Z]+)\./);
      if (match) {
        const prefix = match[1];
        // Find skill with matching prefix
        for (const [name, skill] of this.skills.entries()) {
          if (skill.scenarios.some(s => s.id.startsWith(prefix + '.'))) {
            skillName = name;
            break;
          }
        }
      }

      const scenarioKey = this.generateScenarioKey(skillName, scenario.id);
      this.scenarioTemplates.set(scenarioKey, scenario);
      
      // Store metadata
      this.scenarioMetaData.set(scenarioKey, {
        id: scenario.id,
        title: scenario.title,
        skill: skillName,
        taskCount: scenario.tasks.length,
        filePath: 'memory://' + scenarioKey
      });
    }

    this.loaded = true;
  }

  /**
   * Load skills - for memory repository, this is a no-op since templates are loaded at construction
   * Kept for interface compatibility
   */
  async loadSkills(): Promise<void> {
    // Templates are already loaded during construction
    // This method exists only for interface compatibility
    return Promise.resolve();
  }
}