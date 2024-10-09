import * as vscode from 'vscode';

export function registerOutlineView(context: vscode.ExtensionContext) {
    vscode.window.registerWebviewViewProvider(
        'mermaid-outline-diagram',
        new OutlineViewProvider(context)
    );
}

class OutlineViewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): Thenable<void> | void {
        throw new Error('Method not implemented.');
    }
    constructor(private readonly context: vscode.ExtensionContext) {}

}

