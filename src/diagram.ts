import * as vscode from 'vscode';
import { logMessage } from "./extension";

export class Diagram {
    private validated: boolean = false;

    constructor(private readonly _content: string) {
        const start = '```mermaid';
        this._content = this._content.substring(this._content.indexOf(start) + start.length);
        this._content = this._content.substring(0, this._content.indexOf('```')).trim();
    }

    get content(): string {
        return this._content;
    }
}