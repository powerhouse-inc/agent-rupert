import { describe, it, beforeEach, expect } from '@jest/globals';
import { SkillsRepository } from '../../../src/prompts/SkillsRepository.js';
import type { ISkillsRepository } from '../../../src/prompts/ISkillsRepository.js';

describe('SkillsRepository', () => {
  let repository: ISkillsRepository;

  beforeEach(async () => {
    // Use actual build/prompts directory
    repository = new SkillsRepository('./build/prompts');
    await repository.loadSkills();
  });

  describe('constructor', () => {
    it('should initialize with default base path', () => {
      const defaultRepo = new SkillsRepository();
      expect(defaultRepo).toBeDefined();
    });

    it('should accept custom base path', () => {
      const customRepo = new SkillsRepository('./custom/path');
      expect(customRepo).toBeDefined();
    });
  });

  describe('loadSkills', () => {
    it('should throw error if base path does not exist', async () => {
      const invalidRepo = new SkillsRepository('/nonexistent/path');
      await expect(invalidRepo.loadSkills()).rejects.toThrow(
        'Prompt repository path does not exist:'
      );
    });

    it('should load actual skills', async () => {
      const skills = repository.getSkills();
      
      // Should have loaded multiple skills
      expect(skills.length).toBeGreaterThan(0);
      
      // Check that specific skills are loaded
      expect(skills).toContain('document-modeling');
      expect(skills).toContain('reactor-package-project-management');
    });

    it('should be marked as loaded after loading', async () => {
      expect(repository.isLoaded()).toBe(true);
    });
  });

  describe('query methods', () => {
    it('should get scenario by key', async () => {
      const scenario = repository.getScenarioByKey('document-modeling/DM.00');
      expect(scenario).toBeDefined();
      expect(scenario?.id).toBe('DM.00');
      expect(scenario?.title).toBe('Check the prerequisites for creating a document model');
      expect(scenario?.tasks).toHaveLength(5);
    });

    it('should get scenarios by skill', async () => {
      const scenarios = repository.getScenariosBySkill('document-modeling');
      expect(scenarios.length).toBeGreaterThan(0);
      
      // Should include DM.00 and DM.01
      const scenarioIds = scenarios.map(s => s.id);
      expect(scenarioIds).toContain('DM.00');
      expect(scenarioIds).toContain('DM.01');
    });

    it('should generate scenario keys correctly', async () => {
      const key = repository.generateScenarioKey('document-modeling', 'DM.01');
      expect(key).toBe('document-modeling/DM.01');
    });

    it('should return undefined for non-existent scenario', async () => {
      const scenario = repository.getScenarioByKey('nonexistent/scenario');
      expect(scenario).toBeUndefined();
    });

    it('should get skill information', async () => {
      // First check what skills are actually loaded
      const skills = repository.getSkills();
      expect(skills.length).toBeGreaterThan(0);
      
      // Use the first available skill for testing
      const firstSkill = skills[0];
      const skillInfo = repository.getSkillInformation(firstSkill);
      
      // If document-modeling exists, test with it specifically
      if (skills.includes('document-modeling')) {
        const dmInfo = repository.getSkillInformation('document-modeling');
        expect(dmInfo).toBeDefined();
        expect(dmInfo?.name).toBe('document-modeling');
      } else {
        // Otherwise just verify the structure for any skill
        expect(skillInfo).toBeDefined();
        expect(skillInfo?.name).toBe(firstSkill);
      }
    });

    it('should get skill template', async () => {
      const skillTemplate = repository.getSkillTemplate('document-modeling');
      expect(skillTemplate).toBeDefined();
      expect(skillTemplate?.scenarios).toBeDefined();
      expect(skillTemplate?.scenarios.length).toBeGreaterThan(0);
    });

    it('should get all metadata', async () => {
      const metadata = repository.getAllMetadata();
      expect(metadata.length).toBeGreaterThan(0);
      
      // Check metadata structure
      const dm00Meta = metadata.find(m => m.id === 'DM.00');
      expect(dm00Meta).toBeDefined();
      expect(dm00Meta?.skill).toBe('document-modeling');
      expect(dm00Meta?.title).toBe('Check the prerequisites for creating a document model');
    });

    it('should get scenario required variables', async () => {
      const variables = repository.getScenarioRequiredVariables('document-modeling', 'DM.00');
      expect(Array.isArray(variables)).toBe(true);
      // Variables might be empty, but should be an array
    });

    it('should get skill preamble with context', async () => {
      const preamble = repository.getSkillPreamble('document-modeling', {});
      // Preamble might be undefined if not configured
      if (preamble !== undefined) {
        expect(typeof preamble).toBe('string');
      }
    });
  });

  describe('reload', () => {
    it('should reload all skills', async () => {
      const initialSkills = repository.getSkills();
      expect(initialSkills.length).toBeGreaterThan(0);
      
      // Reload should maintain the same skills
      await repository.loadSkills();
      const reloadedSkills = repository.getSkills();
      
      expect(reloadedSkills.length).toBe(initialSkills.length);
      // Sort both arrays to ensure consistent comparison (order may vary)
      expect(reloadedSkills.sort()).toEqual(initialSkills.sort());
    });
  });

  describe('edge cases and skills', () => {
    it('should return empty array for non-existent skill scenarios', async () => {
      const scenarios = repository.getScenariosBySkill('non-existent-skill');
      expect(scenarios).toEqual([]);
    });

    it('should return undefined for non-existent skill information', async () => {
      const skillInfo = repository.getSkillInformation('non-existent-skill');
      expect(skillInfo).toBeUndefined();
    });

    it('should return undefined for non-existent skill template', async () => {
      const template = repository.getSkillTemplate('non-existent-skill');
      expect(template).toBeUndefined();
    });

    it('should return empty array for non-existent scenario variables', async () => {
      const variables = repository.getScenarioRequiredVariables('non-existent', 'NONE');
      expect(variables).toEqual([]);
    });
  });

  describe('print method', () => {
    it('should have a print method for debugging', () => {
      expect(typeof repository.print).toBe('function');
      // Just verify it doesn't throw
      expect(() => repository.print()).not.toThrow();
    });
  });
});