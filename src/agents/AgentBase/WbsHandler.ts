import { WorkBreakdownStructureDocument } from "powerhouse-agent/document-models/work-breakdown-structure";
import { WorkItemParams, WorkItemType } from "./AgentRoutine.js";

export class WbsRoutineHandler {
    
    public static getNextWorkItem(wbs: WorkBreakdownStructureDocument): { type: WorkItemType, params: WorkItemParams } | null {
        throw new Error("Not yet implemented");
    }

}