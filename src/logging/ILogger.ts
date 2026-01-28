export interface ILogger {
    info(message: string): void;
    error(message: string, error?: any): void;
    warn(message: string): void;
    debug(message: string): void;
}

/**
 * Default console logger implementation
 */
export class DefaultConsoleLogger implements ILogger {
    info(message: string): void {
        console.log(message);
    }

    error(message: string, error?: any): void {
        console.error(message, error);
    }

    warn(message: string): void {
        console.warn(message);
    }

    debug(message: string): void {
        console.log(message);
    }
}