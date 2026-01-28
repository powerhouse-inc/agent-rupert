#!/usr/bin/env node

/**
 * Test service for ServiceExecutor port release verification tests
 * 
 * Usage: node test-service-with-ports.js [mode] [port]
 * 
 * Modes:
 * - http-server: Creates an HTTP server on the specified port
 * - multiple-ports: Creates servers on multiple ports (base, base+1, base+2)
 * - delayed-release: Keeps port open for 200ms after SIGTERM
 * - immediate-release: Closes port immediately on SIGTERM
 * - no-port: Doesn't bind to any port (for testing non-port services)
 * - port-with-url: Outputs port info with Drive URL format
 * 
 * Default: http-server on port 9500
 */

import http from 'http';
import net from 'net';
import {
    FIXTURE_INITIAL_OUTPUT_DELAY as INITIAL_DELAY,
    FIXTURE_PATTERN_INTERVAL as PATTERN_INTERVAL,
    FIXTURE_DELAYED_PORT_RELEASE as PORT_RELEASE_DELAY,
    FIXTURE_GRACEFUL_SHUTDOWN_TIME as GRACEFUL_SHUTDOWN_TIME
} from '../integration/test-timing-constants.js';

const mode = process.argv[2] || 'http-server';
const basePort = parseInt(process.argv[3] || '9500', 10);

const servers = [];

console.log(`Test service with ports started in ${mode} mode (PID: ${process.pid})`);

// Additional constants not from shared file
const FORCED_EXIT_TIMEOUT = 2000;

function createHttpServer(port, name = 'HTTP') {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`${name} server on port ${port}\n`);
    });
    
    server.listen(port, '127.0.0.1', () => {
        console.log(`${name} server listening on port ${port}`);
    });
    
    servers.push(server);
    return server;
}

function createTcpServer(port, name = 'TCP') {
    const server = net.createServer((socket) => {
        socket.write(`${name} server on port ${port}\r\n`);
        socket.pipe(socket);
    });
    
    server.listen(port, '127.0.0.1', () => {
        console.log(`${name} server listening on port ${port}`);
    });
    
    servers.push(server);
    return server;
}

// Graceful shutdown handler
function gracefulShutdown(delayMs = 0) {
    console.log('Received SIGTERM, shutting down...');
    
    if (delayMs > 0) {
        console.log(`Delaying port release by ${delayMs}ms...`);
        setTimeout(() => {
            closeAllServers();
        }, delayMs);
    } else {
        closeAllServers();
    }
}

function closeAllServers() {
    console.log('Closing all servers...');
    let closedCount = 0;
    const totalServers = servers.length;
    
    if (totalServers === 0) {
        console.log('No servers to close');
        process.exit(0);
    }
    
    servers.forEach((server, index) => {
        server.close(() => {
            closedCount++;
            console.log(`Server ${index + 1}/${totalServers} closed`);
            if (closedCount === totalServers) {
                console.log('All ports released, exiting');
                process.exit(0);
            }
        });
    });
    
    // Force exit after timeout if servers don't close
    setTimeout(() => {
        console.error('Forced exit after timeout');
        process.exit(1);
    }, FORCED_EXIT_TIMEOUT);
}

switch (mode) {
    case 'http-server':
        // Single HTTP server with readiness pattern
        console.log('Starting HTTP service...');
        setTimeout(() => {
            createHttpServer(basePort, 'Main HTTP');
            // Output in format that readiness pattern can detect
            setTimeout(() => {
                console.log(`Service ready on http://localhost:${basePort}`);
            }, PATTERN_INTERVAL * 2);
        }, INITIAL_DELAY * 4);
        
        // Keep alive with periodic status
        setInterval(() => {
            console.log('Service running...');
        }, 5000);
        
        process.on('SIGTERM', () => gracefulShutdown(0));
        break;

    case 'multiple-ports':
        // Multiple servers on different ports
        console.log('Starting multi-port service...');
        
        setTimeout(() => {
            createHttpServer(basePort, 'API');
        }, INITIAL_DELAY * 2);
        
        setTimeout(() => {
            createTcpServer(basePort + 1, 'WebSocket');
        }, INITIAL_DELAY * 4);
        
        setTimeout(() => {
            createHttpServer(basePort + 2, 'Admin');
        }, INITIAL_DELAY * 6);
        
        setTimeout(() => {
            console.log('All services ready');
        }, INITIAL_DELAY * 8);
        
        process.on('SIGTERM', () => gracefulShutdown(0));
        break;

    case 'delayed-release':
        // Delays port release after SIGTERM
        console.log('Starting service with delayed port release...');
        
        setTimeout(() => {
            createHttpServer(basePort, 'Delayed Release');
            console.log(`Service ready on http://localhost:${basePort}`);
        }, INITIAL_DELAY * 2);
        
        // Delay port release by PORT_RELEASE_DELAY
        process.on('SIGTERM', () => gracefulShutdown(PORT_RELEASE_DELAY));
        break;

    case 'immediate-release':
        // Releases port immediately on SIGTERM
        console.log('Starting service with immediate port release...');
        
        setTimeout(() => {
            createHttpServer(basePort, 'Immediate Release');
            console.log(`Service ready on http://localhost:${basePort}`);
        }, INITIAL_DELAY * 2);
        
        // Immediate port release
        process.on('SIGTERM', () => gracefulShutdown(0));
        break;

    case 'no-port':
        // Service that doesn't bind to any port
        console.log('Starting service without port binding...');
        
        setTimeout(() => {
            console.log('Service ready (no ports)');
        }, INITIAL_DELAY * 2);
        
        setInterval(() => {
            console.log('Processing...');
        }, 2000);
        
        process.on('SIGTERM', () => {
            console.log('Received SIGTERM, shutting down...');
            setTimeout(() => {
                console.log('Shutdown complete');
                process.exit(0);
            }, GRACEFUL_SHUTDOWN_TIME);
        });
        break;

    case 'port-with-url':
        // Outputs port info with Drive URL format (Powerhouse-like)
        console.log('Starting Powerhouse-like service...');
        
        setTimeout(() => {
            createHttpServer(basePort, 'Switchboard');
        }, INITIAL_DELAY * 2);
        
        setTimeout(() => {
            createHttpServer(basePort + 1, 'Connect');
        }, INITIAL_DELAY * 4);
        
        setTimeout(() => {
            // Output in Powerhouse format
            console.log(`Connect Studio running on port ${basePort + 1}`);
            console.log(`Switchboard listening on port ${basePort}`);
            console.log(`Drive URL: http://localhost:${basePort}/drives/test123`);
        }, INITIAL_DELAY * 6);
        
        process.on('SIGTERM', () => gracefulShutdown(0));
        break;

    default:
        console.error(`Unknown mode: ${mode}`);
        process.exit(1);
}

// Handle other signals
process.on('SIGINT', () => {
    console.log('Received SIGINT');
    gracefulShutdown(0);
});

// Keep process alive
process.stdin.resume();