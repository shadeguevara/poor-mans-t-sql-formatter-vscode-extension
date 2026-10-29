import * as path from "path";
import * as vscode from "vscode";
import { ExtensionOptions, FormattingType } from "./extension-options";

type JsonObject = Record<string, unknown>;

const booleanOptions = new Set([
  "dontInsertErrorOutput",
  "trailingCommas",
  "spaceAfterExpandedComma",
  "expandCommaLists",
  "expandBooleanExpressions",
  "expandCaseStatements",
  "expandBetweenConditions",
  "expandInLists",
  "breakJoinOnSections",
  "uppercaseKeywords",
  "keywordStandardization",
  "randomizeKeywordCase",
  "randomizeLineLengths",
  "preserveComments",
  "enableKeywordSubstitution",
  "compactCaseExpressions",
  "caseExpressionOnNewLine",
  "castCaseExpressionOnNewLine",
  "separateInlineComments",
  "procedureParametersOnSeparateLines",
  "selectColumnsOnSeparateLines",
  "separateCommentsFromCode",
  "spaceAfterInListComma",
  "indentProcedureBody",
]);

const numberOptions = new Set([
  "spacesPerTab",
  "maxLineWidth",
  "statementBreaks",
  "clauseBreaks",
  "booleanExpressionMaxWidth",
  "inListExpandThreshold",
]);

const stringOptions = new Set(["indent", "errorOutputPrefix"]);

const knownOptions = new Set([
  ...booleanOptions,
  ...numberOptions,
  ...stringOptions,
  "formattingType",
  "booleanOperatorPosition",
]);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateOption(key: string, value: unknown, filePath: string): void {
  const prefix = `Invalid "${key}" option in formatter settings file "${filePath}":`;
  if (!knownOptions.has(key)) {
    throw new Error(`${prefix} unknown option.`);
  }
  if (booleanOptions.has(key) || key === "confirmOnError") {
    if (typeof value !== "boolean") {
      throw new Error(`${prefix} expected a boolean.`);
    }
    return;
  }
  if (numberOptions.has(key)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${prefix} expected a non-negative number.`);
    }
    return;
  }
  if (stringOptions.has(key)) {
    if (typeof value !== "string") {
      throw new Error(`${prefix} expected a string.`);
    }
    return;
  }
  if (
    key === "formattingType" &&
    value !== FormattingType.standard &&
    value !== FormattingType.obfuscation
  ) {
    throw new Error(`${prefix} expected "standard" or "obfuscation".`);
  }
  if (
    key === "booleanOperatorPosition" &&
    value !== "leading" &&
    value !== "trailing"
  ) {
    throw new Error(`${prefix} expected "leading" or "trailing".`);
  }
}

function resolveSettingsFileUri(
  configuredPath: string,
  documentUri: vscode.Uri
): vscode.Uri {
  if (path.isAbsolute(configuredPath)) {
    return vscode.Uri.file(configuredPath);
  }

  const segments = configuredPath.replace(/\\/g, "/").split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new Error("The formatter settings path cannot contain '..'.");
  }
  const workspaceFolder =
    vscode.workspace.getWorkspaceFolder(documentUri) ??
    vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error(
      "A relative formatter settings path requires an open workspace folder."
    );
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, ...segments);
}

export async function readFormatterSettingsFile(
  configuredPath: string,
  documentUri: vscode.Uri
): Promise<Partial<ExtensionOptions>> {
  if (!configuredPath.trim()) {
    return {};
  }

  const fileUri = resolveSettingsFileUri(configuredPath, documentUri);
  let contents: Uint8Array;
  try {
    contents = await vscode.workspace.fs.readFile(fileUri);
  } catch (error) {
    throw new Error(
      `Could not read formatter settings file "${configuredPath}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(contents).toString("utf8"));
  } catch (error) {
    throw new Error(
      `Formatter settings file "${configuredPath}" is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (!isObject(parsed)) {
    throw new Error(
      `Formatter settings file "${configuredPath}" must contain a JSON object.`
    );
  }

  const rootOptions: JsonObject = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key !== "std" && key !== "min") {
      validateOption(key, value, configuredPath);
      rootOptions[key] = value;
      continue;
    }
    if (!isObject(value)) {
      throw new Error(
        `The "${key}" section in formatter settings file "${configuredPath}" must be a JSON object.`
      );
    }
    for (const [optionKey, optionValue] of Object.entries(value)) {
      validateOption(optionKey, optionValue, configuredPath);
      rootOptions[optionKey] = optionValue;
    }
  }

  return rootOptions as Partial<ExtensionOptions>;
}
