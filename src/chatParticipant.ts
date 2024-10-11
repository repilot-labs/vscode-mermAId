import * as vscode from 'vscode';
import { DiagramDocument } from './diagramDocument';
import { getHistoryMessages, getContextMessage, IToolCall } from './chatHelpers';
import { logMessage } from './extension';
import { Diagram } from './diagram';
import { DiagramEditorPanel } from './diagramEditorPanel';

export function registerChatParticipant(context: vscode.ExtensionContext) {
    const handler: vscode.ChatRequestHandler = chatRequestHandler;

    const participant = vscode.chat.createChatParticipant('copilot-diagram.mermAId', handler);
    participant.iconPath = new vscode.ThemeIcon('pie-chart');
    context.subscriptions.push(participant);
    DiagramEditorPanel.extensionUri = context.extensionUri;
}

const llmInstructions = `
You are helpful chat assistant that creates diagrams for the user using the mermaid syntax.
There is a selection of tools that let you retrieve extra context for generating the diagram.
If you aren't sure which tool is relevant, you can call multiple tools. You can call tools repeatedly to take actions or gather as much context as needed until you have completed the task fully. Don't give up unless you are sure the request cannot be fulfilled with the tools you have. 
Don't make assumptions about the situation- gather context first, then perform the task or answer the question.
Don't ask the user for confirmation to use tools, just use them.
If you find a symbol you want to get the definition for, like a interface implemented by a class in the context, use the provided tool
The final segment of your response should always be a valid mermaid diagram prefixed with a line containing  \`\`\`mermaid
and suffixed with a line containing \`\`\`. Nothing should follow the closing \`\`\` delimiter.
Only ever include the \`\`\` delimiter in the two places mentioned above.
`;

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
    options.tools = vscode.lm.tools.map((tool): vscode.LanguageModelChatTool => {
        return {
            name: tool.id,
            description: tool.description,
            parametersSchema: tool.parametersSchema ?? {}
        };
    });
    logMessage(`Available tools: ${options.tools.map(tool => tool.name).join(', ')}`);
    if (request.command === "uml") {
        ``;
        messages.push(
            vscode.LanguageModelChatMessage.User(
                "The user asked for a UML diagram. Include all relevant classes in the file attached as context. You must use the tool mermAId_get_symbol_definition to get definitions of symbols " +
                "not defined in the current context. You should call it multiple times since you will likely need to get the definitions of multiple symbols." +
                // " The types of class relationships in a UML diagram are: Inheritance, Composition, Aggregation, Association, Link, Dependency, Realization." +
                " Therefore for all classes you touch, explore their related classes using mermAId_get_symbol_definition to get their definitions and add them to the diagram."
            )
        );
        let includedFiles: boolean = false;
        if (request.references.length > 0) {
            for (const reference of request.references) {
                const v = reference.value;
                if ( v instanceof vscode.Uri) {
                    const doc = await vscode.workspace.openTextDocument(v);
                    messages.push(vscode.LanguageModelChatMessage.User(`The file ${v.fsPath} is attached by the user as context. It has the following contents: ${doc.getText()}`));
                    includedFiles = true;
                }
            }
        }
        // TODO: if the user includes a file as reference - should we get the currently open file
        const doc = vscode.window.activeTextEditor?.document;
        if (doc) {
            messages.push(vscode.LanguageModelChatMessage.User(`The file the user currently has open is: ${doc.uri.fsPath} with contents: ${doc.getText()}`));
        } else {
            messages.push(vscode.LanguageModelChatMessage.User(`The user does not have any files open, the root of the workspace is: ${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath}`));
        }
        
        messages.push(vscode.LanguageModelChatMessage.User('Remember that all class associations/should be defined! If one class has an instance of another it should be connected it it in the UML diagram.'));
      
  }

    let retries = 0;

    const runWithFunctions = async (): Promise<void> => {
        const toolCalls: IToolCall[] = [];

        let isMermaidDiagramStreamingIn = false;
        let mermaidDiagram = '';

        const response = await model.sendRequest(messages, options, token);

        for await (const part of response.stream) {
            if (part instanceof vscode.LanguageModelTextPart) {
                if (!isMermaidDiagramStreamingIn && part.value.includes('```')) {
                    isMermaidDiagramStreamingIn = true;
                }

                if (isMermaidDiagramStreamingIn) {
                    mermaidDiagram += part.value;
                } else {
                    stream.markdown(part.value);
                }
            } else if (part instanceof vscode.LanguageModelToolCallPart) {
                const tool = vscode.lm.tools.find(tool => tool.id === part.name);
                if (!tool) {
                    // BAD tool choice?
                    throw new Error('Got invalid tool choice: ' + part.name);
                }

                let parameters: any;
                try {
                    parameters = JSON.parse(part.parameters);
                } catch (err) {
                    throw new Error(`Got invalid tool use parameters: "${part.parameters}". (${(err as Error).message})`);
                }

                // TODO support prompt-tsx here
                const requestedContentType = 'text/plain';
                toolCalls.push({
                    call: part,
                    result: vscode.lm.invokeTool(tool.id, { parameters: parameters, toolInvocationToken: request.toolInvocationToken, requestedContentTypes: [requestedContentType] }, token),
                    tool
                });
            }

            // if any tools were used, we should add them to the context and re-run the query
            if (toolCalls.length) {
                const assistantMsg = vscode.LanguageModelChatMessage.Assistant('');
                assistantMsg.content2 = toolCalls.map(toolCall => new vscode.LanguageModelToolCallPart(toolCall.tool.id, toolCall.call.toolCallId, toolCall.call.parameters));
                messages.push(assistantMsg);
                for (const toolCall of toolCalls) {
                    // NOTE that the result of calling a function is a special content type of a USER-message
                    const message = vscode.LanguageModelChatMessage.User('');
                    message.content2 = [new vscode.LanguageModelToolResultPart(toolCall.call.toolCallId, (await toolCall.result)['text/plain']!)];
                    messages.push(message);
                }

                // IMPORTANT The prompt must end with a USER message (with no tool call)
                messages.push(vscode.LanguageModelChatMessage.User(`Above is the result of calling the functions ${toolCalls.map(call => call.tool.id).join(', ')}. The user cannot see this result, so you should explain it to the user if referencing it in your answer.`));

                // RE-enter
                return runWithFunctions();
            }
        }

        logMessage(mermaidDiagram);
        isMermaidDiagramStreamingIn = false;

        // Validate
        stream.progress('Validating mermaid diagram');
        const diagram = new Diagram(mermaidDiagram);

        const result = await diagram.generateWithValidation();

        if (!result.success) {
            if (retries++<1) {
                addNestingContext(messages);
            }
            if (retries++ < 2) {
                if (retries++ < 2) {
                    stream.progress('Attempting to fix validation errors');
                    // we might be able to reset the messages to this message only
                    messages.push(vscode.LanguageModelChatMessage.User(`Please fix this error to make the diagram render correctly: ${result.message}. The diagram is below:\n${mermaidDiagram}`));
                    return runWithFunctions();
                } else {
                    if (result.stack) {
                        logMessage(result.stack);
                    }
                    stream.markdown('Failed to generate diagram from the mermaid content. Check output log for details.');
                    stream.markdown(mermaidDiagram);
                }
            }
        } else {
            DiagramEditorPanel.createOrShow(diagram);
        }
    }; // done with runWithFunctions

    await runWithFunctions();
}


    function addNestingContext(messages: vscode.LanguageModelChatMessage[]) {
        messages.push(vscode.LanguageModelChatMessage.Assistant("Remember when creating the UML diagram in Mermaid, classes are represented as flat structures,"+
                    " and Mermaid does not support nested class definitions. Instead, each class must be defined separately, and relationships between them must be explicitly stated." +
                    "Use association to connect the main class to the nested class, using cardinality to denote relationships (e.g., one-to-many)." + 
                    " \n example of correct syntax: \n" +
                `
                classDiagram
                    class House {
                        string address
                        int rooms
                        Kitchen kitchen
                    }
                                    
                    class Kitchen {
                        string appliances
                        int size
                    }
                                    
                    House "1" --> "1" Kitchen : kitchen
                `));
    }

    function specifyAssociations(messages: vscode.LanguageModelChatMessage[]) {
        messages.push(vscode.LanguageModelChatMessage.Assistant("Remember that all class associations/should be defined. In this example:"
            +
            `
            classDiagram
            class Supermarket {
                +Registers: CashRegister[]
            }
            class CashRegister {
                +process(product: Product)
            }
            `
            +
            "This Mermaid diagram is incomplete. You should have this defined like:" + `Supermarket "1" --> "*" CashRegister : has`
            ));
    }
    