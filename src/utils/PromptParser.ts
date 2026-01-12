import Handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Generic template parser using Handlebars
 * Can be used for different types of prompts with type-safe context
 */
export class PromptParser<TContext> {
    private handlebars: typeof Handlebars;
    
    constructor() {
        this.handlebars = Handlebars.create();
        this.registerDefaultHelpers();
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
    
    /**
     * Register default Handlebars helpers
     */
    private registerDefaultHelpers(): void {
        // Helper to format dates
        this.handlebars.registerHelper('formatDate', (date: string | Date, format?: string) => {
            const d = typeof date === 'string' ? new Date(date) : date;
            if (format === 'time') {
                return d.toLocaleTimeString();
            } else if (format === 'date') {
                return d.toLocaleDateString();
            }
            return d.toISOString();
        });
        
        // Helper to join array with separator
        this.handlebars.registerHelper('join', (array: any[], separator: string = ', ') => {
            if (!Array.isArray(array)) return '';
            return array.join(separator);
        });
        
        // Helper to check if value exists and is not empty
        this.handlebars.registerHelper('exists', (value: any) => {
            return value !== undefined && value !== null && value !== '';
        });
        
        // Helper for conditional with comparison
        this.handlebars.registerHelper('eq', (a: any, b: any) => {
            return a === b;
        });
        
        // Helper to convert to uppercase
        this.handlebars.registerHelper('uppercase', (str: string) => {
            return typeof str === 'string' ? str.toUpperCase() : '';
        });
        
        // Helper to convert to lowercase
        this.handlebars.registerHelper('lowercase', (str: string) => {
            return typeof str === 'string' ? str.toLowerCase() : '';
        });
        
        // Helper to check array length
        this.handlebars.registerHelper('hasItems', (array: any[]) => {
            return Array.isArray(array) && array.length > 0;
        });
        
        // Helper for default value
        this.handlebars.registerHelper('default', (value: any, defaultValue: any) => {
            return value !== undefined && value !== null && value !== '' ? value : defaultValue;
        });
    }
}