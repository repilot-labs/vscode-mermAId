export class Diagram {
    constructor(private readonly _content: string) {
        const start = '```mermaid';
        if (this._content.includes(start)) {
            this._content = this._content.substring(this._content.indexOf(start) + start.length);
        }
        if (this._content.includes('```')) {
            this._content = this._content.substring(0, this._content.indexOf('```')).trim();
        }
    }

    asMarkdown(): string {
        return `\`\`\`mermaid\n${this._content}\n\`\`\``;
    }

    get content(): string {
        return this._content;
    }
}