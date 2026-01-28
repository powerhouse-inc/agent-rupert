import path from 'node:path';
import fs from 'node:fs/promises';
import { CLIExecutor } from '../../tasks/executors/cli-executor.js';
import { ServiceExecutor } from '../../tasks/executors/service-executor.js';
import { createCLITask, createServiceTask } from '../../tasks/types.js';
import type { CLITask, ServiceTask } from '../../tasks/types.js';
import type { ChildProcess } from 'node:child_process';
import { AbstractProjectManager, type InitProjectResult, type BaseRunningProject } from './AbstractProjectManager.js';

export interface ReactorPackageConfig {
  name: string;
  path: string;
  connectPort?: number;      // Connect Studio port (default: 3000)
  switchboardPort?: number;   // Vetra Switchboard port (default: 4001)
}

/**
 * Represents a currently running ReactorPackage project
 */
export interface RunningReactorPackageProject extends BaseRunningProject {
  /** Connect Studio port */
  connectPort: number;
  /** Vetra Switchboard port */
  switchboardPort: number;
  /** The Drive URL once vetra has fully started (e.g., http://localhost:4001/drives/xyz) */
  driveUrl?: string;
  /** The MCP server once vetra has fully started (e.g., http://localhost:4001/mcp) */
  mcpServer?: string;
}

/**
 * Options for running a Powerhouse project
 */
export interface RunProjectOptions {
  /** Connect Studio port (default: 3000) */
  connectPort: number;
  /** Vetra Switchboard port (default: 4001) */
  switchboardPort: number;
  /** Timeout in milliseconds to wait for vetra to fully start (default: 60000) */
  startupTimeout: number;
}

/**
 * Result of running a Powerhouse project
 */
export interface RunProjectResult {
  /** Whether the project started successfully */
  success: boolean;
  /** Name of the project */
  projectName?: string;
  /** Error message if the operation failed */
  error?: string;
  /** Connect Studio port the project is running on */
  connectPort?: number;
  /** Vetra Switchboard port the project is running on */
  switchboardPort?: number;
  /** The Drive URL if captured during startup (e.g., http://localhost:4001/drives/xyz) */
  driveUrl?: string;
  /** The MCP server once vetra has fully started (e.g., http://localhost:4001/mcp) */
  mcpServer?: string;
  /** The folder of the project */
  projectPath?: string;
}

interface VetraRuntimeParams {
  driveUrl: string | null;
  mcpServer: string | null;
}

export interface VetraConfig {
  connectPort: number;
  switchboardPort: number;
  startupTimeout: number;
}

export class ReactorPackagesManager extends AbstractProjectManager<
  ReactorPackageConfig,
  RunningReactorPackageProject,
  RunProjectOptions,
  RunProjectResult
> {
  private readonly vetraConfig: VetraConfig;

  constructor(
    projectsDir: string = '../projects/reactor-packages',
    cliExecutor?: CLIExecutor,
    serviceExecutor?: ServiceExecutor,
    vetraConfig?: VetraConfig
  ) {
    super(projectsDir, cliExecutor, serviceExecutor);
    
    // Store vetraConfig with defaults if not provided
    this.vetraConfig = vetraConfig || {
      connectPort: 3000,
      switchboardPort: 4001,
      startupTimeout: 240000
    };
  }

  /**
   * Get the configuration file name for Reactor packages
   */
  protected getProjectConfigFile(): string {
    return 'powerhouse.config.json';
  }

  /**
   * Create initialization tasks for Reactor package
   */
  protected createInitTask(projectName: string, projectPath: string): CLITask[] {
    const tasks: CLITask[] = [];
    
    // Main ph init task
    tasks.push(createCLITask({
      title: `Initialize Powerhouse project: ${projectName}`,
      instructions: `Create a new Powerhouse project using ph init`,
      command: 'ph',
      args: ['init', projectName],
      workingDirectory: this.projectsDir,
      environment: {
        // Ensure non-interactive mode if available
        CI: 'true'
      }
    }));

    // Document engineering upgrade task (workaround for zod issues)
    tasks.push(createCLITask({
      title: `Install document-engineering package v1.40.0 for project: ${projectName}`,
      instructions: `Upgrade document-engineering to avoid zod issues`,
      command: 'pnpm',
      args: ['install', '@powerhousedao/document-engineering@1.40.0'],
      workingDirectory: projectPath,
      environment: {
        CI: 'true'
      }
    }));

    return tasks;
  }

  /**
   * Create the service task for running the Reactor package
   */
  protected createRunTask(project: ReactorPackageConfig, options: RunProjectOptions): ServiceTask {
    return createServiceTask({
      title: `Run Powerhouse project: ${project.name}`,
      instructions: `Start Powerhouse Vetra development server for ${project.name}`,
      command: 'ph',
      args: [
        'vetra',
        '--watch',
        '--connect-port', String(options.connectPort),
        '--switchboard-port', String(options.switchboardPort)
      ],
      workingDirectory: project.path,
      environment: {
        
        // Set PORT as a work-around for bug: 
        // https://github.com/powerhouse-inc/powerhouse/commit/9830c16b26500b6dfe706d8a903ac693311179b7#diff-dbb1c0dff3668e70a2e234186d612eb607994f4f253e661cf3d6b0668258fd72L519
        PORT: String(options.switchboardPort),

        NODE_ENV: 'development'
      },
      gracefulShutdown: {
        signal: 'SIGTERM',
        timeout: 10000
      },
      readiness: {
        patterns: [
          {
            regex: 'Local:\\s*http://localhost:(\\d+)',
            name: 'connect-port',
            endpoints: [{
              endpointName: 'connect-studio',
              endpointDefaultHostUrl: 'http://localhost',
              endpointCaptureGroup: 1,
              monitorPortReleaseUponTermination: true
            }]
          },
          {
            regex: 'Drive URL:\\s*(https?://[^\\s]+)',
            name: 'drive-url',
            endpoints: [{
              endpointName: 'drive-url',
              endpointDefaultHostUrl: '',
              endpointCaptureGroup: 1,
              monitorPortReleaseUponTermination: false
            }]
          },
          {
            regex: 'MCP server available at (https?://[^\\s]+)',
            name: 'mcp-server',
            endpoints: [{
              endpointName: 'mcp-server',
              endpointDefaultHostUrl: '',
              endpointCaptureGroup: 1,
              monitorPortReleaseUponTermination: false
            }]
          },
        ],
        timeout: options.startupTimeout
      }
    });
  }

  /**
   * Extract readiness parameters from service ready event
   */
  protected extractReadinessParams(event: any): VetraRuntimeParams {
    const driveUrl = event.handle.endpoints?.get('drive-url') || null;
    const mcpServer = event.handle.endpoints?.get('mcp-server') || null;
    return { driveUrl, mcpServer };
  }

  /**
   * Initialize a new Powerhouse project using ph init
   * @param projectName - Name of the project to create
   * @returns Result of the initialization
   */
  async init(projectName: string): Promise<InitProjectResult> {
    const validation = this.validateProjectName(projectName);
    if (!validation.valid) {
      return {
        success: false,
        projectPath: '',
        error: validation.error
      };
    }

    const projectPath = path.join(this.projectsDir, projectName);

    try {
      // Ensure projects directory exists
      await this.ensureProjectsDirectory();

      // Check if project already exists
      if (await this.checkProjectExists(projectPath)) {
        return {
          success: false,
          projectPath,
          error: `Project '${projectName}' already exists at ${projectPath}`
        };
      }

      // Get initialization tasks
      const tasks = this.createInitTask(projectName, projectPath);
      
      // Execute all tasks
      let lastResult;
      for (const task of tasks) {
        lastResult = await this.cliExecutor.execute(task);
        
        // Stop if any task fails, unless it's the first task which creates the project
        if (lastResult.exitCode !== 0 && tasks.indexOf(task) > 0) {
          break;
        }
      }

      // Check if initialization was successful
      if (lastResult && lastResult.exitCode === 0) {
        // Verify the project was created
        try {
          await fs.access(projectPath);

          // Check for key files that indicate successful initialization
          const packageJsonPath = path.join(projectPath, 'package.json');
          const configPath = path.join(projectPath, 'powerhouse.config.json');

          await fs.access(packageJsonPath);
          await fs.access(configPath);

          return {
            success: true,
            projectPath
          };
        } catch (error) {
          return {
            success: false,
            projectPath,
            error: `Project created but missing expected files: ${error}`
          };
        }
      } else {
        // Extract error from stderr or stdout
        const errorMessage = lastResult?.stderr || lastResult?.stdout || 'Unknown error during initialization';
        const finalErrorMessage = `ph init failed: ${errorMessage}`;

        return {
          success: false,
          projectPath,
          error: finalErrorMessage
        };
      }
    } catch (error) {
      const errorMessage = `Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`;

      return {
        success: false,
        projectPath,
        error: errorMessage
      };
    }
  }

  /**
   * List all Powerhouse projects in the projects directory
   * @returns Array of project configurations
   */
  async listProjects(): Promise<ReactorPackageConfig[]> {
    const projects: ReactorPackageConfig[] = [];

    try {
      // Ensure directory exists
      await this.ensureProjectsDirectory();

      // Read directory contents
      const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });

      // Check each directory for Powerhouse project
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(this.projectsDir, entry.name);
          const configPath = path.join(projectPath, this.getProjectConfigFile());

          try {
            // Check if it's a valid Powerhouse project
            await fs.access(configPath);

            // Read the configuration
            const configContent = await fs.readFile(configPath, 'utf-8');
            const config = JSON.parse(configContent);

            projects.push({
              name: entry.name,
              path: projectPath,
              connectPort: config.studio?.port || config.connect?.port,
              switchboardPort: config.reactor?.port || config.switchboard?.port
            });
          } catch {
            // Not a Powerhouse project or invalid config, skip
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or other error
      // Error listing projects
    }

    return projects;
  }

  async runProject(projectName: string, options?: RunProjectOptions): Promise<RunProjectResult> {
    // Set defaults for options using vetraConfig
    const effectiveOptions: RunProjectOptions = {
      connectPort: options?.connectPort || this.vetraConfig.connectPort,
      switchboardPort: options?.switchboardPort || this.vetraConfig.switchboardPort,
      startupTimeout: options?.startupTimeout || this.vetraConfig.startupTimeout
    };
    
    // Check if a project is already running
    if (this.runningProject) {
      return {
        success: false,
        error: `A project is already running: ${this.runningProject.name}. Please shutdown the current project first.`
      };
    }

    // Check if ports are available before attempting to start
    const connectPortInUse = await this.isPortInUse(effectiveOptions.connectPort);
    if (connectPortInUse) {
      return {
        success: false,
        error: `Port ${effectiveOptions.connectPort} (Connect Studio) is already in use. Try a different port or stop the process using it.`,
        projectName,
        ...effectiveOptions
      };
    }

    const switchboardPortInUse = await this.isPortInUse(effectiveOptions.switchboardPort);
    if (switchboardPortInUse) {
      return {
        success: false,
        error: `Port ${effectiveOptions.switchboardPort} (Switchboard) is already in use. Try a different port or stop the process using it.`,
        projectName,
        ...effectiveOptions
      };
    }

    // Validate project name
    if (!projectName || projectName.trim() === '') {
      return {
        success: false,
        error: 'Project name cannot be empty'
      };
    }

    // Find the project
    const projects = await this.listProjects();
    const project = projects.find(p => p.name === projectName);

    if (!project) {
      return {
        success: false,
        error: `Project '${projectName}' not found in ${this.projectsDir}`
      };
    }

    // Use provided ports from effectiveOptions (with guaranteed defaults)
    const actualConnectPort = effectiveOptions.connectPort;
    const actualSwitchboardPort = effectiveOptions.switchboardPort;

    // Track the readiness timeout so we can clean it up
    let readinessTimeoutId: NodeJS.Timeout | null = null;

    try {
      // Create Service task
      const runTask = this.createRunTask(project, effectiveOptions);

      // Store the running project info
      this.runningProject = {
        name: project.name,
        path: project.path,
        connectPort: actualConnectPort,
        switchboardPort: actualSwitchboardPort,
        startedAt: new Date(),
        logs: [],
        isFullyStarted: false  // Will be set to true when Drive URL is captured
      };

      // Set up event listener for service output (for logging only, not for readiness detection)
      const outputHandler = (event: any) => {
        if (!this.runningProject || event.serviceId !== this.runningProject.serviceHandle?.id) {
          return;
        }

        const data = event.data;
        const logPrefix = event.type === 'stdout' ? '[stdout]' : '[stderr]';
        this.runningProject.logs.push(`${logPrefix} ${data}`);

        const maxLogs = 500;
        if (this.runningProject.logs.length > maxLogs) {
          this.runningProject.logs = this.runningProject.logs.slice(-maxLogs);
        }
      };

      // Set up promise to wait for service readiness
      let serviceReadyResolve: ((value: VetraRuntimeParams) => void) | null = null;
      const serviceReadyPromise = new Promise<VetraRuntimeParams>((resolve) => {
        serviceReadyResolve = resolve;

        // Set timeout for readiness
        readinessTimeoutId = setTimeout(() => {
          // Resolve with null on timeout
          resolve({ driveUrl: null, mcpServer: null });
        }, effectiveOptions.startupTimeout);
      });

      // Listen for service-ready event
      const readyHandler = (event: any) => {
        if (event.handle.id === this.runningProject?.serviceHandle?.id) {
          // Extract readiness parameters
          const params = this.extractReadinessParams(event);

          if (this.runningProject) {
            if (params.driveUrl) {
              this.runningProject.driveUrl = params.driveUrl;
            }
            
            if (params.mcpServer) { 
              this.runningProject.mcpServer = params.mcpServer;
            }
            
            this.runningProject.isFullyStarted = true;
          }

          // Resolve the promise with parameters
          if (serviceReadyResolve) {
            // Clear the timeout since we're resolving
            if (readinessTimeoutId) {
              clearTimeout(readinessTimeoutId);
              readinessTimeoutId = null;
            }
            serviceReadyResolve(params);
          }
        }
      };

      // Listen for boot-timeout event (fallback if patterns don't match)
      const bootTimeoutHandler = (event: any) => {
        if (event.handle.id === this.runningProject?.serviceHandle?.id) {
          // Boot timeout for project: readiness patterns not matched
          if (serviceReadyResolve) {
            // Clear the timeout since we're resolving
            if (readinessTimeoutId) {
              clearTimeout(readinessTimeoutId);
              readinessTimeoutId = null;
            }
            serviceReadyResolve({ driveUrl: null, mcpServer: null });
          }
        }
      };

      // Register all handlers
      this.serviceExecutor.on('service-output', outputHandler);
      this.serviceExecutor.once('service-ready', readyHandler);
      this.serviceExecutor.once('boot-timeout', bootTimeoutHandler);

      // Start the service (no timeout!)
      const serviceHandle = await this.serviceExecutor.start(runTask);
      this.runningProject.serviceHandle = serviceHandle;

      // Store the service handle's PID if available
      if (serviceHandle.pid && this.runningProject) {
        // Create a mock process object for compatibility
        this.runningProject.process = { pid: serviceHandle.pid } as ChildProcess;
      }

      // Handle service exit
      this.serviceExecutor.once('service-exited', (event) => {
        if (event.handle.id === serviceHandle.id) {
          this.runningProject = null;
          // Clean up all event listeners
          this.serviceExecutor.removeListener('service-output', outputHandler);
          this.serviceExecutor.removeListener('service-ready', readyHandler);
          this.serviceExecutor.removeListener('boot-timeout', bootTimeoutHandler);
        }
      });

      // Wait for service to be ready
      const vetraOutputParams = await serviceReadyPromise;

      return {
        success: true,
        projectName: project.name,
        projectPath: project.path,
        connectPort: actualConnectPort,
        switchboardPort: actualSwitchboardPort,
        driveUrl: vetraOutputParams.driveUrl || undefined,
        mcpServer: vetraOutputParams.mcpServer || undefined,
      };

    } catch (error) {
      // Clean up timeout if it exists
      if (readinessTimeoutId) {
        clearTimeout(readinessTimeoutId);
      }

      this.runningProject = null;
      return {
        success: false,
        projectName: project.name,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}