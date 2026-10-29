import * as path from "path";
import * as vscode from "vscode";
import { formatDocument } from "./lib";
import { readFormatterSettingsFile } from "./settings-file";

function getFormattingOptions(
  editor: vscode.TextEditor
): vscode.FormattingOptions {
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
  return { tabSize, insertSpaces };
}

async function applyFormattingEdits(
  editor: vscode.TextEditor,
  edits: vscode.TextEdit[]
): Promise<void> {
  if (edits.length === 0) {
    return;
  }
  const applied = await editor.edit((editBuilder) => {
    for (const edit of edits) {
      editBuilder.replace(edit.range, edit.newText);
    }
  });
  if (!applied) {
    throw new Error("The SQL formatting edits could not be applied.");
  }
}

async function formatEditor(
  editor: vscode.TextEditor,
  range?: vscode.Range
): Promise<void> {
  const edits = await formatDocument(
    editor.document,
    getFormattingOptions(editor),
    range
  );
  await applyFormattingEdits(editor, edits);
}

async function previewFormatEditor(
  editor: vscode.TextEditor,
  range?: vscode.Range
): Promise<void> {
  const document = editor.document;
  const version = document.version;
  const originalText = document.getText();
  const edits = await formatDocument(
    document,
    getFormattingOptions(editor),
    range
  );
  if (edits.length === 0) {
    return;
  }
  const edit = edits[0];
  const start = document.offsetAt(edit.range.start);
  const end = document.offsetAt(edit.range.end);
  const formattedText =
    originalText.slice(0, start) + edit.newText + originalText.slice(end);
  if (formattedText === originalText) {
    await vscode.window.showInformationMessage("SQL is already formatted.");
    return;
  }

  const previewDocument = await vscode.workspace.openTextDocument({
    language: document.languageId,
    content: formattedText,
  });
  const fileName = document.uri.path.split("/").pop() || "SQL";
  await vscode.commands.executeCommand(
    "vscode.diff",
    document.uri,
    previewDocument.uri,
    `${fileName} ↔ Formatted preview`
  );
  const choice = await vscode.window.showInformationMessage(
    "Review the formatting changes in the diff editor.",
    "Apply Formatting",
    "Discard"
  );
  if (choice !== "Apply Formatting") {
    return;
  }
  if (document.version !== version) {
    await vscode.window.showWarningMessage(
      "The SQL document changed while the preview was open. Create a new preview before applying formatting."
    );
    return;
  }
  await applyFormattingEdits(editor, edits);
}

async function validateSettingsFile(): Promise<boolean> {
  const configuredPath = vscode.workspace
    .getConfiguration("poor-mans-t-sql-formatter-pg")
    .get<string>("settingsFile", "");
  if (!configuredPath.trim()) {
    void vscode.window.showWarningMessage(
      "No formatter settings file is configured. Set poor-mans-t-sql-formatter-pg.settingsFile first."
    );
    return false;
  }
  const documentUri =
    vscode.window.activeTextEditor?.document.uri ??
    vscode.workspace.workspaceFolders?.[0]?.uri ??
    (path.isAbsolute(configuredPath)
      ? vscode.Uri.file(configuredPath)
      : undefined);
  if (!documentUri) {
    void vscode.window.showErrorMessage(
      "Open a workspace folder or configure an absolute formatter settings file path."
    );
    return false;
  }

  try {
    const options = await readFormatterSettingsFile(
      configuredPath,
      documentUri
    );
    void vscode.window.showInformationMessage(
      `Formatter settings are valid (${Object.keys(options).length} options).`
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(
      `Formatter settings validation failed: ${message}`
    );
    return false;
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
    vscode.commands.registerCommand(
      "poor-mans-t-sql-formatter-pg.poorPreviewFormatSql",
      () => {
        const editor = vscode.window.activeTextEditor;
        return editor ? previewFormatEditor(editor) : Promise.resolve();
      }
    ),
    vscode.commands.registerCommand(
      "poor-mans-t-sql-formatter-pg.poorPreviewSelectionSql",
      () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return Promise.resolve();
        }
        if (editor.selection.isEmpty) {
          return vscode.window.showInformationMessage(
            "Select SQL to preview formatting."
          );
        }
        return previewFormatEditor(editor, editor.selection);
      }
    ),
    vscode.commands.registerCommand(
      "poor-mans-t-sql-formatter-pg.validateSettingsFile",
      validateSettingsFile
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
