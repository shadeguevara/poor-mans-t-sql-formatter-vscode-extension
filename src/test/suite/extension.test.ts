import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
  test("exposes compact defaults while keeping list expansion configurable", () => {
    const settings = vscode.workspace.getConfiguration(
      "poor-mans-t-sql-formatter-pg"
    );
    const standardSettings = settings.get<Record<string, unknown>>("std", {});

    assert.strictEqual(settings.get("compactCaseExpressions"), true);
    assert.strictEqual(settings.get("caseExpressionOnNewLine"), false);
    assert.strictEqual(settings.get("castCaseExpressionOnNewLine"), false);
    assert.strictEqual(settings.get("booleanOperatorPosition"), "leading");
    assert.strictEqual(settings.get("booleanExpressionMaxWidth"), 120);
    assert.strictEqual(settings.get("inListExpandThreshold"), 0);
    assert.strictEqual(settings.get("separateInlineComments"), false);
    assert.strictEqual(settings.get("preserveComments"), true);
    assert.strictEqual(standardSettings.statementBreaks, 1);
    assert.strictEqual(standardSettings.expandCommaLists, true);
    assert.strictEqual(standardSettings.expandInLists, false);
    assert.strictEqual(standardSettings.expandCaseStatements, true);
    assert.strictEqual(
      settings.get("procedureParametersOnSeparateLines"),
      true
    );
    assert.strictEqual(settings.get("selectColumnsOnSeparateLines"), true);
    assert.strictEqual(settings.get("separateCommentsFromCode"), true);
    assert.strictEqual(settings.get("spaceAfterInListComma"), false);
    assert.strictEqual(settings.get("indentProcedureBody"), false);
  });

  test("formats compact procedure headers and readable SELECT and CASE blocks", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "sql",
      content: [
        "ALTER PROCEDURE dbo.Sample @First INT, @Second INT",
        "AS",
        "BEGIN",
        "/* Section */",
        "SELECT A = 1, B = CASE WHEN X = 1 AND Y = 2 THEN 'Y' ELSE 'N' END",
        "FROM dbo.T",
        "WHERE Code IN ('A', 'B');",
        "END",
      ].join("\n"),
    });
    const editor = await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand(
      "poor-mans-t-sql-formatter-pg.poorFormatSql"
    );

    const output = document.getText();
    assert.match(
      output,
      /ALTER PROCEDURE dbo\.Sample\r?\n\s+@First INT,\r?\n\s+@Second INT\r?\nAS/
    );
    assert.match(output, /SELECT\r?\n\s+A = 1,\r?\n\s+B = CASE/);
    assert.match(output, /WHEN X = 1 AND Y = 2 THEN 'Y'/);
    assert.match(output, /ELSE 'N'\r?\n\s*END/);
    assert.match(output, /IN \('A','B'\)/);
    assert.match(output, /\/\* Section \*\/\r?\n\r?\nSELECT/);
    assert.match(output, /SELECT\r?\n    A = 1,\r?\n    B = CASE/);

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  test("puts a single procedure parameter on its own line", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "sql",
      content: [
        "ALTER PROCEDURE dbo.SingleParameter @Value INT",
        "AS",
        "BEGIN",
        "SELECT @Value;",
        "END",
      ].join("\n"),
    });
    await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand(
      "poor-mans-t-sql-formatter-pg.poorFormatSql"
    );

    assert.match(
      document.getText(),
      /ALTER PROCEDURE dbo\.SingleParameter\r?\n\s+@Value INT\r?\nAS/
    );
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  test("moves assigned CASE expressions and removes comments when configured", async () => {
    const settings = vscode.workspace.getConfiguration(
      "poor-mans-t-sql-formatter-pg"
    );
    await settings.update(
      "caseExpressionOnNewLine",
      true,
      vscode.ConfigurationTarget.Global
    );
    await settings.update(
      "preserveComments",
      false,
      vscode.ConfigurationTarget.Global
    );

    try {
      const document = await vscode.workspace.openTextDocument({
        language: "sql",
        content: [
          "SELECT Name = CASE WHEN Flag = 1 THEN 'Yes' ELSE 'No' END; -- remove line comment",
          "/* remove block comment */",
          "SELECT Note = '-- keep literal';",
        ].join("\n"),
      });
      await vscode.window.showTextDocument(document);

      await vscode.commands.executeCommand(
        "poor-mans-t-sql-formatter-pg.poorFormatSql"
      );

      const output = document.getText();
      assert.match(
        output,
        /Name =\r?\n\s+CASE\r?\n\s+WHEN Flag = 1 THEN 'Yes'/
      );
      assert.ok(!output.includes("remove line comment"));
      assert.ok(!output.includes("remove block comment"));
      assert.ok(output.includes("'-- keep literal'"));
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
    } finally {
      await settings.update(
        "caseExpressionOnNewLine",
        undefined,
        vscode.ConfigurationTarget.Global
      );
      await settings.update(
        "preserveComments",
        undefined,
        vscode.ConfigurationTarget.Global
      );
    }
  });

  test("supports trailing Boolean operators and expands long IN lists by threshold", async () => {
    const settings = vscode.workspace.getConfiguration(
      "poor-mans-t-sql-formatter-pg"
    );
    await settings.update(
      "booleanOperatorPosition",
      "trailing",
      vscode.ConfigurationTarget.Global
    );
    await settings.update(
      "inListExpandThreshold",
      3,
      vscode.ConfigurationTarget.Global
    );

    try {
      const document = await vscode.workspace.openTextDocument({
        language: "sql",
        content: [
          "SELECT * FROM dbo.T WHERE A = 1 AND B = 2 OR C = 3",
          "AND Code IN (COALESCE(A, B), 'C,D', 'E', 'F')",
          "AND ShortCode IN ('X', 'Y');",
        ].join("\n"),
      });
      await vscode.window.showTextDocument(document);

      await vscode.commands.executeCommand(
        "poor-mans-t-sql-formatter-pg.poorFormatSql"
      );

      const output = document.getText();
      assert.match(output, /A = 1 AND\r?\n\s+B = 2 OR\r?\n\s+C = 3 AND/);
      assert.match(
        output,
        /Code IN \(\r?\n\s+COALESCE\(A, B\),\r?\n\s+'C,D',\r?\n\s+'E',\r?\n\s+'F'\r?\n\s*\)/
      );
      assert.match(output, /ShortCode IN \('X','Y'\)/);
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
    } finally {
      await settings.update(
        "booleanOperatorPosition",
        undefined,
        vscode.ConfigurationTarget.Global
      );
      await settings.update(
        "inListExpandThreshold",
        undefined,
        vscode.ConfigurationTarget.Global
      );
    }
  });

  test("formats CAST CASE expressions, wraps long conditions, and separates inline comments", async () => {
    const settings = vscode.workspace.getConfiguration(
      "poor-mans-t-sql-formatter-pg"
    );
    await settings.update(
      "castCaseExpressionOnNewLine",
      true,
      vscode.ConfigurationTarget.Global
    );
    await settings.update(
      "booleanExpressionMaxWidth",
      35,
      vscode.ConfigurationTarget.Global
    );
    await settings.update(
      "separateInlineComments",
      true,
      vscode.ConfigurationTarget.Global
    );
    await settings.update(
      "std.expandBooleanExpressions",
      false,
      vscode.ConfigurationTarget.Global
    );

    try {
      const document = await vscode.workspace.openTextDocument({
        language: "sql",
        content: [
          "SELECT PayrollCode = CAST(CASE WHEN Flag = 1 THEN 'A' ELSE 'B' END AS CHAR(1)),",
          "ConvertedCode = CONVERT(CHAR(1), CASE WHEN Flag = 1 THEN 'Y' ELSE 'N' END, 112)",
          "WHERE A = 1 AND B = 2 AND C = 3 AND D = 4 -- long predicate note",
          "AND HireDate BETWEEN 1 AND 10 AND Active = 1",
          "AND Note = '-- keep literal';",
        ].join("\n"),
      });
      await vscode.window.showTextDocument(document);

      await vscode.commands.executeCommand(
        "poor-mans-t-sql-formatter-pg.poorFormatSql"
      );

      const output = document.getText();
      assert.match(
        output,
        /PayrollCode = CAST\(\r?\n\s+CASE\r?\n\s+WHEN Flag = 1 THEN 'A'/
      );
      assert.match(
        output,
        /CONVERT\(CHAR\(1\),\r?\n\s+CASE\r?\n\s+WHEN Flag = 1 THEN 'Y'/
      );
      assert.match(
        output,
        /A = 1\r?\n\s+AND B = 2\r?\n\s+AND C = 3\r?\n\s+AND D = 4/
      );
      assert.match(output, /D = 4\r?\n\s+-- long predicate note/);
      assert.match(
        output,
        /HireDate BETWEEN 1\r?\n\s+AND 10\r?\n\s+AND Active = 1/
      );
      assert.ok(output.includes("'-- keep literal'"));
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
    } finally {
      await settings.update(
        "castCaseExpressionOnNewLine",
        undefined,
        vscode.ConfigurationTarget.Global
      );
      await settings.update(
        "booleanExpressionMaxWidth",
        undefined,
        vscode.ConfigurationTarget.Global
      );
      await settings.update(
        "separateInlineComments",
        undefined,
        vscode.ConfigurationTarget.Global
      );
      await settings.update(
        "std.expandBooleanExpressions",
        undefined,
        vscode.ConfigurationTarget.Global
      );
    }
  });

  test("formats only the selected SQL range through the extension command", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "sql",
      content: "select a=1; select b=2;",
    });
    const editor = await vscode.window.showTextDocument(document);
    const selectionStart = document.positionAt(
      document.getText().indexOf("select b")
    );
    editor.selection = new vscode.Selection(
      selectionStart,
      document.positionAt(document.getText().length)
    );

    await vscode.commands.executeCommand(
      "poor-mans-t-sql-formatter-pg.poorFormatSelectionSql"
    );

    const output = document.getText();
    assert.match(output, /^select a=1;/);
    assert.match(output, /SELECT\r?\n\s+b = 2;/);
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  test("loads formatter options from the configured JSON settings file", async () => {
    const settings = vscode.workspace.getConfiguration(
      "poor-mans-t-sql-formatter-pg"
    );
    const settingsFile = path.join(
      os.tmpdir(),
      `poor-mans-sql-settings-${Date.now()}.json`
    );
    const settingsUri = vscode.Uri.file(settingsFile);
    await vscode.workspace.fs.writeFile(
      settingsUri,
      Buffer.from(
        JSON.stringify({
          std: { uppercaseKeywords: false },
          spaceAfterInListComma: true,
        })
      )
    );
    await settings.update(
      "settingsFile",
      settingsFile,
      vscode.ConfigurationTarget.Global
    );

    try {
      const document = await vscode.workspace.openTextDocument({
        language: "sql",
        content: "SELECT Code FROM dbo.T WHERE Code IN ('A','B');",
      });
      await vscode.window.showTextDocument(document);

      await vscode.commands.executeCommand(
        "poor-mans-t-sql-formatter-pg.poorFormatSql"
      );

      const output = document.getText();
      assert.match(output, /select/);
      assert.match(output, /IN \('A', 'B'\)/i);
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
    } finally {
      await settings.update(
        "settingsFile",
        undefined,
        vscode.ConfigurationTarget.Global
      );
      await vscode.workspace.fs.delete(settingsUri);
    }
  });
});
