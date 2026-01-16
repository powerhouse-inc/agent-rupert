/**
 * Context interface for the InboxHandlingFlow
 * Used to pass message-specific data to the handle-stakeholder-message skill scenarios
 */
export interface InboxHandlingFlowContext {
    /**
     * Document references for the agent manager drive
     */
    documents: {
        /**
         * The drive ID where the inbox and WBS documents are stored
         */
        driveId: string;
        
        /**
         * Reference to the inbox document
         */
        inbox: {
            id: string;
        };
        
        /**
         * Reference to the WBS document
         */
        wbs: {
            id: string;
        };
    };
    
    /**
     * Information about the stakeholder who sent the message
     */
    stakeholder: {
        name: string;
    };
    
    /**
     * Thread information containing the message
     */
    thread: {
        id: string;
        topic: string;
    };
    
    /**
     * The specific message to be processed
     */
    message: {
        id: string;
        content: string;
    };
}

/**
 * Extended context that includes tracking information for the flow
 */
export interface InboxHandlingFlowState extends InboxHandlingFlowContext {
    /**
     * Track which messages have been processed
     */
    processedMessageIds: Set<string>;
    
    /**
     * Track any errors during processing
     */
    errors: Array<{
        messageId: string;
        error: Error;
    }>;
}