/**
 * Helper functions for parsing Handlebars templates and extracting variables
 */
export interface TemplateSection {
    type: 'section';
    keyword: string;
    params: string;
    variables: TemplateVariable[];
    sections: TemplateSection[];
}
export interface TemplateVariable {
    type: 'variable';
    expression: string;
}
export type TemplateElement = TemplateVariable | TemplateSection;
/**
 * Extract variables and sections from a Handlebars template
 * Recursively processes nested sections
 */
export declare function extractTemplateVariables(template: string): {
    variables: TemplateVariable[];
    sections: TemplateSection[];
};
/**
 * Convert the extracted template structure to a simplified format for API responses
 */
export declare function simplifyTemplateStructure(extracted: ReturnType<typeof extractTemplateVariables>): any;
/**
 * Process a template string and return both the text and extracted variables
 */
export declare function processTemplate(template: string | undefined): {
    text: string;
    vars?: any;
} | undefined;
//# sourceMappingURL=handlebars-parser.d.ts.map