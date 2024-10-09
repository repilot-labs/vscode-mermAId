import * as vscode from 'vscode';
import { registerChatParticipant } from './chatParticipant';
import { registerChatTool } from "./additionalTools";
import { registerOutlineView } from './outlineView';

const outputChannel = vscode.window.createOutputChannel('mermAId');
export function logMessage(message: string) {
    outputChannel.appendLine(message);
}

export function activate(context: vscode.ExtensionContext) {
    logMessage('Activating mermAId');
    registerOutlineView(context);
    registerChatParticipant(context);
    registerChatTool(context);
}

export function deactivate() {
    logMessage('Deactivating mermAId');
}
