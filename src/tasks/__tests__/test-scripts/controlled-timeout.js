#!/usr/bin/env node

// Script that runs for a controlled amount of time
const duration = parseInt(process.env.DURATION_MS || '1000', 10);

console.log(`Starting process that will run for ${duration}ms`);

// Keep process alive for specified duration
const startTime = Date.now();
const interval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    if (elapsed >= duration) {
        console.log('Process completed successfully');
        clearInterval(interval);
        process.exit(0);
    }
}, 10);