import type { AgentInboxDocument } from 'powerhouse-agent/document-models/agent-inbox';
import type { InboxHandlingFlowContext } from './InboxHandlingFlowContext.js';
import type { BaseAgentConfig } from '../../types.js';

/**
 * Utility class for extracting unread messages from an inbox document
 */
export class InboxHandlingFlow {
    /**
     * Static helper to get the context for the next unread message
     * Returns null if no unread messages are found
     */
    public static getNextUnreadMessage(
        inbox: AgentInboxDocument,
        workDriveConfig: BaseAgentConfig['workDrive']
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
                                    driveId: workDriveConfig.driveUrl || '',
                                    inbox: {
                                        id: workDriveConfig.documents?.inbox?.documentId || ''
                                    },
                                    wbs: {
                                        id: workDriveConfig.documents?.wbs?.documentId || ''
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