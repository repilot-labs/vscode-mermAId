import * as vscode from 'vscode';
import { logMessage } from '../extension';
import { log } from 'console';

interface IGetSymbolDefinition {
    symbols: string[];
    fileString: string;
}

interface IGatherSymbolInfo {
    symbols: string[];
}

interface ISymbolInfo {
    name: string;
    kind: string | undefined;
    location: { uri: vscode.Uri, range: vscode.Range };
    parentSymbol: string | undefined;
    content?: string;
}

const symbolMapping: Map<number, string> = new Map([
    [4, 'Class'],
    [5, 'Method'],
    [6, 'Property'],
    [7, 'Field'],
    [9, 'Enum'],
    [10, 'Interface'],
    [11, 'Function'],
]);

export function registerChatTool(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.lm.registerTool('mermAId_get_symbol_definition', new GetSymbolDefinitionTool())
    );
    context.subscriptions.push(
        vscode.lm.registerTool('mermAId_gather_symbols', new GatherSymbolInfoTool())
    );
}

class GetSymbolDefinitionTool
    implements vscode.LanguageModelTool<IGetSymbolDefinition> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IGetSymbolDefinition>,
        token: vscode.CancellationToken
    ) {
        const params = options.parameters;
        const currentFilePath = params.fileString;
        const resultMap: Map<string, string> = new Map();
        const errors: string[] = [];
        let finalMessageString = '';
        logMessage('mermAId_get_symbol_definition invoked with symbols: ' + params.symbols.toString() + ' in file: ' + currentFilePath);

        for (const symbol of params.symbols) {
            if (token.isCancellationRequested) {
                return;
            }
            let symbolInfo: ISymbolInfo | undefined;
            try {
                // see if we can get the full symbol info
                symbolInfo = await getFullSymbolInfo(symbol, currentFilePath);
                if (symbolInfo) {
                    const document = await vscode.workspace.openTextDocument(symbolInfo.location.uri);
                    symbolInfo.content = document.getText(symbolInfo.location.range);
                } else if (currentFilePath) {
                    // just look for the first occurence of the text in the provided file
                    const document = await vscode.workspace.openTextDocument(currentFilePath);
                    const { content, range } = await getSurroundingContent(document, symbol);

                    if (content && range) {
                        symbolInfo = {
                            name: symbol,
                            kind: undefined,
                            location: { uri: document.uri, range },
                            parentSymbol: undefined,
                            content
                        };
                    }
                }

            } catch {
                errors.push(`Error getting definition for ${symbol}`);
                continue;
            }

            resultMap.set(symbol, symbolInfo ? prettyPrintSymbol(symbolInfo) : 'Not found');
        }

        for (const [key, value] of resultMap) {
            finalMessageString += value;
        }
        finalMessageString += 'Errors:\n';
        for (const error of errors) {
            logMessage(error);
            finalMessageString += error + '\n';
        }

        return {
            'text/plain': finalMessageString,
        };
    }

    async prepareToolInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IGetSymbolDefinition>,
        token: vscode.CancellationToken
    ) {
        return {
            invocationMessage: `Getting definition for '${options.parameters.symbols.join(', ')}'`,
        };
    }
}

class GatherSymbolInfoTool
    implements vscode.LanguageModelTool<IGatherSymbolInfo> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IGatherSymbolInfo>,
        token: vscode.CancellationToken
    ) {
        const params = options.parameters;
        const resultMap: Map<string, string> = new Map();
        const errors: string[] = [];
        let finalMessageString = '';
        logMessage('mermAId_gather_symbols invoked with symbols: ' + params.symbols.toString());

        for (const symbol of params.symbols) {
            if (token.isCancellationRequested) {
                return;
            }
            let symbolInfo: ISymbolInfo | undefined;
            try {
                // see if we can get the full symbol info
                symbolInfo = await getFullSymbolInfo(symbol);
                if (symbolInfo) {
                    const document = await vscode.workspace.openTextDocument(symbolInfo.location.uri);
                    symbolInfo.content = document.getText(symbolInfo.location.range);
                } else {
                    // check the document of the active editor
                    const document = vscode.window.activeTextEditor?.document;
                    if (document) {
                        const { content, range } = await getSurroundingContent(document, symbol);
                        if (content && range) {
                            symbolInfo = {
                                name: symbol,
                                kind: undefined,
                                location: { uri: document.uri, range },
                                parentSymbol: undefined,
                                content
                            };
                        }
                    }
                }

            } catch {
                errors.push(`Error getting definition for ${symbol}`);
                continue;
            }

            resultMap.set(symbol, symbolInfo ? prettyPrintSymbol(symbolInfo) : 'Not found');
        }

        for (const [key, value] of resultMap) {
            finalMessageString += value;
        }
        finalMessageString += 'Errors:\n';
        for (const error of errors) {
            logMessage(error);
            finalMessageString += error + '\n';
        }

        return {
            'text/plain': finalMessageString,
        };
    }

    async prepareToolInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<IGetSymbolDefinition>,
        token: vscode.CancellationToken
    ) {
        return {
            invocationMessage: `Getting definition for '${options.parameters.symbols.join(', ')}'`,
        };
    }
}

async function getFullSymbolInfo(symbol: string, filepath?: string): Promise<ISymbolInfo | undefined> {
    try {
        const refs = await vscode.commands.executeCommand<
            vscode.SymbolInformation[]
        >('vscode.executeWorkspaceSymbolProvider', symbol);
        logMessage('ref: ' + refs);
        if (refs.length === 0) {
            return undefined;
        }
        let ref = refs.find(ref =>
            (ref.name === symbol || ref.name === symbol + '()')
            && symbolMapping.has(ref.kind)
            && (!filepath || ref.location.uri.fsPath === filepath)
        );

        if (!ref) {
            // if we can't find the symbol in the current file, just get the first one from any file
            ref = refs.find(ref =>
                (ref.name === symbol || ref.name === symbol + '()') && symbolMapping.has(ref.kind)
            );
        }

        if (ref) {
            return {
                name: ref.name,
                kind: symbolMapping.get(ref.kind),
                location: ref.location,
                parentSymbol: ref?.containerName,
            };
        }
    }
    catch (e) {
        logMessage('error getting reference file: ' + e);
    }
    return undefined;
}

async function getSurroundingContent(document: vscode.TextDocument, symbolName: string) {
    const text = document.getText();
    const index = text.indexOf(symbolName);
    if (index === -1) {
        return { range: undefined, content: undefined };
    }

    const p2: vscode.Position = document.positionAt(index);
    const definitions: vscode.Location | vscode.LocationLink[] =
        await vscode.commands.executeCommand<
            vscode.Location | vscode.LocationLink[]
        >('vscode.executeDefinitionProvider', document.uri, p2);

    let location: vscode.Location | undefined = undefined;
    if (Array.isArray(definitions)) {

        for (const definition of definitions) {
            if (definition instanceof vscode.Location) {
                location = definition;
            } else {
                location = new vscode.Location(definition.targetUri, definition.targetRange);
            }
        }
    } else if (definitions instanceof vscode.Location) {
        location = definitions;
    }

    const definitionDoc = location
        ? await vscode.workspace.openTextDocument(location.uri)
        : document;

    const line = location?.range.start.line ?? definitionDoc.lineAt(definitionDoc.positionAt(index).line).lineNumber;
    const end = location?.range.end.line ?? line;
    const startLine = Math.max(line - 10, 0);
    const endLine = Math.min(end + 10, definitionDoc.lineCount - 1);

    const range = new vscode.Range(startLine, 0, endLine, definitionDoc.lineAt(endLine).text.length);
    const content = definitionDoc.getText(range);

    const symbolRange = location ?? range;

    return { symbolRange, content };
}

function prettyPrintSymbol(symbol: ISymbolInfo) {
    return `
Symbol: ${symbol.name}
Kind: ${symbol.kind}
File: ${symbol.location.uri.fsPath}
Lines: ${symbol.location.range.start.line + 1}
Parent Symbol: ${symbol.parentSymbol}
Content: ${symbol.content}
`;
}