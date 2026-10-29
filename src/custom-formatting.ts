interface WordToken {
  word: string;
  start: number;
  end: number;
}

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

interface CommentBlock {
  start: number;
  end: number;
  kind: "line" | "block";
  closingStart?: number;
}

function lineStartAt(sql: string, index: number): number {
  return sql.lastIndexOf("\n", index - 1) + 1;
}

function lineEndAt(sql: string, index: number): number {
  const end = sql.indexOf("\n", index);
  return end === -1 ? sql.length : end + 1;
}

function lineContentEndAt(sql: string, index: number): number {
  const end = lineEndAt(sql, index);
  let contentEnd = end;
  if (sql[contentEnd - 1] === "\n") {
    contentEnd--;
  }
  if (sql[contentEnd - 1] === "\r") {
    contentEnd--;
  }
  return contentEnd;
}

function lineIndentAt(sql: string, index: number): string {
  const start = lineStartAt(sql, index);
  return sql.slice(start, index).match(/^[\t ]*/)?.[0] || "";
}

function skipQuoted(sql: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index++;
  }
  return index;
}

function skipBlockComment(sql: string, start: number): number {
  let index = start + 2;
  let depth = 1;
  while (index < sql.length && depth > 0) {
    if (sql[index] === "/" && sql[index + 1] === "*") {
      depth++;
      index += 2;
    } else if (sql[index] === "*" && sql[index + 1] === "/") {
      depth--;
      index += 2;
    } else {
      index++;
    }
  }
  return index;
}

export function stripSqlComments(sql: string): string {
  let result = "";
  let copyFrom = 0;
  let index = 0;

  while (index < sql.length) {
    const character = sql[index];
    if (character === "'" || character === '"' || character === "`") {
      index = skipQuoted(sql, index, character);
    } else if (character === "[") {
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
    } else if (character === "-" && sql[index + 1] === "-") {
      result += sql.slice(copyFrom, index);
      const newline = sql.indexOf("\n", index);
      index = newline === -1 ? sql.length : newline;
      copyFrom = index;
    } else if (character === "/" && sql[index + 1] === "*") {
      result += sql.slice(copyFrom, index);
      const end = skipBlockComment(sql, index);
      const comment = sql.slice(index, end);
      const lineBreaks = comment.match(/\r\n|\r|\n/g)?.join("") || " ";
      result += lineBreaks;
      index = end;
      copyFrom = end;
    } else {
      index++;
    }
  }

  return result + sql.slice(copyFrom);
}

function findWords(sql: string): WordToken[] {
  const words: WordToken[] = [];
  let index = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (character === "'" || character === '"' || character === "`") {
      index = skipQuoted(sql, index, character);
    } else if (character === "[") {
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
    } else if (character === "-" && sql[index + 1] === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") {
        index++;
      }
    } else if (character === "/" && sql[index + 1] === "*") {
      index = skipBlockComment(sql, index);
    } else if (/[A-Za-z_]/.test(character)) {
      const start = index++;
      while (index < sql.length && /[A-Za-z0-9_$#]/.test(sql[index])) {
        index++;
      }
      words.push({
        word: sql.slice(start, index).toLowerCase(),
        start,
        end: index,
      });
    } else {
      index++;
    }
  }
  return words;
}

function splitTopLevelCommas(sql: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let index = 0;
  let depth = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (character === "'" || character === '"' || character === "`") {
      index = skipQuoted(sql, index, character);
    } else if (character === "[") {
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
    } else if (character === "-" && sql[index + 1] === "-") {
      while (index < sql.length && sql[index] !== "\n") {
        index++;
      }
    } else if (character === "/" && sql[index + 1] === "*") {
      index = skipBlockComment(sql, index);
    } else if (character === "(") {
      depth++;
      index++;
    } else if (character === ")") {
      depth--;
      index++;
    } else if (character === "," && depth === 0) {
      parts.push(sql.slice(start, index).trim());
      start = index + 1;
      index++;
    } else {
      index++;
    }
  }
  parts.push(sql.slice(start).trim());
  return parts;
}

export function formatProcedureParameters(
  sql: string,
  indentUnit: string
): string {
  const words = findWords(sql);
  const procedureToken = words.find(
    (token) => token.word === "procedure" || token.word === "proc"
  );
  if (!procedureToken) {
    return sql;
  }

  const asToken = words.find((token) => {
    if (token.start <= procedureToken.end || token.word !== "as") {
      return false;
    }
    const lineStart = lineStartAt(sql, token.start);
    return /^[\t ]*$/.test(sql.slice(lineStart, token.start));
  });
  if (!asToken) {
    return sql;
  }

  const header = sql.slice(procedureToken.end, asToken.start);
  const parameterStartMatch = /@[\w#$]+/.exec(header);
  if (!parameterStartMatch) {
    return sql;
  }
  const parameterStart = procedureToken.end + parameterStartMatch.index;
  const parameterText = sql.slice(parameterStart, asToken.start).trim();
  if (
    !parameterText ||
    parameterText.includes("--") ||
    parameterText.includes("/*")
  ) {
    return sql;
  }

  const parameters = splitTopLevelCommas(parameterText);
  if (parameters.some((parameter) => !parameter)) {
    return sql;
  }

  const headerPrefix = sql.slice(0, parameterStart).trimEnd();
  const procedureIndent = lineIndentAt(sql, procedureToken.start);
  const parameterIndent = `${procedureIndent}${indentUnit}`;
  const asLineStart = lineStartAt(sql, asToken.start);
  const asIndent = sql.slice(asLineStart, asToken.start);
  const lineEnding = sql.includes("\r\n") ? "\r\n" : "\n";

  return (
    `${headerPrefix}${lineEnding}${parameterIndent}` +
    parameters.join(`,${lineEnding}${parameterIndent}`) +
    `${lineEnding}${asIndent}${sql.slice(asToken.start)}`
  );
}

export function formatProcedureBodyIndent(
  sql: string,
  indentUnit: string,
  indentBody: boolean
): string {
  if (indentBody) {
    return sql;
  }
  const words = findWords(sql);
  const procedureToken = words.find(
    (token) => token.word === "procedure" || token.word === "proc"
  );
  if (!procedureToken) {
    return sql;
  }
  const asToken = words.find(
    (token) =>
      token.word === "as" &&
      token.start > procedureToken.end &&
      /^[\t ]*$/.test(sql.slice(lineStartAt(sql, token.start), token.start))
  );
  const beginToken = asToken
    ? words.find((token) => token.word === "begin" && token.start > asToken.end)
    : undefined;
  if (!beginToken) {
    return sql;
  }

  let blockDepth = 0;
  let caseDepth = 0;
  let bodyEnd: number | undefined;
  let bodyStarted = false;
  for (const token of words) {
    if (token.start < beginToken.start) {
      continue;
    }
    if (token.word === "case") {
      caseDepth++;
    } else if (token.word === "begin") {
      blockDepth++;
      bodyStarted = true;
    } else if (token.word === "end") {
      if (caseDepth > 0) {
        caseDepth--;
      } else if (bodyStarted && --blockDepth === 0) {
        bodyEnd = token.end;
        break;
      }
    }
  }
  if (bodyEnd === undefined) {
    return sql;
  }

  const bodyStartLine = lineEndAt(sql, beginToken.end);
  const bodyEndLine = lineContentEndAt(sql, bodyEnd);
  const body = sql.slice(bodyStartLine, bodyEndLine);
  const unindented = body
    .split(/(?<=\n)/)
    .map((line) =>
      line.startsWith(indentUnit) ? line.slice(indentUnit.length) : line
    )
    .join("");
  return sql.slice(0, bodyStartLine) + unindented + sql.slice(bodyEndLine);
}

export function formatSelectProjectionLists(
  sql: string,
  indentUnit: string
): string {
  const edits: TextEdit[] = [];
  const words = findWords(sql);
  const lineEnding = sql.includes("\r\n") ? "\r\n" : "\n";
  for (const token of words) {
    if (token.word !== "select") {
      continue;
    }
    const lineEnd = lineContentEndAt(sql, token.end);
    const suffix = sql.slice(token.end, lineEnd);
    const modifier = /^[\t ]*(?:distinct|all)\b[\t ]*/i.exec(suffix);
    const insertionPoint = token.end + (modifier?.[0].length || 0);
    const remainder = sql.slice(insertionPoint, lineEnd);
    if (!/[^\t ]/.test(remainder) || remainder.includes("--")) {
      continue;
    }
    const indent = `${lineIndentAt(sql, token.start)}${indentUnit}`;
    edits.push({
      start: insertionPoint,
      end: insertionPoint + (remainder.match(/^[\t ]*/)?.[0].length || 0),
      text: `${lineEnding}${indent}`,
    });
  }
  return applyEdits(sql, edits);
}

export function formatCaseExpressionPlacement(
  sql: string,
  indentUnit: string,
  onNewLine: boolean
): string {
  if (!onNewLine) {
    return sql;
  }

  const edits: TextEdit[] = [];
  const lineEnding = sql.includes("\r\n") ? "\r\n" : "\n";
  for (const token of findWords(sql)) {
    if (token.word !== "case") {
      continue;
    }
    const lineStart = lineStartAt(sql, token.start);
    const prefix = sql.slice(lineStart, token.start);
    const assignment =
      /^[\t ]*(?:@?[\w#$]+|\[[^\]]+\])(?:\s*\.\s*(?:[\w#$]+|\[[^\]]+\]))*[\t ]*=[\t ]*$/.test(
        prefix
      );
    if (!assignment) {
      continue;
    }

    const equalsIndex = prefix.lastIndexOf("=");
    const indent = `${lineIndentAt(sql, token.start)}${indentUnit}`;
    edits.push({
      start: lineStart + equalsIndex + 1,
      end: token.start,
      text: `${lineEnding}${indent}`,
    });
  }
  return applyEdits(sql, edits);
}

export function formatCastCaseExpressionPlacement(
  sql: string,
  indentUnit: string,
  onNewLine: boolean
): string {
  if (!onNewLine) {
    return sql;
  }

  const edits: TextEdit[] = [];
  const lineEnding = sql.includes("\r\n") ? "\r\n" : "\n";
  for (const token of findWords(sql)) {
    if (token.word !== "case") {
      continue;
    }

    const lineStart = lineStartAt(sql, token.start);
    const prefix = sql.slice(lineStart, token.start);
    const wrappedAssignment =
      /^[\t ]*(?:@?[\w#$]+|\[[^\]]+\])(?:\s*\.\s*(?:[\w#$]+|\[[^\]]+\]))*[\t ]*=[\t ]*(?:CAST\s*\(|CONVERT\s*\(.*,[\t ]*)$/i.test(
        prefix
      );
    if (!wrappedAssignment) {
      continue;
    }

    const whitespace = prefix.match(/[\t ]*$/)?.[0] || "";
    edits.push({
      start: token.start - whitespace.length,
      end: token.start,
      text: `${lineEnding}${lineIndentAt(sql, token.start)}${indentUnit}`,
    });
  }
  return applyEdits(sql, edits);
}

export function formatInListCommaSpacing(
  sql: string,
  spaceAfterComma: boolean
): string {
  const edits: TextEdit[] = [];
  const words = findWords(sql);
  for (const token of words) {
    if (token.word !== "in") {
      continue;
    }
    let openParen = token.end;
    while (openParen < sql.length && /[\t \r\n]/.test(sql[openParen])) {
      openParen++;
    }
    if (sql[openParen] !== "(") {
      continue;
    }

    let depth = 1;
    let index = openParen + 1;
    while (index < sql.length && depth > 0) {
      const character = sql[index];
      if (character === "'" || character === '"' || character === "`") {
        index = skipQuoted(sql, index, character);
      } else if (character === "[") {
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
      } else if (character === "-" && sql[index + 1] === "-") {
        while (index < sql.length && sql[index] !== "\n") {
          index++;
        }
      } else if (character === "/" && sql[index + 1] === "*") {
        index = skipBlockComment(sql, index);
      } else if (character === "(") {
        depth++;
        index++;
      } else if (character === ")") {
        depth--;
        index++;
      } else if (character === "," && depth === 1) {
        const whitespaceStart = index + 1;
        let whitespaceEnd = whitespaceStart;
        while (
          whitespaceEnd < sql.length &&
          /[\t \r\n]/.test(sql[whitespaceEnd])
        ) {
          whitespaceEnd++;
        }
        const whitespace = sql.slice(whitespaceStart, whitespaceEnd);
        if (!whitespace.includes("\n")) {
          const desiredWhitespace = spaceAfterComma ? " " : "";
          if (whitespace !== desiredWhitespace) {
            edits.push({
              start: whitespaceStart,
              end: whitespaceEnd,
              text: desiredWhitespace,
            });
          }
        }
        index++;
      } else {
        index++;
      }
    }
  }
  return applyEdits(sql, edits);
}

export function expandLongInLists(
  sql: string,
  maxItemsInline: number,
  indentUnit: string
): string {
  if (!Number.isFinite(maxItemsInline) || maxItemsInline < 1) {
    return sql;
  }

  const edits: TextEdit[] = [];
  const words = findWords(sql);
  const lineEnding = sql.includes("\r\n") ? "\r\n" : "\n";

  for (const token of words) {
    if (token.word !== "in") {
      continue;
    }

    let openParen = token.end;
    while (openParen < sql.length && /[\t \r\n]/.test(sql[openParen])) {
      openParen++;
    }
    if (sql[openParen] !== "(") {
      continue;
    }

    let depth = 1;
    let index = openParen + 1;
    const commas: number[] = [];
    let hasComment = false;
    while (index < sql.length && depth > 0) {
      const character = sql[index];
      if (character === "'" || character === '"' || character === "`") {
        index = skipQuoted(sql, index, character);
      } else if (character === "[") {
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
      } else if (character === "-" && sql[index + 1] === "-") {
        hasComment = true;
        while (index < sql.length && sql[index] !== "\n") {
          index++;
        }
      } else if (character === "/" && sql[index + 1] === "*") {
        hasComment = true;
        index = skipBlockComment(sql, index);
      } else if (character === "(") {
        depth++;
        index++;
      } else if (character === ")") {
        depth--;
        index++;
      } else if (character === "," && depth === 1) {
        commas.push(index++);
      } else {
        index++;
      }
    }
    if (depth !== 0 || commas.length + 1 <= maxItemsInline) {
      continue;
    }

    const closeParen = index - 1;
    const listContents = sql.slice(openParen + 1, closeParen);
    if (
      findWords(listContents)[0]?.word === "select" ||
      hasComment ||
      /\r?\n/.test(listContents)
    ) {
      continue;
    }

    const listIndent = `${lineIndentAt(sql, token.start)}${indentUnit}`;
    let firstValueStart = openParen + 1;
    while (firstValueStart < closeParen && /[\t ]/.test(sql[firstValueStart])) {
      firstValueStart++;
    }
    edits.push({
      start: openParen + 1,
      end: firstValueStart,
      text: `${lineEnding}${listIndent}`,
    });

    for (const comma of commas) {
      let whitespaceEnd = comma + 1;
      while (whitespaceEnd < closeParen && /[\t ]/.test(sql[whitespaceEnd])) {
        whitespaceEnd++;
      }
      edits.push({
        start: comma + 1,
        end: whitespaceEnd,
        text: `${lineEnding}${listIndent}`,
      });
    }

    let closingWhitespaceStart = closeParen;
    while (
      closingWhitespaceStart > openParen &&
      /[\t ]/.test(sql[closingWhitespaceStart - 1])
    ) {
      closingWhitespaceStart--;
    }
    edits.push({
      start: closingWhitespaceStart,
      end: closeParen,
      text: `${lineEnding}${lineIndentAt(sql, token.start)}`,
    });
  }

  return applyEdits(sql, edits);
}

export function formatBooleanOperatorPosition(
  sql: string,
  position: "leading" | "trailing"
): string {
  if (position === "leading") {
    return sql;
  }

  const edits: TextEdit[] = [];
  for (const token of findWords(sql)) {
    if (token.word !== "and" && token.word !== "or") {
      continue;
    }

    const operatorLineStart = lineStartAt(sql, token.start);
    const prefix = sql.slice(operatorLineStart, token.start);
    if (!/^[\t ]*$/.test(prefix) || operatorLineStart === 0) {
      continue;
    }

    const previousLineEnd = lineContentEndAt(sql, operatorLineStart - 1);
    const previousLineStart = lineStartAt(sql, previousLineEnd);
    const previousLine = sql.slice(previousLineStart, previousLineEnd);
    if (!previousLine.trim() || previousLine.includes("--")) {
      continue;
    }

    let operatorSuffixEnd = token.end;
    while (
      operatorSuffixEnd < sql.length &&
      /[\t ]/.test(sql[operatorSuffixEnd])
    ) {
      operatorSuffixEnd++;
    }
    edits.push({
      start: previousLineEnd,
      end: previousLineEnd,
      text: ` ${sql.slice(token.start, token.end)}`,
    });
    edits.push({
      start: token.start,
      end: operatorSuffixEnd,
      text: "",
    });
  }

  return applyEdits(sql, edits);
}

export function formatBooleanExpressionWrapping(
  sql: string,
  maxLineWidth: number,
  indentUnit: string,
  spacesPerTab: number
): string {
  if (!Number.isFinite(maxLineWidth) || maxLineWidth <= 0) {
    return sql;
  }

  const tokens = findWords(sql);
  const lineEnding = sql.includes("\r\n") ? "\r\n" : "\n";
  const edits: TextEdit[] = [];
  let tokenIndex = 0;
  let betweenNeedsAnd = false;

  while (tokenIndex < tokens.length) {
    const currentLineStart = lineStartAt(sql, tokens[tokenIndex].start);
    const lineEnd = lineContentEndAt(sql, tokens[tokenIndex].start);
    const lineTokens: WordToken[] = [];
    while (
      tokenIndex < tokens.length &&
      lineStartAt(sql, tokens[tokenIndex].start) === currentLineStart
    ) {
      lineTokens.push(tokens[tokenIndex++]);
    }

    const line = sql.slice(currentLineStart, lineEnd);
    const lineExceedsLimit =
      line.replace(/\t/g, " ".repeat(spacesPerTab)).length > maxLineWidth;
    const lineIndent = line.match(/^[\t ]*/)?.[0] || "";
    for (const token of lineTokens) {
      if (token.word === "between") {
        betweenNeedsAnd = true;
        continue;
      }
      if (token.word !== "and" && token.word !== "or") {
        continue;
      }

      const isBetweenAnd = token.word === "and" && betweenNeedsAnd;
      betweenNeedsAnd = false;
      if (isBetweenAnd || !lineExceedsLimit) {
        continue;
      }

      const whitespaceStart =
        token.start -
        (sql.slice(currentLineStart, token.start).match(/[\t ]*$/)?.[0]
          .length || 0);
      if (whitespaceStart === token.start) {
        continue;
      }
      edits.push({
        start: whitespaceStart,
        end: token.start,
        text: `${lineEnding}${lineIndent}${indentUnit}`,
      });
    }
  }

  return applyEdits(sql, edits);
}

export function formatInlineComments(sql: string): string {
  const edits: TextEdit[] = [];
  const lineEnding = sql.includes("\r\n") ? "\r\n" : "\n";
  let index = 0;

  while (index < sql.length) {
    const character = sql[index];
    if (character === "'" || character === '"' || character === "`") {
      index = skipQuoted(sql, index, character);
    } else if (character === "[") {
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
    } else if (character === "-" && sql[index + 1] === "-") {
      const lineStart = lineStartAt(sql, index);
      const prefix = sql.slice(lineStart, index);
      if (/[^\t ]/.test(prefix)) {
        const whitespaceStart =
          index - (prefix.match(/[\t ]*$/)?.[0].length || 0);
        edits.push({
          start: whitespaceStart,
          end: index,
          text: `${lineEnding}${lineIndentAt(sql, index)}`,
        });
      }
      index = lineContentEndAt(sql, index);
    } else if (character === "/" && sql[index + 1] === "*") {
      index = skipBlockComment(sql, index);
    } else {
      index++;
    }
  }

  return applyEdits(sql, edits);
}

function findStandaloneCommentBlocks(sql: string): CommentBlock[] {
  const comments: CommentBlock[] = [];
  let index = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (character === "'" || character === '"' || character === "`") {
      index = skipQuoted(sql, index, character);
    } else if (character === "[") {
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
    } else if (character === "-" && sql[index + 1] === "-") {
      const start = index;
      const end = lineContentEndAt(sql, index);
      const startLine = lineStartAt(sql, start);
      if (/^[\t ]*$/.test(sql.slice(startLine, start))) {
        const lineEnd = lineEndAt(sql, end);
        const previous = comments[comments.length - 1];
        if (
          previous?.kind === "line" &&
          lineStartAt(sql, previous.end) === startLine
        ) {
          previous.end = lineEnd;
        } else {
          comments.push({ start: startLine, end: lineEnd, kind: "line" });
        }
      }
      index = end;
    } else if (character === "/" && sql[index + 1] === "*") {
      const start = index;
      const end = skipBlockComment(sql, start);
      const startLine = lineStartAt(sql, start);
      const endLineStart = lineStartAt(sql, Math.max(start, end - 1));
      const endLine = lineContentEndAt(sql, end);
      const standalone =
        /^[\t ]*$/.test(sql.slice(startLine, start)) &&
        /^[\t ]*$/.test(sql.slice(end, endLine));
      if (standalone) {
        comments.push({
          start: startLine,
          end: lineEndAt(sql, endLine),
          kind: "block",
          closingStart: endLineStart,
        });
      }
      index = end;
    } else {
      index++;
    }
  }
  return comments;
}

export function formatCommentSpacing(sql: string): string {
  const edits: TextEdit[] = [];
  const comments = findStandaloneCommentBlocks(sql);
  const lineEnding = sql.includes("\r\n") ? "\r\n" : "\n";

  for (const comment of comments) {
    const openingLineEnd = lineContentEndAt(sql, comment.start);
    let followingLineStart = comment.end;
    let followingLineEnd = lineContentEndAt(sql, followingLineStart);
    let nextLine = sql.slice(followingLineStart, followingLineEnd);
    while (
      followingLineStart < sql.length &&
      !nextLine.trim() &&
      followingLineEnd < sql.length
    ) {
      followingLineStart = lineEndAt(sql, followingLineStart);
      followingLineEnd = lineContentEndAt(sql, followingLineStart);
      nextLine = sql.slice(followingLineStart, followingLineEnd);
    }
    const nextIndent = nextLine.match(/^[\t ]*/)?.[0] || "";
    const openingIndent =
      sql.slice(comment.start, openingLineEnd).match(/^[\t ]*/)?.[0] || "";
    if (openingIndent !== nextIndent) {
      edits.push({
        start: comment.start,
        end: comment.start + openingIndent.length,
        text: nextIndent,
      });
    }

    if (
      comment.closingStart !== undefined &&
      comment.closingStart !== comment.start
    ) {
      const closingIndent =
        sql
          .slice(
            comment.closingStart,
            lineContentEndAt(sql, comment.closingStart)
          )
          .match(/^[\t ]*/)?.[0] || "";
      if (closingIndent !== nextIndent) {
        edits.push({
          start: comment.closingStart,
          end: comment.closingStart + closingIndent.length,
          text: nextIndent,
        });
      }
    }

    const precedingLineEnd = comment.start > 0 ? comment.start - 1 : -1;
    const precedingLineStart =
      precedingLineEnd >= 0 ? lineStartAt(sql, precedingLineEnd) : -1;
    const precedingLine = sql.slice(precedingLineStart, precedingLineEnd);
    if (
      precedingLineStart >= 0 &&
      precedingLine.trim().length > 0 &&
      comment.start > 0
    ) {
      edits.push({
        start: comment.start,
        end: comment.start,
        text: lineEnding,
      });
    }

    if (
      comment.end < sql.length &&
      nextLine.trim().length > 0 &&
      followingLineStart === comment.end
    ) {
      edits.push({
        start: comment.end,
        end: comment.end,
        text: lineEnding,
      });
    }
  }
  return applyEdits(sql, edits);
}

function applyEdits(sql: string, edits: TextEdit[]): string {
  edits.sort((left, right) => right.start - left.start);
  let result = sql;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
