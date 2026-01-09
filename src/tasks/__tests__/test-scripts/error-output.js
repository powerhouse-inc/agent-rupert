#!/usr/bin/env node

// Script that outputs to both stdout and stderr
const message = process.env.MESSAGE || 'default message';
const exitCode = parseInt(process.env.EXIT_CODE || '0', 10);

console.log(`stdout: ${message}`);
console.error(`stderr: ${message}`);

process.exit(exitCode);