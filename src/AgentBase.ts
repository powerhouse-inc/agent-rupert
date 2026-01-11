
/**
 *  The AgentBase class implements a Powerhouse Agent which operates as follows: 
 * 
 *  - The agent has a Claude agent as brain and runs a Powerhouse Reactor with a 
 *    number of work documents that it uses for communication, planning and delegation of tasks.
 * 
 *  - The Powerhouse Agent:
 *      (1) maintains a powerhouse/messages document with message threads with stakeholders
 *      (2) maintains a powerhouse/work-breakdown-structure (WBS) with its goals and their status
 *      (3) can determine if it's capable of achieving a goal by 
 *          (a) breaking it down in subgoals
 *          (b) perform a task directly
 *          (c) or delegate a task to an underling
 *      (3) has zero or more tools that it can use to perform tasks by itself
 *      (4) has zero or more underling agents that it can delegate tasks to
 *      (5) has an execution loop which is detailed below
 * 
 *  - In its execution loop, the Powerhouse Agent: 
 *      (1) Reviews its WBS for context to understand what it is working on
 *      (2) Processes unread messages by extracting and categorizing requests and replies from stakeholders: 
 *          - Stakeholder responses to earlier feedback requests are applied to the WBS. It determines if 
 *            a stakeholder response unblocks the goal it's related to.
 *              - If so, it unblocks the goal in the WBS
 *              - If not, it adds a note to the WBS goal and asks the stakeholder another question
 *          - New work requests are applied to the WBS
 *              - New goals can be created in as draft or ready mode. If a goal is in draft mode, the Agent 
 *                may request additional stakeholder info.
 *              - Goals can be marked as WONT_DO to remove them from scope
 *              - The goal hierarchy can be reshuffled by moving goals and subgoals around
 *          - New information requests from stakeholders are:
 *              - either replied to directly, if the agent can reply based on its WBS
 *              - or simply acknowledged if the question needs to be delegated to an underling
 *      (3) Extracts 0 to N next active_work_steps from the active WBS goals and works on them
 *          - If a goal is In Review, that gets priority
 *          - If a goal is In Progress, that gets worked on next
 *          - If a goal is Delegated, the Agent will check on its status
 *      (4) If active_work_steps < N the Agent will decide what to work on next
 *          - A goal can be moved from TODO to IN_PROGRESS
 *          - A goal can be moved from TODO to DELEGATED
 *      
 */
class AgentBase {

}