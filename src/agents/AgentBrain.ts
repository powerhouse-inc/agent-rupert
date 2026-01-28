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

    /**
     * End a conversation session
     * No-op in this implementation as it doesn't support sessions
     */
    public async endSession(sessionId: string): Promise<void> {
        // This implementation doesn't support sessions, so this is a no-op
        if (this.logger) {
            this.logger.debug(`   AgentBrain: endSession called for ${sessionId} (no-op)`);
        }
    }
}