import * as vscode from 'vscode';
import { MCPServer, ToolConfiguration } from './server.js';
import { listWorkspaceFiles } from './tools/file-tools.js';
import { logger } from './utils/logger.js';

// Re-export for testing purposes
export { MCPServer };

let mcpServer: MCPServer | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let sharedTerminal: vscode.Terminal | undefined;
// Server state - disabled by default
let serverEnabled: boolean = false;

// Terminal name constant
const TERMINAL_NAME = 'MCP Shell Commands';

/**
 * Gets the tool configuration from VS Code settings
 * @returns ToolConfiguration object with all tool enablement settings
 */
function getToolConfiguration(): ToolConfiguration {
    const config = vscode.workspace.getConfiguration('vscode-mcp-server');
    const enabledTools = config.get<any>('enabledTools') || {};

    return {
        file: enabledTools.file ?? true,
        edit: enabledTools.edit ?? true,
        shell: enabledTools.shell ?? true,
        diagnostics: enabledTools.diagnostics ?? true,
        symbol: enabledTools.symbol ?? true
    };
}

/**
 * Gets or creates the shared terminal for the extension
 * @param context The extension context
 * @returns The shared terminal instance
 */
export function getExtensionTerminal(context: vscode.ExtensionContext): vscode.Terminal {
    // Check if a terminal with our name already exists
    const existingTerminal = vscode.window.terminals.find(t => t.name === TERMINAL_NAME);

    if (existingTerminal && existingTerminal.exitStatus === undefined) {
        // Reuse the existing terminal if it's still open
        logger.info('[getExtensionTerminal] Reusing existing terminal for shell commands');
        return existingTerminal;
    }

    // Create a new terminal if it doesn't exist or if it has exited
    sharedTerminal = vscode.window.createTerminal(TERMINAL_NAME);
    logger.info('[getExtensionTerminal] Created new terminal for shell commands');
    context.subscriptions.push(sharedTerminal);

    return sharedTerminal;
}

// Function to update status bar
function updateStatusBar(port: number) {
    logger.info(`[updateStatusBar] Updating status bar - serverEnabled: ${serverEnabled}, port: ${port}`);
    logger.info(`[updateStatusBar] statusBarItem exists: ${statusBarItem !== undefined}`);

    if (!statusBarItem) {
        logger.warn(`[updateStatusBar] WARNING: statusBarItem is undefined, cannot update`);
        return;
    }

    if (serverEnabled) {
        statusBarItem.text = `$(server) MCP Server: ${port}`;
        statusBarItem.tooltip = `MCP Server running at localhost:${port} (Click to toggle)`;
        statusBarItem.backgroundColor = undefined;
        logger.info(`[updateStatusBar] Status bar updated: Server running on port ${port}`);
    } else {
        statusBarItem.text = `$(server) MCP Server: Off`;
        statusBarItem.tooltip = `MCP Server is disabled (Click to toggle)`;
        // Use a subtle color to indicate disabled state
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        logger.info(`[updateStatusBar] Status bar updated: Server disabled`);
    }
    statusBarItem.show();
    logger.info(`[updateStatusBar] Status bar shown`);
}

// Function to toggle server state
async function toggleServerState(context: vscode.ExtensionContext): Promise<void> {
    logger.info('========================================');
    logger.info(`[toggleServerState] Starting toggle operation - changing from ${serverEnabled} to ${!serverEnabled}`);
    logger.info(`[toggleServerState] Timestamp: ${new Date().toISOString()}`);

    serverEnabled = !serverEnabled;

    // Store state for persistence
    try {
        await context.globalState.update('mcpServerEnabled', serverEnabled);
        logger.info(`[toggleServerState] State saved to globalState: ${serverEnabled}`);
    } catch (error) {
        logger.error(`[toggleServerState] Failed to save state: ${error instanceof Error ? error.message : String(error)}`);
    }

    const config = vscode.workspace.getConfiguration('vscode-mcp-server');
    const port = config.get<number>('port') || 3000;
    const host = config.get<string>('host') || '127.0.0.1';

    // Update status bar immediately to provide feedback
    updateStatusBar(port);

    if (serverEnabled) {
        // Start the server if it was disabled
        if (!mcpServer) {
            logger.info(`[toggleServerState] Creating MCP server instance`);
            try {
                const terminal = getExtensionTerminal(context);
                const toolConfig = getToolConfiguration();
                mcpServer = new MCPServer(port, host, terminal, toolConfig);
                mcpServer.setFileListingCallback(async (path: string, recursive: boolean) => {
                    try {
                        return await listWorkspaceFiles(path, recursive);
                    } catch (error) {
                        logger.error(`[toggleServerState] Error listing files: ${error instanceof Error ? error.message : String(error)}`);
                        throw error;
                    }
                });
                mcpServer.setupTools();

                logger.info(`[toggleServerState] Starting server at ${new Date().toISOString()}`);
                const startTime = Date.now();

                await mcpServer.start();

                const duration = Date.now() - startTime;
                logger.info(`[toggleServerState] Server started successfully at ${new Date().toISOString()} (took ${duration}ms)`);

                vscode.window.showInformationMessage(`MCP Server enabled and running at http://localhost:${port}/mcp`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const errorStack = error instanceof Error ? error.stack : '';
                logger.error(`[toggleServerState] FAILED to start server: ${errorMessage}`);
                logger.error(`[toggleServerState] Error stack: ${errorStack}`);

                // Reset state on failure
                serverEnabled = false;
                mcpServer = undefined;
                updateStatusBar(port);

                vscode.window.showErrorMessage(`Failed to start MCP Server: ${errorMessage}`);
            }
        }
    } else {
        // Stop the server if it was enabled
        if (mcpServer) {
            // Capture the server reference before async callback
            const serverToStop = mcpServer;

            // Show progress indicator
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Stopping MCP Server',
                cancellable: false
            }, async (progress) => {
                logger.info(`[toggleServerState] Stopping server at ${new Date().toISOString()}`);
                progress.report({ message: 'Closing connections...' });

                const stopTime = Date.now();
                try {
                    await serverToStop.stop();
                    const duration = Date.now() - stopTime;
                    logger.info(`[toggleServerState] Server stopped successfully at ${new Date().toISOString()} (took ${duration}ms)`);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logger.error(`[toggleServerState] Error stopping server: ${errorMessage}`);
                    throw error;
                }
            });

            mcpServer = undefined;
            vscode.window.showInformationMessage('MCP Server has been disabled');
        }
    }

    logger.info(`[toggleServerState] Toggle operation completed`);
    logger.info('========================================');
}

export async function activate(context: vscode.ExtensionContext) {
    logger.info('========================================');
    logger.info('Activating vscode-mcp-server extension');
    logger.info(`[activate] Timestamp: ${new Date().toISOString()}`);
    logger.info(`[activate] VS Code version: ${vscode.version}`);
    logger.info(`[activate] Extension path: ${context.extensionPath}`);
    logger.info(`[activate] Global storage path: ${context.globalStorageUri?.fsPath}`);
    logger.info('========================================');

    // Create status bar item EARLY so we can show errors even if activation fails
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'vscode-mcp-server.toggleServer';
    statusBarItem.text = `$(server) MCP Server: Initializing...`;
    statusBarItem.tooltip = 'MCP Server extension is initializing';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    logger.info('[activate] Status bar item created and shown');

    try {
        // Get configuration
        const config = vscode.workspace.getConfiguration('vscode-mcp-server');
        logger.info(`[activate] Configuration loaded`);

        const defaultEnabled = config.get<boolean>('defaultEnabled') ?? false;
        logger.info(`[activate] defaultEnabled from config: ${defaultEnabled}`);

        const port = config.get<number>('port') || 3000;
        const host = config.get<string>('host') || '127.0.0.1';

        // Load saved state or use configured default
        const savedState = context.globalState.get<boolean>('mcpServerEnabled');
        logger.info(`[activate] Saved state from globalState: ${savedState}`);

        serverEnabled = savedState !== undefined ? savedState : defaultEnabled;

        logger.info(`[activate] Using port ${port} from configuration`);
        logger.info(`[activate] Server enabled: ${serverEnabled}`);

        // Only start the server if enabled
        if (serverEnabled) {
            logger.info('[activate] Server is enabled, starting initialization...');

            // Create the shared terminal
            logger.info('[activate] Creating shared terminal...');
            const terminal = getExtensionTerminal(context);
            logger.info('[activate] Shared terminal created');

            // Initialize MCP server with the configured port, terminal, and tool configuration
            logger.info('[activate] Creating MCPServer instance...');
            const toolConfig = getToolConfiguration();
            mcpServer = new MCPServer(port, host, terminal, toolConfig);
            logger.info('[activate] MCPServer instance created');

            // Set up file listing callback
            logger.info('[activate] Setting up file listing callback...');
            mcpServer.setFileListingCallback(async (path: string, recursive: boolean) => {
                try {
                    return await listWorkspaceFiles(path, recursive);
                } catch (error) {
                    logger.error(`Error listing files: ${error instanceof Error ? error.message : String(error)}`);
                    throw error;
                }
            });
            logger.info('[activate] File listing callback set');

            // Call setupTools after setting the callback
            logger.info('[activate] Calling setupTools...');
            mcpServer.setupTools();
            logger.info('[activate] Tools setup complete');

            logger.info('[activate] Starting MCP server...');
            const serverStartTime = Date.now();
            await mcpServer.start();
            const serverStartDuration = Date.now() - serverStartTime;
            logger.info(`MCP Server started successfully (took ${serverStartDuration}ms)`);
        } else {
            logger.info('MCP Server is disabled by default');
        }

        // Update status bar after server state is determined
        updateStatusBar(port);

        // Register commands
        const toggleServerCommand = vscode.commands.registerCommand(
            'vscode-mcp-server.toggleServer',
            () => toggleServerState(context)
        );

        const showServerInfoCommand = vscode.commands.registerCommand(
            'vscode-mcp-server.showServerInfo',
            () => {
                if (serverEnabled) {
                    vscode.window.showInformationMessage(`MCP Server is running at http://localhost:${port}/mcp`);
                } else {
                    vscode.window.showInformationMessage('MCP Server is currently disabled. Click on the status bar item to enable it.');
                }
            }
        );

        // Listen for configuration changes to restart server if needed
        const configChangeListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration('vscode-mcp-server.enabledTools')) {
                logger.info('[configChangeListener] Tool configuration changed - restarting server if enabled');
                if (serverEnabled && mcpServer) {
                    try {
                        // Stop current server
                        await mcpServer.stop();
                        mcpServer = undefined;

                        // Start new server with updated configuration
                        const config = vscode.workspace.getConfiguration('vscode-mcp-server');
                        const port = config.get<number>('port') || 3000;
                        const host = config.get<string>('host') || '127.0.0.1';
                        const terminal = getExtensionTerminal(context);
                        const toolConfig = getToolConfiguration();

                        mcpServer = new MCPServer(port, host, terminal, toolConfig);
                        mcpServer.setFileListingCallback(async (path: string, recursive: boolean) => {
                            try {
                                return await listWorkspaceFiles(path, recursive);
                            } catch (error) {
                                logger.error(`[configChangeListener] Error listing files: ${error instanceof Error ? error.message : String(error)}`);
                                throw error;
                            }
                        });
                        mcpServer.setupTools();
                        await mcpServer.start();

                        vscode.window.showInformationMessage('MCP Server restarted with updated tool configuration');
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        logger.error(`[configChangeListener] Error restarting server: ${errorMessage}`);
                        vscode.window.showErrorMessage(`Failed to restart MCP Server: ${errorMessage}`);
                    }
                }
            }
        });

        // Add all disposables to the context subscriptions
        // Note: statusBarItem was already added earlier in activation
        context.subscriptions.push(
            toggleServerCommand,
            showServerInfoCommand,
            configChangeListener,
            { dispose: async () => mcpServer && await mcpServer.stop() }
        );

        logger.info('[activate] All commands and listeners registered');
        logger.info('[activate] Extension activation completed successfully');
        logger.info('========================================');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        logger.error(`[activate] CRITICAL ERROR: ${errorMessage}`);
        logger.error(`[activate] Error stack: ${errorStack}`);
        logger.error(`[activate] Error type: ${error?.constructor?.name}`);

        // Show error in status bar so user knows something went wrong
        if (statusBarItem) {
            statusBarItem.text = `$(error) MCP Server: Error`;
            statusBarItem.tooltip = `MCP Server failed to start: ${errorMessage}. Click to retry.`;
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            statusBarItem.show();
        }

        // Show user-friendly error message
        vscode.window.showErrorMessage(`MCP Server failed to activate: ${errorMessage}. Check "MCP Server Extension" output for details.`);

        // Re-throw so VS Code knows activation failed
        throw error;
    }
}

export async function deactivate() {
    logger.info('========================================');
    logger.info('Deactivating vscode-mcp-server extension');
    logger.info(`[deactivate] Timestamp: ${new Date().toISOString()}`);
    logger.info(`[deactivate] mcpServer exists: ${mcpServer !== undefined}`);
    logger.info(`[deactivate] statusBarItem exists: ${statusBarItem !== undefined}`);
    logger.info(`[deactivate] sharedTerminal exists: ${sharedTerminal !== undefined}`);
    logger.info('========================================');

    // Dispose status bar item first
    if (statusBarItem) {
        logger.info('[deactivate] Disposing status bar item');
        statusBarItem.dispose();
        statusBarItem = undefined;
    }

    // Dispose the shared terminal
    if (sharedTerminal) {
        logger.info('[deactivate] Disposing shared terminal');
        sharedTerminal.dispose();
        sharedTerminal = undefined;
    }

    if (!mcpServer) {
        logger.info('[deactivate] No MCP server to stop, completing deactivation');
        logger.dispose();
        return;
    }

    try {
        logger.info('[deactivate] Stopping MCP Server');
        await mcpServer.stop();
        logger.info('[deactivate] MCP Server stopped successfully');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        logger.error(`[deactivate] Error stopping MCP Server: ${errorMessage}`);
        logger.error(`[deactivate] Error stack: ${errorStack}`);
        throw error; // Re-throw to ensure VS Code knows about the failure
    } finally {
        mcpServer = undefined;
        logger.info('[deactivate] Disposing logger');
        logger.dispose();
    }
}