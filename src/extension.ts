import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    registerChatParticipant(context);
}

const llmInstructions = `
You are helpful chat assistant that creates diagrams for the user using the mermaid syntax.
The final segment of your response should always be a valid mermaid diagram prefixed with a line containing  \`\`\`mermaid
and suffixed with a line containing \`\`\`.
Only ever include the \`\`\` delimiter in the two places mentioned above.
`;

function registerChatParticipant(context: vscode.ExtensionContext) {
    const handler: vscode.ChatRequestHandler = chatRequestHandler;

    const participant = vscode.chat.createChatParticipant('copilot-diagram.mermAId', handler);
    participant.iconPath = new vscode.ThemeIcon('pie-chart');
    context.subscriptions.push(participant);
}

async function chatRequestHandler(request: vscode.ChatRequest, chatContext: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o'
    });

    const model = models[0];

    const options: vscode.LanguageModelChatRequestOptions = {
        justification: 'To collaborate on diagrams',
    };

    const messages = [
        vscode.LanguageModelChatMessage.Assistant(llmInstructions),
    ];
    messages.push(...await getHistoryMessages(chatContext));
    if (request.references.length) {
        messages.push(vscode.LanguageModelChatMessage.User(await getContextMessage(request.references)));
    }
    messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

    let isMermaidDiagramStreamingIn = false;
    let mermaidDiagram = '';

    const response = await model.sendRequest(messages, options, token);

    for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelChatResponseTextPart) {
            if (!isMermaidDiagramStreamingIn && part.value.includes('```')) {
                stream.progress('Validating mermaid diagram');
                isMermaidDiagramStreamingIn = true;
            }

            if (isMermaidDiagramStreamingIn) {
                mermaidDiagram += part.value;
            } else {
                stream.markdown(part.value);
            }
        } else if (part instanceof vscode.LanguageModelChatResponseToolCallPart) {
            throw new Error('Tool calls are not supported yet.');
        }
    }

    isMermaidDiagramStreamingIn = false;
    
    // Validate
    const mermaid = (await import('mermaid')).default;
    try {
        const trimmedDiagram = mermaidDiagram.replace(/```mermaid/, '').replace(/```/, '').trim();
        const diagramType = await mermaid.parse(trimmedDiagram);
        stream.progress(`Generating ${diagramType.diagramType} diagram`);
        stream.markdown(mermaidDiagram);
        openDiagramInEditor(mermaidDiagram);
    } catch (e: any) {
        // TODO: Loop back to fix the diagram
        stream.markdown('Please try again.');
        // log
        console.error(e?.message ?? e);
    }
};

async function openDiagramInEditor(diagram: string) {
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: diagram });
    vscode.commands.executeCommand('markdown.showPreview', document.uri);
}

async function getContextMessage(references: ReadonlyArray<vscode.ChatPromptReference>): Promise<string> {
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

async function getHistoryMessages(context: vscode.ChatContext): Promise<vscode.LanguageModelChatMessage[]> {
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

export function deactivate() { }
