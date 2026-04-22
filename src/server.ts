import * as vscode from 'vscode';
import { FastMCP } from 'fastmcp';
import { registerFileTools, FileListingCallback } from './tools/file-tools.js';
import { registerEditTools } from './tools/edit-tools.js';
import { registerShellTools } from './tools/shell-tools.js';
import { registerDiagnosticsTools } from './tools/diagnostics-tools.js';
import { registerSymbolTools } from './tools/symbol-tools.js';
import { logger } from './utils/logger.js';

export interface ToolConfiguration {
    file: boolean;
    edit: boolean;
    shell: boolean;
    diagnostics: boolean;
    symbol: boolean;
}

export class MCPServer {
    private server: FastMCP;
    private port: number;
    private host: string;
    private fileListingCallback?: FileListingCallback;
    private terminal?: vscode.Terminal;
    private toolConfig: ToolConfiguration;

    public setFileListingCallback(callback: FileListingCallback) {
        this.fileListingCallback = callback;
    }

    constructor(port: number = 3000, host: string = '127.0.0.1', terminal?: vscode.Terminal, toolConfig?: ToolConfiguration) {
        this.port = port;
        this.host = host;
        this.terminal = terminal;
        this.toolConfig = toolConfig ?? {
            file: true,
            edit: true,
            shell: true,
            diagnostics: true,
            symbol: true,
        };
        this.server = new FastMCP({
            name: 'vscode-mcp-server',
            version: '1.0.0',
        });
    }

    public setupTools(): void {
        if (!this.fileListingCallback) {
            logger.warn('File listing callback not set during tools setup');
            return;
        }
        if (this.toolConfig.file) {
            registerFileTools(this.server, this.fileListingCallback);
            logger.info('MCP file tools registered successfully');
        }
        if (this.toolConfig.edit) {
            registerEditTools(this.server);
            logger.info('MCP edit tools registered successfully');
        }
        if (this.toolConfig.shell) {
            registerShellTools(this.server, this.terminal);
            logger.info('MCP shell tools registered successfully');
        }
        if (this.toolConfig.diagnostics) {
            registerDiagnosticsTools(this.server);
            logger.info('MCP diagnostics tools registered successfully');
        }
        if (this.toolConfig.symbol) {
            registerSymbolTools(this.server);
            logger.info('MCP symbol tools registered successfully');
        }
    }

    public async start(): Promise<void> {
        logger.info(`[MCPServer.start] Starting FastMCP server on ${this.host}:${this.port}`);
        await this.server.start({
            transportType: 'httpStream',
            httpStream: {
                host: this.host,
                port: this.port,
            },
        });
        logger.info(`MCP Server (FastMCP) listening on ${this.host}:${this.port}`);
    }

    public async stop(_forceTimeout: number = 5000): Promise<void> {
        logger.info('[MCPServer.stop] Stopping FastMCP server');
        try {
            await this.server.stop();
        } catch (error) {
            logger.warn(`[MCPServer.stop] Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        logger.info('[MCPServer.stop] Server stopped');
    }
}
