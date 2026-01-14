/**
 * Shared Handlebars helpers for prompt templates
 * Used by both runtime PromptParser and build-time precompilation
 */

export const handlebarsHelpers = {
    /**
     * Format dates with optional format type
     */
    formatDate: (date: string | Date, format?: string) => {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (format === 'time') {
            return d.toLocaleTimeString();
        } else if (format === 'date') {
            return d.toLocaleDateString();
        }
        return d.toISOString();
    },
    
    /**
     * Join array with separator
     */
    join: (array: any[], separator: string = ', ') => {
        if (!Array.isArray(array)) return '';
        return array.join(separator);
    },
    
    /**
     * Check if value exists and is not empty
     */
    exists: (value: any) => {
        return value !== undefined && value !== null && value !== '';
    },
    
    /**
     * Check equality
     */
    eq: (a: any, b: any) => {
        return a === b;
    },
    
    /**
     * Convert to uppercase
     */
    uppercase: (str: string) => {
        return typeof str === 'string' ? str.toUpperCase() : '';
    },
    
    /**
     * Convert to lowercase
     */
    lowercase: (str: string) => {
        return typeof str === 'string' ? str.toLowerCase() : '';
    },
    
    /**
     * Check if array has items
     */
    hasItems: (array: any[]) => {
        return Array.isArray(array) && array.length > 0;
    },
    
    /**
     * Provide default value if undefined/null/empty
     */
    default: (value: any, defaultValue: any) => {
        return value !== undefined && value !== null && value !== '' ? value : defaultValue;
    }
};

/**
 * Register all helpers with a Handlebars instance
 */
export function registerHelpers(handlebars: any): void {
    Object.entries(handlebarsHelpers).forEach(([name, helper]) => {
        handlebars.registerHelper(name, helper);
    });
}

/**
 * Get list of known helper names for precompilation optimization
 */
export function getKnownHelpers(): string[] {
    return Object.keys(handlebarsHelpers);
}