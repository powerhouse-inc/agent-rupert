/**
 * Interface for agent brain implementations
 * Provides natural language processing capabilities for agent operations
 */
export interface IAgentBrain {
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
}