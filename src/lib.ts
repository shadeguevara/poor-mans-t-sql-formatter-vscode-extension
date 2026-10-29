import * as vscode from "vscode";
import { ExtensionOptions, FormattingType } from "./extension-options";
import { formatCaseExpressions } from "./case-formatting";
import {
  expandLongInLists,
  formatBooleanOperatorPosition,
  formatBooleanExpressionWrapping,
  formatCaseExpressionPlacement,
  formatCastCaseExpressionPlacement,
  formatCommentSpacing,
  formatInlineComments,
  formatInListCommaSpacing,
  formatProcedureBodyIndent,
  formatProcedureParameters,
  formatSelectProjectionLists,
  stripSqlComments,
} from "./custom-formatting";
import { readFormatterSettingsFile } from "./settings-file";
const sqlFormatter = require("poor-mans-t-sql-formatter");

export interface ISqlFormatterResult {
  errorFound: boolean;
  text: string;
}

function getWholeDocRange(doc: vscode.TextDocument) {
  var firstLine = doc.lineAt(0);
  var lastLine = doc.lineAt(doc.lineCount - 1);
  return new vscode.Range(firstLine.range.start, lastLine.range.end);
}

function collectOptions(
  extensionOptions: vscode.WorkspaceConfiguration,
  editorOptions: vscode.FormattingOptions
): Partial<ExtensionOptions> {
  const options: Partial<ExtensionOptions> = {
    formattingType: extensionOptions.get<ExtensionOptions["formattingType"]>(
      "formattingType",
      FormattingType.standard
    ),
    errorOutputPrefix: extensionOptions.get("errorOutputPrefix", ""),
    dontInsertErrorOutput: extensionOptions.get("dontInsertErrorOutput", true),
    compactCaseExpressions: extensionOptions.get(
      "compactCaseExpressions",
      true
    ),
    caseExpressionOnNewLine: extensionOptions.get(
      "caseExpressionOnNewLine",
      false
    ),
    castCaseExpressionOnNewLine: extensionOptions.get(
      "castCaseExpressionOnNewLine",
      false
    ),
    booleanOperatorPosition: extensionOptions.get(
      "booleanOperatorPosition",
      "leading"
    ),
    booleanExpressionMaxWidth: extensionOptions.get(
      "booleanExpressionMaxWidth",
      120
    ),
    inListExpandThreshold: extensionOptions.get("inListExpandThreshold", 0),
    separateInlineComments: extensionOptions.get(
      "separateInlineComments",
      false
    ),
    procedureParametersOnSeparateLines: extensionOptions.get(
      "procedureParametersOnSeparateLines",
      true
    ),
    selectColumnsOnSeparateLines: extensionOptions.get(
      "selectColumnsOnSeparateLines",
      true
    ),
    separateCommentsFromCode: extensionOptions.get(
      "separateCommentsFromCode",
      true
    ),
    spaceAfterInListComma: extensionOptions.get("spaceAfterInListComma", false),
    indentProcedureBody: extensionOptions.get("indentProcedureBody", false),
    ...extensionOptions.get<Partial<ExtensionOptions>>("min", {}),
    ...extensionOptions.get<Partial<ExtensionOptions>>("std", {}),
  };

  if (!options.indent) {
    options.indent = editorOptions.insertSpaces
      ? " ".repeat(editorOptions.tabSize)
      : "\t";
  }
  const spacesPerTabInspection =
    extensionOptions.inspect<number>("std.spacesPerTab");
  const configuredSpacesPerTab = [
    spacesPerTabInspection?.workspaceFolderLanguageValue,
    spacesPerTabInspection?.workspaceLanguageValue,
    spacesPerTabInspection?.globalLanguageValue,
    spacesPerTabInspection?.workspaceFolderValue,
    spacesPerTabInspection?.workspaceValue,
    spacesPerTabInspection?.globalValue,
  ].find((value) => value !== undefined);
  options.spacesPerTab = configuredSpacesPerTab ?? editorOptions.tabSize;

  return options;
}

export function formatDocument(
  document: vscode.TextDocument,
  editorFormattingOptions: vscode.FormattingOptions,
  selectionRange?: vscode.Range
): Promise<vscode.TextEdit[]> {
  const range = selectionRange || getWholeDocRange(document);
  const inputSql = document.getText(range);

  let extensionSettingsObject = vscode.workspace.getConfiguration(
    "poor-mans-t-sql-formatter-pg"
  );
  let options = collectOptions(
    extensionSettingsObject,
    editorFormattingOptions
  );
  const preserveCommentsInspection =
    extensionSettingsObject.inspect<boolean>("preserveComments");
  const explicitPreserveComments = [
    preserveCommentsInspection?.workspaceFolderLanguageValue,
    preserveCommentsInspection?.workspaceLanguageValue,
    preserveCommentsInspection?.globalLanguageValue,
    preserveCommentsInspection?.workspaceFolderValue,
    preserveCommentsInspection?.workspaceValue,
    preserveCommentsInspection?.globalValue,
  ].find((value) => value !== undefined);
  const preserveComments =
    explicitPreserveComments ?? options.preserveComments ?? true;

  const formatPromise = (async (): Promise<vscode.TextEdit[]> => {
    const dontWarnOnLanguageMismatch = extensionSettingsObject.get(
      "dontWarnOnLanguageMismatch",
      false
    );
    const expectedLanguages = extensionSettingsObject.get<string[]>(
      "expectedLanguages",
      ["sql", "plaintext"]
    );
    if (
      !dontWarnOnLanguageMismatch &&
      !expectedLanguages.find(
        (language) => language === document.languageId || language === "*"
      )
    ) {
      const selectedAction = await vscode.window.showWarningMessage(
        "The language of the file you are attempting to format does not match the formatter's configuration. Would you like to format anyway?",
        "Format Anyway",
        "Cancel"
      );
      if (selectedAction !== "Format Anyway") {
        return [];
      }
    }

    const settingsFile = extensionSettingsObject.get<string>(
      "settingsFile",
      ""
    );
    const fileOptions = await readFormatterSettingsFile(
      settingsFile,
      document.uri
    );
    const externalPreserveComments = fileOptions.preserveComments;
    options = {
      ...options,
      preserveComments,
      ...fileOptions,
    };
    if (externalPreserveComments !== undefined) {
      options.preserveComments = externalPreserveComments;
    }
    if (options.dontInsertErrorOutput) {
      options.errorOutputPrefix = "";
    }

    const {
      compactCaseExpressions,
      caseExpressionOnNewLine,
      castCaseExpressionOnNewLine,
      booleanOperatorPosition,
      booleanExpressionMaxWidth,
      inListExpandThreshold,
      separateInlineComments,
      procedureParametersOnSeparateLines,
      selectColumnsOnSeparateLines,
      separateCommentsFromCode,
      spaceAfterInListComma,
      indentProcedureBody,
      ...formatterOptions
    } = options;
    const result = sqlFormatter.formatSql(
      options.preserveComments ? inputSql : stripSqlComments(inputSql),
      formatterOptions
    ) as ISqlFormatterResult;
    const indent = options.indent || "\t";
    let formattedText = result.text;

    if (procedureParametersOnSeparateLines) {
      formattedText = formatProcedureParameters(formattedText, indent);
    }
    if (selectColumnsOnSeparateLines) {
      formattedText = formatSelectProjectionLists(formattedText, indent);
    }
    if (!options.expandInLists && (inListExpandThreshold ?? 0) > 0) {
      formattedText = expandLongInLists(
        formattedText,
        inListExpandThreshold ?? 0,
        indent
      );
    }
    formattedText = formatInListCommaSpacing(
      formattedText,
      spaceAfterInListComma ?? false
    );
    formattedText = formatBooleanExpressionWrapping(
      formattedText,
      booleanExpressionMaxWidth ?? 0,
      indent,
      options.spacesPerTab || editorFormattingOptions.tabSize
    );
    formattedText = formatBooleanOperatorPosition(
      formattedText,
      booleanOperatorPosition === "trailing" ? "trailing" : "leading"
    );
    formattedText = formatCaseExpressionPlacement(
      formattedText,
      indent,
      caseExpressionOnNewLine ?? false
    );
    formattedText = formatCastCaseExpressionPlacement(
      formattedText,
      indent,
      castCaseExpressionOnNewLine ?? false
    );
    if (compactCaseExpressions) {
      formattedText = formatCaseExpressions(
        formattedText,
        indent,
        options.spacesPerTab || editorFormattingOptions.tabSize,
        options.maxLineWidth || 999
      );
    }
    formattedText = formatProcedureBodyIndent(
      formattedText,
      indent,
      indentProcedureBody ?? false
    );
    if (separateCommentsFromCode) {
      formattedText = formatCommentSpacing(formattedText);
    }
    if (separateInlineComments) {
      formattedText = formatInlineComments(formattedText);
    }

    return [vscode.TextEdit.replace(range, formattedText)];
  })();
  return formatPromise.catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);
    await vscode.window.showErrorMessage(`SQL formatting failed: ${message}`);
    throw error;
  });
}
