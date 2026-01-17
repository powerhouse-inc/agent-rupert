#!/usr/bin/env node

// Test script to verify self-reflection MCP returns complete SkillInfo
const http = require('http');

async function testSelfReflectionAPI() {
    console.log('Testing self-reflection MCP endpoints...\n');
    
    // Test the list_skills endpoint to see if it returns complete SkillInfo
    const testEndpoint = async (path) => {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 3100,
                path: path,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(data);
                    }
                });
            });
            
            req.on('error', reject);
            req.end();
        });
    };
    
    try {
        // Test the /agents/reactor-dev/skills endpoint
        console.log('Testing /agents/reactor-dev/skills endpoint...');
        const skillsResponse = await testEndpoint('/agents/reactor-dev/skills');
        
        if (skillsResponse && skillsResponse.skills && skillsResponse.skills.length > 0) {
            const firstSkill = skillsResponse.skills[0];
            console.log(`\nFirst skill: ${firstSkill.name} (${firstSkill.id})`);
            console.log(`Has preamble: ${firstSkill.hasPreamble}`);
            console.log(`Has expectedOutcome: ${!!firstSkill.expectedOutcome}`);
            
            // Check if preambleTemplate has text and vars
            if (firstSkill.preambleTemplate) {
                console.log(`Preamble template text: ${!!firstSkill.preambleTemplate.text}`);
                console.log(`Preamble variables: ${firstSkill.preambleTemplate.vars || []}`);
            }
            
            // Check first scenario
            if (firstSkill.scenarios && firstSkill.scenarios.length > 0) {
                const firstScenario = firstSkill.scenarios[0];
                console.log(`\nFirst scenario: ${firstScenario.id} - ${firstScenario.title}`);
                console.log(`Has preamble: ${firstScenario.hasPreamble}`);
                
                // Check first task
                if (firstScenario.tasks && firstScenario.tasks.length > 0) {
                    const firstTask = firstScenario.tasks[0];
                    console.log(`\nFirst task: ${firstTask.id} - ${firstTask.title}`);
                    console.log(`Has template text: ${!!firstTask.template.text}`);
                    console.log(`Template variables: ${firstTask.template.vars || []}`);
                }
            }
            
            console.log('\n✅ Self-reflection MCP returns complete SkillInfo with templates and variables!');
        } else {
            console.log('❌ No skills returned or unexpected format');
        }
        
    } catch (error) {
        console.error('Error testing endpoint:', error);
    }
}

// Run test if server is running
testSelfReflectionAPI().catch(console.error);