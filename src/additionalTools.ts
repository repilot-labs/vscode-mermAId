import * as vscode from "vscode";

interface IGetSymbolDefinition {
  symbols: string[];
  fileString: string;
  position: string;
}
export function registerChatTool(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.lm.registerTool(
      "mermAId_get_symbol_definition",
      new GetSymbolDefinitionTool()
    )
  );
}
export class GetSymbolDefinitionTool
implements vscode.LanguageModelTool<IGetSymbolDefinition>
{
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IGetSymbolDefinition>,
    token: vscode.CancellationToken
  ) {
    const params = options.parameters as IGetSymbolDefinition;
    const currentFilePath = params.fileString;
    const resultMap: Map<string, string> = new Map();
    const errors: string[] = [];
    let finalMessageString = '';
    console.log("mermAId_get_symbol_definition invoked with symbols", params.symbols.toString(), "in file: ", currentFilePath);
    
    // get file text
    let document;
    try {
      document = await vscode.workspace.openTextDocument(currentFilePath);
    } catch (e) {
      errors.push(`Error opening file: ${e}`);
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw new Error("No active editor found");
      }
      document = await vscode.workspace.openTextDocument(editor.document.uri);
    }
    const text = document.getText();
    
    for (const symbol of params.symbols) {
      try {
        
        const position = text.indexOf(symbol);

        if (position === -1) {
          errors.push(
            `Symbol "${symbol}" not found in document ${currentFilePath}`
          );
        }
        
        const uri = document.uri;
        const p2: vscode.Position = document.positionAt(position);
        
        const definitions: vscode.Location | vscode.LocationLink[] =
        await vscode.commands.executeCommand<
        vscode.Location | vscode.LocationLink[]
        >("vscode.executeDefinitionProvider", uri, p2);


        const symbols = await vscode.commands.executeCommand<
          vscode.DocumentSymbol[]
        >(
          "vscode.executeDocumentSymbolProvider",
          uri
        );
        const fileSymbolMatch = symbols.find(s => s.name === symbol);
        if (fileSymbolMatch) {
          finalMessageString = finalMessageString + `Symbol "${symbol}" has children: ${fileSymbolMatch.children.map(c => c.name).join(", ")}\n`;
        }
        
        if (Array.isArray(definitions)) {
          for (const definition of definitions) {
            const document = await vscode.workspace.openTextDocument(
              definition.targetUri
            );
            if (!resultMap.has(definition.targetUri.toString())) {
              resultMap.set(document.uri.fsPath, document.getText());
            }
          }
        } else if (definitions instanceof vscode.Location) {
          const document = await vscode.workspace.openTextDocument(
            definitions.uri
          );
          resultMap.set(document.uri.fsPath, document.getText());
        }
      } catch (e) {
        errors.push(`Error opening file: ${e}`);
      }
    }
    for (const [key, value] of resultMap) {
      finalMessageString += `File: ${key}\nContents: ${value}\n\n`;
    }
    finalMessageString += "Errors:\n";
    for (const error of errors) {
      console.log(error);
      finalMessageString += error + "\n";
    }
    
    return {
      "text/plain": finalMessageString,
    };
  }
  
  async prepareToolInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IGetSymbolDefinition>,
    token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: `Getting definition for "${options.parameters.symbols.toString()}"`,
    };
  }
}
