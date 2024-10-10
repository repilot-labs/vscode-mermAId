import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { logMessage } from './extension';

export class Diagram {
    private tempDir: string | undefined;

    constructor(private readonly _content: string) {
    }

    get content(): string { return this._content; }

    get asSvg(): string {
        if (!this.tempDir) {
            this.validate();
        }

        if (!this.tempDir) {
            throw new Error('Failed to get SVG content');
        }

        // file is written to a slightly different name, probably need to validate
        return fs.readFileSync(`${this.tempDir}/diagram-1.svg`, 'utf8');
    }

    async validate(): Promise<{ message: string, stack: string } | undefined> {
        this.tempDir = fs.mkdtempSync(os.tmpdir());

        // Write the diagram to a file
        fs.writeFileSync(path.join(this.tempDir, 'diagram.md'), this.content);
        const mermaidCLIModule = await import('@mermaid-js/mermaid-cli');
        try {
            await mermaidCLIModule.run(
                `${this.tempDir}/diagram.md`,     // input
                `${this.tempDir}/diagram.svg`,               // output
                {
                    outputFormat: 'svg',
                }
            );

        } catch (e: any) {
            logMessage(`ERR: ${e?.message ?? e}`);
            return {
                message: e?.message ?? JSON.stringify(e),
                stack: e.stack
            };
        }

        return undefined;
    }
}