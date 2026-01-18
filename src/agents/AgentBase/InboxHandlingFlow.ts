import type { AgentInboxDocument } from 'powerhouse-agent/document-models/agent-inbox';
import type { InboxHandlingFlowContext } from './InboxHandlingFlowContext.js';
import { WorkItemParams, WorkItemType } from './AgentRoutine.js';

/**
 * Utility class for extracting unread messages from an inbox document
 */
export class InboxRoutineHandler {

    public static getNextWorkItem(inbox: AgentInboxDocument): { type: WorkItemType, params: WorkItemParams } | null {
        throw new Error("Not yet implemented");
    }

    public static hasUnreadMessages(inbox: AgentInboxDocument): boolean {
        const state = inbox.state.global;
        
        // Check if there are any unread messages
        if (state.threads && Array.isArray(state.threads)) {
            for (const thread of state.threads) {
                if (thread.messages && Array.isArray(thread.messages)) {
                    for (const message of thread.messages) {
                        // Check if message is unread and from stakeholder (Incoming flow)
                        if (!message.read && message.flow === 'Incoming') {
                            return true;
                        }
                    }
                }
            }
        }
        
        return false;
    }

    /**
     * Static helper to get the context for the next unread message
     * Returns null if no unread messages are found
     */
    public static getNextUnreadMessage(
        inbox: AgentInboxDocument,
        driveUrl: string,
        wbsId: string,
    ): InboxHandlingFlowContext | null {
        const state = inbox.state.global;
        
        // Find the first unread message from a stakeholder
        if (state.threads && Array.isArray(state.threads)) {
            for (const thread of state.threads) {
                if (thread.messages && Array.isArray(thread.messages)) {
                    for (const message of thread.messages) {
                        // Check if message is unread and from stakeholder (Incoming flow)
                        if (!message.read && message.flow === 'Incoming') {
                            // Get stakeholder name
                            const stakeholderId = thread.stakeholder;
                            const stakeholder = state.stakeholders?.find(s => s.id === stakeholderId);
                            const stakeholderName = stakeholder?.name || 'Unknown';
                            
                            // Return context for this message
                            return {
                                documents: {
                                    driveId: driveUrl || '',
                                    inbox: {
                                        id: inbox.header.id || ''
                                    },
                                    wbs: {
                                        id: wbsId || ''
                                    }
                                },
                                stakeholder: {
                                    name: stakeholderName
                                },
                                thread: {
                                    id: thread.id,
                                    topic: thread.topic || 'No topic'
                                },
                                message: {
                                    id: message.id,
                                    content: message.content || ''
                                }
                            };
                        }
                    }
                }
            }
        }
        
        // No unread messages found
        return null;
    }
}