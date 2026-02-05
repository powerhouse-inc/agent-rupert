import { ServerConfig } from "./types.js";
import dotenv from 'dotenv';

dotenv.config();

// Base path for all agent-created projects (useful for PVC mounts in Kubernetes)
const PROJECTS_BASE_PATH = process.env.PROJECTS_BASE_PATH || '../projects';

export const config: ServerConfig = {
    serverPort: Number(process.env.API_PORT) || 3100,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    agents: {
        reactorPackageDev: {
            name: process.env.REACTOR_PACKAGES_DEV_NAME || "Reactor Package Dev",
            workDrive: {
                driveUrl: process.env.AGENT_MANAGER_DRIVE || null,
                reactorStorage: {
                    type: 'memory'
                },
                documents: {
                    inbox: {
                        documentType: "powerhouse/agent-inbox",
                        documentId: process.env.REACTOR_PACKAGES_DEV_INBOX || null,
                    },
                    wbs: {
                        documentType: "powerhouse/work-breakdown-structure",
                        documentId: process.env.REACTOR_PACKAGES_DEV_WBS || null,
                    }
                }
            },
            reactorPackages: {
                projectsDir: process.env.REACTOR_PACKAGES_PATH || `${PROJECTS_BASE_PATH}/reactor-packages`,
                defaultProjectName: "agent-project",
                autoStartDefaultProject: false,
            },
            fusionProjects: {
                projectsDir: process.env.FUSION_PROJECTS_PATH || `${PROJECTS_BASE_PATH}/fusion`,
                nextjsPort: Number(process.env.FUSION_NEXTJS_PORT) || 8000,
            },
            vetraConfig: {
                connectPort: Number(process.env.VETRA_CONNECT_PORT) || 5000,
                switchboardPort: Number(process.env.VETRA_SWITCHBOARD_PORT) || 6100,
                startupTimeout: Number(process.env.VETRA_STARTUP_TIMEOUT) || 60000
            }
        },
        powerhouseArchitect: {
            name: process.env.POWERHOUSE_ARCHITECT_NAME || "Powerhouse Architect",
            workDrive: {
                driveUrl: process.env.AGENT_MANAGER_DRIVE || null,
                reactorStorage: {
                    type: 'memory'
                },
                documents: {
                    inbox: {
                        documentType: "powerhouse/agent-inbox",
                        documentId: process.env.POWERHOUSE_ARCHITECT_INBOX || null,
                    },
                    wbs: {
                        documentType: "powerhouse/work-breakdown-structure",
                        documentId: process.env.POWERHOUSE_ARCHITECT_WBS || null,
                    }
                }
            }
        }
    }
}