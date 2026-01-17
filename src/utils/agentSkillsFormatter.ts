import fs from 'fs-extra';
import { join } from 'path';
import type { SkillInfo, TemplateWithVars } from '../prompts/types.js';

const { writeFile, ensureDir } = fs;

/**
 * Escape backticks in template text for markdown code blocks
 */
function escapeBackticks(text: string): string {
  // Replace ``` with \`\`\` to escape them in markdown
  return text.replace(/```/g, '\\`\\`\\`');
}

/**
 * Format template with vars as markdown
 */
function formatTemplate(template: TemplateWithVars | string | undefined, title: string): string {
  if (!template) return '';
  
  let sections: string[] = [];
  
  // Handle both TemplateWithVars and string formats
  if (typeof template === 'string') {
    sections.push(`**${title}:**`);
    sections.push('```md');
    sections.push(escapeBackticks(template));
    sections.push('```');
  } else if (template && typeof template === 'object' && 'text' in template) {
    sections.push(`**${title}:**`);
    sections.push('```md');
    sections.push(escapeBackticks(template.text));
    sections.push('```');
    
    if (template.vars && template.vars.length > 0) {
      sections.push(`*Variables:* ${template.vars.map(v => `\`${v}\``).join(', ')}`);
    }
  }
  
  return sections.length > 0 ? sections.join('\n') + '\n' : '';
}

/**
 * Format skills info as markdown
 */
function formatSkillsAsMarkdown(
  agentName: string,
  agentType: string,
  profile: (TemplateWithVars | undefined)[],
  skills: SkillInfo[] | null
): string {
  const lines: string[] = [];
  
  // Header
  lines.push(`# Agent: ${agentName}`);
  lines.push('');
  lines.push(`**Type:** ${agentType}`);
  lines.push('');
  
  // Profile Templates
  if (profile && profile.length > 0) {
    lines.push('## System Prompt Templates');
    lines.push('');
    
    profile.forEach((template, index) => {
      if (!template) return;
      
      lines.push(`### Profile Template ${index + 1}`);
      lines.push('');
      
      if (typeof template === 'object' && 'text' in template) {
        lines.push('```md');
        lines.push(escapeBackticks(template.text));
        lines.push('```');
        lines.push('');
        
        if (template.vars && template.vars.length > 0) {
          lines.push(`**Variables:** ${template.vars.map(v => `\`${v}\``).join(', ')}`);
          lines.push('');
        }
      }
    });
  }
  
  // Skills
  if (skills && skills.length > 0) {
    lines.push('## Skills');
    lines.push('');
    
    skills.forEach(skill => {
      lines.push(`### Skill: ${skill.name} (${skill.id})`);
      lines.push('');
      
      // Skill preamble
      if (skill.hasPreamble && skill.preambleTemplate) {
        lines.push(formatTemplate(skill.preambleTemplate, 'Skill Preamble'));
      }
      
      // Skill expected outcome
      if (skill.expectedOutcome) {
        lines.push(formatTemplate(skill.expectedOutcome, 'Skill Expected Outcome'));
      }
      
      // Scenarios
      if (skill.scenarios.length > 0) {
        lines.push('#### Scenarios');
        lines.push('');
        
        skill.scenarios.forEach(scenario => {
          lines.push(`##### ${scenario.id}: ${scenario.title}`);
          lines.push('');
          
          // Scenario preamble
          if (scenario.hasPreamble && scenario.preambleTemplate) {
            lines.push(formatTemplate(scenario.preambleTemplate, 'Scenario Preamble'));
          }
          
          // Scenario expected outcome
          if (scenario.expectedOutcome) {
            lines.push(formatTemplate(scenario.expectedOutcome, 'Scenario Expected Outcome'));
          }
          
          // Tasks
          if (scenario.tasks.length > 0) {
            lines.push('**Tasks:**');
            lines.push('');
            
            scenario.tasks.forEach(task => {
              lines.push(`###### ${task.id}: ${task.title}`);
              lines.push('');
              
              // Task template
              lines.push(formatTemplate(task.template, 'Task Template'));
              
              // Task expected outcome
              if (task.expectedOutcome) {
                lines.push(formatTemplate(task.expectedOutcome, 'Task Expected Outcome'));
              }
            });
          }
        });
      }
      
      lines.push('---');
      lines.push('');
    });
  } else if (skills === null) {
    lines.push('## Skills');
    lines.push('');
    lines.push('*No skills configured for this agent*');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Write agent skills info to markdown file
 */
export async function writeAgentSkillsInfo(
  agentName: string,
  agentType: string,
  skillsAndProfile: { skills: SkillInfo[] | null; profile: (TemplateWithVars | undefined)[] } | null,
  outputDir: string = './prompts/agent-descriptions'
): Promise<void> {
  if (!skillsAndProfile) {
    console.warn(`No skills/profile data available for agent ${agentName}`);
    return;
  }
  
  // Ensure output directory exists
  await ensureDir(outputDir);
  
  // Format the markdown
  const markdown = formatSkillsAsMarkdown(
    agentName,
    agentType,
    skillsAndProfile.profile,
    skillsAndProfile.skills
  );
  
  // Write to file
  const fileName = `${agentName}.md`;
  const filePath = join(outputDir, fileName);
  
  await writeFile(filePath, markdown, 'utf-8');
  
  console.log(`Written agent skills info to ${filePath}`);
}

/**
 * Write all agents' skills info to markdown files
 */
export async function writeAllAgentsSkillsInfo(
  agents: Array<{
    name: string;
    type: string;
    getSkillsAndProfile: () => Promise<{ skills: SkillInfo[] | null; profile: (TemplateWithVars | undefined)[] } | null>;
  }>,
  outputDir: string = './prompts/agent-descriptions'
): Promise<void> {
  console.log('Writing agent skills info to markdown files...');
  
  for (const agent of agents) {
    try {
      const skillsAndProfile = await agent.getSkillsAndProfile();
      await writeAgentSkillsInfo(agent.name, agent.type, skillsAndProfile, outputDir);
    } catch (error) {
      console.error(`Failed to write skills info for agent ${agent.name}:`, error);
    }
  }
  
  console.log('Finished writing agent skills info');
}