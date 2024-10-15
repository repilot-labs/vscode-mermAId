import * as vscode from 'vscode';
import { logMessage } from '../extension';

interface IGetSymbolDefinition {
    symbols: string[];
    fileString: string;
    position: string;
}
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
            let document; // document where symbol is located
            let position; // position of symbol in document
            try {
                // try with provided file first
                document = await vscode.workspace.openTextDocument(currentFilePath);
                // if we have a document, get the text and position of the symbol
                let text = document.getText();
                position = text.indexOf(symbol);
                if (position === -1) {
                    throw new Error('Symbol not found in file');
                }
            } catch {
                // if that fails, try to find a file with it in the workspace
                const candidateDocument = await getReferenceFile(symbol);
                if (!candidateDocument) {
                    errors.push(
                        `Symbol '${symbol}' not found in workspace`
                    );
                    continue;
                }
                try {
                    document = candidateDocument;
                    let text = document.getText();
                    position = text.indexOf(symbol);
                }
                catch {
                    continue;
                }
            }

            const p2: vscode.Position = document.positionAt(position);

            // get the definition(s) of the symbol
            const definitions: vscode.Location | vscode.LocationLink[] =
                await vscode.commands.executeCommand<
                    vscode.Location | vscode.LocationLink[]
                >('vscode.executeDefinitionProvider', document.uri, p2);

            if (Array.isArray(definitions)) {

                for (const definition of definitions) {
                    let uriDef;
                    if (definition instanceof vscode.Location) {
                        uriDef = definition.uri;
                    } else {
                        uriDef = definition.targetUri;
                    }
                    const document = await vscode.workspace.openTextDocument(
                        uriDef
                    );
                    if (uriDef && !resultMap.has(uriDef.toString())) {
                        resultMap.set(document.uri.fsPath, document.getText());
                    }
                }
            } else if (definitions instanceof vscode.Location) {
                const document = await vscode.workspace.openTextDocument(
                    definitions.uri
                );
                resultMap.set(document.uri.fsPath, document.getText());
            }
        }
        for (const [key, value] of resultMap) {
            finalMessageString += `File: ${key}\nContents: ${value}\n\n`;
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

async function getReferenceFile(symbol: string): Promise<vscode.TextDocument | undefined> {
    try {
        const refs = await vscode.commands.executeCommand<
            vscode.SymbolInformation[]
        >('vscode.executeWorkspaceSymbolProvider', symbol);
        logMessage('ref: ' + refs);
        if (refs.length === 0) {
            return undefined;
        }
        const ref: vscode.SymbolInformation = refs[0];
        if (ref) {
            return await vscode.workspace.openTextDocument(ref.location.uri);
        }
    }
    catch (e) {
        logMessage('error getting reference file: ' + e);
    }
    return undefined;
}

