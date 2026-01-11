#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

// Get counter file path from command line argument
const counterFile = process.argv[2];
if (!counterFile) {
    console.error('Error: Counter file path required as first argument');
    process.exit(1);
}

// Get interval from environment or use default
const interval = parseInt(process.env.COUNTER_INTERVAL || '1000', 10);

console.log(`Counter service starting...`);
console.log(`Writing to: ${counterFile}`);
console.log(`Interval: ${interval}ms`);

let counter = 0;

// Create directory if it doesn't exist
const dir = path.dirname(counterFile);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// Counter function
function incrementCounter() {
    counter++;
    fs.writeFileSync(counterFile, counter.toString());
    console.log(`Count: ${counter}`);
}

// Start counting
incrementCounter(); // Initial count
const intervalId = setInterval(incrementCounter, interval);

// Handle shutdown gracefully
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    clearInterval(intervalId);
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    clearInterval(intervalId);
    process.exit(0);
});

// Keep process alive
process.stdin.resume();