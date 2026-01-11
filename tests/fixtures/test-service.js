#!/usr/bin/env node

/**
 * Test service for ServiceExecutor integration tests
 * 
 * Usage: node test-service.js [mode]
 * 
 * Modes:
 * - simple: Runs forever, outputs tick every second
 * - counted: Outputs 5 ticks then exits with code 0
 * - graceful: Handles SIGTERM and exits cleanly
 * - stubborn: Ignores SIGTERM (requires SIGKILL)
 * - output: Outputs to both stdout and stderr
 * - failing: Exits with code 1 after 1 second
 * - immediate-fail: Exits with code 1 immediately
 */

const mode = process.argv[2] || 'simple';

console.log(`Test service started in ${mode} mode (PID: ${process.pid})`);

switch (mode) {
    case 'simple':
        // Run forever, output tick every second
        let tickCount = 0;
        setInterval(() => {
            console.log(`tick ${++tickCount}`);
        }, 1000);
        break;

    case 'counted':
        // Output 5 ticks then exit successfully
        let count = 0;
        const countedInterval = setInterval(() => {
            console.log(`tick ${++count}`);
            if (count >= 5) {
                clearInterval(countedInterval);
                console.log('Completed 5 ticks, exiting');
                process.exit(0);
            }
        }, 200); // Faster for testing
        break;

    case 'graceful':
        // Handle SIGTERM gracefully
        let gracefulTick = 0;
        const gracefulInterval = setInterval(() => {
            console.log(`tick ${++gracefulTick}`);
        }, 500);
        
        process.on('SIGTERM', () => {
            console.log('Received SIGTERM, shutting down gracefully');
            clearInterval(gracefulInterval);
            setTimeout(() => {
                console.log('Graceful shutdown complete');
                process.exit(0);
            }, 100);
        });
        break;

    case 'stubborn':
        // Ignore SIGTERM (requires SIGKILL)
        let stubbornTick = 0;
        setInterval(() => {
            console.log(`tick ${++stubbornTick}`);
        }, 500);
        
        process.on('SIGTERM', () => {
            console.log('Received SIGTERM but refusing to stop!');
        });
        break;

    case 'output':
        // Output to both stdout and stderr
        let outputCount = 0;
        setInterval(() => {
            outputCount++;
            console.log(`stdout message ${outputCount}`);
            console.error(`stderr message ${outputCount}`);
            if (outputCount >= 3) {
                process.exit(0);
            }
        }, 100);
        break;

    case 'failing':
        // Exit with error after 1 second
        console.log('Running for 1 second then failing...');
        setTimeout(() => {
            console.error('Fatal error occurred!');
            process.exit(1);
        }, 1000);
        break;

    case 'immediate-fail':
        // Exit with error immediately
        console.error('Immediate failure!');
        process.exit(1);
        break;

    default:
        console.error(`Unknown mode: ${mode}`);
        process.exit(1);
}

// Keep process alive for modes that don't have their own timer
if (['simple', 'graceful', 'stubborn'].includes(mode)) {
    // Prevent process from exiting
    process.stdin.resume();
}