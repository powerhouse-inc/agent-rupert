import Anthropic from "@anthropic-ai/sdk";
import { IAgentBrain, IBrainLogger } from "./IAgentBrain.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const WRITE_PROMPT_TO_FILE = true;

export class AgentBrain implements IAgentBrain {
    private api: Anthropic;
    private logger?: IBrainLogger;
    private systemPrompt?: string;

    constructor(api: Anthropic) {
        this.api = api;
    }

    public setLogger(logger: IBrainLogger): void {
        this.logger = logger;
    }

    public setSystemPrompt(prompt: string, agentName?: string): void {
        this.systemPrompt = prompt;
        if (this.logger) {
            this.logger.debug(`   AgentBrain: System prompt set (${prompt.length} chars)`);
        }
        
        if (WRITE_PROMPT_TO_FILE) {
            try {
                const promptsDir = join(process.cwd(), 'tmp', 'prompts');
                mkdirSync(promptsDir, { recursive: true });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const agentPart = agentName ? `_${agentName.replace(/\s+/g, '')}` : '';
                const filename = join(promptsDir, `R${agentPart}_${timestamp}.md`);
                writeFileSync(filename, prompt, 'utf-8');
                console.log(`   DEBUG: Regular brain system prompt written to ${filename}`);
            } catch (error) {
                console.error('   DEBUG: Failed to write regular brain prompt to file:', error);
            }
        }
    }

    public getSystemPrompt(): string | undefined {
        return this.systemPrompt;
    }

    public getAnthropic(): Anthropic {
        return this.api;
    }

    /**
     * Describe WBS operations in natural language
     * Analyzes the operations and returns a human-readable description
     */
    public async describeWbsOperations(operations: any[]): Promise<string> {
        try {
            // Create a prompt with the operations data
            const userPrompt = `Analyze these Work Breakdown Structure (WBS) operations and describe what changes occurred in simple, clear English. Focus on the business meaning, not technical details.

Operations data:
${JSON.stringify(operations, null, 2)}

Provide a concise summary of what happened.`;

            const response = await this.api.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 200,
                messages: [
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                temperature: 0.3,
                ...(this.systemPrompt ? { system: this.systemPrompt } : {})
            });

            // Extract text content from response
            let description = "";
            for (const block of response.content) {
                if (block.type === "text") {
                    description += block.text;
                }
            }

            return description || "WBS document was updated";
        } catch (error) {
            console.error("Failed to describe WBS operations:", error);
            return `WBS document was updated with ${operations.length} operation(s)`;
        }
    }

    /**
     * Describe inbox operations in natural language
     * Analyzes the operations and returns a human-readable description
     */
    public async describeInboxOperations(operations: any[]): Promise<string> {
        try {
            // Create a prompt with the operations data
            const userPrompt = `Analyze these inbox document operations and describe what messages or requests were received in simple, clear English. Focus on the business meaning.

Operations data:
${JSON.stringify(operations, null, 2)}

Provide a concise summary of what was received.`;

            const response = await this.api.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 200,
                messages: [
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                temperature: 0.3,
                ...(this.systemPrompt ? { system: this.systemPrompt } : {})
            });

            // Extract text content from response
            let description = "";
            for (const block of response.content) {
                if (block.type === "text") {
                    description += block.text;
                }
            }

            return description || "Inbox received new content";
        } catch (error) {
            console.error("Failed to describe inbox operations:", error);
            return `Inbox received ${operations.length} operation(s)`;
        }
    }

    /**
     * Send a message to the brain for processing
     */
    public async sendMessage(message: string, sessionId?: string): Promise<{response: string; sessionId?: string}> {
        if (this.logger) {
            this.logger.debug(`   AgentBrain: Sending message (${message.length} chars)`);
        }

        // This implementation doesn't support sessions, ignore sessionId parameter
        if (sessionId && this.logger) {
            this.logger.debug('   AgentBrain: This implementation does not support sessions, ignoring sessionId');
        }

        try {
            const response = await this.api.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1000,
                messages: [
                    {
                        role: "user",
                        content: message
                    }
                ],
                temperature: 0.7,
                ...(this.systemPrompt ? { system: this.systemPrompt } : {})
            });

            // Extract text content from response
            let result = "";
            for (const block of response.content) {
                if (block.type === "text") {
                    result += block.text;
                }
            }

            return {
                response: result || "No response generated",
                sessionId: undefined  // This implementation doesn't support sessions
            };
        } catch (error) {
            if (this.logger) {
                this.logger.error(`   AgentBrain: Error sending message`, error);
            }
            throw error;
        }
    }
}