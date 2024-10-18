# copilot-mermaid-diagram README

This is the README for your extension "copilot-mermaid-diagram". This extension is used to generate diagrams for your
code. This uses VS Code copilot chat for requests.

## Features

1. many slash commands are possible (see mermaid chat assistant in the chat panel)
2. on the outline view check out mermaid outline for a generated outline for each file

## Requirements

see package.json

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

- `mermaid.searchForExtensions`: Search for Mermaid extensions when viewing Mermaid source.
- `mermaid.enableGroq`: Enable outline generation with groq, requires API key to groq

## Using groq

1. use the command `copilot mermAId: Store groq API key` to add your groq api key
2. go to the outline view and click the refresh button
3. you should be able to see in the mermAId logs that the groq API is set
4. to disable even with the key set use the setting `mermaid.enableGroq`
5. groq API key is store in extension secrets, may not persist always so check if you think there is an issue

### 0.0.1

A tester version of this extension.s
