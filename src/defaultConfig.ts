import { ServerConfig } from "./types.js";
import dotenv from 'dotenv';

dotenv.config();

export const defaultConfig: ServerConfig = {
    serverPort: Number(process.env.API_PORT) || 3100,
    agents: {
        reactorPackageDev: {
            name: "ReactorPackageDev",
            workDrive: {
                driveUrl: process.env.AGENT_MANAGER_DRIVE || null,
                reactorStorage: {
                    type: 'memory'
                },
                documents: {
                    inbox: {
                        documentType: "powerhouse/agent-inbox",
                        documentId: null,
                    },
                    wbs: {
                        documentType: "powerhouse/work-breakdown-structure",
                        documentId: null,
                    }
                }
            },
            reactorPackages: {
                projectsDir: "../projects",
                defaultProjectName: "agent-project",
                autoStartDefaultProject: false,
            },
            vetraConfig: {
                connectPort: Number(process.env.VETRA_CONNECT_PORT) || 5000,
                switchboardPort: Number(process.env.VETRA_SWITCHBOARD_PORT) || 6100,
                startupTimeout: Number(process.env.VETRA_STARTUP_TIMEOUT) || 60000
            }
        },
        powerhouseArchitect: {
            name: "PowerhouseArchitect",
            workDrive: {
                driveUrl: process.env.AGENT_MANAGER_DRIVE || null,
                reactorStorage: {
                    type: 'memory'
                },
                documents: {
                    inbox: {
                        documentType: "powerhouse/agent-inbox",
                        documentId: null,
                    },
                    wbs: {
                        documentType: "powerhouse/work-breakdown-structure",
                        documentId: null,
                    }
                }
            }
        }
    }
}