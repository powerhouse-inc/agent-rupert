import Anthropic from "@anthropic-ai/sdk";

export class AgentBrain {
    private api: Anthropic;

    constructor(api: Anthropic) {
        this.api = api;
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
            const prompt = `Analyze these Work Breakdown Structure (WBS) operations and describe what changes occurred in simple, clear English. Focus on the business meaning, not technical details.

Operations data:
${JSON.stringify(operations, null, 2)}

Provide a concise summary of what happened.`;

            const response = await this.api.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 200,
                messages: [{
                    role: "user",
                    content: prompt
                }],
                temperature: 0.3
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
            const prompt = `Analyze these inbox document operations and describe what messages or requests were received in simple, clear English. Focus on the business meaning.

Operations data:
${JSON.stringify(operations, null, 2)}

Provide a concise summary of what was received.`;

            const response = await this.api.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 200,
                messages: [{
                    role: "user",
                    content: prompt
                }],
                temperature: 0.3
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
}