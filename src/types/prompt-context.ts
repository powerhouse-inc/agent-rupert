/**
 * Context data for agent brain prompt templates
 */
export interface AgentBrainPromptContext {
    // Server configuration
    serverPort: number;
    anthropicApiKey: boolean; // Just whether it exists, not the actual key
    
    // Agent identification
    agentName: string;
    agentType: 'ReactorPackageDevAgent' | 'PowerhouseArchitectAgent' | 'CreativeWriterAgent';
    
    // Agent workspace
    workingDirectory?: string;
    
    // ReactorPackageDevAgent specific
    projectsDir?: string;
    defaultProjectName?: string;
    vetraConfig?: {
        connectPort: number;
        switchboardPort: number;
        startupTimeout: number;
    };
    
    // Runtime state
    timestamp: string;
    mcpServers: string[];
    allowedTools?: string[];
    model?: string;
    
    // Drive configuration
    driveUrl?: string;
    documentIds?: {
        inbox?: string;
        wbs?: string;
    };
    
    // Storage configuration
    storageType?: 'memory' | 'filesystem';
    
    // Additional capabilities or features
    capabilities?: string[];
    
    // CreativeWriterAgent specific
    genre?: string;
}

/**
 * Context data for task prompt templates (future use)
 */
export interface TaskPromptContext {
    taskId: string;
    taskName: string;
    taskDescription: string;
    taskType: string;
    agentName: string;
    agentType: string;
    priority?: 'low' | 'medium' | 'high';
    deadline?: string;
    dependencies?: string[];
    timestamp: string;
}

/**
 * Context data for workflow prompt templates (future use)
 */
export interface WorkflowPromptContext {
    workflowId: string;
    workflowName: string;
    workflowDescription: string;
    steps: Array<{
        stepId: string;
        stepName: string;
        stepDescription: string;
        status: 'pending' | 'in_progress' | 'completed' | 'failed';
    }>;
    currentStep?: string;
    agentName: string;
    timestamp: string;
}