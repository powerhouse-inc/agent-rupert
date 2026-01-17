#!/usr/bin/env ts-node

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root, Heading, Content } from 'mdast';
import Handlebars from 'handlebars';
// Import from plain JS file
import { getKnownHelpers } from '../src/prompts/handlebars-helpers.js';
import { processTemplate } from './handlebars-parser';

interface PromptTask {
  id: string;
  title: string;
  content: string;
  expectedOutcome?: string;
}

interface PromptDocument {
  id: string;
  title: string;
  preamble?: string;
  tasks: PromptTask[];
  expectedOutcome?: string;
}

async function parseMdFile(filePath: string): Promise<PromptDocument | null> {
  const content = await fs.readFile(filePath, 'utf-8');
  
  // Parse markdown to AST
  const processor = unified().use(remarkParse);
  const ast = processor.parse(content) as Root;
  
  let mainTask: { id: string; title: string } | null = null;
  let preamble = '';
  const tasks: PromptTask[] = [];
  let currentTask: { id: string; title: string; contentNodes: Content[]; expectedOutcomeNodes?: Content[] } | null = null;
  let collectingPreamble = true;
  const preambleNodes: Content[] = [];
  let foundMainTask = false;
  let scenarioExpectedOutcomeNodes: Content[] | null = null;
  let collectingTaskOutcome = false;
  let collectingScenarioOutcome = false;
  
  // Process only top-level children of root
  const rootChildren = ast.children;
  
  for (const node of rootChildren) {
    if (node.type === 'heading') {
      const heading = node as Heading;
      const headingText = extractText(heading);
      
      if (heading.depth === 1) {
        // Main task (# header) - should match PREFIX.NUM (e.g., CRP.03)
        foundMainTask = true;
        const match = headingText.match(/^([A-Z]+\.\d+)\s+(.+)$/);
        if (match) {
          mainTask = {
            id: match[1],
            title: match[2]
          };
        }
        // Keep collecting preamble until we hit the first ## heading
        // This allows content between # and ## to be treated as preamble
      } else if (heading.depth === 2) {
        // Check if this is "Expected Scenario Outcome"
        if (headingText === 'Expected Scenario Outcome') {
          collectingScenarioOutcome = true;
          scenarioExpectedOutcomeNodes = [];
          collectingPreamble = false;
          collectingTaskOutcome = false;
          
          // Save current task if exists
          if (currentTask) {
            tasks.push({
              id: currentTask.id,
              title: currentTask.title,
              content: nodesToMarkdown(currentTask.contentNodes),
              expectedOutcome: currentTask.expectedOutcomeNodes 
                ? nodesToMarkdown(currentTask.expectedOutcomeNodes).trim() 
                : undefined
            });
            currentTask = null;
          }
        } else {
          // Regular subtask (## header) - this marks the end of preamble collection
          collectingPreamble = false;
          collectingScenarioOutcome = false;
          collectingTaskOutcome = false;
          
          // Save previous task if exists
          if (currentTask) {
            tasks.push({
              id: currentTask.id,
              title: currentTask.title,
              content: nodesToMarkdown(currentTask.contentNodes),
              expectedOutcome: currentTask.expectedOutcomeNodes 
                ? nodesToMarkdown(currentTask.expectedOutcomeNodes).trim() 
                : undefined
            });
          }
          
          // Start new task
          // Match task IDs that follow the pattern: PREFIX.NUM.NUM (e.g., CRP.03.1)
          const match = headingText.match(/^([A-Z]+\.\d+\.\d+)\s+(.+)$/);
          if (match) {
            currentTask = {
              id: match[1],
              title: match[2],
              contentNodes: []
            };
          } else {
            // Skip headers that don't match the expected pattern and warn
            const skillName = filePath.split('/').slice(-2, -1)[0] || 'unknown-skill';
            console.warn(`  ⚠ WARNING in ${skillName}: Skipping invalid task header: "## ${headingText}"`);
            // Set currentTask to null to ignore content until the next valid task
            currentTask = null;
          }
        }
      } else if (heading.depth === 3 && headingText === 'Expected Task Outcome') {
        // Start collecting expected outcome for current task
        collectingTaskOutcome = true;
        if (currentTask) {
          currentTask.expectedOutcomeNodes = [];
        }
      } else if (currentTask && !collectingTaskOutcome) {
        // Level 3+ headers are part of the task content (unless we're collecting outcome)
        currentTask.contentNodes.push(node);
      }
    } else {
      // Regular content
      if (collectingScenarioOutcome && scenarioExpectedOutcomeNodes) {
        scenarioExpectedOutcomeNodes.push(node);
      } else if (collectingTaskOutcome && currentTask?.expectedOutcomeNodes) {
        currentTask.expectedOutcomeNodes.push(node);
      } else if (collectingPreamble) {
        // Only collect as preamble if we haven't found the main task yet
        // OR if we've found the main task but haven't hit the first subtask
        if (!foundMainTask || (foundMainTask && collectingPreamble)) {
          preambleNodes.push(node);
        }
      } else if (currentTask) {
        currentTask.contentNodes.push(node);
      }
    }
  }
  
  // Save last task if exists
  if (currentTask) {
    tasks.push({
      id: currentTask.id,
      title: currentTask.title,
      content: nodesToMarkdown(currentTask.contentNodes),
      expectedOutcome: currentTask.expectedOutcomeNodes 
        ? nodesToMarkdown(currentTask.expectedOutcomeNodes).trim() 
        : undefined
    });
  }
  
  if (!mainTask) {
    console.warn(`No main task found in ${filePath}`);
    return null;
  }
  
  // Convert preamble nodes to markdown
  if (preambleNodes.length > 0) {
    preamble = nodesToMarkdown(preambleNodes).trim();
  }
  
  // Convert scenario expected outcome nodes to markdown
  let scenarioExpectedOutcome: string | undefined;
  if (scenarioExpectedOutcomeNodes && scenarioExpectedOutcomeNodes.length > 0) {
    scenarioExpectedOutcome = nodesToMarkdown(scenarioExpectedOutcomeNodes).trim();
  }
  
  // Validate task IDs
  validateTaskIds(tasks, filePath, mainTask.id);
  
  return {
    id: mainTask.id,
    title: mainTask.title,
    preamble: preamble || undefined,
    tasks,
    expectedOutcome: scenarioExpectedOutcome
  };
}

function validateTaskIds(tasks: PromptTask[], filePath: string, mainTaskId: string) {
  if (tasks.length === 0) return;
  
  // Parse the main task ID to determine the expected prefix
  const match = mainTaskId.match(/^([A-Z]+)\.(\d+)$/);
  if (!match) {
    // If main ID doesn't follow expected pattern, skip validation
    return;
  }
  
  const prefix = match[1];
  const mainNumber = match[2];
  const expectedPrefix = `${prefix}.${mainNumber}`;
  
  // Track seen IDs for duplicate detection
  const seenIds = new Set<string>();
  let expectedSubtask = 1;
  
  for (const task of tasks) {
    // Check for duplicates
    if (seenIds.has(task.id)) {
      console.warn(`  ⚠ WARNING in ${filePath}: Duplicate task ID found: ${task.id}`);
    }
    seenIds.add(task.id);
    
    // Parse subtask ID
    const subtaskMatch = task.id.match(/^([A-Z]+)\.(\d+)\.(\d+)$/);
    if (!subtaskMatch) {
      console.warn(`  ⚠ WARNING in ${filePath}: Invalid task ID format: ${task.id}`);
      continue;
    }
    
    const taskPrefix = `${subtaskMatch[1]}.${subtaskMatch[2]}`;
    const subtaskNumber = parseInt(subtaskMatch[3], 10);
    
    // Check if task has correct prefix
    if (taskPrefix !== expectedPrefix) {
      console.warn(`  ⚠ WARNING in ${filePath}: Task ${task.id} has wrong prefix. Expected ${expectedPrefix}.X`);
      continue;
    }
    
    // Check for out-of-order or missing IDs
    if (subtaskNumber !== expectedSubtask) {
      if (subtaskNumber < expectedSubtask) {
        console.warn(`  ⚠ WARNING in ${filePath}: Task ${task.id} appears out of order`);
      } else {
        // Missing IDs
        for (let missing = expectedSubtask; missing < subtaskNumber; missing++) {
          console.warn(`  ⚠ WARNING in ${filePath}: Missing task ID: ${expectedPrefix}.${missing}`);
        }
      }
    }
    
    // Update expected for next iteration
    expectedSubtask = subtaskNumber + 1;
  }
}

function extractText(node: Heading): string {
  let text = '';
  
  function visitNode(n: any) {
    if (n.type === 'text') {
      text += n.value;
    } else if (n.children) {
      n.children.forEach(visitNode);
    }
  }
  
  if (node.children) {
    node.children.forEach(visitNode);
  }
  
  return text;
}

function nodesToMarkdown(nodes: Content[]): string {
  // Convert AST nodes back to markdown
  const lines: string[] = [];
  
  for (const node of nodes) {
    lines.push(nodeToMarkdown(node));
  }
  
  return lines.join('\n').trim();
}

function nodeToMarkdown(node: any): string {
  switch (node.type) {
    case 'paragraph':
      return node.children.map(nodeToMarkdown).join('') + '\n';
    
    case 'heading':
      const level = '#'.repeat(node.depth);
      const text = node.children.map(nodeToMarkdown).join('');
      return `${level} ${text}\n`;
    
    case 'list':
      return node.children.map((item: any, index: number) => {
        const bullet = node.ordered ? `${index + 1}.` : '-';
        const content = item.children.map(nodeToMarkdown).join('').trim();
        return `${bullet} ${content}`;
      }).join('\n') + '\n';
    
    case 'listItem':
      return node.children.map(nodeToMarkdown).join('');
    
    case 'code':
      const lang = node.lang || '';
      return `\`\`\`${lang}\n${node.value}\n\`\`\`\n`;
    
    case 'inlineCode':
      return `\`${node.value}\``;
    
    case 'text':
      return node.value;
    
    case 'strong':
      return `**${node.children.map(nodeToMarkdown).join('')}**`;
    
    case 'emphasis':
      return `*${node.children.map(nodeToMarkdown).join('')}*`;
    
    case 'link':
      const linkText = node.children.map(nodeToMarkdown).join('');
      return `[${linkText}](${node.url})`;
    
    case 'blockquote':
      const quoteContent = node.children.map(nodeToMarkdown).join('');
      return quoteContent.split('\n').map((line: string) => `> ${line}`).join('\n') + '\n';
    
    case 'thematicBreak':
      return '---\n';
    
    default:
      // For unknown node types, try to extract children
      if (node.children) {
        return node.children.map(nodeToMarkdown).join('');
      }
      return '';
  }
}

/**
 * Precompile a template string with Handlebars
 */
function precompileTemplate(template: string): string {
  const knownHelpers = getKnownHelpers();
  
  // Create an object with all helpers set to true for precompilation
  const knownHelpersObj: Record<string, boolean> = {};
  knownHelpers.forEach(helper => {
    knownHelpersObj[helper] = true;
  });
  
  // Precompile the template
  const precompiled = Handlebars.precompile(template, {
    knownHelpers: knownHelpersObj,
    knownHelpersOnly: false // Allow custom helpers too
  });
  
  return precompiled;
}

// No longer needed - we use the src/prompts/handlebars-helpers.js file directly

/**
 * Generate a JavaScript module for a skill preamble
 */
function generatePreambleModule(content: string, skillName: string): string {
  // Precompile the preamble template
  const precompiled = precompileTemplate(content);
  
  // Calculate relative path from build/prompts/[skill]/ to src/prompts/handlebars-helpers.js
  // For a skill like "short-story-writing", the path is build/prompts/short-story-writing/.preamble.js
  // We need to go up 3 levels (short-story-writing, prompts, build) to reach the project root
  const skillDepth = skillName.split('/').filter(p => p).length;
  const helperPath = '../'.repeat(skillDepth + 2) + 'src/prompts/handlebars-helpers.js';
  
  const moduleCode = `// Generated by build-prompts.ts
// DO NOT EDIT - This file is auto-generated from .preamble.md

import Handlebars from 'handlebars/runtime.js';
import { registerHelpers } from '${helperPath}';

// Register helpers with Handlebars runtime
registerHelpers(Handlebars);

// Precompiled preamble template
const preambleTemplate = Handlebars.template(${precompiled});
const preambleText = ${JSON.stringify(content)};
const preambleVars = ${JSON.stringify(processTemplate(content))};

// Export the skill preamble
export default {
  skill: "${skillName}",
  preamble: (context) => preambleTemplate(context || {}),
  preambleText: preambleText,
  preambleVars: preambleVars
};

// Export a render function for convenience
export function render(context = {}) {
  return preambleTemplate(context);
}
`;
  
  return moduleCode;
}

/**
 * Generate a JavaScript module for a skill result/expected outcome
 */
function generateResultModule(content: string, skillName: string): string {
  // Precompile the result template
  const precompiled = precompileTemplate(content);
  
  // Calculate relative path
  const skillDepth = skillName.split('/').filter(p => p).length;
  const helperPath = '../'.repeat(skillDepth + 2) + 'src/prompts/handlebars-helpers.js';
  
  const moduleCode = `// Generated by build-prompts.ts
// DO NOT EDIT - This file is auto-generated from .result.md

import Handlebars from 'handlebars/runtime.js';
import { registerHelpers } from '${helperPath}';

// Register helpers with Handlebars runtime
registerHelpers(Handlebars);

// Precompiled result template
const resultTemplate = Handlebars.template(${precompiled});
const expectedOutcomeText = ${JSON.stringify(content)};
const expectedOutcomeVars = ${JSON.stringify(processTemplate(content))};

// Export the skill expected outcome
export default {
  skill: "${skillName}",
  expectedOutcome: (context) => resultTemplate(context || {}),
  expectedOutcomeText: expectedOutcomeText,
  expectedOutcomeVars: expectedOutcomeVars
};

// Export a render function for convenience
export function render(context = {}) {
  return resultTemplate(context);
}
`;
  
  return moduleCode;
}

/**
 * Generate a JavaScript module for a prompt document
 */
function generateModule(promptDoc: PromptDocument, relativePath: string): string {
  // Precompile preamble if it exists
  const preambleCompiled = promptDoc.preamble 
    ? precompileTemplate(promptDoc.preamble)
    : null;
  
  // Precompile scenario expected outcome if it exists
  const expectedOutcomeCompiled = promptDoc.expectedOutcome
    ? precompileTemplate(promptDoc.expectedOutcome)
    : null;
  
  // Precompile each task's content and expected outcome
  const tasksWithCompiledContent = promptDoc.tasks.map(task => ({
    id: task.id,
    title: task.title,
    content: task.content,  // Keep raw text
    contentCompiled: precompileTemplate(task.content),
    expectedOutcome: task.expectedOutcome,  // Keep raw text
    expectedOutcomeCompiled: task.expectedOutcome 
      ? precompileTemplate(task.expectedOutcome)
      : null
  }));
  
  // Calculate relative path from build/prompts/... to src/prompts/handlebars-helpers.js
  const depth = relativePath.split('/').filter(p => p).length;
  const helperPath = '../'.repeat(depth + 1) + 'src/prompts/handlebars-helpers.js';
  
  // Generate the module code
  const moduleCode = `// Generated by build-prompts.ts
// DO NOT EDIT - This file is auto-generated from markdown sources

import Handlebars from 'handlebars/runtime.js';
import { registerHelpers } from '${helperPath}';

// Register helpers with Handlebars runtime
registerHelpers(Handlebars);

// Precompiled preamble template
${preambleCompiled ? `const preambleTemplate = Handlebars.template(${preambleCompiled});` : 'const preambleTemplate = null;'}
${promptDoc.preamble ? `const preambleText = ${JSON.stringify(promptDoc.preamble)};` : 'const preambleText = null;'}
${promptDoc.preamble ? `const preambleVars = ${JSON.stringify(processTemplate(promptDoc.preamble))};` : 'const preambleVars = null;'}

// Precompiled expected outcome template
${expectedOutcomeCompiled ? `const expectedOutcomeTemplate = Handlebars.template(${expectedOutcomeCompiled});` : 'const expectedOutcomeTemplate = null;'}
${promptDoc.expectedOutcome ? `const expectedOutcomeText = ${JSON.stringify(promptDoc.expectedOutcome)};` : 'const expectedOutcomeText = null;'}
${promptDoc.expectedOutcome ? `const expectedOutcomeVars = ${JSON.stringify(processTemplate(promptDoc.expectedOutcome))};` : 'const expectedOutcomeVars = null;'}

// Precompiled task templates
const taskTemplates = [
${tasksWithCompiledContent.map(task => {
  const contentVars = processTemplate(task.content);
  const expectedOutcomeVars = task.expectedOutcome ? processTemplate(task.expectedOutcome) : undefined;
  return `  {
    id: "${task.id}",
    title: "${task.title.replace(/"/g, '\\"')}",
    content: Handlebars.template(${task.contentCompiled}),
    contentText: ${JSON.stringify(task.content)},
    contentVars: ${JSON.stringify(contentVars)}${
    task.expectedOutcomeCompiled ? `,
    expectedOutcome: Handlebars.template(${task.expectedOutcomeCompiled}),
    expectedOutcomeText: ${JSON.stringify(task.expectedOutcome)},
    expectedOutcomeVars: ${JSON.stringify(expectedOutcomeVars)}` : ''}
  }`;
}).join(',\n')}
];

// Export the prompt document
export default {
  id: "${promptDoc.id}",
  title: "${promptDoc.title.replace(/"/g, '\\"')}",
  preamble: preambleTemplate,
  preambleText: preambleText,
  preambleVars: preambleVars,
  expectedOutcome: expectedOutcomeTemplate,
  expectedOutcomeText: expectedOutcomeText,
  expectedOutcomeVars: expectedOutcomeVars,
  tasks: taskTemplates.map(t => ({
    id: t.id,
    title: t.title,
    content: (context) => t.content(context || {}),
    contentText: t.contentText,
    contentVars: t.contentVars,
    expectedOutcome: t.expectedOutcome ? (context) => t.expectedOutcome(context || {}) : undefined,
    expectedOutcomeText: t.expectedOutcomeText || undefined,
    expectedOutcomeVars: t.expectedOutcomeVars || undefined
  }))
};

// Export a render function for convenience
export function render(context = {}) {
  return {
    id: "${promptDoc.id}",
    title: "${promptDoc.title.replace(/"/g, '\\"')}",
    preamble: preambleTemplate ? preambleTemplate(context) : undefined,
    expectedOutcome: expectedOutcomeTemplate ? expectedOutcomeTemplate(context) : undefined,
    tasks: taskTemplates.map(t => ({
      id: t.id,
      title: t.title,
      content: t.content(context),
      expectedOutcome: t.expectedOutcome ? t.expectedOutcome(context) : undefined
    }))
  };
}
`;
  
  return moduleCode;
}

async function buildPrompts() {
  // Parse command line arguments
  const verbose = process.argv.includes('--verbose');
  
  const promptsDir = path.join(process.cwd(), 'prompts', 'skills');
  const outputDir = path.join(process.cwd(), 'build', 'prompts');
  
  // Clear and recreate output directory
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);
  
  // No longer need to create helpers module - using src/prompts/handlebars-helpers.js directly
  
  // Find all markdown files in prompts directory (excluding .preamble.md)
  const mdFiles = await glob('**/*.md', { 
    cwd: promptsDir,
    absolute: false,
    ignore: ['**/.preamble.md']
  });
  
  console.log(`Found ${mdFiles.length} scenario markdown files`);
  
  // Process skill preambles
  const preambleFiles = await glob('**/.preamble.md', {
    cwd: promptsDir,
    absolute: false
  });
  
  console.log(`Found ${preambleFiles.length} skill preamble files`);
  
  // Find skill result files (.result.md)
  const resultFiles = await glob('**/.result.md', {
    cwd: promptsDir,
    absolute: false
  });
  
  console.log(`Found ${resultFiles.length} skill result files`);
  
  // Process skill preambles first
  for (const preamblePath of preambleFiles) {
    const skillName = path.dirname(preamblePath);
    const inputPath = path.join(promptsDir, preamblePath);
    const outputPath = path.join(outputDir, skillName, '.preamble.js');
    
    if (verbose) {
      console.log(`Processing preamble: ${preamblePath}`);
    }
    
    try {
      const content = await fs.readFile(inputPath, 'utf-8');
      
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Generate and write JavaScript module
      const moduleCode = generatePreambleModule(content, skillName);
      await fs.writeFile(outputPath, moduleCode, 'utf-8');
      
      if (verbose) {
        console.log(`  ✓ Generated skill preamble: ${outputPath}`);
      }
    } catch (error) {
      console.error(`  ✗ Error processing preamble ${preamblePath}:`, error);
    }
  }
  
  // Process skill result files
  for (const resultPath of resultFiles) {
    const skillName = path.dirname(resultPath);
    const inputPath = path.join(promptsDir, resultPath);
    const outputPath = path.join(outputDir, skillName, '.result.js');
    
    if (verbose) {
      console.log(`\nProcessing skill result: ${skillName}/.result.md`);
    }
    
    try {
      const content = await fs.readFile(inputPath, 'utf-8');
      
      // Extract content after "# Expected Skill Outcome" header if present
      const lines = content.split('\n');
      let outcomeContent = '';
      let foundHeader = false;
      
      for (const line of lines) {
        if (line.trim() === '# Expected Skill Outcome' || line.trim() === '## Expected Skill Outcome') {
          foundHeader = true;
          continue;
        }
        if (foundHeader) {
          outcomeContent += line + '\n';
        }
      }
      
      // If no header found, use entire content
      if (!foundHeader) {
        outcomeContent = content;
      }
      
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Generate and write JavaScript module
      const moduleCode = generateResultModule(outcomeContent.trim(), skillName);
      await fs.writeFile(outputPath, moduleCode, 'utf-8');
      
      if (verbose) {
        console.log(`  ✓ Generated skill result: ${outputPath}`);
      }
    } catch (error: any) {
      console.error(`  ✗ Error processing ${resultPath}: ${error.message}`);
    }
  }
  
  // Track skills for non-verbose output
  const skills = new Set<string>();
  let successCount = 0;
  let errorCount = 0;
  
  for (const relativePath of mdFiles) {
    const inputPath = path.join(promptsDir, relativePath);
    const baseName = relativePath.replace('.md', '');
    const outputPath = path.join(outputDir, baseName + '.js');
    
    if (verbose) {
      console.log(`Processing: ${relativePath}`);
    }
    
    try {
      const promptDoc = await parseMdFile(inputPath);
      
      if (promptDoc) {
        // Track skill from directory path
        const skillName = path.dirname(relativePath);
        if (skillName !== '.') {
          skills.add(skillName);
        }
        
        // Ensure output directory exists
        await fs.ensureDir(path.dirname(outputPath));
        
        // Generate and write JavaScript module
        const moduleCode = generateModule(promptDoc, baseName);
        await fs.writeFile(outputPath, moduleCode, 'utf-8');
        
        successCount++;
        
        if (verbose) {
          console.log(`  ✓ Generated: ${outputPath}`);
          console.log(`    Main task: ${promptDoc.id} - ${promptDoc.title}`);
          console.log(`    Subtasks: ${promptDoc.tasks.length}`);
        }
      } else {
        errorCount++;
        if (verbose) {
          console.log(`  ⚠ Skipped: No valid prompt structure found`);
        }
      }
    } catch (error) {
      errorCount++;
      console.error(`  ✗ Error processing ${relativePath}:`, error);
    }
  }
  
  if (!verbose) {
    console.log(`✓ Built ${successCount} scenario files across ${skills.size} skills`);
    if (errorCount > 0) {
      console.log(`⚠ ${errorCount} files had errors`);
    }
  } else {
    console.log('\nBuild complete!');
    console.log(`  Success: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);
  }
}

// Run the build
buildPrompts().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});