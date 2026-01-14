/**
 * Shared Handlebars helpers for prompt templates
 * 
 * IMPORTANT: This is a plain JavaScript file (not TypeScript) to avoid transpilation issues
 * when used by both the build script and generated prompt modules.
 * This file is referenced directly from src/ by all consumers, eliminating the need
 * for separate copies in build/ or dist/ directories.
 * 
 * Used by:
 * - build-prompts.ts (build-time precompilation)
 * - Generated prompt modules in build/prompts/
 * - Runtime PromptParser
 */

export const handlebarsHelpers = {
    /**
     * Format dates with optional format type
     */
    formatDate: (date, format) => {
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
    join: (array, separator = ', ') => {
        if (!Array.isArray(array)) return '';
        return array.join(separator);
    },
    
    /**
     * Check if value exists and is not empty
     */
    exists: (value) => {
        return value !== undefined && value !== null && value !== '';
    },
    
    /**
     * Check equality
     */
    eq: (a, b) => {
        return a === b;
    },
    
    /**
     * Convert to uppercase
     */
    uppercase: (str) => {
        return typeof str === 'string' ? str.toUpperCase() : '';
    },
    
    /**
     * Convert to lowercase
     */
    lowercase: (str) => {
        return typeof str === 'string' ? str.toLowerCase() : '';
    },
    
    /**
     * Check if array has items
     */
    hasItems: (array) => {
        return Array.isArray(array) && array.length > 0;
    },
    
    /**
     * Return value or default if value is empty
     */
    default: (value, defaultValue) => {
        return value !== undefined && value !== null && value !== '' ? value : defaultValue;
    }
};

/**
 * Register all helpers with a Handlebars instance
 */
export function registerHelpers(handlebars) {
    Object.entries(handlebarsHelpers).forEach(([name, helper]) => {
        handlebars.registerHelper(name, helper);
    });
}

/**
 * Get list of known helper names for precompilation
 */
export function getKnownHelpers() {
    return Object.keys(handlebarsHelpers);
}