import * as vscode from 'vscode';
import { MermaidPrompt, MermaidProps } from './mermaidPrompt';
import { ChatMessage, ChatRole, HTMLTracer, PromptRenderer } from '@vscode/prompt-tsx';

export interface IToolCall {
    tool: vscode.LanguageModelToolInformation;
    call: vscode.LanguageModelToolCallPart;
    result: Thenable<vscode.LanguageModelToolResult>;
}


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

export async function renderMessages(chat: vscode.LanguageModelChat, props: MermaidProps, stream: vscode.ChatResponseStream, serveTrace: boolean) {
    const renderer = new PromptRenderer({ modelMaxPromptTokens: chat.maxInputTokens }, MermaidPrompt, props, {
        tokenLength: async (text, _token) => {
            return chat.countTokens(text);
        },
        countMessageTokens: async (message: ChatMessage) => {
            return chat.countTokens(message.content);
        }
    });
    const tracer = new HTMLTracer();
    renderer.tracer = tracer;
    const result = await renderer.render();
    if (serveTrace) {
        const server = await tracer.serveHTML();
        console.log('Server address:', server.address);
        const serverUri = vscode.Uri.parse(server.address);
    }
    return result;
}

export function toVsCodeChatMessages(messages: ChatMessage[]) {
    return messages.map(m => {
        switch (m.role) {
            case ChatRole.Assistant:
                {
                    const message: vscode.LanguageModelChatMessage = vscode.LanguageModelChatMessage.Assistant(
                        m.content,
                        m.name
                    );
                    if (m.tool_calls) {
                        message.content2 = [m.content];
                        message.content2.push(
                            ...m.tool_calls.map(
                                tc =>
                                    new vscode.LanguageModelToolCallPart(tc.function.name, tc.id, JSON.parse(tc.function.arguments))
                            )
                        );
                    }
                    return message;
                }
            case ChatRole.User:
                return vscode.LanguageModelChatMessage.User(m.content, m.name);
            case ChatRole.Function: {
                const message: vscode.LanguageModelChatMessage = vscode.LanguageModelChatMessage.User('');
                message.content2 = [new vscode.LanguageModelToolResultPart(m.name, [m.content])];
                return message;
            }
            case ChatRole.Tool: {
                {
                    const message: vscode.LanguageModelChatMessage = vscode.LanguageModelChatMessage.User(m.content);
                    message.content2 = [new vscode.LanguageModelToolResultPart(m.tool_call_id!, [m.content])];
                    return message;
                }
            }
            default:
                throw new Error(
                    `Converting chat message with role ${m.role} to VS Code chat message is not supported.`
                );
        }
    });
}