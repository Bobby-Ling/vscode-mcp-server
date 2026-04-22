import * as vscode from 'vscode';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import * as path_module from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger.js';

/**
 * Convert a symbol kind to a string representation
 * @param kind The symbol kind enum value
 * @returns String representation of the symbol kind
 */
function symbolKindToString(kind: vscode.SymbolKind): string {
    switch (kind) {
        case vscode.SymbolKind.File: return 'File';
        case vscode.SymbolKind.Module: return 'Module';
        case vscode.SymbolKind.Namespace: return 'Namespace';
        case vscode.SymbolKind.Package: return 'Package';
        case vscode.SymbolKind.Class: return 'Class';
        case vscode.SymbolKind.Method: return 'Method';
        case vscode.SymbolKind.Property: return 'Property';
        case vscode.SymbolKind.Field: return 'Field';
        case vscode.SymbolKind.Constructor: return 'Constructor';
        case vscode.SymbolKind.Enum: return 'Enum';
        case vscode.SymbolKind.Interface: return 'Interface';
        case vscode.SymbolKind.Function: return 'Function';
        case vscode.SymbolKind.Variable: return 'Variable';
        case vscode.SymbolKind.Constant: return 'Constant';
        case vscode.SymbolKind.String: return 'String';
        case vscode.SymbolKind.Number: return 'Number';
        case vscode.SymbolKind.Boolean: return 'Boolean';
        case vscode.SymbolKind.Array: return 'Array';
        case vscode.SymbolKind.Object: return 'Object';
        case vscode.SymbolKind.Key: return 'Key';
        case vscode.SymbolKind.Null: return 'Null';
        case vscode.SymbolKind.EnumMember: return 'EnumMember';
        case vscode.SymbolKind.Struct: return 'Struct';
        case vscode.SymbolKind.Event: return 'Event';
        case vscode.SymbolKind.Operator: return 'Operator';
        case vscode.SymbolKind.TypeParameter: return 'TypeParameter';
        default: return 'Unknown';
    }
}

/**
 * Converts a workspace URI to a path relative to the workspace root
 * @param uri The URI to convert
 * @returns Path relative to workspace root
 */
function uriToWorkspacePath(uri: vscode.Uri): string {
    if (!vscode.workspace.workspaceFolders) {
        return uri.fsPath;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const workspaceRoot = workspaceFolder.uri.fsPath;

    // Convert to relative path
    const relativePath = path_module.relative(workspaceRoot, uri.fsPath);
    return relativePath;
}

/**
 * Get a preview of the code at a specific line
 * @param uri The URI of the document
 * @param line The line number (0-based)
 * @returns The line content as a string or undefined if not available
 */
async function getPreview(uri: vscode.Uri, line?: number): Promise<string | undefined> {
    if (line === undefined) {
        return undefined;
    }

    try {
        // Try to open the document from VS Code's text document manager
        const documents = vscode.workspace.textDocuments;
        let document = documents.find(doc => doc.uri.toString() === uri.toString());

        // If document is not already open, try to read it from the file system
        if (!document) {
            try {
                const content = await vscode.workspace.fs.readFile(uri);
                const text = Buffer.from(content).toString('utf8');
                const lines = text.split(/\r?\n/);

                if (line >= 0 && line < lines.length) {
                    return lines[line].trim();
                }
            } catch (error) {
                logger.warn(`[getPreview] Could not read file: ${error instanceof Error ? error.message : String(error)}`);
                return undefined;
            }
        } else {
            // Document is open, get the line directly
            if (line >= 0 && line < document.lineCount) {
                return document.lineAt(line).text.trim();
            }
        }
    } catch (error) {
        logger.warn(`[getPreview] Error getting preview: ${error instanceof Error ? error.message : String(error)}`);
    }

    return undefined;
}

/**
 * Get the text content of a specific line in a file
 * @param uri The URI of the document
 * @param line The line number (0-based)
 * @returns The text content of the line or undefined if line doesn't exist
 */
async function getLineText(uri: vscode.Uri, line: number): Promise<string | undefined> {
    try {
        // Open the document using VS Code's API
        const document = await vscode.workspace.openTextDocument(uri);

        // Check if the line exists
        if (line >= 0 && line < document.lineCount) {
            return document.lineAt(line).text;
        }
        return undefined;
    } catch (error) {
        logger.warn(`[getLineText] Error getting line text: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/**
 * Find the first occurrence of a symbol in a line of text
 * @param lineText The text content of the line
 * @param symbolName The exact symbol name to search for
 * @returns The character position (index) where the symbol starts, or -1 if not found
 */
function findSymbolInLine(lineText: string, symbolName: string): number {
    return lineText.indexOf(symbolName);
}

/**
 * Format a Location object to a user-friendly format
 * @param location The location to format
 * @returns Formatted location string with relative path and line:character
 */
function formatLocation(location: vscode.Location): string {
    const relativePath = uriToWorkspacePath(location.uri);
    return `${relativePath}:${location.range.start.line + 1}:${location.range.start.character}`;
}

/**
 * Format a DefinitionLink (LocationLink) object to a user-friendly format
 * @param definitionLink The definition link to format
 * @returns Formatted definition link with path, range, and optional origin
 */
function formatDefinitionLink(definitionLink: vscode.DefinitionLink): {
    location: string;
    targetRange: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    targetSelectionRange?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    originSelectionRange?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
} {
    const relativePath = uriToWorkspacePath(definitionLink.targetUri);
    return {
        location: `${relativePath}:${definitionLink.targetRange.start.line + 1}:${definitionLink.targetRange.start.character}`,
        targetRange: {
            start: {
                line: definitionLink.targetRange.start.line + 1,
                character: definitionLink.targetRange.start.character
            },
            end: {
                line: definitionLink.targetRange.end.line + 1,
                character: definitionLink.targetRange.end.character
            }
        },
        targetSelectionRange: definitionLink.targetSelectionRange ? {
            start: {
                line: definitionLink.targetSelectionRange.start.line + 1,
                character: definitionLink.targetSelectionRange.start.character
            },
            end: {
                line: definitionLink.targetSelectionRange.end.line + 1,
                character: definitionLink.targetSelectionRange.end.character
            }
        } : undefined,
        originSelectionRange: definitionLink.originSelectionRange ? {
            start: {
                line: definitionLink.originSelectionRange.start.line + 1,
                character: definitionLink.originSelectionRange.start.character
            },
            end: {
                line: definitionLink.originSelectionRange.end.line + 1,
                character: definitionLink.originSelectionRange.end.character
            }
        } : undefined
    };
}

/**
 * Format a CallHierarchyItem to a user-friendly format
 * @param item The call hierarchy item to format
 * @returns Formatted call hierarchy item
 */
function formatCallHierarchyItem(item: vscode.CallHierarchyItem): {
    name: string;
    kind: string;
    detail?: string;
    location: string;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    selectionRange: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
} {
    const relativePath = uriToWorkspacePath(item.uri);
    return {
        name: item.name,
        kind: symbolKindToString(item.kind),
        detail: item.detail,
        location: `${relativePath}:${item.selectionRange.start.line + 1}:${item.selectionRange.start.character}`,
        range: {
            start: {
                line: item.range.start.line + 1,
                character: item.range.start.character
            },
            end: {
                line: item.range.end.line + 1,
                character: item.range.end.character
            }
        },
        selectionRange: {
            start: {
                line: item.selectionRange.start.line + 1,
                character: item.selectionRange.start.character
            },
            end: {
                line: item.selectionRange.end.line + 1,
                character: item.selectionRange.end.character
            }
        }
    };
}

/**
 * Format a TypeHierarchyItem to a user-friendly format
 * @param item The type hierarchy item to format
 * @returns Formatted type hierarchy item
 */
function formatTypeHierarchyItem(item: vscode.TypeHierarchyItem): {
    name: string;
    kind: string;
    detail?: string;
    location: string;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    selectionRange: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
} {
    const relativePath = uriToWorkspacePath(item.uri);
    return {
        name: item.name,
        kind: symbolKindToString(item.kind),
        detail: item.detail,
        location: `${relativePath}:${item.selectionRange.start.line + 1}:${item.selectionRange.start.character}`,
        range: {
            start: {
                line: item.range.start.line + 1,
                character: item.range.start.character
            },
            end: {
                line: item.range.end.line + 1,
                character: item.range.end.character
            }
        },
        selectionRange: {
            start: {
                line: item.selectionRange.start.line + 1,
                character: item.selectionRange.start.character
            },
            end: {
                line: item.selectionRange.end.line + 1,
                character: item.selectionRange.end.character
            }
        }
    };
}

/**
 * Format SignatureHelp to a user-friendly format
 * @param signatureHelp The signature help to format
 * @returns Formatted signature help information
 */
function formatSignatureHelp(signatureHelp: vscode.SignatureHelp): {
    activeSignature: number;
    activeParameter: number;
    signatures: Array<{
        label: string;
        documentation?: string;
        parameters: Array<{
            label: string;
            documentation?: string;
        }>;
    }>;
} {
    return {
        activeSignature: signatureHelp.activeSignature,
        activeParameter: signatureHelp.activeParameter,
        signatures: signatureHelp.signatures.map(sig => ({
            label: sig.label,
            documentation: sig.documentation ?
                (typeof sig.documentation === 'string' ? sig.documentation : sig.documentation.value) :
                undefined,
            parameters: sig.parameters.map(param => ({
                label: Array.isArray(param.label) ? param.label.join('') : param.label,
                documentation: param.documentation ?
                    (typeof param.documentation === 'string' ? param.documentation : param.documentation.value) :
                    undefined
            }))
        }))
    };
}

/**
 * Process hover content to extract string value
 * @param content The hover content item
 * @returns String representation of the content
 */
function processHoverContent(content: any): string {
    if (typeof content === 'string') {
        return content;
    } else if (content && typeof content === 'object' && 'value' in content) {
        return content.value;
    }
    return String(content);
}

/**
 * Get hover information for a symbol at a specific position in a document
 * @param uri The URI of the text document
 * @param position The position of the symbol
 * @returns Hover information for the symbol
 */
export async function getSymbolHoverInfo(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<{
    hovers: Array<{
        contents: string[];
        range?: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        preview?: string;
    }>;
}> {
    logger.info(`[getSymbolHoverInfo] Getting hover info for ${uri.toString()} at position (${position.line},${position.character})`);

    try {
        // Execute the hover provider
        const commandResult = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            uri,
            position
        ) || [];

        logger.info(`[getSymbolHoverInfo] Found ${commandResult.length} hover results`);

        // Map the hover results to a more friendly format
        const hovers = await Promise.all(commandResult.map(async hover => {
            // Process the contents
            let contents: string[] = [];

            if (Array.isArray(hover.contents)) {
                contents = hover.contents.map(processHoverContent);
            } else if (hover.contents) {
                contents = [processHoverContent(hover.contents)];
            }

            // Format the range if available
            const range = hover.range ? {
                start: {
                    line: hover.range.start.line,
                    character: hover.range.start.character
                },
                end: {
                    line: hover.range.end.line,
                    character: hover.range.end.character
                }
            } : undefined;

            // Get a preview of the code if range is available
            const preview = await getPreview(uri, hover.range?.start.line);

            return { contents, range, preview };
        }));

        return { hovers };
    } catch (error) {
        logger.error(`[getSymbolHoverInfo] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Get definition locations for a symbol at a specific position
 * @param uri The URI of the text document
 * @param position The position of the symbol
 * @returns Array of definition locations with code preview
 */
export async function getDefinition(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<{
    definitions: Array<{
        location: string;
        targetRange: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        targetSelectionRange?: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        preview?: string;
        fullCode?: string;
    }>;
    total: number;
}> {
    logger.info(`[getDefinition] Getting definition for ${uri.toString()} at position (${position.line},${position.character})`);

    try {
        const rawDefinitions = await vscode.commands.executeCommand<(vscode.DefinitionLink | vscode.Location)[]>(
            'vscode.executeDefinitionProvider',
            uri,
            position
        ) || [];

        const definitions = rawDefinitions.map(normalizeToDefinitionLink);
        logger.info(`[getDefinition] Found ${definitions.length} definitions`);

        const formattedDefinitions = await Promise.all(definitions.map(async (def) => {
            const preview = await getPreview(def.targetUri, def.targetRange.start.line);

            // Get full code block from definition range
            let fullCode: string | undefined;
            try {
                const doc = await vscode.workspace.openTextDocument(def.targetUri);
                const startLine = def.targetRange.start.line;
                const endLine = def.targetRange.end.line;

                if (startLine >= 0 && endLine < doc.lineCount && endLine >= startLine) {
                    const lines: string[] = [];
                    for (let i = startLine; i <= endLine; i++) {
                        lines.push(doc.lineAt(i).text);
                    }
                    fullCode = lines.join('\n');
                }
            } catch (e) {
                logger.warn(`[getDefinition] Could not read full code: ${e}`);
            }

            const formatted = formatDefinitionLink(def);
            return {
                location: formatted.location,
                targetRange: formatted.targetRange,
                targetSelectionRange: formatted.targetSelectionRange,
                preview,
                fullCode
            };
        }));

        return {
            definitions: formattedDefinitions,
            total: definitions.length
        };
    } catch (error) {
        logger.error(`[getDefinition] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Get all references to a symbol at a specific position
 * @param uri The URI of the text document
 * @param position The position of the symbol
 * @returns Array of reference locations
 */
export async function getReferences(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<{
    references: Array<{
        location: string;
        range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        preview?: string;
    }>;
    total: number;
}> {
    logger.info(`[getReferences] Getting references for ${uri.toString()} at position (${position.line},${position.character})`);

    try {
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            uri,
            position
        ) || [];

        logger.info(`[getReferences] Found ${references.length} references`);

        const formattedReferences = await Promise.all(references.map(async (ref) => {
            const preview = await getPreview(ref.uri, ref.range.start.line);
            return {
                location: formatLocation(ref),
                range: {
                    start: {
                        line: ref.range.start.line + 1,
                        character: ref.range.start.character
                    },
                    end: {
                        line: ref.range.end.line + 1,
                        character: ref.range.end.character
                    }
                },
                preview
            };
        }));

        return {
            references: formattedReferences,
            total: references.length
        };
    } catch (error) {
        logger.error(`[getReferences] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Get type definition locations for a symbol at a specific position
 * @param uri The URI of the text document
 * @param position The position of the symbol
 * @returns Array of type definition locations
 */
/**
 * Normalize a Location or LocationLink (DefinitionLink) to a DefinitionLink.
 * VS Code commands like executeTypeDefinitionProvider / executeImplementationProvider
 * can return either type depending on the language server.
 */
function normalizeToDefinitionLink(item: vscode.Location | vscode.DefinitionLink): vscode.DefinitionLink {
    if ('targetUri' in item) {
        // Already a DefinitionLink / LocationLink
        return item;
    }
    // It's a vscode.Location — adapt it
    return {
        targetUri: item.uri,
        targetRange: item.range,
        targetSelectionRange: item.range,
    };
}

export async function getTypeDefinition(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<{
    definitions: Array<{
        location: string;
        targetRange: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        targetSelectionRange?: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        preview?: string;
    }>;
    total: number;
}> {
    logger.info(`[getTypeDefinition] Getting type definition for ${uri.toString()} at position (${position.line},${position.character})`);

    try {
        const rawDefinitions = await vscode.commands.executeCommand<(vscode.DefinitionLink | vscode.Location)[]>(
            'vscode.executeTypeDefinitionProvider',
            uri,
            position
        ) || [];

        const definitions = rawDefinitions.map(normalizeToDefinitionLink);
        logger.info(`[getTypeDefinition] Found ${definitions.length} type definitions`);

        const formattedDefinitions = await Promise.all(definitions.map(async (def) => {
            const preview = await getPreview(def.targetUri, def.targetRange.start.line);
            const formatted = formatDefinitionLink(def);
            return {
                location: formatted.location,
                targetRange: formatted.targetRange,
                targetSelectionRange: formatted.targetSelectionRange,
                preview
            };
        }));

        return {
            definitions: formattedDefinitions,
            total: definitions.length
        };
    } catch (error) {
        logger.error(`[getTypeDefinition] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Get implementation locations for a symbol at a specific position
 * @param uri The URI of the text document
 * @param position The position of the symbol
 * @returns Array of implementation locations
 */
export async function getImplementations(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<{
    implementations: Array<{
        location: string;
        targetRange: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        targetSelectionRange?: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        preview?: string;
    }>;
    total: number;
}> {
    logger.info(`[getImplementations] Getting implementations for ${uri.toString()} at position (${position.line},${position.character})`);

    try {
        const rawImplementations = await vscode.commands.executeCommand<(vscode.DefinitionLink | vscode.Location)[]>(
            'vscode.executeImplementationProvider',
            uri,
            position
        ) || [];

        const implementations = rawImplementations.map(normalizeToDefinitionLink);
        logger.info(`[getImplementations] Found ${implementations.length} implementations`);

        const formattedImplementations = await Promise.all(implementations.map(async (impl) => {
            const preview = await getPreview(impl.targetUri, impl.targetRange.start.line);
            const formatted = formatDefinitionLink(impl);
            return {
                location: formatted.location,
                targetRange: formatted.targetRange,
                targetSelectionRange: formatted.targetSelectionRange,
                preview
            };
        }));

        return {
            implementations: formattedImplementations,
            total: implementations.length
        };
    } catch (error) {
        logger.error(`[getImplementations] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Get signature help for a symbol at a specific position
 * @param uri The URI of the text document
 * @param position The position of the symbol
 * @returns Signature help information
 */
export async function getSignatureHelp(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<{
    activeSignature: number;
    activeParameter: number;
    signatures: Array<{
        label: string;
        documentation?: string;
        parameters: Array<{
            label: string;
            documentation?: string;
        }>;
    }>;
}> {
    logger.info(`[getSignatureHelp] Getting signature help for ${uri.toString()} at position (${position.line},${position.character})`);

    try {
        const signatureHelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
            'vscode.executeSignatureHelpProvider',
            uri,
            position
        );

        if (!signatureHelp) {
            logger.info('[getSignatureHelp] No signature help found');
            return {
                activeSignature: 0,
                activeParameter: 0,
                signatures: []
            };
        }

        logger.info(`[getSignatureHelp] Found ${signatureHelp.signatures.length} signatures`);

        return formatSignatureHelp(signatureHelp);
    } catch (error) {
        logger.error(`[getSignatureHelp] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Search for symbols across the workspace
 * @param query The search query
 * @param maxResults Maximum number of results to return
 * @returns Array of formatted symbol information objects
 */
export async function searchWorkspaceSymbols(query: string, maxResults: number = 10): Promise<{
    symbols: Array<{
        name: string;
        kind: string;
        location: string;
        containerName?: string;
        range?: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
    }>;
    total: number;
}> {
    logger.info(`[searchWorkspaceSymbols] Starting with query: "${query}", maxResults: ${maxResults}`);

    try {
        // Execute the workspace symbol provider
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            query
        ) || [];

        logger.info(`[searchWorkspaceSymbols] Found ${symbols.length} symbols`);

        // Get total count before limiting
        const totalCount = symbols.length;

        // Apply limit
        const limitedSymbols = symbols.slice(0, maxResults);

        // Format the results
        const result = {
            symbols: limitedSymbols.map(symbol => {
                const formatted = {
                    name: symbol.name,
                    kind: symbolKindToString(symbol.kind),
                    location: `${uriToWorkspacePath(symbol.location.uri)}:${symbol.location.range.start.line + 1}:${symbol.location.range.start.character}`,
                    range: {
                        start: {
                            line: symbol.location.range.start.line + 1,
                            character: symbol.location.range.start.character
                        },
                        end: {
                            line: symbol.location.range.end.line + 1,
                            character: symbol.location.range.end.character
                        }
                    }
                };

                // Add container name if available
                if (symbol.containerName) {
                    Object.assign(formatted, { containerName: symbol.containerName });
                }

                return formatted;
            }),
            total: totalCount
        };

        return result;
    } catch (error) {
        logger.error(`[searchWorkspaceSymbols] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Prepare call hierarchy for a symbol at a specific position
 * @param uri The URI of the text document
 * @param position The position of the symbol
 * @returns Call hierarchy items that can be used as entry points
 */
export async function prepareCallHierarchy(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<{
    items: Array<{
        name: string;
        kind: string;
        detail?: string;
        location: string;
        range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        selectionRange: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
    }>;
    total: number;
}> {
    logger.info(`[prepareCallHierarchy] Preparing call hierarchy for ${uri.toString()} at position (${position.line},${position.character})`);

    try {
        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
            'vscode.prepareCallHierarchy',
            uri,
            position
        ) || [];

        logger.info(`[prepareCallHierarchy] Found ${items.length} call hierarchy items`);

        const formattedItems = items.map(item => formatCallHierarchyItem(item));

        return {
            items: formattedItems,
            total: items.length
        };
    } catch (error) {
        logger.error(`[prepareCallHierarchy] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Prepare type hierarchy for a symbol at a specific position
 * @param uri The URI of the text document
 * @param position The position of the symbol
 * @returns Type hierarchy items that can be used as entry points
 */
export async function prepareTypeHierarchy(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<{
    items: Array<{
        name: string;
        kind: string;
        detail?: string;
        location: string;
        range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        selectionRange: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
    }>;
    total: number;
}> {
    logger.info(`[prepareTypeHierarchy] Preparing type hierarchy for ${uri.toString()} at position (${position.line},${position.character})`);

    try {
        const items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            'vscode.prepareTypeHierarchy',
            uri,
            position
        ) || [];

        logger.info(`[prepareTypeHierarchy] Found ${items.length} type hierarchy items`);

        const formattedItems = items.map(item => formatTypeHierarchyItem(item));

        return {
            items: formattedItems,
            total: items.length
        };
    } catch (error) {
        logger.error(`[prepareTypeHierarchy] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Get all document symbols from a file in hierarchical format
 * @param uri The URI of the document
 * @param maxDepth Maximum nesting depth to display (optional)
 * @returns Formatted symbol information with hierarchy
 */
export async function getDocumentSymbols(
    uri: vscode.Uri,
    maxDepth?: number
): Promise<{
    symbols: Array<{
        name: string;
        detail?: string;
        kind: string;
        range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        selectionRange: {
            start: { line: number; character: number };
            end: { line: number; character: number };
        };
        depth: number;
        children?: any[];
    }>;
    total: number;
    totalByKind: Record<string, number>;
}> {
    logger.info(`[getDocumentSymbols] Getting symbols for ${uri.toString()}, maxDepth: ${maxDepth}`);

    try {
        // Execute the document symbol provider
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        ) || [];

        logger.info(`[getDocumentSymbols] Found ${symbols.length} top-level symbols`);

        const flatSymbols: any[] = [];
        const kindCounts: Record<string, number> = {};

        // Recursive function to process symbols and their children
        function processSymbols(symbols: vscode.DocumentSymbol[], depth: number = 0) {
            for (const symbol of symbols) {
                // Skip if max depth exceeded
                if (maxDepth !== undefined && depth > maxDepth) {
                    continue;
                }

                const kindString = symbolKindToString(symbol.kind);
                kindCounts[kindString] = (kindCounts[kindString] || 0) + 1;

                const processedSymbol = {
                    name: symbol.name,
                    detail: symbol.detail || undefined,
                    kind: kindString,
                    range: {
                        start: {
                            line: symbol.range.start.line + 1,
                            character: symbol.range.start.character
                        },
                        end: {
                            line: symbol.range.end.line + 1,
                            character: symbol.range.end.character
                        }
                    },
                    selectionRange: {
                        start: {
                            line: symbol.selectionRange.start.line + 1,
                            character: symbol.selectionRange.start.character
                        },
                        end: {
                            line: symbol.selectionRange.end.line + 1,
                            character: symbol.selectionRange.end.character
                        }
                    },
                    depth,
                    children: symbol.children && symbol.children.length > 0 ? symbol.children.length : undefined
                };

                flatSymbols.push(processedSymbol);

                // Recursively process children
                if (symbol.children && symbol.children.length > 0) {
                    processSymbols(symbol.children, depth + 1);
                }
            }
        }

        processSymbols(symbols);

        return {
            symbols: flatSymbols,
            total: flatSymbols.length,
            totalByKind: kindCounts
        };
    } catch (error) {
        logger.error(`[getDocumentSymbols] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Recursively walk a DocumentSymbol tree and collect exact-name matches.
 */
function collectDocumentSymbolMatches(
    symbols: vscode.DocumentSymbol[],
    query: string,
    caseSensitive: boolean,
    file: string,
    results: Array<{
        name: string;
        kind: string;
        file: string;
        line: number;
        character: number;
        detail?: string;
        containerPath: string[];
    }>,
    containerPath: string[] = []
): void {
    for (const sym of symbols) {
        const match = caseSensitive
            ? sym.name === query
            : sym.name.toLowerCase() === query.toLowerCase();

        if (match) {
            results.push({
                name: sym.name,
                kind: symbolKindToString(sym.kind),
                file,
                // selectionRange pinpoints just the symbol name (like the @ picker)
                line: sym.selectionRange.start.line + 1,
                character: sym.selectionRange.start.character,
                detail: sym.detail || undefined,
                containerPath: [...containerPath],
            });
        }

        if (sym.children && sym.children.length > 0) {
            collectDocumentSymbolMatches(
                sym.children, query, caseSensitive, file,
                results, [...containerPath, sym.name]
            );
        }
    }
}

/**
 * Hybrid strategy: use workspace symbol provider to find candidate files,
 * then use document symbol provider for precise selectionRange lookup.
 * @param query The exact symbol name to search for
 * @param caseSensitive Whether to match case-sensitively (default: true)
 * @param maxResults Maximum number of results to return
 */
export async function searchSymbolInfo(query: string, caseSensitive: boolean = true, maxResults: number = 20): Promise<{
    symbols: Array<{
        name: string;
        kind: string;
        file: string;
        line: number;
        character: number;
        detail?: string;
        containerPath: string[];
    }>;
    total: number;
    query: string;
}> {
    logger.info(`[searchSymbolInfo] query="${query}", caseSensitive=${caseSensitive}, maxResults=${maxResults}`);

    try {
        // Step 1: Use workspace symbol provider to find candidate files.
        // We pass the query so LSP can narrow down candidate files efficiently.
        const rawSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            query
        ) || [];

        logger.info(`[searchSymbolInfo] Workspace provider returned ${rawSymbols.length} candidates`);

        // Step 2: Collect unique URIs from candidates
        const uriSet = new Map<string, vscode.Uri>();
        for (const s of rawSymbols) {
            const key = s.location.uri.toString();
            if (!uriSet.has(key)) {
                uriSet.set(key, s.location.uri);
            }
        }

        logger.info(`[searchSymbolInfo] Scanning ${uriSet.size} unique file(s) with document symbol provider`);

        // Step 3: For each file, run document symbol provider and do precise name matching
        const results: Array<{
            name: string;
            kind: string;
            file: string;
            line: number;
            character: number;
            detail?: string;
            containerPath: string[];
        }> = [];

        for (const uri of uriSet.values()) {
            if (results.length >= maxResults) { break; }

            try {
                const docSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    uri
                ) || [];

                const filePath = uriToWorkspacePath(uri);
                collectDocumentSymbolMatches(docSymbols, query, caseSensitive, filePath, results);
            } catch (e) {
                logger.warn(`[searchSymbolInfo] Could not get document symbols for ${uri}: ${e}`);
            }
        }

        const total = results.length;
        return { symbols: results.slice(0, maxResults), total, query };
    } catch (error) {
        logger.error(`[searchSymbolInfo] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Registers MCP symbol-related tools with the server
 * @param server MCP server instance
 */
export function registerSymbolTools(server: FastMCP): void {
    server.addTool({
        name: 'fuzz_search_symbols_code',
        description: `Searches for symbols (functions, classes, variables) across workspace using fuzzy/prefix matching.

        WHEN TO USE: Exploring project structure when you only know part of a symbol name (e.g., 'createW' finds 'createWorkspaceFile').
        For precise location lookup by exact name, use search_symbol_info instead.
        
        Returns location and container info. Limit results to avoid overwhelming output.`,
        parameters: z.object({
            query: z.string().describe('The search query for symbol names'),
            maxResults: z.number().optional().default(10).describe('Maximum number of results to return (default: 10)')
        }),
        execute: async ({ query, maxResults = 10 }) => {
            logger.info(`[fuzz_search_symbols_code] Tool called with query="${query}", maxResults=${maxResults}`);
            try {
                logger.info('[fuzz_search_symbols_code] Searching workspace symbols');
                const result = await searchWorkspaceSymbols(query, maxResults);
                let resultText: string;
                if (result.symbols.length === 0) {
                    resultText = `No symbols found matching query "${query}".`;
                } else {
                    resultText = `Found ${result.total} symbols matching query "${query}"`;
                    if (result.total > maxResults) { resultText += ` (showing first ${maxResults})`; }
                    resultText += ":\n\n";
                    for (const symbol of result.symbols) {
                        resultText += `${symbol.name} (${symbol.kind})`;
                        if (symbol.containerName) { resultText += ` in ${symbol.containerName}`; }
                        resultText += `\nLocation: ${symbol.location}\n\n`;
                    }
                }
                logger.info('[fuzz_search_symbols_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[fuzz_search_symbols_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'search_symbol_info',
        description: `Precisely locates a symbol by exact name and returns its declaration file, line, and column.

        WHEN TO USE: You know the exact symbol name and need file/line/col to pass to other tools
        (get_definition_code, get_references_code, get_call_hierarchy_code, etc.).
        Uses a hybrid strategy: workspace symbol provider finds candidate files, then document symbol
        provider (same as the VS Code @ picker) gives precise selectionRange for each match.
        For fuzzy/prefix exploration use fuzz_search_symbols_code instead.
        
        Returns: workspace-relative file path, 1-based line, character offset, symbol kind,
        detail (e.g. signature), and containerPath (e.g. ["ClassName", "methodName"]).`,
        parameters: z.object({
            query: z.string().describe('The exact symbol name to search for'),
            caseSensitive: z.boolean().optional().default(true).describe('Case-sensitive name match (default: true)'),
            maxResults: z.number().optional().default(20).describe('Maximum number of results to return (default: 20)')
        }),
        execute: async ({ query, caseSensitive = true, maxResults = 20 }) => {
            logger.info(`[search_symbol_info] Tool called with query="${query}", caseSensitive=${caseSensitive}, maxResults=${maxResults}`);
            try {
                const result = await searchSymbolInfo(query, caseSensitive, maxResults);
                let resultText: string;
                if (result.symbols.length === 0) {
                    resultText = `No symbol found with name "${query}".\nTip: check spelling, or use fuzz_search_symbols_code for fuzzy search.`;
                } else {
                    resultText = `Found ${result.total} symbol(s) named "${query}"`;
                    if (result.total > maxResults) { resultText += ` (showing first ${maxResults})`; }
                    resultText += ':\n\n';
                    for (const sym of result.symbols) {
                        resultText += `name: ${sym.name}\nkind: ${sym.kind}\n`;
                        if (sym.detail) { resultText += `detail: ${sym.detail}\n`; }
                        if (sym.containerPath.length > 0) { resultText += `container: ${sym.containerPath.join(' > ')}\n`; }
                        resultText += `file: ${sym.file}\nline: ${sym.line}\ncharacter: ${sym.character}\n\n`;
                    }
                }
                logger.info('[search_symbol_info] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[search_symbol_info] Error: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'get_definition_code',
        description: `Gets the definition location and code block for a symbol (go to definition).

        WHEN TO USE: Finding where a function/class/variable is actually defined, getting the full implementation code.
        USE search_symbol_info to find the file/line/col of a symbol first, then pass it here.
        USE get_symbol_definition_code for: getting type/docs via hover (lighter, no code block).
        
        Returns the full code block at the definition location. Requires exact symbol name and line number.`,
        parameters: z.object({
            path: z.string().describe('The path to the file containing the symbol'),
            line: z.number().describe('The line number of the symbol (1-based)'),
            symbol: z.string().describe('The symbol name to look for on the specified line')
        }),
        execute: async ({ path, line, symbol }) => {
            logger.info(`[get_definition_code] Tool called with path="${path}", line=${line}, symbol="${symbol}"`);
            const zeroBasedLine = line - 1;
            try {
                if (!vscode.workspace.workspaceFolders) { throw new Error('No workspace folder open'); }
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fullPath = path_module.resolve(workspaceRoot, path);
                const uri = vscode.Uri.file(fullPath);
                try { await vscode.workspace.fs.stat(uri); } catch { throw new Error(`File not found: ${path}`); }
                const lineText = await getLineText(uri, zeroBasedLine);
                if (!lineText) { throw new Error(`Line ${line} not found in file: ${path}`); }
                const character = findSymbolInLine(lineText, symbol);
                if (character === -1) { return { content: [{ type: 'text' as const, text: `Symbol "${symbol}" not found on line ${line} in file: ${path}` }] }; }
                const position = new vscode.Position(zeroBasedLine, character);
                const result = await getDefinition(uri, position);
                let resultText: string;
                if (result.definitions.length === 0) {
                    resultText = `No definition found for symbol "${symbol}" at ${path}:${line}:${character}.`;
                } else {
                    resultText = `Found ${result.total} definition(s) for symbol "${symbol}" at ${path}:${line}:${character}:\n\n`;
                    for (const def of result.definitions) {
                        resultText += `**Definition at**: ${def.location}\n**Range**: ${def.targetRange.start.line}:${def.targetRange.start.character} - ${def.targetRange.end.line}:${def.targetRange.end.character}\n\n`;
                        if (def.preview) { resultText += `**Preview**: \`${def.preview}\`\n\n`; }
                        if (def.fullCode) { const lineCount = def.targetRange.end.line - def.targetRange.start.line + 1; resultText += `**Code** (${lineCount} lines):\n\`\`\`\n${def.fullCode}\n\`\`\`\n\n`; }
                        resultText += `---\n\n`;
                    }
                }
                logger.info('[get_definition_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[get_definition_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'get_symbol_definition_code',
        description: `Gets definition information for a symbol using hover data (type, docs, source).

        WHEN TO USE: Understanding what a symbol represents, checking function signatures, quick API reference.
        USE search_symbols_code instead for: finding symbols by name across the project.
        
        Requires exact symbol name and line number. If symbol not found on line, returns clear message.`,
        parameters: z.object({
            path: z.string().describe('The path to the file containing the symbol'),
            line: z.number().describe('The line number of the symbol (1-based)'),
            symbol: z.string().describe('The symbol name to look for on the specified line')
        }),
        execute: async ({ path, line, symbol }) => {
            logger.info(`[get_symbol_definition_code] Tool called with path="${path}", line=${line}, symbol="${symbol}"`);
            const zeroBasedLine = line - 1;
            try {
                if (!vscode.workspace.workspaceFolders) { throw new Error('No workspace folder open'); }
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fullPath = path_module.resolve(workspaceRoot, path);
                const uri = vscode.Uri.file(fullPath);
                try { await vscode.workspace.fs.stat(uri); } catch { throw new Error(`File not found: ${path}`); }
                const lineText = await getLineText(uri, zeroBasedLine);
                if (!lineText) { throw new Error(`Line ${line} not found in file: ${path}`); }
                const character = findSymbolInLine(lineText, symbol);
                if (character === -1) { return { content: [{ type: 'text' as const, text: `Symbol "${symbol}" not found on line ${line} in file: ${path}` }] }; }
                const position = new vscode.Position(zeroBasedLine, character);
                const hoverResult = await getSymbolHoverInfo(uri, position);
                let resultText: string;
                if (hoverResult.hovers.length === 0) {
                    resultText = `No definition information found for symbol "${symbol}" at ${path}:${line}:${character}.`;
                } else {
                    resultText = `Definition information for symbol "${symbol}" at ${path}:${line}:${character}:\n\n`;
                    for (const hover of hoverResult.hovers) {
                        if (hover.preview) { resultText += `Code context: \`${hover.preview}\`\n\n`; }
                        for (const content of hover.contents) { resultText += `${content}\n\n`; }
                        if (hover.range) { resultText += `Symbol range: [${hover.range.start.line}:${hover.range.start.character}] to [${hover.range.end.line}:${hover.range.end.character}]\n\n`; }
                    }
                }
                logger.info('[get_symbol_definition_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[get_symbol_definition_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'get_document_symbols_code',
        description: `Gets complete symbol outline for a file showing hierarchical structure and line numbers.

        WHEN TO USE: Understanding file structure, getting overview of all symbols, finding symbol positions. This tool should be be preferred over reading the file using read_file_code when only an overview of the file is needed.
        USE search_symbols_code instead for: finding specific symbols by name across the project.
        
        Shows classes, functions, methods, variables with line ranges. Use maxDepth for large files to avoid deep nesting.`,
        parameters: z.object({
            path: z.string().describe('The path to the file to analyze (relative to workspace)'),
            maxDepth: z.number().optional().describe('Maximum nesting depth to display (optional)')
        }),
        execute: async ({ path, maxDepth }) => {
            logger.info(`[get_document_symbols_code] Tool called with path="${path}", maxDepth=${maxDepth}`);
            try {
                if (!vscode.workspace.workspaceFolders) { throw new Error('No workspace folder open'); }
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fullPath = path_module.resolve(workspaceRoot, path);
                const uri = vscode.Uri.file(fullPath);
                try { await vscode.workspace.fs.stat(uri); } catch { throw new Error(`File not found: ${path}`); }
                logger.info('[get_document_symbols_code] Getting document symbols');
                const result = await getDocumentSymbols(uri, maxDepth);
                let resultText: string;
                if (result.symbols.length === 0) {
                    resultText = `No symbols found in file: ${path}`;
                } else {
                    resultText = `Document symbols for ${path} (${result.total} total symbols):\n\n`;
                    const kindSummary = Object.entries(result.totalByKind).map(([kind, count]) => `${count} ${kind}${count !== 1 ? 's' : ''}`).join(', ');
                    resultText += `Summary: ${kindSummary}\n\n`;
                    for (const symbol of result.symbols) {
                        const indent = '  '.repeat(symbol.depth);
                        resultText += `${indent}${symbol.name} (${symbol.kind})`;
                        if (symbol.detail) { resultText += ` - ${symbol.detail}`; }
                        resultText += `\n${indent}  Range: ${symbol.range.start.line}:${symbol.range.start.character}-${symbol.range.end.line}:${symbol.range.end.character}`;
                        if (symbol.children !== undefined) { resultText += ` | Children: ${symbol.children}`; }
                        resultText += '\n\n';
                    }
                }
                logger.info('[get_document_symbols_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[get_document_symbols_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'get_references_code',
        description: `Finds all references to a symbol across the workspace.

        WHEN TO USE: Finding where a function/class/variable is used, understanding impact of changes, refactoring preparation.
        
        Requires exact symbol name and line number. Returns locations of all references with code preview.`,
        parameters: z.object({
            path: z.string().describe('The path to the file containing the symbol'),
            line: z.number().describe('The line number of the symbol (1-based)'),
            symbol: z.string().describe('The symbol name to look for on the specified line')
        }),
        execute: async ({ path, line, symbol }) => {
            logger.info(`[get_references_code] Tool called with path="${path}", line=${line}, symbol="${symbol}"`);
            const zeroBasedLine = line - 1;
            try {
                if (!vscode.workspace.workspaceFolders) { throw new Error('No workspace folder open'); }
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fullPath = path_module.resolve(workspaceRoot, path);
                const uri = vscode.Uri.file(fullPath);
                try { await vscode.workspace.fs.stat(uri); } catch { throw new Error(`File not found: ${path}`); }
                const lineText = await getLineText(uri, zeroBasedLine);
                if (!lineText) { throw new Error(`Line ${line} not found in file: ${path}`); }
                const character = findSymbolInLine(lineText, symbol);
                if (character === -1) { return { content: [{ type: 'text' as const, text: `Symbol "${symbol}" not found on line ${line} in file: ${path}` }] }; }
                const position = new vscode.Position(zeroBasedLine, character);
                const result = await getReferences(uri, position);
                let resultText: string;
                if (result.references.length === 0) {
                    resultText = `No references found for symbol "${symbol}" at ${path}:${line}:${character}.`;
                } else {
                    resultText = `Found ${result.total} references to symbol "${symbol}" at ${path}:${line}:${character}:\n\n`;
                    for (const ref of result.references) {
                        resultText += `- ${ref.location}`;
                        if (ref.preview) { resultText += `\n  Code: \`${ref.preview}\``; }
                        resultText += '\n\n';
                    }
                }
                logger.info('[get_references_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[get_references_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'get_type_definition_code',
        description: `Finds the type definition for a symbol (goes to the type's definition).

        WHEN TO USE: Understanding what type a variable/parameter has, navigating to type definitions, exploring type hierarchy.
        
        Requires exact symbol name and line number. Works best on typed languages (TypeScript, etc.).`,
        parameters: z.object({
            path: z.string().describe('The path to the file containing the symbol'),
            line: z.number().describe('The line number of the symbol (1-based)'),
            symbol: z.string().describe('The symbol name to look for on the specified line')
        }),
        execute: async ({ path, line, symbol }) => {
            logger.info(`[get_type_definition_code] Tool called with path="${path}", line=${line}, symbol="${symbol}"`);
            const zeroBasedLine = line - 1;
            try {
                if (!vscode.workspace.workspaceFolders) { throw new Error('No workspace folder open'); }
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fullPath = path_module.resolve(workspaceRoot, path);
                const uri = vscode.Uri.file(fullPath);
                try { await vscode.workspace.fs.stat(uri); } catch { throw new Error(`File not found: ${path}`); }
                const lineText = await getLineText(uri, zeroBasedLine);
                if (!lineText) { throw new Error(`Line ${line} not found in file: ${path}`); }
                const character = findSymbolInLine(lineText, symbol);
                if (character === -1) { return { content: [{ type: 'text' as const, text: `Symbol "${symbol}" not found on line ${line} in file: ${path}` }] }; }
                const position = new vscode.Position(zeroBasedLine, character);
                const result = await getTypeDefinition(uri, position);
                let resultText: string;
                if (result.definitions.length === 0) {
                    resultText = `No type definition found for symbol "${symbol}" at ${path}:${line}:${character}.`;
                } else {
                    resultText = `Found ${result.total} type definition(s) for symbol "${symbol}" at ${path}:${line}:${character}:\n\n`;
                    for (const def of result.definitions) {
                        resultText += `- Location: ${def.location}`;
                        if (def.preview) { resultText += `\n  Code: \`${def.preview}\``; }
                        resultText += `\n  Range: ${def.targetRange.start.line}:${def.targetRange.start.character}-${def.targetRange.end.line}:${def.targetRange.end.character}\n\n`;
                    }
                }
                logger.info('[get_type_definition_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[get_type_definition_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'get_implementations_code',
        description: `Finds all implementations of an interface or abstract class.

        WHEN TO USE: Finding concrete implementations of an interface, discovering subclasses, understanding polymorphism.
        
        Requires exact symbol name and line number. Works on interface/class definitions.`,
        parameters: z.object({
            path: z.string().describe('The path to the file containing the symbol'),
            line: z.number().describe('The line number of the symbol (1-based)'),
            symbol: z.string().describe('The symbol name to look for on the specified line')
        }),
        execute: async ({ path, line, symbol }) => {
            logger.info(`[get_implementations_code] Tool called with path="${path}", line=${line}, symbol="${symbol}"`);
            const zeroBasedLine = line - 1;
            try {
                if (!vscode.workspace.workspaceFolders) { throw new Error('No workspace folder open'); }
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fullPath = path_module.resolve(workspaceRoot, path);
                const uri = vscode.Uri.file(fullPath);
                try { await vscode.workspace.fs.stat(uri); } catch { throw new Error(`File not found: ${path}`); }
                const lineText = await getLineText(uri, zeroBasedLine);
                if (!lineText) { throw new Error(`Line ${line} not found in file: ${path}`); }
                const character = findSymbolInLine(lineText, symbol);
                if (character === -1) { return { content: [{ type: 'text' as const, text: `Symbol "${symbol}" not found on line ${line} in file: ${path}` }] }; }
                const position = new vscode.Position(zeroBasedLine, character);
                const result = await getImplementations(uri, position);
                let resultText: string;
                if (result.implementations.length === 0) {
                    resultText = `No implementations found for symbol "${symbol}" at ${path}:${line}:${character}.`;
                } else {
                    resultText = `Found ${result.total} implementation(s) for symbol "${symbol}" at ${path}:${line}:${character}:\n\n`;
                    for (const impl of result.implementations) {
                        resultText += `- Location: ${impl.location}`;
                        if (impl.preview) { resultText += `\n  Code: \`${impl.preview}\``; }
                        resultText += `\n  Range: ${impl.targetRange.start.line}:${impl.targetRange.start.character}-${impl.targetRange.end.line}:${impl.targetRange.end.character}\n\n`;
                    }
                }
                logger.info('[get_implementations_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[get_implementations_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'get_signature_help_code',
        description: `Gets function/method signature information including parameters and documentation.

        WHEN TO USE: Understanding function parameters, checking available overloads, getting API documentation.
        
        Requires exact symbol name and line number. The tool automatically positions the cursor inside the call parentheses after the symbol name, which is required by the LSP signature help provider.`,
        parameters: z.object({
            path: z.string().describe('The path to the file containing the symbol'),
            line: z.number().describe('The line number of the symbol (1-based)'),
            symbol: z.string().describe('The symbol name to look for on the specified line')
        }),
        execute: async ({ path, line, symbol }) => {
            logger.info(`[get_signature_help_code] Tool called with path="${path}", line=${line}, symbol="${symbol}"`);
            const zeroBasedLine = line - 1;
            try {
                if (!vscode.workspace.workspaceFolders) { throw new Error('No workspace folder open'); }
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fullPath = path_module.resolve(workspaceRoot, path);
                const uri = vscode.Uri.file(fullPath);
                try { await vscode.workspace.fs.stat(uri); } catch { throw new Error(`File not found: ${path}`); }
                const lineText = await getLineText(uri, zeroBasedLine);
                if (!lineText) { throw new Error(`Line ${line} not found in file: ${path}`); }
                const character = findSymbolInLine(lineText, symbol);
                if (character === -1) { return { content: [{ type: 'text' as const, text: `Symbol "${symbol}" not found on line ${line} in file: ${path}` }] }; }
                // LSP signature help requires cursor to be inside the call parentheses.
                // Scan forward from the symbol name end to find '(' and position after it.
                const symbolEnd = character + symbol.length;
                const openParenIdx = lineText.indexOf('(', symbolEnd);
                const sigCharacter = openParenIdx !== -1 ? openParenIdx + 1 : character;
                const position = new vscode.Position(zeroBasedLine, sigCharacter);
                logger.info(`[get_signature_help_code] Using position (${zeroBasedLine}, ${sigCharacter}) for signature help`);
                const result = await getSignatureHelp(uri, position);
                let resultText: string;
                if (result.signatures.length === 0) {
                    resultText = `No signature help found for symbol "${symbol}" at ${path}:${line}:${character}.`;
                } else {
                    resultText = `Signature help for symbol "${symbol}" at ${path}:${line}:${character}:\n\n`;
                    resultText += `Active signature: ${result.activeSignature + 1} of ${result.signatures.length}\nActive parameter: ${result.activeParameter}\n\n`;
                    for (let i = 0; i < result.signatures.length; i++) {
                        const sig = result.signatures[i];
                        const isActive = i === result.activeSignature;
                        resultText += `${isActive ? '**' : ''}Signature ${i + 1}:${isActive ? '**' : ''}\n  ${sig.label}\n`;
                        if (sig.documentation) { resultText += `  Documentation: ${sig.documentation}\n`; }
                        if (sig.parameters.length > 0) {
                            resultText += `  Parameters:\n`;
                            for (let j = 0; j < sig.parameters.length; j++) {
                                const param = sig.parameters[j];
                                const isParamActive = j === result.activeParameter && isActive;
                                resultText += `    ${isParamActive ? '*' : ''}${param.label}${isParamActive ? '*' : ''}`;
                                if (param.documentation) { resultText += ` - ${param.documentation}`; }
                                resultText += '\n';
                            }
                        }
                        resultText += '\n';
                    }
                }
                logger.info('[get_signature_help_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[get_signature_help_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'get_call_hierarchy_code',
        description: `Gets full call hierarchy for a function/method, including who calls it (incoming) and what it calls (outgoing).

        WHEN TO USE: Understanding function call relationships, tracing callers and callees, analyzing call graphs.
        
        Requires exact symbol name and line number. Works on function/method definitions.
        Use includeIncoming and includeOutgoing to control which directions to query.`,
        parameters: z.object({
            path: z.string().describe('The path to the file containing the symbol'),
            line: z.number().describe('The line number of the symbol (1-based)'),
            symbol: z.string().describe('The symbol name to look for on the specified line'),
            includeIncoming: z.boolean().optional().default(true).describe('Whether to include incoming calls (who calls this function). Default: true'),
            includeOutgoing: z.boolean().optional().default(true).describe('Whether to include outgoing calls (what this function calls). Default: true')
        }),
        execute: async ({ path, line, symbol, includeIncoming = true, includeOutgoing = true }) => {
            logger.info(`[get_call_hierarchy_code] Tool called with path="${path}", line=${line}, symbol="${symbol}", includeIncoming=${includeIncoming}, includeOutgoing=${includeOutgoing}`);
            const zeroBasedLine = line - 1;
            try {
                if (!vscode.workspace.workspaceFolders) { throw new Error('No workspace folder open'); }
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fullPath = path_module.resolve(workspaceRoot, path);
                const uri = vscode.Uri.file(fullPath);
                try { await vscode.workspace.fs.stat(uri); } catch { throw new Error(`File not found: ${path}`); }
                const lineText = await getLineText(uri, zeroBasedLine);
                if (!lineText) { throw new Error(`Line ${line} not found in file: ${path}`); }
                const character = findSymbolInLine(lineText, symbol);
                if (character === -1) { return { content: [{ type: 'text' as const, text: `Symbol "${symbol}" not found on line ${line} in file: ${path}` }] }; }
                const position = new vscode.Position(zeroBasedLine, character);
                // Prepare call hierarchy entry points (raw items needed for follow-up queries)
                const rawItems = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                    'vscode.prepareCallHierarchy',
                    uri,
                    position
                ) || [];
                let resultText: string;
                if (rawItems.length === 0) {
                    resultText = `No call hierarchy found for symbol "${symbol}" at ${path}:${line}:${character}.\n\nThis may mean:\n- The symbol is not a function/method\n- The language does not support call hierarchy\n- The symbol was not recognized as callable`;
                } else {
                    resultText = `Call hierarchy for symbol "${symbol}" at ${path}:${line}:${character}:\n\n`;
                    for (const rawItem of rawItems) {
                        const item = formatCallHierarchyItem(rawItem);
                        resultText += `## ${item.name} (${item.kind})`;
                        if (item.detail) { resultText += ` - ${item.detail}`; }
                        resultText += `\nLocation: ${item.location}\n\n`;
                        if (includeIncoming) {
                            const incomingCalls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                                'vscode.provideIncomingCalls',
                                rawItem
                            ) || [];
                            resultText += `**Incoming calls** (${incomingCalls.length} caller(s)):\n`;
                            for (const call of incomingCalls) {
                                const caller = formatCallHierarchyItem(call.from);
                                resultText += `  - ${caller.name} (${caller.kind}) at ${caller.location}\n`;
                            }
                            resultText += '\n';
                        }
                        if (includeOutgoing) {
                            const outgoingCalls = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                                'vscode.provideOutgoingCalls',
                                rawItem
                            ) || [];
                            resultText += `**Outgoing calls** (${outgoingCalls.length} callee(s)):\n`;
                            for (const call of outgoingCalls) {
                                const callee = formatCallHierarchyItem(call.to);
                                resultText += `  - ${callee.name} (${callee.kind}) at ${callee.location}\n`;
                            }
                            resultText += '\n';
                        }
                    }
                }
                logger.info('[get_call_hierarchy_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[get_call_hierarchy_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });

    server.addTool({
        name: 'get_type_hierarchy_code',
        description: `Prepares type hierarchy for a class/interface (entry point for supertype/subtype analysis).

        WHEN TO USE: Understanding inheritance relationships, preparing for type graph analysis, entry point for superclass/subclass queries.
        
        Requires exact symbol name and line number. Works on class/interface definitions. Use this as entry point before querying supertypes/subtypes.`,
        parameters: z.object({
            path: z.string().describe('The path to the file containing the symbol'),
            line: z.number().describe('The line number of the symbol (1-based)'),
            symbol: z.string().describe('The symbol name to look for on the specified line')
        }),
        execute: async ({ path, line, symbol }) => {
            logger.info(`[get_type_hierarchy_code] Tool called with path="${path}", line=${line}, symbol="${symbol}"`);
            const zeroBasedLine = line - 1;
            try {
                if (!vscode.workspace.workspaceFolders) { throw new Error('No workspace folder open'); }
                const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fullPath = path_module.resolve(workspaceRoot, path);
                const uri = vscode.Uri.file(fullPath);
                try { await vscode.workspace.fs.stat(uri); } catch { throw new Error(`File not found: ${path}`); }
                const lineText = await getLineText(uri, zeroBasedLine);
                if (!lineText) { throw new Error(`Line ${line} not found in file: ${path}`); }
                const character = findSymbolInLine(lineText, symbol);
                if (character === -1) { return { content: [{ type: 'text' as const, text: `Symbol "${symbol}" not found on line ${line} in file: ${path}` }] }; }
                const position = new vscode.Position(zeroBasedLine, character);
                const result = await prepareTypeHierarchy(uri, position);
                let resultText: string;
                if (result.items.length === 0) {
                    resultText = `No type hierarchy found for symbol "${symbol}" at ${path}:${line}:${character}.\n\nThis may mean:\n- The symbol is not a class/interface\n- The language does not support type hierarchy\n- The symbol was not recognized as a type`;
                } else {
                    resultText = `Type hierarchy entry point(s) for symbol "${symbol}" at ${path}:${line}:${character}:\n\nFound ${result.total} item(s). Use these as starting points for supertype/subtype queries.\n\n`;
                    for (const item of result.items) {
                        resultText += `- **${item.name}** (${item.kind})`;
                        if (item.detail) { resultText += ` - ${item.detail}`; }
                        resultText += `\n  Location: ${item.location}\n  Range: ${item.range.start.line}:${item.range.start.character}-${item.range.end.line}:${item.range.end.character}\n\n`;
                    }
                }
                logger.info('[get_type_hierarchy_code] Successfully completed');
                return { content: [{ type: 'text' as const, text: resultText }] };
            } catch (error) {
                logger.error(`[get_type_hierarchy_code] Error in tool: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        }
    });
}
