import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { logMessage } from './extension';

export class Diagram {
    constructor(private readonly _content: string) {
    }

    get content(): string { return this._content; }

    async validate(): Promise<{ message: string, stack: string } | undefined> {
        const tmpDir = fs.mkdtempSync(os.tmpdir());
        logMessage(tmpDir);

        // Write the diagram to a file
        fs.writeFileSync(path.join(tmpDir, 'diagram.md'), this.content);
        const mermaidCLIModule = await import('@mermaid-js/mermaid-cli');
        try {
            await mermaidCLIModule.run(
                `${tmpDir}/diagram.md`,     // input
                `${tmpDir}/diagram.svg`,    // output
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