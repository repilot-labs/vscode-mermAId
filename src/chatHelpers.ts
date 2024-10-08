import * as vscode from 'vscode';

export async function getContextMessage(references: ReadonlyArray<vscode.ChatPromptReference>): Promise<string> {
    const contextParts = (await Promise.all(references.map(async ref => {
        if (ref.value instanceof vscode.Uri) {
            const fileContents = (await vscode.workspace.fs.readFile(ref.value)).toString();
            return `${ref.value.fsPath}:\n\`\`\`\n${fileContents}\n\`\`\``;
        } else if (ref.value instanceof vscode.Location) {
            const rangeText = (await vscode.workspace.openTextDocument(ref.value.uri)).getText(ref.value.range);
            return `${ref.value.uri.fsPath}:${ref.value.range.start.line + 1}-${ref.value.range.end.line + 1}\n\`\`\`${rangeText}\`\`\``;
        } else if (typeof ref.value === 'string') {
            return ref.value;
        }
        return null;
    }))).filter(part => part !== null) as string[];

    const context = contextParts
        .map(part => `<context>\n${part}\n</context>`)
        .join('\n');
    return `The user has provided these references:\n${context}`;
}

export async function getHistoryMessages(context: vscode.ChatContext): Promise<vscode.LanguageModelChatMessage[]> {
    const messages: vscode.LanguageModelChatMessage[] = [];
    for (const message of context.history) {
        if (message instanceof vscode.ChatRequestTurn) {
            if (message.references.length) {
                messages.push(vscode.LanguageModelChatMessage.User(await getContextMessage(message.references)));
            }
            messages.push(vscode.LanguageModelChatMessage.User(message.prompt));
        } else if (message instanceof vscode.ChatResponseTurn) {
            const strResponse = message.response.map(part => {
                if (part instanceof vscode.ChatResponseMarkdownPart) {
                    return part.value.value;
                } else if (part instanceof vscode.ChatResponseAnchorPart) {
                    if (part.value instanceof vscode.Location) {
                        return ` ${part.value.uri.fsPath}:${part.value.range.start.line}-${part.value.range.end.line} `;
                    } else if (part.value instanceof vscode.Uri) {
                        return ` ${part.value.fsPath} `;
                    }
                }
            }).join('');
            messages.push(vscode.LanguageModelChatMessage.Assistant(strResponse));
        }
    }

    return messages;
}