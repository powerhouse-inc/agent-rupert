import path from 'path';
import { PromptRepository } from '../../../src/prompts/PromptRepository.js';

describe('PromptRepository', () => {
  let repository: PromptRepository;

  beforeEach(async () => {
    // Use actual build/prompts directory
    repository = new PromptRepository('./build/prompts');
    await repository.load();
  });

  describe('constructor', () => {
    it('should initialize with default base path', () => {
      const defaultRepo = new PromptRepository();
      expect(defaultRepo).toBeDefined();
    });

    it('should accept custom base path', () => {
      const customRepo = new PromptRepository('./custom/path');
      expect(customRepo).toBeDefined();
    });
  });

  describe('load', () => {
    it('should throw error if base path does not exist', async () => {
      const invalidRepo = new PromptRepository('/nonexistent/path');
      await expect(invalidRepo.load()).rejects.toThrow(
        'Prompt repository path does not exist:'
      );
    });

    it('should load actual scenario documents', async () => {
      const scenarios = repository.getAllScenarios();
      
      // Should have loaded multiple documents
      expect(scenarios.length).toBeGreaterThan(0);
      
      // Check that document-modeling scenarios are loaded
      const dm00 = repository.getScenarioBySkillAndId('document-modeling', 'DM.00');
      expect(dm00).toBeDefined();
      expect(dm00?.title).toBe('Check the prerequisites for creating a document model');
      expect(dm00?.tasks).toHaveLength(6);
      
      const dm01 = repository.getScenarioBySkillAndId('document-modeling', 'DM.01');
      expect(dm01).toBeDefined();
      expect(dm01?.title).toBe('Write the document model description');
      expect(dm01?.tasks).toHaveLength(5);
    });
  });

  describe('query methods', () => {
    it('should get scenario by key', async () => {
      const scenario = repository.getScenario('document-modeling/DM.00');
      expect(scenario).toBeDefined();
      expect(scenario?.id).toBe('DM.00');
    });

    it('should get scenario by skill and ID', async () => {
      const scenario = repository.getScenarioBySkillAndId('document-modeling', 'DM.01');
      expect(scenario).toBeDefined();
      expect(scenario?.id).toBe('DM.01');
    });

    it('should get scenarios by skill', async () => {
      const scenarios = repository.getScenariosBySkill('document-modeling');
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      
      // Check that DM.00 and DM.01 are included
      const ids = scenarios.map(s => s.id);
      expect(ids).toContain('DM.00');
      expect(ids).toContain('DM.01');
    });

    it('should find scenarios by pattern', async () => {
      const dmScenarios = repository.findScenariosByPattern('DM');
      expect(dmScenarios.length).toBeGreaterThanOrEqual(2);
      
      // All found scenarios should match the pattern
      dmScenarios.forEach(scenario => {
        expect(scenario.id).toMatch(/DM/);
      });
    });

    it('should get next scenario in sequence', async () => {
      const next = repository.getNextScenario('document-modeling/DM.00');
      expect(next).toBeDefined();
      expect(next?.id).toBe('DM.01');
    });

    it('should return undefined for non-existent next scenario', async () => {
      const next = repository.getNextScenario('document-modeling/DM.01');
      // DM.02 doesn't exist, so should return undefined
      expect(next).toBeUndefined();
    });

    it('should get specific task from scenario', async () => {
      const task = repository.getTask('document-modeling/DM.00', 'DM.00.1');
      expect(task).toBeDefined();
      expect(task?.title).toBe('Ensure you have the required input and context');
    });

    it('should get all metadata', async () => {
      const metadata = repository.getAllMetadata();
      
      // Should have metadata for all loaded scenarios
      expect(metadata.length).toBeGreaterThan(0);
      
      // Find DM.00 metadata
      const dm00Meta = metadata.find(m => m.id === 'DM.00');
      expect(dm00Meta).toBeDefined();
      expect(dm00Meta?.skill).toBe('document-modeling');
      expect(dm00Meta?.taskCount).toBe(6);
    });

    it('should check if repository is loaded', async () => {
      // Repository is loaded in beforeEach
      expect(repository.isLoaded()).toBe(true);
      
      // Create new repository that hasn't been loaded
      const newRepo = new PromptRepository('./build/prompts');
      expect(newRepo.isLoaded()).toBe(false);
    });
  });

  describe('reload', () => {
    it('should reload all scenarios', async () => {
      const initialCount = repository.getAllScenarios().length;
      expect(initialCount).toBeGreaterThan(0);
      
      // Reload should maintain the same scenarios
      await repository.reload();
      
      const afterReload = repository.getAllScenarios().length;
      expect(afterReload).toBe(initialCount);
    });
  });

  describe('edge cases and skills', () => {
    it('should handle multiple skills', async () => {
      const skills = repository.getSkills();
      
      // Should have at least document-modeling skill
      expect(skills).toContain('document-modeling');
      
      // Should handle multiple skills
      expect(skills.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle scenarios in default skill', async () => {
      const skills = repository.getSkills();
      
      // Check if there are any top-level scenarios
      const defaultScenarios = repository.getScenariosBySkill('default');
      if (defaultScenarios.length > 0) {
        expect(skills).toContain('default');
      }
    });

    it('should return empty array for non-existent skill', async () => {
      const scenarios = repository.getScenariosBySkill('non-existent');
      expect(scenarios).toEqual([]);
    });
    
    it('should return undefined for non-existent scenario', async () => {
      const scenario = repository.getScenario('non-existent/scenario');
      expect(scenario).toBeUndefined();
    });

    it('should return undefined for non-existent task', async () => {
      const task = repository.getTask('document-modeling/DM.00', 'DM.00.999');
      expect(task).toBeUndefined();
    });
  });
});