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

export type VariableTransformer = (variable: string, context: { 
  parentPath: string; 
  sectionType?: string;
  sectionParams?: string;
}) => string | null;

// Default transformers
export const defaultTransformers: VariableTransformer[] = [
  // Transform 'this' to parent path
  (variable, { parentPath, sectionType }) => {
    if (variable === 'this' && parentPath) {
      return parentPath;
    }
    return variable;
  },
  // Ignore 'else' as it's a control structure, not a variable
  (variable) => {
    if (variable === 'else') {
      return null;
    }
    return variable;
  }
];

/**
 * Extract variables and sections from a Handlebars template
 * Recursively processes nested sections with path context
 */
export function extractTemplateVariables(
  template: string,
  path: string = '',
  transformers: VariableTransformer[] = defaultTransformers
): {
  variables: TemplateVariable[];
  sections: TemplateSection[];
} {
  const result: {
    variables: TemplateVariable[];
    sections: TemplateSection[];
  } = {
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
  const sections: TemplateSection[] = [];
  const placeholders = new Map<string, TemplateSection>();
  let sectionIndex = 0;
  
  let processedTemplate = template.replace(sectionRegex, (match, keyword, params, content) => {
    const placeholder = `__SECTION_${sectionIndex++}__`;
    const sectionType = keyword.trim();
    const sectionParams = params.trim();
    
    // Determine the new path based on section type
    let newPath = path;
    if (sectionType === 'each') {
      // 'each' changes context to iterate over the collection
      newPath = path ? `${path}.${sectionParams}` : sectionParams;
    }
    // 'if', 'unless', 'with' don't change the variable path context
    
    // Recursively extract variables from section content with the new path
    const sectionResult = extractTemplateVariables(content, newPath, transformers);
    
    const section: TemplateSection = {
      type: 'section',
      keyword: sectionType,
      params: sectionParams,
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
      let variable = variableMatch[1].trim();
      
      // Apply transformers
      for (const transformer of transformers) {
        const transformed = transformer(variable, { 
          parentPath: path,
          sectionType: undefined,
          sectionParams: undefined
        });
        if (transformed === null) {
          // Skip this variable
          variable = '';
          break;
        }
        variable = transformed;
      }
      
      if (variable) {
        // Add path prefix if we're in a context
        if (path && !variable.startsWith(path)) {
          variable = `${path}.${variable}`;
        }
        
        result.variables.push({
          type: 'variable',
          expression: variable
        });
      }
    }
  }

  result.sections = sections;
  return result;
}

/**
 * Collect all variables from a structure recursively
 */
function collectAllVariables(extracted: ReturnType<typeof extractTemplateVariables>): string[] {
  const allVars: string[] = [];
  
  // Add top-level variables
  allVars.push(...extracted.variables.map(v => v.expression));
  
  // Recursively collect from sections
  for (const section of extracted.sections) {
    allVars.push(...section.variables.map(v => v.expression));
    allVars.push(...collectAllVariables({ variables: [], sections: section.sections }));
  }
  
  return allVars;
}

/**
 * Convert the extracted template structure to a simplified format for API responses
 */
export function simplifyTemplateStructure(extracted: ReturnType<typeof extractTemplateVariables>): any {
  // Collect all variables from the entire structure
  const allVariables = collectAllVariables(extracted);
  
  // Deduplicate and sort for consistency
  const uniqueVars = Array.from(new Set(allVariables)).sort();
  
  // Return flattened structure with just unique variables
  return {
    vars: uniqueVars
  };
}

/**
 * Process a template string and return both the text and extracted variables
 */
export function processTemplate(template: string | undefined): { text: string; vars?: any } | undefined {
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