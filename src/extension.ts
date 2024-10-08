import * as vscode from 'vscode';
import { registerChatParticipant } from './chatParticipant';

export function activate(context: vscode.ExtensionContext) {
    registerChatParticipant(context);
}

export function deactivate() { }
