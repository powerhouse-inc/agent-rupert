/**
 * Logger interface for brain implementations
 */
export interface IBrainLogger {
    info(message: string): void;
    error(message: string, error?: any): void;
    warn(message: string): void;
    debug(message: string): void;
}

/**
 * Interface for agent brain implementations
 * Provides natural language processing capabilities for agent operations
 */
export interface IAgentBrain {
    /**
     * Set the logger for the brain implementation
     * @param logger Logger instance for logging operations
     */
    setLogger(logger: IBrainLogger): void;

    /**
     * Set the system prompt for the brain
     * This prompt provides context and instructions for all operations
     * @param prompt System prompt text
     * @param agentName Optional agent name for debugging
     */
    setSystemPrompt(prompt: string, agentName?: string): void;

    /**
     * Get the current system prompt
     * @returns Current system prompt or undefined if not set
     */
    getSystemPrompt(): string | undefined;

    /**
     * Send a message to the brain for processing
     * @param message The message to send
     * @param sessionId Optional session ID to resume a previous conversation
     * @param options Optional configuration for this message
     * @returns Promise with the response and session ID for continuing the conversation
     */
    sendMessage(message: string, sessionId?: string, options?: { maxTurns?: number }): Promise<{response: string; sessionId?: string}>;

    /**
     * Cleanup any resources used by the brain
     * Called when the brain is no longer needed
     */
    cleanup?(): Promise<void>;
}