#!/usr/bin/env node

// Script that streams output with delays to test streaming functionality
const lines = ['First line', 'Second line', 'Third line'];

async function streamOutput() {
    for (const line of lines) {
        console.log(line);
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

streamOutput();