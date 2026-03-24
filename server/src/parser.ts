import {
  Diagnostic,
  DiagnosticSeverity,
  DocumentSymbol,
  FoldingRange,
  FoldingRangeKind,
  Position,
  Range,
  SymbolKind
} from 'vscode-languageserver/node';

interface HeaderInfo {
  delimiter: string;
  indentUnit?: string;
  strictMode: boolean;
}

interface ItemNode {
  anonymous: boolean;
  children: ItemNode[];
  childNames: Map<string, number>;
  depth: number;
  endLine: number;
  line: number;
  name: string;
}

interface BlockState {
  closeToken: string;
  line: number;
  kind: FoldingRangeKind | undefined;
  type: 'comment' | 'raw' | 'code' | 'quote';
}

export interface ParsedDocument {
  diagnostics: Diagnostic[];
  foldingRanges: FoldingRange[];
  symbols: DocumentSymbol[];
}

const DEFAULT_DELIMITER = '`';
const HEADER_PREFIX = '.nana-lang';

export function parseDocument(text: string): ParsedDocument {
  const diagnostics: Diagnostic[] = [];
  const foldingRanges: FoldingRange[] = [];
  const root: ItemNode = {
    anonymous: true,
    children: [],
    childNames: new Map<string, number>(),
    depth: -1,
    endLine: 0,
    line: 0,
    name: 'root'
  };

  const lines = text.split(/\r?\n/);
  const stack: ItemNode[] = [];
  const blockStack: BlockState[] = [];

  let header = parseHeader(lines[0] ?? '', diagnostics);
  let indentUnit = header.indentUnit;
  let pendingJoinLine: number | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineText = lines[lineIndex];
    const trimmed = lineText.trim();

    if (lineIndex === 0) {
      if (!trimmed.startsWith(HEADER_PREFIX)) {
        diagnostics.push(
          createDiagnostic(
            lineIndex,
            0,
            Math.max(1, trimmed.length),
            'The first line should declare the file as .nana-lang.',
            DiagnosticSeverity.Error
          )
        );
      }
      continue;
    }

    if (blockStack.length > 0) {
      const activeBlock = blockStack[blockStack.length - 1];
      if (isMatchingBlockClose(trimmed, activeBlock, header.delimiter)) {
        blockStack.pop();
        if (lineIndex > activeBlock.line) {
          foldingRanges.push({
            startLine: activeBlock.line,
            endLine: lineIndex,
            kind: activeBlock.kind
          });
        }
      } else if (activeBlock.type === 'comment' && isCommentBlockOpen(trimmed, header.delimiter)) {
        blockStack.push({
          closeToken: '!!' + header.delimiter,
          kind: FoldingRangeKind.Comment,
          line: lineIndex,
          type: 'comment'
        });
      }
      continue;
    }

    if (trimmed === '') {
      continue;
    }

    if (trimmed.startsWith(HEADER_PREFIX)) {
      header = parseHeader(trimmed, diagnostics, lineIndex);
      indentUnit = header.indentUnit ?? indentUnit;
      stack.length = 0;
      continue;
    }

    const indentMatch = lineText.match(/^\s*/);
    const indent = indentMatch?.[0] ?? '';
    const content = lineText.slice(indent.length);

    if (pendingJoinLine !== undefined) {
      pendingJoinLine = undefined;
    }

    if (/\t/.test(indent) && / /.test(indent)) {
      diagnostics.push(
        createDiagnostic(
          lineIndex,
          0,
          indent.length,
          'Mixed tabs and spaces make Nana indentation ambiguous.',
          DiagnosticSeverity.Warning
        )
      );
    }

    if (!indentUnit && indent.length > 0) {
      indentUnit = inferIndentUnit(indent);
    }

    const depth = getIndentDepth(indent, indentUnit, lineIndex, diagnostics);

    if (startsWithCommand(content, header.delimiter, '!') && !startsWithCommand(content, header.delimiter, '!!')) {
      continue;
    }

    if (startsWithCommand(content, header.delimiter, '!!')) {
      if (isCommentBlockOpen(trimmed, header.delimiter)) {
        blockStack.push({
          closeToken: '!!' + header.delimiter,
          kind: FoldingRangeKind.Comment,
          line: lineIndex,
          type: 'comment'
        });
      }
      continue;
    }

    if (startsWithCommand(content, header.delimiter, '((')) {
      blockStack.push({
        closeToken: '))',
        kind: FoldingRangeKind.Region,
        line: lineIndex,
        type: 'raw'
      });
      continue;
    }

    if (startsWithCommand(content, header.delimiter, '{{')) {
      blockStack.push({
        closeToken: '}}',
        kind: FoldingRangeKind.Region,
        line: lineIndex,
        type: 'code'
      });
      continue;
    }

    if (startsWithCommand(content, header.delimiter, "''")) {
      blockStack.push({
        closeToken: "''",
        kind: FoldingRangeKind.Region,
        line: lineIndex,
        type: 'quote'
      });
      continue;
    }

    if (hasUnclosedInlineRaw(content, header.delimiter)) {
      diagnostics.push(
        createDiagnostic(
          lineIndex,
          content.indexOf(header.delimiter),
          content.length,
          'Inline raw text opened with `(` is missing a closing )`.',
          DiagnosticSeverity.Error
        )
      );
    }

    if (endsWithJoin(content, header.delimiter)) {
      pendingJoinLine = lineIndex;
    }

    const item = createItemNode(content, lineIndex, depth, header.delimiter);
    if (!item) {
      continue;
    }

    while (stack.length > depth) {
      stack.pop();
    }

    const parent = depth === 0 ? root : stack[depth - 1];
    if (!parent) {
      diagnostics.push(
        createDiagnostic(
          lineIndex,
          0,
          indent.length,
          'Indentation skipped a parent level.',
          DiagnosticSeverity.Error
        )
      );
      continue;
    }

    if (header.strictMode && !item.anonymous) {
      const normalizedName = item.name.toLowerCase();
      const previousLine = parent.childNames.get(normalizedName);
      if (previousLine !== undefined) {
        diagnostics.push(
          createDiagnostic(
            lineIndex,
            indent.length,
            indent.length + item.name.length,
            `Duplicate item "${item.name}" is not allowed in strict mode.`,
            DiagnosticSeverity.Warning
          )
        );
        diagnostics.push(
          createDiagnostic(
            previousLine,
            0,
            lines[previousLine]?.length ?? 1,
            `Previous declaration of "${item.name}" is here.`,
            DiagnosticSeverity.Hint
          )
        );
      } else {
        parent.childNames.set(normalizedName, lineIndex);
      }
    }

    parent.children.push(item);
    stack[depth] = item;
  }

  if (pendingJoinLine !== undefined) {
    diagnostics.push(
      createDiagnostic(
        pendingJoinLine,
        0,
        lines[pendingJoinLine]?.length ?? 1,
        'Join commands (`&, `&&, `&&&) must be followed by another content line.',
        DiagnosticSeverity.Error
      )
    );
  }

  for (const block of blockStack) {
    diagnostics.push(
      createDiagnostic(
        block.line,
        0,
        lines[block.line]?.length ?? 1,
        `Unclosed ${block.type} block; expected ${block.closeToken}.`,
        DiagnosticSeverity.Error
      )
    );
  }

  finalizeTree(root);

  for (const child of root.children) {
    collectFoldingRanges(child, foldingRanges);
  }

  const symbols = root.children.map(toDocumentSymbol);

  return {
    diagnostics,
    foldingRanges,
    symbols
  };
}

function parseHeader(line: string, diagnostics: Diagnostic[], lineIndex = 0): HeaderInfo {
  const trimmed = line.trim();
  const defaults: HeaderInfo = {
    delimiter: DEFAULT_DELIMITER,
    strictMode: false
  };

  if (!trimmed.startsWith(HEADER_PREFIX)) {
    return defaults;
  }

  const rest = trimmed.slice(HEADER_PREFIX.length).trimStart();
  if (rest.length === 0) {
    diagnostics.push(
      createDiagnostic(
        lineIndex,
        0,
        Math.max(1, line.length),
        'Header should include a version such as ".nana-lang 0.8s".',
        DiagnosticSeverity.Warning
      )
    );
    return defaults;
  }

  const versionMatch = rest.match(/^(\S+)([\s\S]*)$/);
  if (!versionMatch) {
    return defaults;
  }

  const version = versionMatch[1];
  const suffix = versionMatch[2] ?? '';
  const trimmedSuffix = suffix.trimEnd();
  const delimiter = trimmedSuffix.length > 0 ? trimmedSuffix.slice(-1) : DEFAULT_DELIMITER;
  const indentCandidate = trimmedSuffix.length > 0 ? trimmedSuffix.slice(0, -1) : '';

  return {
    delimiter,
    indentUnit: indentCandidate.length > 0 ? indentCandidate : undefined,
    strictMode: version.endsWith('s')
  };
}

function inferIndentUnit(indent: string): string | undefined {
  if (/^\t+$/.test(indent)) {
    return '\t';
  }

  if (/^ +$/.test(indent)) {
    return indent;
  }

  return undefined;
}

function getIndentDepth(
  indent: string,
  indentUnit: string | undefined,
  lineIndex: number,
  diagnostics: Diagnostic[]
): number {
  if (indent.length === 0) {
    return 0;
  }

  if (!indentUnit) {
    return 1;
  }

  let remaining = indent;
  let depth = 0;
  while (remaining.length > 0) {
    if (!remaining.startsWith(indentUnit)) {
      diagnostics.push(
        createDiagnostic(
          lineIndex,
          0,
          indent.length,
          'Indentation does not match the active Nana indent unit.',
          DiagnosticSeverity.Warning
        )
      );
      return depth;
    }
    remaining = remaining.slice(indentUnit.length);
    depth += 1;
  }

  return depth;
}

function startsWithCommand(content: string, delimiter: string, command: string): boolean {
  return content.trimStart().startsWith(delimiter + command);
}

function hasUnclosedInlineRaw(content: string, delimiter: string): boolean {
  const marker = delimiter + '(';
  const start = content.indexOf(marker);
  if (start === -1 || content.includes(delimiter + '((')) {
    return false;
  }

  return content.indexOf(')' + delimiter, start + marker.length) === -1;
}

function isCommentBlockOpen(trimmed: string, delimiter: string): boolean {
  return trimmed === delimiter + '!!';
}

function endsWithJoin(content: string, delimiter: string): boolean {
  return new RegExp(`${escapeRegExp(delimiter)}(?:&&&|&&|&)\\s*$`).test(content);
}

function isMatchingBlockClose(trimmed: string, block: BlockState, delimiter: string): boolean {
  if (trimmed === block.closeToken) {
    return true;
  }

  if (block.type === 'raw' || block.type === 'code' || block.type === 'quote') {
    return trimmed === block.closeToken + delimiter;
  }

  return false;
}

function createItemNode(content: string, line: number, depth: number, delimiter: string): ItemNode | undefined {
  const extracted = extractLeadingText(content, delimiter);
  if (!extracted) {
    return undefined;
  }

  return {
    anonymous: extracted.anonymous,
    children: [],
    childNames: new Map<string, number>(),
    depth,
    endLine: line,
    line,
    name: extracted.name
  };
}

function extractLeadingText(content: string, delimiter: string): { anonymous: boolean; name: string } | undefined {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed === delimiter) {
    return {
      anonymous: true,
      name: '(item)'
    };
  }

  if (trimmed.startsWith(delimiter)) {
    if (trimmed.startsWith(delimiter + '=')) {
      return {
        anonymous: true,
        name: trimmed.slice(delimiter.length + 1).trim() || '(value)'
      };
    }

    if (trimmed.startsWith(delimiter + '|')) {
      return {
        anonymous: true,
        name: '(table columns)'
      };
    }

    if (trimmed.startsWith(delimiter + '%')) {
      return {
        anonymous: true,
        name: '(defaults)'
      };
    }

    if (trimmed.startsWith(delimiter + '---')) {
      return undefined;
    }

    return {
      anonymous: true,
      name: '(command)'
    };
  }

  let result = '';
  for (let index = 0; index < content.length; index += 1) {
    if (content.startsWith(delimiter + '`', index)) {
      result += delimiter;
      index += delimiter.length;
      continue;
    }

    if (content.startsWith(delimiter, index)) {
      break;
    }

    const current = content[index];
    if (current === undefined) {
      break;
    }

    result += current;
  }

  const name = result.trim();
  if (name.length === 0) {
    return {
      anonymous: true,
      name: '(item)'
    };
  }

  return {
    anonymous: false,
    name
  };
}

function finalizeTree(node: ItemNode): number {
  let endLine = node.line;
  for (const child of node.children) {
    endLine = Math.max(endLine, finalizeTree(child));
  }
  node.endLine = endLine;
  return endLine;
}

function collectFoldingRanges(node: ItemNode, foldingRanges: FoldingRange[]): void {
  if (node.endLine > node.line) {
    foldingRanges.push({
      startLine: node.line,
      endLine: node.endLine,
      kind: FoldingRangeKind.Region
    });
  }

  for (const child of node.children) {
    collectFoldingRanges(child, foldingRanges);
  }
}

function toDocumentSymbol(node: ItemNode): DocumentSymbol {
  return DocumentSymbol.create(
    node.name,
    '',
    node.anonymous ? SymbolKind.Array : SymbolKind.Object,
    Range.create(Position.create(node.line, 0), Position.create(node.endLine, 0)),
    Range.create(Position.create(node.line, 0), Position.create(node.line, 0)),
    node.children.map(toDocumentSymbol)
  );
}

function createDiagnostic(
  line: number,
  startCharacter: number,
  endCharacter: number,
  message: string,
  severity: DiagnosticSeverity
): Diagnostic {
  return Diagnostic.create(
    Range.create(Position.create(line, startCharacter), Position.create(line, Math.max(startCharacter + 1, endCharacter))),
    message,
    severity,
    undefined,
    'nana'
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
