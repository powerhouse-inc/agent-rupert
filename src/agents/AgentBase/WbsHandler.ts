import { WorkBreakdownStructureDocument } from "powerhouse-agent/document-models/work-breakdown-structure";
import { WorkItemParams, WorkItemType } from "./AgentRoutine.js";

export class WbsRoutineHandler {
    
    /**
     * Get the next work item from the WBS document
     * Currently returns an idle work item as a placeholder
     * TODO: Implement actual WBS goal processing
     */
    public static getNextWorkItem(wbs: WorkBreakdownStructureDocument): { type: WorkItemType, params: WorkItemParams } | null {
        // For now, just return an idle work item
        // In the future, this would analyze WBS goals and create appropriate work items
        return {
            type: 'idle',
            params: {}
        };
    }

}