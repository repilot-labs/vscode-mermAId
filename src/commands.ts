import { commands, window, workspace } from "vscode";
import { Diagram } from "./diagram";
import { DiagramEditorPanel } from "./diagramEditorPanel";
import { DiagramDocument } from "./diagramDocument";

export const COMMAND_OPEN_DIAGRAM_SVG = 'mermAId.openDiagramSvg';
export const COMMAND_OPEN_MARKDOWN_FILE = 'mermAId.openMarkdownFile';

export function registerCommands() {
    commands.registerCommand(COMMAND_OPEN_DIAGRAM_SVG, async (content?: string) => {
        const textContent = content ?? window.activeTextEditor?.document.getText();

        if (textContent) {
            const diagram = new Diagram(textContent);
            // TODO: This now internally validates the diagram, handle?
            /*const result =*/ DiagramEditorPanel.createOrShow(diagram);
        }
    });

    commands.registerCommand(COMMAND_OPEN_MARKDOWN_FILE, async (content?: string) => {
        if (!content) {
            if (DiagramEditorPanel.currentPanel) {
                content = DiagramEditorPanel.currentPanel.diagram.content;
            } else {
                return;
            }
        }
        const diagram = typeof content === 'string' ? new Diagram(content) : DiagramEditorPanel.currentPanel?.diagram;
        if (diagram) {
            await DiagramDocument.createAndShow(diagram);
        }
    });
}