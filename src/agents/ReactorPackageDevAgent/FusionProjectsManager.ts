import path from "node:path";
import fs from 'node:fs/promises';
import { CLIExecutor } from "../../tasks/executors/cli-executor.js";
import { ServiceExecutor } from "../../tasks/executors/service-executor.js";
import { type CLITask, type ServiceTask, createCLITask, createServiceTask } from '../../tasks/types.js';
import type { ChildProcess } from 'node:child_process';
import { AbstractProjectManager, type InitProjectResult, type BaseRunningProject } from './AbstractProjectManager.js';

interface FusionRuntimeParams {
  fusionUrl: string | null;
  fusionPort: number | null;
}

export interface FusionProjectConfig {
  name: string;
  path: string;
}

/**
 * Options for running a Fusion project
 */
export interface RunFusionProjectOptions {
  /** Fusion front-end port (default: 8000) */
  fusionPort: number;
  /** Switchboard URL to serve as back-end */
  switchboardUrl: string;
  /** Timeout in milliseconds to wait for fusion to fully start (default: 60000) */
  startupTimeout: number;
}

/**
 * Result of running a Fusion project
 */
export interface RunFusionProjectResult {
  /** Whether the project started successfully */
  success: boolean;
  /** Name of the project */
  projectName: string;
  /** The folder of the project */
  projectPath?: string;
  /** Fusion port the project is running on */
  fusionPort?: number;
  /** Switchboard URL to serve as backend */
  switchboardUrl?: string;
  /** Error message if the operation failed */
  error?: string;
}

/**
 * Represents a currently running Fusion project
 */
export interface RunningFusionProject extends BaseRunningProject {
  /** Fusion port (Next.js) */
  fusionPort: number;
  /** The Switchboard URL */
  switchboardUrl: string;
}

export class FusionProjectsManager extends AbstractProjectManager<
  FusionProjectConfig,
  RunningFusionProject,
  RunFusionProjectOptions,
  RunFusionProjectResult
> {
  private defaultNextjsPort: number;

  constructor(
    projectsDir: string = '../projects/fusion',
    cliExecutor?: CLIExecutor,
    serviceExecutor?: ServiceExecutor,
    defaultNextjsPort: number = 8000
  ) {
    super(projectsDir, cliExecutor, serviceExecutor);
    this.defaultNextjsPort = defaultNextjsPort;
  }

  /**
   * Get the default Next.js port for Fusion projects
   */
  public getDefaultNextjsPort(): number {
    return this.defaultNextjsPort;
  }

  /**
   * Get the configuration file name for Fusion projects
   */
  protected getProjectConfigFile(): string {
    return 'next.config.ts';
  }

  /**
   * Create initialization tasks for Fusion project
   */
  protected createInitTask(projectName: string, projectPath: string): CLITask[] {
    const tasks: CLITask[] = [];

    // Git clone task
    tasks.push(createCLITask({
      title: `Initialize Fusion project: ${projectName}`,
      instructions: `Create a new Fusion project`,
      command: 'git',
      args: ['clone', 'https://github.com/powerhouse-inc/fusion-boilerplate.git', projectName],
      workingDirectory: this.projectsDir,
      environment: {
        CI: 'true'
      }
    }));

    // Set project name task
    tasks.push(createCLITask({
      title: `Set project name: ${projectName}`,
      instructions: `Update package.json with project name`,
      command: 'sed',
      args: ['-i', '-e', `s/fusion-boilerplate/${projectName}/g`, './package.json'],
      workingDirectory: projectPath,
      environment: {
        CI: 'true'
      }
    }));

    // Install dependencies task
    tasks.push(createCLITask({
      title: `Install dependencies: ${projectName}`,
      instructions: `Install project dependencies`,
      command: 'pnpm',
      args: ['install'],
      workingDirectory: projectPath,
      environment: {
        CI: 'true'
      }
    }));

    return tasks;
  }

  /**
   * Create the service task for running the Fusion project
   */
  protected createRunTask(project: FusionProjectConfig, options: RunFusionProjectOptions): ServiceTask {
    return createServiceTask({
      title: `Run Fusion project: ${project.name}`,
      instructions: `Start Fusion development server for ${project.name}`,
      command: 'pnpm',
      args: ['dev', '-p', String(options.fusionPort)],
      workingDirectory: project.path,
      environment: {
        NODE_ENV: 'development',
        PH_SWITCHBOARD_URL: options.switchboardUrl
      },
      gracefulShutdown: {
        signal: 'SIGTERM',
        timeout: 10000
      },
      readiness: {
        patterns: [
          {
            regex: 'Local:\\s*http://localhost:(\\d+)',
            name: 'fusion-port',
            endpoints: [{
              endpointName: 'fusion-url',
              endpointDefaultHostUrl: 'http://localhost',
              endpointCaptureGroup: 1,
              monitorPortReleaseUponTermination: true
            }]
          }
        ],
        timeout: options.startupTimeout
      }
    });
  }

  /**
   * Extract readiness parameters from service ready event
   */
  protected extractReadinessParams(event: any): FusionRuntimeParams {
    const fusionUrl = event.handle.endpoints?.get('fusion-url') || null;
    const fusionPort = Number(event.readinessMatches?.get('fusion-port')?.[0] || null);
    return { fusionUrl, fusionPort };
  }

  /**
   * Initialize a new Fusion project
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
        
        // Stop if any task fails
        if (lastResult.exitCode !== 0) {
          break;
        }
      }

      // Check if initialization was successful
      if (lastResult && lastResult.exitCode === 0) {
        // Verify the project was created
        try {
          await fs.access(projectPath);
          await fs.access(path.join(projectPath, 'package.json'));

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
        const errorMessage = lastResult?.stderr || lastResult?.stdout || 'Unknown error during initialization';
        const finalErrorMessage = `git clone failed: ${errorMessage}`;

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
   * List all Fusion projects in the projects directory
   * @returns Array of project configurations
   */
  async listProjects(): Promise<FusionProjectConfig[]> {
    const projects: FusionProjectConfig[] = [];

    try {
      // Ensure directory exists
      await this.ensureProjectsDirectory();

      // Read directory contents
      const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });

      // Check each directory for Fusion project
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(this.projectsDir, entry.name);
          const configPath = path.join(projectPath, this.getProjectConfigFile());

          try {
            await fs.access(configPath);
            projects.push({
              name: entry.name,
              path: projectPath,
            });

          } catch {
            // Not a Fusion project or invalid config, skip
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or other error
      // Error listing projects
    }

    return projects;
  }

  async runProject(projectName: string, options?: RunFusionProjectOptions): Promise<RunFusionProjectResult> {
    // Set defaults for options
    const effectiveOptions: RunFusionProjectOptions = {
      fusionPort: options?.fusionPort || this.defaultNextjsPort,
      switchboardUrl: options?.switchboardUrl || 'http://localhost:4001/graphql',
      startupTimeout: options?.startupTimeout || 60000
    };

    // Check if a project is already running
    if (this.runningProject) {
      return {
        success: false,
        projectName,
        error: `A project is already running: ${this.runningProject.name}. Please shutdown the current project first.`
      };
    }

    // Check if ports are available before attempting to start
    const fusionPortInUse = await this.isPortInUse(effectiveOptions.fusionPort);
    if (fusionPortInUse) {
      return {
        success: false,
        error: `Port ${effectiveOptions.fusionPort} (Fusion) is already in use. Try a different port or stop the process using it.`,
        projectName,
        ...effectiveOptions
      };
    }

    // Find the project
    const projects = await this.listProjects();
    const project = projects.find(p => p.name === projectName);

    if (!project) {
      return {
        success: false,
        projectName,
        error: `Project '${projectName}' not found in ${this.projectsDir}`
      };
    }

    // Use provided ports from effectiveOptions
    const actualFusionPort = effectiveOptions.fusionPort;
    const actualSwitchboardUrl = effectiveOptions.switchboardUrl;

    // Track the readiness timeout so we can clean it up
    let readinessTimeoutId: NodeJS.Timeout | null = null;

    try {
      // Create Service task
      const runTask = this.createRunTask(project, effectiveOptions);

      // Store the running project info
      this.runningProject = {
        name: project.name,
        path: project.path,
        fusionPort: actualFusionPort,
        switchboardUrl: actualSwitchboardUrl,
        startedAt: new Date(),
        logs: [],
        isFullyStarted: false  // Will be set to true when ready
      };

      // Set up event listener for service output (for logging only)
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
      let serviceReadyResolve: ((value: FusionRuntimeParams) => void) | null = null;
      const serviceReadyPromise = new Promise<FusionRuntimeParams>((resolve) => {
        serviceReadyResolve = resolve;

        // Set timeout for readiness
        readinessTimeoutId = setTimeout(() => {
          // Resolve with null on timeout
          resolve({ fusionUrl: null, fusionPort: null });
        }, effectiveOptions.startupTimeout);
      });

      // Listen for service-ready event
      const readyHandler = (event: any) => {
        if (event.handle.id === this.runningProject?.serviceHandle?.id) {
          // Extract readiness parameters
          const params = this.extractReadinessParams(event);

          if (params.fusionUrl && this.runningProject) {
            this.runningProject.fusionPort = params.fusionPort || actualFusionPort;
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
            serviceReadyResolve({ fusionUrl: null, fusionPort: null });
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
      const fusionOutputParams = await serviceReadyPromise;
      
      return {
        success: true,
        projectName: project.name,
        projectPath: project.path,
        fusionPort: fusionOutputParams.fusionPort || actualFusionPort,
        switchboardUrl: actualSwitchboardUrl,
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