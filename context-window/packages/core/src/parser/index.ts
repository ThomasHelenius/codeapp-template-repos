import {
  Symbol,
  SymbolKind,
  ImportInfo,
  ExportInfo,
  ParsedFile,
  TokenizedFile,
  Language,
} from '../types.js';

export interface ParseResult {
  symbols: Symbol[];
  imports: ImportInfo[];
  exports: ExportInfo[];
}

export abstract class LanguageParser {
  abstract parse(content: string): ParseResult;
  abstract extractSignature(symbol: Symbol, content: string): string;
}

export class TypeScriptParser extends LanguageParser {
  parse(content: string): ParseResult {
    const symbols: Symbol[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Parse imports
      const importMatch = line.match(/^import\s+(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const specifiers = importMatch[1]
          ? importMatch[1].replace(/[{}]/g, '').split(',').map(s => s.trim())
          : importMatch[2]
            ? [importMatch[2]]
            : [importMatch[3]];
        imports.push({
          source: importMatch[4],
          specifiers: specifiers.filter(Boolean),
          isDefault: !importMatch[1] && !importMatch[2],
          isNamespace: !!importMatch[2],
          line: lineNum,
        });
        continue;
      }

      // Parse exports and declarations
      const isExported = line.trimStart().startsWith('export');
      const declLine = isExported ? line.replace(/^export\s+(default\s+)?/, '') : line;

      // Function
      const funcMatch = declLine.match(/^(async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/);
      if (funcMatch) {
        const endLine = this.findBlockEnd(lines, i);
        const body = lines.slice(i, endLine + 1).join('\n');
        symbols.push({
          name: funcMatch[2],
          kind: 'function',
          signature: this.buildFunctionSignature(funcMatch),
          body,
          startLine: lineNum,
          endLine: endLine + 1,
          isExported,
          docComment: this.extractDocComment(lines, i),
        });
        if (isExported) {
          exports.push({ name: funcMatch[2], kind: 'function', isDefault: line.includes('default'), line: lineNum });
        }
        i = endLine;
        continue;
      }

      // Arrow function / const function
      const arrowMatch = declLine.match(/^const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\(?([^)=]*)\)?\s*(?::\s*([^=]+))?\s*=>/);
      if (arrowMatch) {
        const endLine = this.findStatementEnd(lines, i);
        symbols.push({
          name: arrowMatch[1],
          kind: 'function',
          signature: `const ${arrowMatch[1]} = (${arrowMatch[2]}) =>`,
          body: lines.slice(i, endLine + 1).join('\n'),
          startLine: lineNum,
          endLine: endLine + 1,
          isExported,
          docComment: this.extractDocComment(lines, i),
        });
        if (isExported) {
          exports.push({ name: arrowMatch[1], kind: 'function', isDefault: false, line: lineNum });
        }
        i = endLine;
        continue;
      }

      // Class
      const classMatch = declLine.match(/^(abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/);
      if (classMatch) {
        const endLine = this.findBlockEnd(lines, i);
        const body = lines.slice(i, endLine + 1).join('\n');
        const children = this.parseClassMembers(body, lineNum);
        symbols.push({
          name: classMatch[2],
          kind: 'class',
          signature: declLine.split('{')[0].trim(),
          body,
          startLine: lineNum,
          endLine: endLine + 1,
          isExported,
          children,
          docComment: this.extractDocComment(lines, i),
        });
        if (isExported) {
          exports.push({ name: classMatch[2], kind: 'class', isDefault: line.includes('default'), line: lineNum });
        }
        i = endLine;
        continue;
      }

      // Interface
      const interfaceMatch = declLine.match(/^interface\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+[^{]+)?/);
      if (interfaceMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({
          name: interfaceMatch[1],
          kind: 'interface',
          signature: declLine.split('{')[0].trim(),
          body: lines.slice(i, endLine + 1).join('\n'),
          startLine: lineNum,
          endLine: endLine + 1,
          isExported,
          docComment: this.extractDocComment(lines, i),
        });
        if (isExported) {
          exports.push({ name: interfaceMatch[1], kind: 'interface', isDefault: false, line: lineNum });
        }
        i = endLine;
        continue;
      }

      // Type alias
      const typeMatch = declLine.match(/^type\s+(\w+)(?:<[^>]+>)?\s*=/);
      if (typeMatch) {
        const endLine = this.findStatementEnd(lines, i);
        symbols.push({
          name: typeMatch[1],
          kind: 'type',
          signature: lines.slice(i, endLine + 1).join('\n').trim(),
          startLine: lineNum,
          endLine: endLine + 1,
          isExported,
          docComment: this.extractDocComment(lines, i),
        });
        if (isExported) {
          exports.push({ name: typeMatch[1], kind: 'type', isDefault: false, line: lineNum });
        }
        i = endLine;
        continue;
      }

      // Enum
      const enumMatch = declLine.match(/^(const\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        const endLine = this.findBlockEnd(lines, i);
        symbols.push({
          name: enumMatch[2],
          kind: 'enum',
          signature: declLine.split('{')[0].trim(),
          body: lines.slice(i, endLine + 1).join('\n'),
          startLine: lineNum,
          endLine: endLine + 1,
          isExported,
          docComment: this.extractDocComment(lines, i),
        });
        if (isExported) {
          exports.push({ name: enumMatch[2], kind: 'enum', isDefault: false, line: lineNum });
        }
        i = endLine;
        continue;
      }

      // Const/variable
      const constMatch = declLine.match(/^(const|let|var)\s+(\w+)(?:\s*:\s*([^=]+))?\s*=/);
      if (constMatch) {
        const endLine = this.findStatementEnd(lines, i);
        symbols.push({
          name: constMatch[2],
          kind: constMatch[1] === 'const' ? 'constant' : 'variable',
          signature: `${constMatch[1]} ${constMatch[2]}${constMatch[3] ? `: ${constMatch[3].trim()}` : ''}`,
          body: lines.slice(i, endLine + 1).join('\n'),
          startLine: lineNum,
          endLine: endLine + 1,
          isExported,
        });
        if (isExported) {
          exports.push({ name: constMatch[2], kind: 'constant', isDefault: false, line: lineNum });
        }
        i = endLine;
        continue;
      }
    }

    return { symbols, imports, exports };
  }

  extractSignature(symbol: Symbol, _content: string): string {
    return symbol.signature;
  }

  private buildFunctionSignature(match: RegExpMatchArray): string {
    const async = match[1] ? 'async ' : '';
    const name = match[2];
    const generics = match[3] || '';
    const params = match[4] || '';
    const returnType = match[5] ? `: ${match[5].trim()}` : '';
    return `${async}function ${name}${generics}(${params})${returnType}`;
  }

  private findBlockEnd(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let started = false;

    for (let i = startIndex; i < lines.length; i++) {
      for (const char of lines[i]) {
        if (char === '{') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
          if (started && braceCount === 0) {
            return i;
          }
        }
      }
    }
    return lines.length - 1;
  }

  private findStatementEnd(lines: string[], startIndex: number): number {
    let parenCount = 0;
    let braceCount = 0;
    let bracketCount = 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '(') parenCount++;
        if (char === ')') parenCount--;
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
      }

      if (parenCount === 0 && braceCount === 0 && bracketCount === 0) {
        if (line.trimEnd().endsWith(';') || line.trimEnd().endsWith(',') || i === lines.length - 1) {
          return i;
        }
      }
    }
    return lines.length - 1;
  }

  private parseClassMembers(classBody: string, _baseLineNum: number): Symbol[] {
    const members: Symbol[] = [];
    const lines = classBody.split('\n');

    for (let i = 1; i < lines.length - 1; i++) {
      const line = lines[i].trim();

      // Method
      const methodMatch = line.match(/^(public|private|protected)?\s*(static)?\s*(async)?\s*(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/);
      if (methodMatch && methodMatch[4] !== 'constructor') {
        members.push({
          name: methodMatch[4],
          kind: 'method',
          signature: line.split('{')[0].trim(),
          startLine: i,
          endLine: i,
          isExported: false,
        });
      }

      // Property
      const propMatch = line.match(/^(public|private|protected)?\s*(static)?\s*(readonly)?\s*(\w+)\s*[?!]?\s*:\s*([^;=]+)/);
      if (propMatch) {
        members.push({
          name: propMatch[4],
          kind: 'property',
          signature: line.replace(/;$/, '').trim(),
          startLine: i,
          endLine: i,
          isExported: false,
        });
      }
    }

    return members;
  }

  private extractDocComment(lines: string[], index: number): string | undefined {
    if (index === 0) return undefined;

    const comments: string[] = [];
    let i = index - 1;

    while (i >= 0) {
      const line = lines[i].trim();
      if (line.startsWith('*') || line.startsWith('/*') || line.startsWith('//')) {
        comments.unshift(lines[i]);
        i--;
      } else if (line === '') {
        i--;
      } else {
        break;
      }
    }

    return comments.length > 0 ? comments.join('\n') : undefined;
  }
}

export class PythonParser extends LanguageParser {
  parse(content: string): ParseResult {
    const symbols: Symbol[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Parse imports
      const importMatch = line.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
      if (importMatch) {
        const source = importMatch[1] || importMatch[2].split(',')[0].trim();
        const specifiers = importMatch[2].split(',').map(s => s.trim().split(' as ')[0]);
        imports.push({
          source,
          specifiers,
          isDefault: !importMatch[1],
          isNamespace: importMatch[2].includes('*'),
          line: lineNum,
        });
        continue;
      }

      // Parse function definitions
      const funcMatch = line.match(/^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
      if (funcMatch) {
        const endLine = this.findIndentBlockEnd(lines, i);
        const isPrivate = funcMatch[2].startsWith('_');
        symbols.push({
          name: funcMatch[2],
          kind: 'function',
          signature: `${funcMatch[1] || ''}def ${funcMatch[2]}(${funcMatch[3]})${funcMatch[4] ? ` -> ${funcMatch[4]}` : ''}`,
          body: lines.slice(i, endLine + 1).join('\n'),
          startLine: lineNum,
          endLine: endLine + 1,
          isExported: !isPrivate,
          docComment: this.extractDocstring(lines, i),
        });
        if (!isPrivate) {
          exports.push({ name: funcMatch[2], kind: 'function', isDefault: false, line: lineNum });
        }
        continue;
      }

      // Parse class definitions
      const classMatch = line.match(/^class\s+(\w+)(?:\(([^)]*)\))?:/);
      if (classMatch) {
        const endLine = this.findIndentBlockEnd(lines, i);
        const isPrivate = classMatch[1].startsWith('_');
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          signature: `class ${classMatch[1]}${classMatch[2] ? `(${classMatch[2]})` : ''}`,
          body: lines.slice(i, endLine + 1).join('\n'),
          startLine: lineNum,
          endLine: endLine + 1,
          isExported: !isPrivate,
          docComment: this.extractDocstring(lines, i),
        });
        if (!isPrivate) {
          exports.push({ name: classMatch[1], kind: 'class', isDefault: false, line: lineNum });
        }
        continue;
      }
    }

    return { symbols, imports, exports };
  }

  extractSignature(symbol: Symbol, _content: string): string {
    return symbol.signature;
  }

  private findIndentBlockEnd(lines: string[], startIndex: number): number {
    const startIndent = this.getIndent(lines[startIndex]);

    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;

      const indent = this.getIndent(line);
      if (indent <= startIndent) {
        return i - 1;
      }
    }
    return lines.length - 1;
  }

  private getIndent(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  private extractDocstring(lines: string[], index: number): string | undefined {
    if (index + 1 >= lines.length) return undefined;

    const nextLine = lines[index + 1].trim();
    if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
      const quote = nextLine.startsWith('"""') ? '"""' : "'''";
      const docLines: string[] = [];

      for (let i = index + 1; i < lines.length; i++) {
        docLines.push(lines[i]);
        if (i > index + 1 && lines[i].includes(quote)) {
          break;
        }
      }
      return docLines.join('\n');
    }
    return undefined;
  }
}

const parsers: Record<Language, LanguageParser> = {
  typescript: new TypeScriptParser(),
  javascript: new TypeScriptParser(),
  python: new PythonParser(),
  // Add more parsers as needed - for now, fallback to TypeScript parser
  go: new TypeScriptParser(),
  rust: new TypeScriptParser(),
  java: new TypeScriptParser(),
  c: new TypeScriptParser(),
  cpp: new TypeScriptParser(),
  csharp: new TypeScriptParser(),
  ruby: new TypeScriptParser(),
  php: new TypeScriptParser(),
  swift: new TypeScriptParser(),
  kotlin: new TypeScriptParser(),
  markdown: new TypeScriptParser(),
  json: new TypeScriptParser(),
  yaml: new TypeScriptParser(),
  toml: new TypeScriptParser(),
};

export function getParser(language: Language): LanguageParser {
  return parsers[language] || parsers.typescript;
}

export function parseFile(file: TokenizedFile): ParsedFile {
  if (!file.language) {
    return {
      ...file,
      symbols: [],
      imports: [],
      exports: [],
    };
  }

  const parser = getParser(file.language);
  const result = parser.parse(file.content);

  return {
    ...file,
    ...result,
  };
}
