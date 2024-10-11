import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { logMessage } from './extension';

export class Diagram {
    private tempDir: string | undefined;
    private validated: boolean = false;

    constructor(private readonly _content: string) {
    }

    private get outputFileName(): string {
        return `${this.tempDir}/diagram-1.svg`;
    }

    get content(): string { return this._content; }

    asSvg(): string {
        if (!this.validated) {
            throw new Error('Must generate diagram with validation before accessing SVG');
        }

        // TODO: file is written to a slightly different name, probably need to validate
        return fs.readFileSync(this.outputFileName, 'utf8');
    }

    async generateWithValidation(): Promise<{ success: boolean; message?: string; stack?: string, diagramPath?: string | undefined }> {
        let diagramTempPath;
        if (!this._content.length) {
            return {
                success: false,
                message: 'Provided content is empty',
            };
        }
        try {
            this.tempDir = fs.mkdtempSync(os.tmpdir());
            if (!this.tempDir) {
                return {
                    success: false,
                    message: 'Failed to create temporary directory',
                };
            }

            // Write the diagram to a file
            diagramTempPath = path.join(this.tempDir, 'diagram.md');
            fs.writeFileSync(diagramTempPath, this.content);
            const mermaidCLIModule = await import('@mermaid-js/mermaid-cli');
            await mermaidCLIModule.run(
                `${this.tempDir}/diagram.md`,     // input
                `${this.tempDir}/diagram.svg`,    // output
                {
                    outputFormat: 'svg',
                }
            );

        } catch (e: any) {
            logMessage(`ERR: ${e?.message ?? e}`);
            return {
                success: false,
                message: e?.message ?? JSON.stringify(e),
                stack: e.stack,
            };
        }

        // I've noticed that if the input file is _really_ wrong from the LLM (i.e the LLM generates typescript code)
        // The CLI doesn't throw, but exits (without generating any output, of course)
        //
        // Check for the existence of the output file
        if (!fs.existsSync(this.outputFileName)) {
            return {
                success: false,
                message: 'Output file was not created',
            };
        }

        // Success
        this.validated = true;
        return {
            success: true,
            diagramPath: diagramTempPath
        };
    }
}