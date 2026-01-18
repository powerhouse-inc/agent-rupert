import { SkillsRepositoryBase } from './SkillsRepositoryBase.js';
import type { SkillTemplate, ScenarioTemplate } from './types.js';

/**
 * Memory-based implementation of Skills Repository
 * Stores templates directly in memory without file loading
 */
export class MemorySkillsRepository extends SkillsRepositoryBase {
  private skillTemplates: SkillTemplate[];
  private additionalScenarios: ScenarioTemplate[];

  /**
   * Create a memory-based skills repository
   * @param skillTemplates - Array of skill templates to store
   * @param scenarioTemplates - Optional array of additional standalone scenario templates
   */
  constructor(
    skillTemplates: SkillTemplate[] = [],
    scenarioTemplates: ScenarioTemplate[] = []
  ) {
    super();
    this.skillTemplates = skillTemplates;
    this.additionalScenarios = scenarioTemplates;
  }

  /**
   * Load skills into memory
   * For memory repository, this just processes the provided templates
   */
  async loadSkills(): Promise<void> {
    // Clear existing data
    this.skills.clear();
    this.scenarioTemplates.clear();
    this.scenarioMetaData.clear();

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
   * Add a skill template at runtime
   */
  addSkillTemplate(skillTemplate: SkillTemplate): void {
    this.skillTemplates.push(skillTemplate);
    this.registerSkill(skillTemplate.name, skillTemplate);
  }

  /**
   * Add a scenario template at runtime
   */
  addScenarioTemplate(scenario: ScenarioTemplate, skillName?: string): void {
    // If no skill name provided, try to infer from ID
    if (!skillName) {
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
      skillName = skillName || 'unknown';
    }

    this.additionalScenarios.push(scenario);
    
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

  /**
   * Clear all templates from memory
   */
  clear(): void {
    this.skillTemplates = [];
    this.additionalScenarios = [];
    this.skills.clear();
    this.scenarioTemplates.clear();
    this.scenarioMetaData.clear();
    this.loaded = false;
  }
}