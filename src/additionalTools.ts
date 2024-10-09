import * as vscode from "vscode";

interface IGetSymbolDefinition {
  symbols: string;
  currentFilePath: string;
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
    const symbol = params.symbols;
    const currentFilePath = params.currentFilePath;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("No active editor found");
    }
    const defReturn = [];
    try {
      const document = await vscode.workspace.openTextDocument(currentFilePath);
      const text = document.getText();
      const position = text.indexOf(symbol);

      if (position === -1) {
        console.log(
          `Symbol "${symbol}" not found in document ${currentFilePath}`
        );
        defReturn.push(
          `Symbol "${symbol}" not found in document ${currentFilePath}`
        );
      }

      const uri = document.uri;
      const p2: vscode.Position = document.positionAt(position);

      const definitions: vscode.Location | vscode.LocationLink[] =
        await vscode.commands.executeCommand<
          vscode.Location | vscode.LocationLink[]
        >("vscode.executeDefinitionProvider", uri, p2);



      const addedDocuments = new Set<string>();
      if (Array.isArray(definitions)) {
        for (const definition of definitions) {
          const document = await vscode.workspace.openTextDocument(
            definition.targetUri
          );
          if (!addedDocuments.has(definition.targetUri.toString())) {
            defReturn.push(document.getText());
            addedDocuments.add(definition.targetUri.toString());
          }
        }
      } else if (definitions instanceof vscode.Location) {
        const document = await vscode.workspace.openTextDocument(
          definitions.uri
        );
        defReturn.push(document.getText());
      }
    } catch (e) {
      throw new Error(`Error opening file: ${e}`);
    }

    return {
      "text/plain": defReturn.toString(),
    };
  }

  async prepareToolInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IGetSymbolDefinition>,
    token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: `Getting definition for "${options.parameters.symbols}"`,
    };
  }
}
