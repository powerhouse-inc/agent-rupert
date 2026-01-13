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

    it('should load actual prompt documents', async () => {
      const prompts = repository.getAllPrompts();
      
      // Should have loaded multiple documents
      expect(prompts.length).toBeGreaterThan(0);
      
      // Check that document-modeling prompts are loaded
      const dm00 = repository.getPromptByCategoryAndId('document-modeling', 'DM.00');
      expect(dm00).toBeDefined();
      expect(dm00?.title).toBe('Check the prerequisites for creating a document model');
      expect(dm00?.tasks).toHaveLength(6);
      
      const dm01 = repository.getPromptByCategoryAndId('document-modeling', 'DM.01');
      expect(dm01).toBeDefined();
      expect(dm01?.title).toBe('Write the document model description');
      expect(dm01?.tasks).toHaveLength(5);
    });
  });

  describe('query methods', () => {
    it('should get prompt by key', async () => {
      const prompt = repository.getPrompt('document-modeling/DM.00');
      expect(prompt).toBeDefined();
      expect(prompt?.id).toBe('DM.00');
    });

    it('should get prompt by category and ID', async () => {
      const prompt = repository.getPromptByCategoryAndId('document-modeling', 'DM.01');
      expect(prompt).toBeDefined();
      expect(prompt?.id).toBe('DM.01');
    });

    it('should get prompts by category', async () => {
      const prompts = repository.getPromptsByCategory('document-modeling');
      expect(prompts.length).toBeGreaterThanOrEqual(2);
      
      // Check that DM.00 and DM.01 are included
      const ids = prompts.map(p => p.id);
      expect(ids).toContain('DM.00');
      expect(ids).toContain('DM.01');
    });

    it('should find prompts by pattern', async () => {
      const dmPrompts = repository.findPromptsByPattern('DM');
      expect(dmPrompts.length).toBeGreaterThanOrEqual(2);
      
      // All found prompts should match the pattern
      dmPrompts.forEach(prompt => {
        expect(prompt.id).toMatch(/DM/);
      });
    });

    it('should get next prompt in sequence', async () => {
      const next = repository.getNextPrompt('document-modeling/DM.00');
      expect(next).toBeDefined();
      expect(next?.id).toBe('DM.01');
    });

    it('should return undefined for non-existent next prompt', async () => {
      const next = repository.getNextPrompt('document-modeling/DM.01');
      // DM.02 doesn't exist, so should return undefined
      expect(next).toBeUndefined();
    });

    it('should get specific task from prompt', async () => {
      const task = repository.getTask('document-modeling/DM.00', 'DM.00.1');
      expect(task).toBeDefined();
      expect(task?.title).toBe('Ensure you have the required input and context');
    });

    it('should get all metadata', async () => {
      const metadata = repository.getAllMetadata();
      
      // Should have metadata for all loaded prompts
      expect(metadata.length).toBeGreaterThan(0);
      
      // Find DM.00 metadata
      const dm00Meta = metadata.find(m => m.id === 'DM.00');
      expect(dm00Meta).toBeDefined();
      expect(dm00Meta?.category).toBe('document-modeling');
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
    it('should reload all prompts', async () => {
      const initialCount = repository.getAllPrompts().length;
      expect(initialCount).toBeGreaterThan(0);
      
      // Reload should maintain the same prompts
      await repository.reload();
      
      const afterReload = repository.getAllPrompts().length;
      expect(afterReload).toBe(initialCount);
    });
  });

  describe('edge cases and categories', () => {
    it('should handle multiple categories', async () => {
      const categories = repository.getCategories();
      
      // Should have at least document-modeling category
      expect(categories).toContain('document-modeling');
      
      // Should handle multiple categories
      expect(categories.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle prompts in default category', async () => {
      const categories = repository.getCategories();
      
      // Check if there are any top-level prompts
      const defaultPrompts = repository.getPromptsByCategory('default');
      if (defaultPrompts.length > 0) {
        expect(categories).toContain('default');
      }
    });

    it('should return empty array for non-existent category', async () => {
      const prompts = repository.getPromptsByCategory('non-existent');
      expect(prompts).toEqual([]);
    });
    
    it('should return undefined for non-existent prompt', async () => {
      const prompt = repository.getPrompt('non-existent/prompt');
      expect(prompt).toBeUndefined();
    });

    it('should return undefined for non-existent task', async () => {
      const task = repository.getTask('document-modeling/DM.00', 'DM.00.999');
      expect(task).toBeUndefined();
    });
  });
});