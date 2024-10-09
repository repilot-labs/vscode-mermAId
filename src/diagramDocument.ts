import * as vscode from 'vscode';
import { Diagram } from './diagram';

export class DiagramDocument {
    private content: string = '';
    private document: vscode.TextDocument | undefined;

    constructor() {
        vscode.workspace.onDidCloseTextDocument((doc) => {
            if (this.document && doc.uri.toString() === this.document.uri.toString()) {
                this.document = undefined;
            }
        });
    }

    async update(diagram: Diagram) {
        this.content = diagram.content;
        if (!this.document) {
            this.document = await vscode.workspace.openTextDocument({ language: 'markdown', content: this.content });
            await vscode.window.showTextDocument(this.document);
            this.showPreview();
        } else {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(this.document.uri, new vscode.Range(0, 0, this.document.lineCount, 0), this.content);
            await vscode.workspace.applyEdit(edit);
        }
    }

    private showPreview() {
        if (this.document) {
            vscode.commands.executeCommand('markdown.showPreview', this.document.uri);
        }
    }
}
