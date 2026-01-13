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
    setSystemPrompt?(prompt: string, agentName?: string): void;

    /**
     * Get the current system prompt
     * @returns Current system prompt or undefined if not set
     */
    getSystemPrompt?(): string | undefined;

    /**
     * Describe WBS operations in natural language
     * Analyzes the operations and returns a human-readable description
     * @param operations Array of WBS operations to analyze
     * @returns Promise with human-readable description of the operations
     */
    describeWbsOperations(operations: any[]): Promise<string>;

    /**
     * Describe inbox operations in natural language
     * Analyzes the operations and returns a human-readable description
     * @param operations Array of inbox operations to analyze
     * @returns Promise with human-readable description of the operations
     */
    describeInboxOperations(operations: any[]): Promise<string>;

    /**
     * Send a message to the brain for processing
     * @param message The message to send
     * @returns Promise with the response from the brain
     */
    sendMessage?(message: string): Promise<string>;
}