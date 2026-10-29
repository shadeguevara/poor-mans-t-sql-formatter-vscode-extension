# Poor Man's T-SQL Formatter for VS Code

A VS Code extension for formatting T-SQL, based on [Poor Man's T-SQL Formatter](https://github.com/TaoK/PoorMansTSqlFormatter). In addition to the upstream formatter's options, this extension adds configurable layout rules for stored procedures, `SELECT` projections, comments, and `CASE` expressions.

The formatter changes SQL text. Review the diff before saving or running formatted SQL, especially when using comment removal or keyword standardization.

## Use the formatter

1. Open a `.sql` file in VS Code.
2. To format the file, run **Poor Man's SQL: Format SQL** from the Command Palette, or use VS Code's **Format Document** action.
3. To format only part of a file, select the SQL and run **Poor Man's SQL: Format selection** or VS Code's **Format Selection** action.
4. Review the result in the editor and undo with **Ctrl+Z** if needed.

The extension contributes document and range formatting providers for the `sql` language. In a development checkout, press **F5** to launch an Extension Development Host; that does not install the checkout into your normal VS Code profile.

## Personalize formatting

Open **Preferences: Open User Settings (JSON)** or the workspace's `.vscode/settings.json`. The settings below show the extension's compact stored-procedure defaults; remove any entries you want to leave at their defaults.

```json
{
  "[sql]": {
    "editor.insertSpaces": true,
    "editor.tabSize": 4
  },
  "poor-mans-t-sql-formatter-pg.compactCaseExpressions": true,
  "poor-mans-t-sql-formatter-pg.caseExpressionOnNewLine": false,
  "poor-mans-t-sql-formatter-pg.castCaseExpressionOnNewLine": false,
  "poor-mans-t-sql-formatter-pg.booleanOperatorPosition": "leading",
  "poor-mans-t-sql-formatter-pg.booleanExpressionMaxWidth": 120,
  "poor-mans-t-sql-formatter-pg.inListExpandThreshold": 0,
  "poor-mans-t-sql-formatter-pg.separateInlineComments": false,
  "poor-mans-t-sql-formatter-pg.preserveComments": true,
  "poor-mans-t-sql-formatter-pg.procedureParametersOnSeparateLines": true,
  "poor-mans-t-sql-formatter-pg.selectColumnsOnSeparateLines": true,
  "poor-mans-t-sql-formatter-pg.separateCommentsFromCode": true,
  "poor-mans-t-sql-formatter-pg.spaceAfterInListComma": false,
  "poor-mans-t-sql-formatter-pg.indentProcedureBody": false,
  "poor-mans-t-sql-formatter-pg.std.maxLineWidth": 120,
  "poor-mans-t-sql-formatter-pg.std.statementBreaks": 1,
  "poor-mans-t-sql-formatter-pg.std.clauseBreaks": 1,
  "poor-mans-t-sql-formatter-pg.std.expandCommaLists": true,
  "poor-mans-t-sql-formatter-pg.std.expandInLists": false,
  "poor-mans-t-sql-formatter-pg.std.expandCaseStatements": true,
  "poor-mans-t-sql-formatter-pg.std.expandBooleanExpressions": true,
  "poor-mans-t-sql-formatter-pg.std.uppercaseKeywords": true
}
```

### Extension-specific layout settings

| Setting                              | Default     | Effect                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compactCaseExpressions`             | `true`      | Aligns `CASE`, `ELSE`, and `END`; puts each `WHEN` on its own indented line and keeps `THEN` beside it when the branch fits within the configured maximum line width.                                                                                                                                                                 |
| `caseExpressionOnNewLine`            | `false`     | Moves a directly assigned `CASE` to the next continuation-indented line, e.g. `ColumnName =` followed by `CASE`. It does not move a `CASE` nested inside `CAST(...)` or `CONVERT(...)`.                                                                                                                                               |
| `castCaseExpressionOnNewLine`        | `false`     | Moves `CASE` onto a continuation line inside a directly assigned `CAST(...)` or `CONVERT(...)`, e.g. `ColumnName = CAST(` followed by `CASE`.                                                                                                                                                                                         |
| `booleanOperatorPosition`            | `"leading"` | With `std.expandBooleanExpressions` enabled, places `AND`/`OR` at the start of a continuation line (`leading`) or at the end of the preceding line (`trailing`).                                                                                                                                                                      |
| `booleanExpressionMaxWidth`          | `120`       | Wraps long, single-line Boolean expressions at `AND`/`OR` when they exceed this width. This complements `std.expandBooleanExpressions`; set to `0` to disable this additional line-width rule.                                                                                                                                        |
| `inListExpandThreshold`              | `0`         | Automatically puts `IN (...)` items on separate lines when the list contains more than this many top-level items. `0` disables automatic expansion; for example, set it to `5` to keep lists of up to five items inline. Subqueries and lists already spanning multiple lines are left to `std.expandInLists`/the upstream formatter. |
| `separateInlineComments`             | `false`     | Moves trailing `--` comments onto their own line, aligned with the SQL code they follow. Standalone comments and block comments are unchanged.                                                                                                                                                                                        |
| `preserveComments`                   | `true`      | Retains comments. Set to `false` to remove line and block comments before formatting. This also removes comment-based directives; use with care.                                                                                                                                                                                      |
| `procedureParametersOnSeparateLines` | `true`      | Places procedure parameters below the procedure declaration, one per line.                                                                                                                                                                                                                                                            |
| `selectColumnsOnSeparateLines`       | `true`      | Places each `SELECT` projection on its own line.                                                                                                                                                                                                                                                                                      |
| `separateCommentsFromCode`           | `true`      | Aligns standalone comment blocks with following code and separates comment blocks from code with a blank line. This does not remove comments; use `preserveComments` for that.                                                                                                                                                        |
| `spaceAfterInListComma`              | `false`     | Controls spaces after commas in single-line `IN (...)` lists. It does not override `std.expandInLists`.                                                                                                                                                                                                                               |
| `indentProcedureBody`                | `false`     | Keeps the outer procedure body flush-left under `BEGIN`. Set `true` to restore one extra indent level.                                                                                                                                                                                                                                |

These are whitespace-oriented layout rules. The formatter does not reorder `CASE` branches, add `ELSE` values, or decide which conditions are most specific because those changes can alter SQL behavior.

### Upstream formatter settings

These settings are grouped by formatting mode. `std.*` configures standard formatting; `min.*` is for obfuscation formatting. Set `poor-mans-t-sql-formatter-pg.formattingType` to `obfuscation` to use that mode.

| Setting                         | Default            | Effect                                                                                                            |
| ------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `std.indent`                    | Editor indentation | Explicit indentation unit; otherwise uses the SQL editor's `insertSpaces` and `tabSize` settings.                 |
| `std.spacesPerTab`              | Editor tab size    | Tab width for line-length calculations.                                                                           |
| `std.maxLineWidth`              | `120`              | Preferred maximum formatted line width.                                                                           |
| `std.statementBreaks`           | `1`                | Line breaks between statements.                                                                                   |
| `std.clauseBreaks`              | `1`                | Line breaks between clauses.                                                                                      |
| `std.expandCommaLists`          | `true`             | Expands comma-delimited lists, including projections and arguments.                                               |
| `std.trailingCommas`            | `true`             | Places commas at the end of expanded list lines rather than the beginning of the next line.                       |
| `std.spaceAfterExpandedComma`   | `false`            | Adds a space after commas in expanded lists.                                                                      |
| `std.expandBooleanExpressions`  | `true`             | Breaks Boolean expressions around `AND` and `OR`.                                                                 |
| `std.expandCaseStatements`      | `true`             | Expands `CASE` expressions for the custom compact `CASE` layout to refine.                                        |
| `std.expandBetweenConditions`   | `true`             | Breaks out the upper bound of `BETWEEN` expressions.                                                              |
| `std.expandInLists`             | `false`            | Places all `IN (...)` values on separate lines. When enabled, this takes precedence over `inListExpandThreshold`. |
| `std.breakJoinOnSections`       | `false`            | Places a `JOIN`'s `ON` section on its own line.                                                                   |
| `std.uppercaseKeywords`         | `true`             | Uppercases SQL keywords.                                                                                          |
| `std.keywordStandardization`    | `false`            | Replaces less-common keywords with standardized forms; T-SQL only.                                                |
| `min.randomizeKeywordCase`      | `false`            | Randomizes keyword casing in obfuscation mode.                                                                    |
| `min.randomizeLineLengths`      | `false`            | Randomizes line lengths in obfuscation mode.                                                                      |
| `min.preserveComments`          | `true`             | Legacy obfuscation option. Prefer the mode-independent `preserveComments` setting.                                |
| `min.enableKeywordSubstitution` | `false`            | Substitutes keyword synonyms in obfuscation mode; T-SQL only.                                                     |

General settings also include:

- `formattingType` (`standard` by default): selects `standard` or `obfuscation`.
- `confirmOnError`, `errorOutputPrefix`, and `dontInsertErrorOutput`: control handling and reporting when parsing encounters errors. By default, the extension does not insert the warning prefix.
- `expectedLanguages` and `dontWarnOnLanguageMismatch`: control language mismatch warnings. Defaults expect `sql` and `plaintext`.
- `settingsFile`: optionally loads the shared JSON formatter settings described below.

The full setting names are prefixed with `poor-mans-t-sql-formatter-pg.`. You can find and edit them through **Preferences: Open Settings** by searching for `Poor Man's SQL`.

### Shared JSON settings file

For settings shared across machines or repositories, set `poor-mans-t-sql-formatter-pg.settingsFile` to a JSON file path. Relative paths resolve from the workspace folder containing the SQL document; an absolute path is also accepted. Values in the file override VS Code settings. The file is read and validated each time SQL is formatted, so edits take effect immediately.

The file uses the option names without the `poor-mans-t-sql-formatter-pg.` prefix. Standard and obfuscation library settings can be grouped under `std` and `min`; custom formatter settings go at the top level:

```json
{
  "compactCaseExpressions": true,
  "caseExpressionOnNewLine": false,
  "inListExpandThreshold": 6,
  "booleanOperatorPosition": "leading",
  "spaceAfterInListComma": false,
  "std": {
    "uppercaseKeywords": true,
    "expandBooleanExpressions": true,
    "expandInLists": false,
    "maxLineWidth": 120
  }
}
```

Unknown option names, invalid value types, malformed JSON, and unreadable files stop formatting and show an error instead of silently falling back. Keep the settings file free of secrets; it is ordinary project configuration and may be committed with the repository.

## Development and tests

Prerequisites: Node.js and npm. From the repository root:

```powershell
npm ci
npm run typecheck
npm run compile-tests
npm run compile
npm run lint
npm test
```

`npm test` launches the VS Code integration suite and downloads the VS Code version selected by `VSCODE_TEST_VERSION` (or the latest stable version when unset). Set `VSCODE_EXECUTABLE_PATH` to an existing VS Code executable to run against that local installation instead. In CI, the suite runs against the latest three supported VS Code minor releases. For interactive extension development, open this folder in VS Code and press **F5**.

The repository includes a Husky pre-commit hook that runs Prettier on staged files, then runs the TypeScript check and integration tests. Install dependencies with `npm ci` to activate it. CI runs the same integration suite against VS Code 1.142, 1.143, and 1.144; update this matrix when newer stable releases become available.

## Limitations

- Formatting is parser-based and is not a full SQL semantic analysis. Review output before executing it.
- The custom procedure-parameter rule targets a procedure declaration with a line-oriented `AS`; unusual declarations or comments embedded in the parameter list may not be rewritten.
- The custom outer-body indentation rule targets the first procedure in the formatted text. Complex scripts with multiple procedure definitions, unusual block structures, or dynamic SQL should be reviewed.
- `caseExpressionOnNewLine` currently targets simple identifier or qualified-identifier assignments immediately followed by `CASE`; it deliberately leaves `CAST(CASE...)` and `CONVERT(...CASE...)` intact.
- `preserveComments: false` removes SQL comments, including comments used by external tools as directives or hints. It does not alter comment-like text inside quoted strings or bracketed identifiers.

## Roadmap

- [x] Add integration tests for formatting commands, selection formatting, custom layout behavior, and shared JSON settings.
- [x] Document current settings, configuration-file precedence, and usage.
- [x] Test automatically against the latest three VS Code minor releases in CI.
- [x] Support optional workspace-relative or absolute JSON settings files.
- [x] Run staged Prettier, typecheck, and integration tests through Husky and lint-staged.

## Background

This project is inspired by the original [Poor Man's T-SQL Formatter VS Code extension](https://github.com/TaoK/poor-mans-t-sql-formatter-vscode-extension), authored by [Tao Klerks](https://github.com/TaoK). The formatter library is maintained at [TaoK/PoorMansTSqlFormatter](https://github.com/TaoK/PoorMansTSqlFormatter).

## Marketplace

Install the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=piotrgredowski.poor-mans-t-sql-formatter-pg).

If the extension is useful, consider leaving a [Marketplace review](https://marketplace.visualstudio.com/items?itemName=piotrgredowski.poor-mans-t-sql-formatter-pg&ssr=false#review-details) or starring the [GitHub repository](https://github.com/piotrgredowski/poor-mans-t-sql-formatter-vscode-extension).
