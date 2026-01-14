import Handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { registerHelpers } from '../prompts/handlebars-helpers.js';

/**
 * Generic template parser using Handlebars
 * Can be used for different types of prompts with type-safe context
 */
export class PromptParser<TContext> {
    private handlebars: typeof Handlebars;
    
    constructor() {
        this.handlebars = Handlebars.create();
        // Use shared helpers
        registerHelpers(this.handlebars);
    }
    
    /**
     * Parse a single template file with context data
     * @param templatePath Path relative to project root
     * @param context Data to populate the template
     * @returns Processed template string
     */
    async parse(templatePath: string, context: TContext): Promise<string> {
        try {
            const template = await this.readTemplate(templatePath);
            const compiled = this.handlebars.compile(template);
            return compiled(context);
        } catch (error) {
            throw new Error(`Failed to parse template ${templatePath}: ${error}`);
        }
    }
    
    /**
     * Parse multiple templates and concatenate with double newline
     * @param templatePaths Array of paths relative to project root
     * @param context Data to populate the templates
     * @returns Concatenated processed templates
     */
    async parseMultiple(templatePaths: string[], context: TContext): Promise<string> {
        if (templatePaths.length === 0) {
            return '';
        }
        
        try {
            const results = await Promise.all(
                templatePaths.map(path => this.parse(path, context))
            );
            return results.join('\n\n');
        } catch (error) {
            throw new Error(`Failed to parse multiple templates: ${error}`);
        }
    }
    
    /**
     * Read template file from disk
     * @param templatePath Path relative to project root
     * @returns Template content
     */
    private async readTemplate(templatePath: string): Promise<string> {
        try {
            // Read relative to current working directory (project root)
            const fullPath = join(process.cwd(), templatePath);
            const content = await readFile(fullPath, 'utf-8');
            return content;
        } catch (error) {
            throw new Error(`Failed to read template file ${templatePath}: ${error}`);
        }
    }
}