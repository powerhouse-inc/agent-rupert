/**
 * Helper functions for parsing Handlebars templates and extracting variables
 */
/**
 * Extract variables and sections from a Handlebars template
 * Recursively processes nested sections
 */
export function extractTemplateVariables(template) {
    const result = {
        variables: [],
        sections: []
    };
    if (!template) {
        return result;
    }
    // Regular expressions for matching Handlebars constructs
    const sectionRegex = /\{\{#(\w+)\s+([^}]*?)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
    const variableRegex = /\{\{([^#\/][^}]*?)\}\}/g;
    // First, find all sections and replace them with placeholders
    const sections = [];
    const placeholders = new Map();
    let sectionIndex = 0;
    let processedTemplate = template.replace(sectionRegex, (match, keyword, params, content) => {
        const placeholder = `__SECTION_${sectionIndex++}__`;
        // Recursively extract variables from section content
        const sectionResult = extractTemplateVariables(content);
        const section = {
            type: 'section',
            keyword: keyword.trim(),
            params: params.trim(),
            variables: sectionResult.variables,
            sections: sectionResult.sections
        };
        sections.push(section);
        placeholders.set(placeholder, section);
        return placeholder;
    });
    // Now extract variables from the remaining template
    let variableMatch;
    while ((variableMatch = variableRegex.exec(processedTemplate)) !== null) {
        // Skip placeholders
        if (!variableMatch[1].startsWith('__SECTION_')) {
            result.variables.push({
                type: 'variable',
                expression: variableMatch[1].trim()
            });
        }
    }
    result.sections = sections;
    return result;
}
/**
 * Convert the extracted template structure to a simplified format for API responses
 */
export function simplifyTemplateStructure(extracted) {
    const simplified = {};
    // Add variables if present
    if (extracted.variables.length > 0) {
        simplified.vars = extracted.variables.map(v => v.expression);
    }
    // Add sections if present
    if (extracted.sections.length > 0) {
        simplified.sections = extracted.sections.map(section => ({
            type: section.keyword,
            params: section.params,
            ...(section.variables.length > 0 ? { vars: section.variables.map(v => v.expression) } : {}),
            ...(section.sections.length > 0 ? { sections: simplifyTemplateStructure({ variables: [], sections: section.sections }).sections } : {})
        }));
    }
    return simplified;
}
/**
 * Process a template string and return both the text and extracted variables
 */
export function processTemplate(template) {
    if (!template) {
        return undefined;
    }
    const extracted = extractTemplateVariables(template);
    const simplified = simplifyTemplateStructure(extracted);
    return {
        text: template,
        ...(Object.keys(simplified).length > 0 ? simplified : {})
    };
}
//# sourceMappingURL=handlebars-parser.js.map