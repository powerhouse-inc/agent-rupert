#!/usr/bin/env node

/**
 * Test service for ServiceExecutor boot phase and readiness detection tests
 * 
 * Usage: node test-service-with-readiness.js [mode]
 * 
 * Modes:
 * - powerhouse: Simulates Powerhouse vetra startup with ports and Drive URL
 * - multi-pattern: Requires multiple patterns to be matched for readiness
 * - slow-boot: Takes longer to become ready (for timeout testing)
 * - boot-fail: Never outputs readiness patterns (for timeout testing)
 * - stderr-ready: Outputs readiness on stderr instead of stdout
 * - mixed-output: Outputs readiness mixed with other messages
 * - port-only: Only outputs port information (no Drive URL)
 * - immediate-ready: Outputs all readiness patterns immediately
 */

const mode = process.argv[2] || 'powerhouse';

console.log(`Test service with readiness started in ${mode} mode (PID: ${process.pid})`);

// Timing constants matching test-timing-constants.ts
const INITIAL_DELAY = 50;
const PATTERN_INTERVAL = 50;
const SLOW_BOOT_STEP = 500;
const GRACEFUL_SHUTDOWN_TIME = 100;

switch (mode) {
    case 'powerhouse':
        // Simulates Powerhouse vetra startup sequence
        console.log('Initializing Powerhouse services...');
        setTimeout(() => {
            console.log('Starting Connect Studio...');
        }, INITIAL_DELAY);
        setTimeout(() => {
            console.log('Connect Studio running on port 3000');
        }, INITIAL_DELAY + PATTERN_INTERVAL);
        setTimeout(() => {
            console.log('Starting Vetra Switchboard...');
        }, INITIAL_DELAY + PATTERN_INTERVAL * 2);
        setTimeout(() => {
            console.log('Switchboard listening on port 4001');
        }, INITIAL_DELAY + PATTERN_INTERVAL * 3);
        setTimeout(() => {
            console.log('Connecting to remote drives...');
        }, INITIAL_DELAY + PATTERN_INTERVAL * 4);
        setTimeout(() => {
            console.log('Drive URL: http://localhost:4001/drives/abc123xyz789');
            console.log('Service fully started and ready to accept connections');
        }, INITIAL_DELAY + PATTERN_INTERVAL * 5);
        
        // Keep running with periodic status updates
        setInterval(() => {
            console.log('Service running normally...');
        }, 5000);
        break;

    case 'multi-pattern':
        // Requires multiple patterns to match
        console.log('Starting multi-component service...');
        setTimeout(() => {
            console.log('Database connected on port 5432');
        }, INITIAL_DELAY);
        setTimeout(() => {
            console.log('API server ready on port 8080');
        }, INITIAL_DELAY + PATTERN_INTERVAL);
        setTimeout(() => {
            console.log('WebSocket server listening on port 8081');
        }, INITIAL_DELAY + PATTERN_INTERVAL * 2);
        setTimeout(() => {
            console.log('All components ready');
        }, INITIAL_DELAY + PATTERN_INTERVAL * 3);
        
        setInterval(() => {
            console.log('Health check: OK');
        }, 3000);
        break;

    case 'slow-boot':
        // Takes 2.5 seconds to become ready (5 steps * 500ms each)
        console.log('Starting slow service...');
        let progress = 0;
        const bootInterval = setInterval(() => {
            progress += 20;
            console.log(`Boot progress: ${progress}%`);
            if (progress >= 100) {
                clearInterval(bootInterval);
                console.log('Service ready on port 9000');
                console.log('Drive URL: http://localhost:9000/drives/slow123');
            }
        }, SLOW_BOOT_STEP);
        break;

    case 'boot-fail':
        // Never outputs readiness patterns
        console.log('Starting service that will never be ready...');
        setInterval(() => {
            console.log('Still booting... (this will never complete)');
        }, SLOW_BOOT_STEP);
        break;

    case 'stderr-ready':
        // Outputs readiness patterns on stderr
        console.log('Starting service with stderr readiness...');
        setTimeout(() => {
            console.error('ERROR: Connect port: 3000');
        }, INITIAL_DELAY);
        setTimeout(() => {
            console.error('WARNING: Switchboard port: 4001');
        }, INITIAL_DELAY + PATTERN_INTERVAL);
        setTimeout(() => {
            console.error('Drive URL: http://localhost:4001/drives/stderr456');
        }, INITIAL_DELAY + PATTERN_INTERVAL * 2);
        
        setInterval(() => {
            console.log('Service operational');
        }, 2000);
        break;

    case 'mixed-output':
        // Readiness mixed with lots of other output
        console.log('Starting noisy service...');
        let lineCount = 0;
        const noiseInterval = setInterval(() => {
            lineCount++;
            console.log(`Debug line ${lineCount}: Random data ${Math.random()}`);
            
            if (lineCount === 5) {
                console.log('Hidden in noise: Server port: 7777');
            }
            if (lineCount === 10) {
                console.log(`More debug info... Drive URL: http://localhost:7777/drives/mixed999 ... continuing startup`);
            }
            if (lineCount === 15) {
                console.log('Startup complete!');
                clearInterval(noiseInterval);
                setInterval(() => {
                    console.log('Running...');
                }, 3000);
            }
        }, 20);
        break;

    case 'port-only':
        // Only outputs port information (no Drive URL)
        console.log('Starting minimal service...');
        setTimeout(() => {
            console.log('HTTP server listening on port 8888');
        }, INITIAL_DELAY + PATTERN_INTERVAL);
        setTimeout(() => {
            console.log('Service ready (no Drive URL available)');
        }, INITIAL_DELAY + PATTERN_INTERVAL * 2);
        
        setInterval(() => {
            console.log('Heartbeat');
        }, 2000);
        break;

    case 'immediate-ready':
        // All readiness patterns output immediately
        console.log('Connect Studio port: 3000');
        console.log('Switchboard port: 4001');
        console.log('Drive URL: http://localhost:4001/drives/instant000');
        console.log('Service ready immediately!');
        
        setInterval(() => {
            console.log('Running smoothly...');
        }, 1000);
        break;

    default:
        console.error(`Unknown mode: ${mode}`);
        process.exit(1);
}

// Handle graceful shutdown for all modes
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    setTimeout(() => {
        console.log('Shutdown complete');
        process.exit(0);
    }, GRACEFUL_SHUTDOWN_TIME);
});

// Keep process alive
process.stdin.resume();