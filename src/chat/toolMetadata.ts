import * as vscode from 'vscode';

export interface ToolCallRound {
	response: string;
	toolCalls: vscode.LanguageModelToolCallPart[];
}

export interface MermaidChatMetadata {
    toolCallsMetadata: ToolCallsMetadata;
}

export interface ToolCallsMetadata {
    toolCallRounds: ToolCallRound[];
    toolCallResults: Record<string, vscode.LanguageModelToolResult>;
}

export function isTsxMermaidMetadata(obj: unknown): obj is MermaidChatMetadata {
    // If you change the metadata format, you would have to make this stricter or handle old objects in old ChatRequest metadata
    return !!obj &&
        !!(obj as MermaidChatMetadata).toolCallsMetadata &&
        Array.isArray((obj as MermaidChatMetadata).toolCallsMetadata.toolCallRounds);
}