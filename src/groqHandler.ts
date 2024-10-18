import * as vscode from 'vscode';
import { logMessage } from './extension';

// Groq client
let groq: any;
// flag to check if Groq is enabled
export let groqEnabled = false;
/**
 * Registers the Groq tool within the given VS Code extension context.
 * 
 * This function retrieves the Groq API key from the extension's secrets storage.
 * If the API key is found, it initializes the Groq SDK with the API key and enables Groq functionality.
 * If the API key is not found, it logs a message and defaults to using only OpenAI.
 * 
 * @param context - The VS Code extension context which provides access to secrets storage and other extension resources.
 */
export function registerGroqTool(context: vscode.ExtensionContext) {
    const Groq = require('groq-sdk');
     context.secrets.get('groq-api-key').then((apiKey) => {
           if (apiKey) {
               logMessage('Retrieved Groq API key, will use groq for outline view diagram generation.');
               groq = new Groq({apiKey:apiKey});
               groqEnabled = true;
           } else {
                logMessage('No Groq API key found, defaulting to using only OpenAI.');
           }
       });
}


export class GroqChatResponse implements vscode.LanguageModelChatResponse {
    // seems like it needs both string and text but they represent the same thing?
    public text: AsyncIterable<string>;
    public stream: AsyncIterable<string>;
    constructor(text: AsyncIterable<string>) {
        this.text = text;
        this.stream = text;
    }
}

export function convertMessagesToGroq(messages: vscode.LanguageModelChatMessage[]): {role: string, content: string}[] {
    const groqMessages = [];
    for (const message of messages) {
        if (message.role === 1) {
            groqMessages.push({role:"user", content:message.content});
        } else if (message.role === 2) {
            groqMessages.push({role:"assistant", content:message.content});
        }
    }
    return groqMessages;
}


export async function callWithGroq(messages: vscode.LanguageModelChatMessage[]): Promise<GroqChatResponse>{
    
    messages.push(vscode.LanguageModelChatMessage.User(`For Groq specifically, follow these formatting rules strictly:

1. Use triple backticks (\`\`\`) to enclose any Mermaid diagrams.
2. Always specify the language as 'mermaid' right after the first set of backticks, like this: \`\`\`mermaid.
3. Only include the Mermaid diagram itself, with **no additional text** outside the diagram. Only include **one** mermaid diagram per response.
4. The diagram should be a **class diagram** and nothing else.

Example:
\`\`\`mermaid
classDiagram
class DiscoveredTestPayload {
    +cwd: string
    +status: "success"
    }

DiscoveredTestPayload <|-- ClassB
\`\`\`

all open { symbols in the diagram must have a close } symbol when defining classes.

Thank you!`));
    const groqMessages = convertMessagesToGroq(messages);

    const tools = [
        {
            type: "function",
            function: {
                name: "mermAId_get_symbol_definition",
                description: "Given a file path string and a list of symbols, this model returns the definitions of the specified symbols. For example, if the file 'x.py' is provided and the symbol 'abc' is requested, the model will find 'abc' in 'x.py' and return its definition from the file where it is actually defined, such as 'y.py'.",
                parameters: {
                    type: "object",
                    properties: {
                        symbols: {
                            type: "array",
                            items: {
                                "type": "string"
                            },
                            description: "A list of symbols in the file to get the definition for.",
                        },
                        fileString: {
                            type: "string",
                            description: "The path to the file represented as a string where you are finding these symbols you want to get the definition for. Or undefined if the location of the symbol is unknown.",
                        }
                    },
                    required: ["symbols", "fileString"],
                },
            },
        }
    ];



    const chatCompletion: AsyncIterable<string> = await groq.chat.completions.create({
        "messages": groqMessages,
        "model": "llama3-groq-70b-8192-tool-use-preview",
        "temperature": 1,
        "max_tokens": 1024,
        "top_p": 1,
        "stream": true,
        "stop": null,
        "tools": tools,
        "tool_choice": "auto",
    });    
    return new GroqChatResponse(chatCompletion);

}