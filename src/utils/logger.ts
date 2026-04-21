import * as vscode from 'vscode';

/**
 * Logger class for MCP Server extension
 * Uses VS Code's OutputChannel for reliable logging across async operations
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MCP Server Extension');
    }

    /**
     * Get the singleton instance of the logger
     */
    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Format a message with timestamp
     * @param message The message to format
     * @returns Formatted message with timestamp
     */
    private formatMessage(message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] ${message}`;
    }

    /**
     * Log an informational message
     * @param message The message to log
     */
    public info(message: string): void {
        this.outputChannel.appendLine(this.formatMessage(`INFO: ${message}`));
    }

    /**
     * Log a warning message
     * @param message The message to log
     */
    public warn(message: string): void {
        this.outputChannel.appendLine(this.formatMessage(`WARN: ${message}`));
    }

    /**
     * Log an error message
     * @param message The message to log
     */
    public error(message: string): void {
        this.outputChannel.appendLine(this.formatMessage(`ERROR: ${message}`));
    }

    /**
     * Log a debug message
     * @param message The message to log
     */
    public debug(message: string): void {
        this.outputChannel.appendLine(this.formatMessage(`DEBUG: ${message}`));
    }

    /**
     * Show the output channel in the VS Code UI
     */
    public showChannel(): void {
        this.outputChannel.show();
    }

    /**
     * Dispose of the output channel and reset singleton instance
     * This allows the logger to be re-created after deactivation
     */
    public dispose(): void {
        if (this.outputChannel) {
            this.outputChannel.dispose();
            this.outputChannel = undefined as any;
        }
        // Reset singleton so next getInstance() creates a fresh instance
        Logger.instance = undefined as any;
    }

    /**
     * Check if the logger is currently initialized and usable
     */
    public static isInitialized(): boolean {
        return Logger.instance !== undefined && Logger.instance !== null;
    }
}

// Export a singleton instance
export const logger = Logger.getInstance();
