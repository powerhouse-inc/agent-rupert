/**
 * Type declarations for handlebars-helpers.js
 * 
 * This file provides TypeScript types for the plain JavaScript
 * handlebars-helpers.js module.
 */

export interface HandlebarsHelpers {
    formatDate: (date: string | Date, format?: string) => string;
    join: (array: any[], separator?: string) => string;
    exists: (value: any) => boolean;
    eq: (a: any, b: any) => boolean;
    uppercase: (str: string) => string;
    lowercase: (str: string) => string;
    hasItems: (array: any) => boolean;
    default: (value: any, defaultValue: any) => any;
}

export const handlebarsHelpers: HandlebarsHelpers;
export function registerHelpers(handlebars: any): void;
export function getKnownHelpers(): string[];