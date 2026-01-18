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

  /**
   * Print the skill tree structure to console for debugging
   * Shows all skills, scenarios, and tasks in a hierarchical format
   */
  public print(): void {
    console.log('\n=== Memory Skills Repository ===');
    console.log(`Total Skills: ${this.skills.size}`);
    console.log(`Total Scenarios: ${this.scenarioTemplates.size}`);
    console.log('');

    // Print each skill
    for (const [skillName, skillTemplate] of this.skills.entries()) {
      console.log(`📦 Skill: ${skillName}`);
      
      // Print skill preamble if exists
      if (skillTemplate.preambleText) {
        console.log(`   ├─ Has preamble`);
      }
      
      // Print skill expected outcome if exists
      if (skillTemplate.expectedOutcomeText) {
        console.log(`   ├─ Has expected outcome`);
      }

      // Print scenarios
      console.log(`   └─ Scenarios (${skillTemplate.scenarios.length}):`);
      
      for (let i = 0; i < skillTemplate.scenarios.length; i++) {
        const scenario = skillTemplate.scenarios[i];
        const isLast = i === skillTemplate.scenarios.length - 1;
        const prefix = isLast ? '      └─' : '      ├─';
        
        console.log(`${prefix} 📋 ${scenario.id}: ${scenario.title}`);
        
        // Print scenario preamble if exists
        if (scenario.preamble) {
          const subPrefix = isLast ? '         ' : '      │  ';
          console.log(`${subPrefix}├─ Has preamble`);
        }
        
        // Print tasks
        const taskPrefix = isLast ? '         ' : '      │  ';
        console.log(`${taskPrefix}└─ Tasks (${scenario.tasks.length}):`);
        
        for (let j = 0; j < scenario.tasks.length; j++) {
          const task = scenario.tasks[j];
          const isLastTask = j === scenario.tasks.length - 1;
          const taskItemPrefix = isLast ? '            ' : '      │     ';
          const taskSymbol = isLastTask ? '└─' : '├─';
          
          console.log(`${taskItemPrefix}${taskSymbol} ✅ ${task.id}: ${task.title}`);
        }
      }
      
      console.log('');
    }

    // Print additional scenarios not part of skills
    if (this.additionalScenarios.length > 0) {
      console.log('📂 Additional Standalone Scenarios:');
      for (const scenario of this.additionalScenarios) {
        console.log(`   └─ ${scenario.id}: ${scenario.title} (${scenario.tasks.length} tasks)`);
      }
      console.log('');
    }

    console.log('=== End of Repository ===\n');
  }
}