import * as vscode from 'vscode';
import { logMessage } from '../extension';

interface IGetSymbolDefinition {
    symbols: string[];
    fileString?: string;
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
        vscode.lm.registerTool(
            'mermAId_get_symbol_definition',
            new GetSymbolDefinitionTool()
        )
    );
}

export class GetSymbolDefinitionTool
    implements vscode.LanguageModelTool<IGetSymbolDefinition> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IGetSymbolDefinition>,
        token: vscode.CancellationToken
    ) {
        const params = options.parameters as IGetSymbolDefinition;
        const currentFilePath = params.fileString;
        const resultMap: Map<string, string> = new Map();
        const errors: string[] = [];
        let finalMessageString = '';
        logMessage('mermAId_get_symbol_definition invoked with symbols: ' + params.symbols.toString() + ' in file: ' + currentFilePath);

        for (const symbol of params.symbols) {
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
                    const { content, range } = getSurroundingContent(document, symbol);
                    symbolInfo = {
                        name: symbol,
                        kind: undefined,
                        location: { uri: document.uri, range },
                        parentSymbol: undefined,
                        content
                    };
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

async function getFullSymbolInfo(symbol: string, filepath: string | undefined): Promise<ISymbolInfo | undefined> {
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

function getSurroundingContent(document: vscode.TextDocument, symbolName: string) {
    const text = document.getText();
    const index = text.indexOf(symbolName);
    const line = document.lineAt(document.positionAt(index).line);
    const startLine = Math.max(line.lineNumber - 5, 0);
    const endLine = Math.min(line.lineNumber + 5, document.lineCount - 1);

    const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
    const content = document.getText(range);

    return { range, content };
}

function prettyPrintSymbol(symbol: ISymbolInfo) {
    return `
Symbol: ${symbol.name}
Kind: ${symbol.kind}
File: ${symbol.location.uri.fsPath}
Lines: ${symbol.location.range.start.line + 1}-${symbol.location.range.end.line + 1}
Parent Symbol: ${symbol.parentSymbol}
Content: ${symbol.content}
`;
}