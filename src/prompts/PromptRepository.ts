import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { 
  PromptDocument, 
  PromptCategory, 
  PromptMetadata,
  PromptTask
} from './types.js';

export class PromptRepository {
  private prompts: Map<string, PromptDocument> = new Map();
  private categories: Map<string, PromptCategory> = new Map();
  private metadata: Map<string, PromptMetadata> = new Map();
  private basePath: string;

  constructor(basePath: string = './build/prompts') {
    this.basePath = path.resolve(basePath);
  }

  /**
   * Load all prompt JSON files from the repository
   */
  async load(): Promise<void> {
    // Clear existing data
    this.prompts.clear();
    this.categories.clear();
    this.metadata.clear();

    // Ensure base path exists
    if (!await fs.pathExists(this.basePath)) {
      throw new Error(`Prompt repository path does not exist: ${this.basePath}`);
    }

    // Find all JSON files
    const pattern = '**/*.json';
    const jsonFiles = await glob(pattern, {
      cwd: this.basePath,
      absolute: false
    });

    if (jsonFiles.length === 0) {
      console.warn(`No prompt files found in ${this.basePath}`);
      return;
    }

    // Load each JSON file
    for (const relativePath of jsonFiles) {
      await this.loadPromptFile(relativePath);
    }
  }

  /**
   * Load a single prompt file
   */
  private async loadPromptFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, relativePath);
    
    try {
      const content = await fs.readJson(fullPath) as PromptDocument;
      
      // Validate structure
      if (!content.id || !content.title || !Array.isArray(content.tasks)) {
        console.warn(`Invalid prompt document structure in ${relativePath}`);
        return;
      }

      // Determine category from directory structure
      const category = this.getCategoryFromPath(relativePath);
      
      // Store the prompt document
      const promptKey = this.generatePromptKey(category, content.id);
      this.prompts.set(promptKey, content);

      // Update category
      if (!this.categories.has(category)) {
        this.categories.set(category, {
          name: category,
          documents: []
        });
      }
      this.categories.get(category)!.documents.push(content);

      // Store metadata
      this.metadata.set(promptKey, {
        id: content.id,
        title: content.title,
        category,
        taskCount: content.tasks.length,
        filePath: fullPath
      });

    } catch (error) {
      console.error(`Failed to load prompt file ${relativePath}:`, error);
    }
  }

  /**
   * Extract category from file path
   */
  private getCategoryFromPath(relativePath: string): string {
    const dir = path.dirname(relativePath);
    return dir === '.' ? 'default' : dir.replace(/\\/g, '/');
  }

  /**
   * Generate a unique key for a prompt document
   */
  private generatePromptKey(category: string, id: string): string {
    return category === 'default' ? id : `${category}/${id}`;
  }

  /**
   * Get all loaded prompt documents
   */
  getAllPrompts(): PromptDocument[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Get a specific prompt document by key
   */
  getPrompt(key: string): PromptDocument | undefined {
    return this.prompts.get(key);
  }

  /**
   * Get a prompt document by category and ID
   */
  getPromptByCategoryAndId(category: string, id: string): PromptDocument | undefined {
    const key = this.generatePromptKey(category, id);
    return this.prompts.get(key);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get all prompts in a category
   */
  getPromptsByCategory(category: string): PromptDocument[] {
    return this.categories.get(category)?.documents || [];
  }

  /**
   * Get metadata for all prompts
   */
  getAllMetadata(): PromptMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get metadata for a specific prompt
   */
  getMetadata(key: string): PromptMetadata | undefined {
    return this.metadata.get(key);
  }

  /**
   * Search for prompts by ID pattern
   */
  findPromptsByPattern(pattern: string): PromptDocument[] {
    const regex = new RegExp(pattern, 'i');
    return this.getAllPrompts().filter(p => regex.test(p.id));
  }

  /**
   * Get next prompt in sequence (e.g., DM.00 -> DM.01)
   */
  getNextPrompt(currentKey: string): PromptDocument | undefined {
    const current = this.getPrompt(currentKey);
    if (!current) return undefined;

    // Parse current ID to find next
    const match = current.id.match(/^([A-Z]+)\.(\d+)$/);
    if (!match) return undefined;

    const prefix = match[1];
    const currentNum = parseInt(match[2], 10);
    const nextId = `${prefix}.${String(currentNum + 1).padStart(2, '0')}`;

    // Try to find in same category first
    const metadata = this.getMetadata(currentKey);
    if (metadata) {
      const nextInCategory = this.getPromptByCategoryAndId(metadata.category, nextId);
      if (nextInCategory) return nextInCategory;
    }

    // Try default category
    return this.getPrompt(nextId);
  }

  /**
   * Get a specific task from a prompt
   */
  getTask(promptKey: string, taskId: string): PromptTask | undefined {
    const prompt = this.getPrompt(promptKey);
    return prompt?.tasks.find(t => t.id === taskId);
  }

  /**
   * Check if repository has been loaded
   */
  isLoaded(): boolean {
    return this.prompts.size > 0;
  }

  /**
   * Reload all prompts from disk
   */
  async reload(): Promise<void> {
    await this.load();
  }
}