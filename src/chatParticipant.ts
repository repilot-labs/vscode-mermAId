import * as vscode from 'vscode';
import { DiagramDocument } from './diagramDocument';
import { getHistoryMessages, getContextMessage } from './chatHelpers';

export function registerChatParticipant(context: vscode.ExtensionContext) {
    const handler: vscode.ChatRequestHandler = chatRequestHandler;

    const participant = vscode.chat.createChatParticipant('copilot-diagram.mermAId', handler);
    participant.iconPath = new vscode.ThemeIcon('pie-chart');
    context.subscriptions.push(participant);
}

const llmInstructions = `
You are helpful chat assistant that creates diagrams for the user using the mermaid syntax.
The final segment of your response should always be a valid mermaid diagram prefixed with a line containing  \`\`\`mermaid
and suffixed with a line containing \`\`\`.
Only ever include the \`\`\` delimiter in the two places mentioned above.
`;

const diagramManager = new DiagramDocument();

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
        await diagramManager.setContent(mermaidDiagram);
    } catch (e: any) {
        // TODO: Loop back to fix the diagram
        stream.markdown('Please try again.');
        // log
        console.error(e?.message ?? e);
    }
};