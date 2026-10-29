import * as vscode from "vscode";
import { formatDocument } from "./lib";

async function formatEditor(
  editor: vscode.TextEditor,
  range?: vscode.Range
): Promise<void> {
  const editorSettings = vscode.workspace.getConfiguration(
    "editor",
    editor.document.uri
  );
  const tabSize =
    typeof editor.options.tabSize === "number"
      ? editor.options.tabSize
      : editorSettings.get<number>("tabSize", 4);
  const insertSpaces =
    typeof editor.options.insertSpaces === "boolean"
      ? editor.options.insertSpaces
      : editorSettings.get<boolean>("insertSpaces", true);
  const edits = await formatDocument(
    editor.document,
    { tabSize, insertSpaces },
    range
  );
  if (edits.length > 0) {
    const applied = await editor.edit((editBuilder) => {
      for (const edit of edits) {
        editBuilder.replace(edit.range, edit.newText);
      }
    });
    if (!applied) {
      throw new Error("The SQL formatting edits could not be applied.");
    }
  }
}

function formatWhole(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  return editor ? formatEditor(editor) : Promise.resolve();
}

function formatSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  return editor ? formatEditor(editor, editor.selection) : Promise.resolve();
}

export function activate(context: vscode.ExtensionContext) {
  const disposables = [
    vscode.commands.registerCommand(
      "poor-mans-t-sql-formatter-pg.poorFormatSql",
      formatWhole
    ),
    vscode.commands.registerCommand(
      "poor-mans-t-sql-formatter-pg.poorFormatSelectionSql",
      formatSelection
    ),
    vscode.languages.registerDocumentFormattingEditProvider("sql", {
      provideDocumentFormattingEdits(
        document,
        options: vscode.FormattingOptions
      ) {
        return formatDocument(document, options);
      },
    }),
    vscode.languages.registerDocumentRangeFormattingEditProvider("sql", {
      provideDocumentRangeFormattingEdits(
        document,
        range,
        options: vscode.FormattingOptions
      ) {
        return formatDocument(document, options, range);
      },
    }),
  ];

  context.subscriptions.push(...disposables);
}

export function deactivate() {}
