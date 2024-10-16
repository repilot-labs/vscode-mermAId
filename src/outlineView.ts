import * as vscode from 'vscode';
import { logMessage } from './extension';
import { IToolCall } from './chat/chatHelpers';
import { Diagram } from './diagram';
import { DiagramEditorPanel } from './diagramEditorPanel';


const template = (innerContent: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=0.5">
    <title>MermAId Outline Diagram</title>
</head>
<body>
    ${innerContent}
</body>
</html>
`;

const llmInstructions = `
You are helpful chat assistant that creates diagrams for the user using the mermaid syntax.
The output diagram should represent an outline of the document.
Use tools to help you formulate the structure of the code.
You must provide a valid mermaid diagram prefixed with a line containing  \`\`\`mermaid
and suffixed with a line containing \`\`\`.
Only ever include the \`\`\` delimiter in the two places mentioned above.
Do not include any other text before or after the diagram, only include the diagram.
`;

let outlineViewCancellationTokenSource: vscode.CancellationTokenSource | undefined;
let followActiveDocument = false;

export function registerOutlineView(context: vscode.ExtensionContext) {
    const outlineView = new OutlineViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            OutlineViewProvider.viewType,
            outlineView,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('copilot-mermAId-diagram.refresh-outline', () => {
            // Cancel the previous token if it exists
            if (outlineViewCancellationTokenSource) {
                outlineViewCancellationTokenSource.cancel();
            }
            outlineViewCancellationTokenSource = new vscode.CancellationTokenSource();
            outlineView.generateOutlineDiagram(outlineViewCancellationTokenSource.token);
        })
    );

    // When enabled, toggle automatically updating
    // outline whenever focused document changes
    context.subscriptions.push(
        vscode.commands.registerCommand('copilot-mermAId-diagram.follow-outline', () => {
            followActiveDocument = !followActiveDocument;
            vscode.window.showInformationMessage(`Follow ${followActiveDocument ? 'enabled' : 'disabled'}`); // TODO: Style
        })
    );

    // Listen for active text editor change
    vscode.window.onDidChangeActiveTextEditor((e: vscode.TextEditor | undefined) => {
        if (followActiveDocument) {
            logMessage(`Active document changed to: ${e?.document.fileName}`);
            vscode.commands.executeCommand('copilot-mermAId-diagram.refresh-outline');
        }
    });
}


class OutlineViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'mermaid-outline-diagram';

    private _view?: vscode.WebviewView;
    private parseDetails: { success: boolean, error: string } | undefined = undefined;

    public async generateOutlineDiagram(cancellationToken: vscode.CancellationToken) {
        if (!this._view) {
            return;
        }
        this.setGeneratingPage(); // TODO: Style
        try {
            logMessage('Generating outline diagram...');
            const { success } = await this.promptLLMToUpdateWebview(cancellationToken);
            if (!success) {
                this._view.webview.html = template('<p>Please try again.</p>'); // TODO: Style
            }
        } catch (e) {
            logMessage(`Unexpected error generating outline diagram: ${e}`);
            this._view.webview.html = template('<p>Please try again.</p>'); // TODO: Style
        }
    }

    public async resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        this._view.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'parse-result':
						logMessage(`(Outline) Parse Result: ${JSON.stringify(message)}`);
						this.parseDetails = message;
						break;
				}
			},
			null,
		);

        this.setGeneratingPage(); // TODO: Style
    }

    private async promptLLMToUpdateWebview(cancellationToken: vscode.CancellationToken) {
        const doc = vscode.window.activeTextEditor?.document;
        if (!doc || !this._view) {
            return { success: false, error: 'No document or view' };
        }

        const model = await this.getModel();
        if (!model) {
            return { success: false, error: 'No model' };
        }
        const options: vscode.LanguageModelChatRequestOptions = {
            justification: 'To display a dynamic diagram of the file outline',
            tools: vscode.lm.tools.map((tool): vscode.LanguageModelChatTool => {
                return {
                    name: tool.name,
                    description: tool.description,
                    parametersSchema: tool.parametersSchema ?? {}
                };
            }),
        };
        logMessage(`Available tools: ${options.tools?.map(tool => tool.name).join(', ')}`);
        if (cancellationToken.isCancellationRequested) {
            return { success: false, error: 'Cancelled' };
        }
    
        const messages = [
            vscode.LanguageModelChatMessage.Assistant(llmInstructions),
            vscode.LanguageModelChatMessage.User(`The file the user currently has open is: ${doc.uri.fsPath} with contents: ${doc.getText()}`),
        ];
    
        // Recursive
        let retries = 0;
        const runWithTools = async () => {
            const toolCalls: IToolCall[] = [];
            let mermaidDiagram = '';
    
            if (cancellationToken.isCancellationRequested) {
                return { success: false, error: 'Cancelled' };
            }
    
            const response = await model.sendRequest(messages, options, cancellationToken);
            // Loop for reading response from the LLM
            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    mermaidDiagram += part.value;
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    const toolUsed = vscode.lm.tools.find(t => t.name === part.name);
                    logMessage(`🛠️ Used tool '${toolUsed?.name}' to generate diagram`);
                    if (!toolUsed) {
                        throw new Error(`Tool ${part.name} invalid`);
                    }
                    const parameters = part.parameters;
    
                    const requestedContentType = 'text/plain';
                    toolCalls.push({
                        call: part,
                        result: vscode.lm.invokeTool(toolUsed.name,
                            {
                                parameters,
                                toolInvocationToken: undefined,
                                requestedContentTypes: [requestedContentType]
                            }, cancellationToken),
                        tool: toolUsed
                    });
                }
    
                // if any tools were used, add them to the context and re-run the query
                if (toolCalls.length) {
                    const assistantMsg = vscode.LanguageModelChatMessage.Assistant('');
                    assistantMsg.content2 = toolCalls.map(toolCall => new vscode.LanguageModelToolCallPart(toolCall.tool.name, toolCall.call.toolCallId, toolCall.call.parameters));
                    messages.push(assistantMsg);
                    for (const toolCall of toolCalls) {
                        // NOTE that the result of calling a function is a special content type of a USER-message
                        const message = vscode.LanguageModelChatMessage.User('');
                        message.content2 = [new vscode.LanguageModelToolResultPart(toolCall.call.toolCallId, (await toolCall.result)['text/plain']!)];
                        messages.push(message);
                    }
    
                    // IMPORTANT The prompt must end with a USER message (with no tool call)
                    messages.push(vscode.LanguageModelChatMessage.User(`Above is the result of calling the functions ${toolCalls.map(call => call.tool.name).join(', ')}. Use this as you iterate on the mermaid diagram.`));
    
                    // RE-enter
                    return runWithTools();
                }
            } // done with stream loop
    
            logMessage(`Received candidate mermaid outline for file: ${mermaidDiagram}`);
            logMessage(mermaidDiagram);
    
            // Validate the diagram
            const candidateNextDiagram = new Diagram(mermaidDiagram);
            const result = await this.validate(candidateNextDiagram);

            if (result.success) {
                return result;
            }

            //  -- Handle parse error

            logMessage(`Outline generation not success (on retry ${++retries})`);
            if (retries < 4) {
                messages.push(vscode.LanguageModelChatMessage.User(`Please fix this mermaid parse error to make the diagram render correctly: ${result.error}. The produced diagram with the parse error is:\n${candidateNextDiagram.content}`));
                return runWithTools();
            } else {
                return { success: false, error: "Exhausted retries" };
            }
        }; // done with runWithTools
    
        return await runWithTools();
    }

    private async validate(candidateNextDiagram: Diagram): Promise<{ success: true } | { success: false, error: string }> {
        this.parseDetails = undefined; // TODO: This feels race-y.
        if (!this._view) {
            logMessage('FAIL! No view found - where did it go!');
            return { success: false, error: 'No view found. This is unexpected.' };
        }
        this._view.webview.html = DiagramEditorPanel.getHtmlToValidateMermaid(this._view.webview, candidateNextDiagram);
        // wait for parseDetails to be set via message posted from webview
        return new Promise<{ success: true } | { success: false, error: string }>((resolve) => {
            const interval = setInterval(() => {
                if (this.parseDetails !== undefined) {
                    clearInterval(interval);
                    if (this.parseDetails.success) {
                        if (!this._view) {
                            logMessage('FAIL! No view found - where did it go!');
                            return { success: false, error: 'No view found. This is unexpected.' };
                        }
                        this._view.webview.html = DiagramEditorPanel.getHtmlForWebview(this._view.webview, candidateNextDiagram);
                        resolve({ success: true });
                    } else {
                        resolve({ success: false, error: this.parseDetails.error });
                    }
                }
            }, 100);
        });
    }

    private async getModel(): Promise<vscode.LanguageModelChat | undefined> {
        const models = await vscode.lm.selectChatModels();
        if (!models.length) {
            logMessage('FAIL! No LLM model found');
            return;
        }
        const model = models.find(m => m.family === 'gpt-4o' && m.vendor === 'copilot'); // TODO: Hardcoding to avoid a bug with selector object
        if (!model) {
            logMessage('FAIL! Preferred LLM model not found');
            return;
        }
        return model;
    }

    private setGeneratingPage() {
        if (!this._view) {
            return;
        }
        const { animatedGraphUri } = DiagramEditorPanel.getWebviewResources(this._view.webview);
        this._view.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
        <img src="${animatedGraphUri}" alt="Loading image">
        </body>
        `;
    }

    constructor(private readonly context: vscode.ExtensionContext) { }

}
