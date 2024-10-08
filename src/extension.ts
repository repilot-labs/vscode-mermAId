import * as vscode from 'vscode';
import { registerChatParticipant } from './chatParticipant';

const outputChannel = vscode.window.createOutputChannel('mermAId');
export function logMessage(message: string) {
    outputChannel.appendLine(message);
}

export function activate(context: vscode.ExtensionContext) {
    logMessage('Activating mermAId');
    registerChatParticipant(context);
}

export function deactivate() {
    logMessage('Deactivating mermAId');
}
