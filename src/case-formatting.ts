interface SqlToken {
  kind: "case" | "when" | "then" | "else" | "end";
  start: number;
  end: number;
}

interface CaseFrame {
  indent: string;
  when?: SqlToken;
}

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

function findCaseTokens(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;

  while (index < sql.length) {
    const character = sql[index];
    const nextCharacter = sql[index + 1];

    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      index++;
      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            index += 2;
            continue;
          }
          index++;
          break;
        }
        index++;
      }
      continue;
    }

    if (character === "[") {
      index++;
      while (index < sql.length) {
        if (sql[index] === "]") {
          if (sql[index + 1] === "]") {
            index += 2;
            continue;
          }
          index++;
          break;
        }
        index++;
      }
      continue;
    }

    if (character === "-" && nextCharacter === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") {
        index++;
      }
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      index += 2;
      let commentDepth = 1;
      while (index < sql.length && commentDepth > 0) {
        if (sql[index] === "/" && sql[index + 1] === "*") {
          commentDepth++;
          index += 2;
        } else if (sql[index] === "*" && sql[index + 1] === "/") {
          commentDepth--;
          index += 2;
        } else {
          index++;
        }
      }
      continue;
    }

    if (/[A-Za-z_]/.test(character)) {
      const start = index;
      index++;
      while (index < sql.length && /[A-Za-z0-9_$#]/.test(sql[index])) {
        index++;
      }
      const word = sql.slice(start, index).toLowerCase();
      if (
        word === "case" ||
        word === "when" ||
        word === "then" ||
        word === "else" ||
        word === "end"
      ) {
        tokens.push({ kind: word, start, end: index });
      }
      continue;
    }

    index++;
  }

  return tokens;
}

function lineStartAt(sql: string, index: number): number {
  return sql.lastIndexOf("\n", index - 1) + 1;
}

function lineEndAt(sql: string, index: number): number {
  const lineEnd = sql.indexOf("\n", index);
  return lineEnd === -1 ? sql.length : lineEnd;
}

function lineContentEndAt(sql: string, index: number): number {
  const lineEnd = lineEndAt(sql, index);
  return sql[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
}

function indentationAt(sql: string, index: number): string {
  const start = lineStartAt(sql, index);
  const prefix = sql.slice(start, index);
  return /^[\t ]*$/.test(prefix) ? prefix : prefix.match(/^[\t ]*/)?.[0] || "";
}

function visualLength(text: string, spacesPerTab: number): number {
  return text.replace(/\t/g, " ".repeat(spacesPerTab)).length;
}

function addLineIndentEdit(
  sql: string,
  token: SqlToken,
  indent: string,
  edits: TextEdit[]
): void {
  const start = lineStartAt(sql, token.start);
  const prefix = sql.slice(start, token.start);
  if (/^[\t ]*$/.test(prefix) && prefix !== indent) {
    edits.push({ start, end: token.start, text: indent });
  }
}

export function formatCaseExpressions(
  sql: string,
  indentUnit: string,
  spacesPerTab: number,
  maxLineWidth: number
): string {
  const edits: TextEdit[] = [];
  const caseStack: CaseFrame[] = [];

  for (const token of findCaseTokens(sql)) {
    const frame = caseStack[caseStack.length - 1];

    switch (token.kind) {
      case "case": {
        const parentFrame = caseStack[caseStack.length - 1];
        const prefix = sql.slice(lineStartAt(sql, token.start), token.start);
        const caseIndent =
          parentFrame && /\bthen[\t ]+$/i.test(prefix)
            ? `${parentFrame.indent}${indentUnit}${indentUnit}`
            : indentationAt(sql, token.start);
        caseStack.push({ indent: caseIndent });
        const caseLineEnd = lineContentEndAt(sql, token.end);
        const trailingWhitespace = sql.slice(token.end, caseLineEnd);
        if (/^[\t ]+$/.test(trailingWhitespace)) {
          edits.push({
            start: token.end,
            end: caseLineEnd,
            text: "",
          });
        }
        break;
      }
      case "when":
        if (frame) {
          frame.when = token;
        }
        break;
      case "then":
        if (frame?.when) {
          const when = frame.when;
          const whenLineStart = lineStartAt(sql, when.start);
          const thenLineStart = lineStartAt(sql, token.start);
          const conditionAndBreak = sql.slice(when.end, token.start);
          const condition = conditionAndBreak
            .replace(/\r?\n[\t ]*/g, " ")
            .trim();
          const thenLineContentEnd = lineContentEndAt(sql, token.end);
          const result = sql.slice(token.end, thenLineContentEnd).trim();
          const mergedLine = `${
            frame.indent
          }${indentUnit}WHEN ${condition} THEN${result ? ` ${result}` : ""}`;

          if (
            condition &&
            !conditionAndBreak.includes("--") &&
            !conditionAndBreak.includes("/*") &&
            !/\bcase[\t ]*$/i.test(result) &&
            /^[\t ]*$/.test(sql.slice(thenLineStart, token.start)) &&
            visualLength(mergedLine, spacesPerTab) <= maxLineWidth
          ) {
            edits.push({
              start: whenLineStart,
              end: thenLineContentEnd,
              text: mergedLine,
            });
          } else {
            addLineIndentEdit(sql, when, `${frame.indent}${indentUnit}`, edits);
            addLineIndentEdit(
              sql,
              token,
              `${frame.indent}${indentUnit}${indentUnit}`,
              edits
            );
          }
          frame.when = undefined;
        }
        break;
      case "else":
      case "end":
        if (frame) {
          addLineIndentEdit(sql, token, frame.indent, edits);
        }
        if (token.kind === "end" && frame) {
          caseStack.pop();
        }
        break;
    }
  }

  edits.sort((left, right) => right.start - left.start);
  let formattedSql = sql;
  for (const edit of edits) {
    formattedSql =
      formattedSql.slice(0, edit.start) +
      edit.text +
      formattedSql.slice(edit.end);
  }
  return formattedSql;
}
