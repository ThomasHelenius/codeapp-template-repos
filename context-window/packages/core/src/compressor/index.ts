import * as fs from 'node:fs';
import picomatch from 'picomatch';
import {
  CompressionConfig,
  CompressionResult,
  CompressionStats,
  CompressionLevel,
  FileManifest,
  ParsedFile,
  RankedFile,
  RankingFactors,
  Symbol,
} from '../types.js';
import { countTokens } from '../tokens.js';
import { Scanner, ScanResult } from '../scanner/index.js';
import { parseFile } from '../parser/index.js';

export interface CompressorOptions extends CompressionConfig {
  basePath: string;
}

export class Compressor {
  private options: CompressorOptions;

  constructor(options: CompressorOptions) {
    this.options = {
      maxTokens: options.maxTokens || 128000,
      strategy: options.strategy || 'balanced',
      include: options.include,
      exclude: options.exclude,
      priorityPatterns: options.priorityPatterns || [],
      includeTests: options.includeTests ?? false,
      includeComments: options.includeComments ?? true,
      includeDocstrings: options.includeDocstrings ?? true,
      focusFiles: options.focusFiles,
      focusSymbols: options.focusSymbols,
      customRules: options.customRules,
      basePath: options.basePath,
    };
  }

  async compress(): Promise<CompressionResult> {
    const startTime = Date.now();

    // Scan files
    const scanner = new Scanner({
      basePath: this.options.basePath,
      include: this.options.include,
      exclude: this.options.exclude,
    });
    const scanResult = await scanner.scan();

    // Parse and tokenize files
    const parsedFiles = await this.parseFiles(scanResult);

    // Rank files by importance
    const rankedFiles = this.rankFiles(parsedFiles);

    // Apply compression strategy
    const { content, manifest } = this.applyStrategy(rankedFiles);

    const compressedTokens = countTokens(content);
    const originalTokens = parsedFiles.reduce((sum, f) => sum + f.tokens, 0);

    const stats: CompressionStats = {
      originalFiles: scanResult.files.length,
      includedFiles: manifest.length,
      excludedFiles: scanResult.files.length - manifest.length,
      originalLines: scanResult.totalLines,
      compressedLines: content.split('\n').length,
      originalTokens,
      compressedTokens,
      compressionRatio: originalTokens > 0 ? 1 - compressedTokens / originalTokens : 0,
      strategy: this.options.strategy,
      processingTime: Date.now() - startTime,
    };

    return { content, stats, manifest };
  }

  private async parseFiles(scanResult: ScanResult): Promise<ParsedFile[]> {
    const parsedFiles: ParsedFile[] = [];

    for (const file of scanResult.files) {
      try {
        const content = await fs.promises.readFile(file.path, 'utf-8');
        const tokens = countTokens(content);

        const tokenizedFile = {
          ...file,
          tokens,
          content,
        };

        const parsedFile = parseFile(tokenizedFile);
        parsedFiles.push(parsedFile);
      } catch {
        // Skip files that can't be read
        continue;
      }
    }

    return parsedFiles;
  }

  private rankFiles(files: ParsedFile[]): RankedFile[] {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    return files
      .map((file) => {
        const factors = this.calculateFactors(file, now, maxAge);
        const score = this.calculateScore(factors);
        return { ...file, score, factors };
      })
      .sort((a, b) => b.score - a.score);
  }

  private calculateFactors(file: ParsedFile, now: number, maxAge: number): RankingFactors {
    const age = now - file.lastModified.getTime();
    const recency = Math.max(0, 1 - age / maxAge);

    const isEntryPoint =
      file.relativePath.includes('index.') ||
      file.relativePath.includes('main.') ||
      file.relativePath.includes('app.') ||
      file.relativePath.includes('mod.') ||
      file.relativePath === 'src/index.ts' ||
      file.relativePath === 'src/main.ts';

    const isTest =
      file.relativePath.includes('.test.') ||
      file.relativePath.includes('.spec.') ||
      file.relativePath.includes('__tests__') ||
      file.relativePath.includes('_test.') ||
      file.relativePath.includes('test_');

    const isGenerated =
      file.relativePath.includes('.generated.') ||
      file.relativePath.includes('.gen.') ||
      file.relativePath.includes('/generated/') ||
      file.content.includes('@generated') ||
      file.content.includes('DO NOT EDIT');

    const matchesFocus = this.matchesFocusPatterns(file);

    // Centrality based on exports (more exports = more central)
    const centrality = Math.min(1, file.exports.length / 10);

    // Size factor (prefer medium-sized files)
    const idealSize = 500;
    const sizeFactor = 1 - Math.abs(file.lines - idealSize) / (idealSize * 4);

    return {
      recency,
      centrality,
      size: Math.max(0, sizeFactor),
      isEntryPoint,
      isTest,
      isGenerated,
      matchesFocus,
    };
  }

  private matchesFocusPatterns(file: ParsedFile): boolean {
    if (!this.options.focusFiles?.length && !this.options.priorityPatterns?.length) {
      return false;
    }

    const patterns = [...(this.options.focusFiles || []), ...(this.options.priorityPatterns || [])];
    const matchers = patterns.map((p) => picomatch(p));

    return matchers.some((matcher) => matcher(file.relativePath));
  }

  private calculateScore(factors: RankingFactors): number {
    let score = 0;

    // Base score from factors
    score += factors.recency * 0.2;
    score += factors.centrality * 0.25;
    score += factors.size * 0.1;

    // Bonuses
    if (factors.isEntryPoint) score += 0.3;
    if (factors.matchesFocus) score += 0.5;

    // Penalties
    if (factors.isTest && !this.options.includeTests) score -= 0.4;
    if (factors.isGenerated) score -= 0.8;

    return score;
  }

  private applyStrategy(files: RankedFile[]): { content: string; manifest: FileManifest[] } {
    switch (this.options.strategy) {
      case 'full':
        return this.strategyFull(files);
      case 'signatures':
        return this.strategySignatures(files);
      case 'types':
        return this.strategyTypes(files);
      case 'tree':
        return this.strategyTree(files);
      case 'balanced':
      default:
        return this.strategyBalanced(files);
    }
  }

  private strategyFull(files: RankedFile[]): { content: string; manifest: FileManifest[] } {
    const sections: string[] = [];
    const manifest: FileManifest[] = [];
    let currentTokens = 0;

    for (const file of files) {
      if (currentTokens + file.tokens > this.options.maxTokens) {
        break;
      }

      sections.push(this.formatFile(file, 0));
      currentTokens += file.tokens;

      manifest.push({
        path: file.relativePath,
        compressionLevel: 0,
        originalTokens: file.tokens,
        compressedTokens: file.tokens,
        includedSymbols: file.symbols.map((s) => s.name),
        reason: 'full content',
      });
    }

    return { content: sections.join('\n\n'), manifest };
  }

  private strategySignatures(files: RankedFile[]): { content: string; manifest: FileManifest[] } {
    const sections: string[] = [];
    const manifest: FileManifest[] = [];
    let currentTokens = 0;

    for (const file of files) {
      const compressed = this.compressToSignatures(file);
      const tokens = countTokens(compressed);

      if (currentTokens + tokens > this.options.maxTokens) {
        continue;
      }

      sections.push(compressed);
      currentTokens += tokens;

      manifest.push({
        path: file.relativePath,
        compressionLevel: 2,
        originalTokens: file.tokens,
        compressedTokens: tokens,
        includedSymbols: file.symbols.map((s) => s.name),
        reason: 'signatures only',
      });
    }

    return { content: sections.join('\n\n'), manifest };
  }

  private strategyTypes(files: RankedFile[]): { content: string; manifest: FileManifest[] } {
    const sections: string[] = [];
    const manifest: FileManifest[] = [];
    let currentTokens = 0;

    for (const file of files) {
      const typeSymbols = file.symbols.filter(
        (s) => s.kind === 'interface' || s.kind === 'type' || s.kind === 'enum'
      );

      if (typeSymbols.length === 0) continue;

      const compressed = this.formatTypesOnly(file, typeSymbols);
      const tokens = countTokens(compressed);

      if (currentTokens + tokens > this.options.maxTokens) {
        continue;
      }

      sections.push(compressed);
      currentTokens += tokens;

      manifest.push({
        path: file.relativePath,
        compressionLevel: 3,
        originalTokens: file.tokens,
        compressedTokens: tokens,
        includedSymbols: typeSymbols.map((s) => s.name),
        reason: 'types only',
      });
    }

    return { content: sections.join('\n\n'), manifest };
  }

  private strategyTree(files: RankedFile[]): { content: string; manifest: FileManifest[] } {
    const tree = this.buildFileTree(files);
    const content = `# Project Structure\n\n${tree}`;
    const tokens = countTokens(content);

    const manifest: FileManifest[] = files.map((f) => ({
      path: f.relativePath,
      compressionLevel: 5 as CompressionLevel,
      originalTokens: f.tokens,
      compressedTokens: Math.ceil(tokens / files.length),
      includedSymbols: [],
      reason: 'tree only',
    }));

    return { content, manifest };
  }

  private strategyBalanced(files: RankedFile[]): { content: string; manifest: FileManifest[] } {
    const sections: string[] = [];
    const manifest: FileManifest[] = [];
    let currentTokens = 0;

    const budgetPerTier = this.options.maxTokens / 4;

    // Tier 1: Top 20% files get full content
    const tier1Count = Math.ceil(files.length * 0.2);
    const tier1 = files.slice(0, tier1Count);

    for (const file of tier1) {
      if (currentTokens + file.tokens > budgetPerTier) {
        const compressed = this.compressToSignatures(file);
        const tokens = countTokens(compressed);
        sections.push(compressed);
        currentTokens += tokens;
        manifest.push({
          path: file.relativePath,
          compressionLevel: 2,
          originalTokens: file.tokens,
          compressedTokens: tokens,
          includedSymbols: file.symbols.map((s) => s.name),
          reason: 'tier 1 - compressed due to budget',
        });
      } else {
        sections.push(this.formatFile(file, 0));
        currentTokens += file.tokens;
        manifest.push({
          path: file.relativePath,
          compressionLevel: 0,
          originalTokens: file.tokens,
          compressedTokens: file.tokens,
          includedSymbols: file.symbols.map((s) => s.name),
          reason: 'tier 1 - full content',
        });
      }
    }

    // Tier 2: Next 30% get signatures
    const tier2Count = Math.ceil(files.length * 0.3);
    const tier2 = files.slice(tier1Count, tier1Count + tier2Count);

    for (const file of tier2) {
      const compressed = this.compressToSignatures(file);
      const tokens = countTokens(compressed);

      if (currentTokens + tokens > this.options.maxTokens * 0.7) {
        continue;
      }

      sections.push(compressed);
      currentTokens += tokens;
      manifest.push({
        path: file.relativePath,
        compressionLevel: 2,
        originalTokens: file.tokens,
        compressedTokens: tokens,
        includedSymbols: file.symbols.map((s) => s.name),
        reason: 'tier 2 - signatures',
      });
    }

    // Tier 3: Next 30% get types only
    const tier3Count = Math.ceil(files.length * 0.3);
    const tier3 = files.slice(tier1Count + tier2Count, tier1Count + tier2Count + tier3Count);

    for (const file of tier3) {
      const typeSymbols = file.symbols.filter(
        (s) => s.kind === 'interface' || s.kind === 'type' || s.kind === 'enum'
      );

      if (typeSymbols.length === 0) continue;

      const compressed = this.formatTypesOnly(file, typeSymbols);
      const tokens = countTokens(compressed);

      if (currentTokens + tokens > this.options.maxTokens * 0.9) {
        continue;
      }

      sections.push(compressed);
      currentTokens += tokens;
      manifest.push({
        path: file.relativePath,
        compressionLevel: 3,
        originalTokens: file.tokens,
        compressedTokens: tokens,
        includedSymbols: typeSymbols.map((s) => s.name),
        reason: 'tier 3 - types only',
      });
    }

    // Add file tree for remaining files
    const remainingFiles = files.slice(tier1Count + tier2Count + tier3Count);
    if (remainingFiles.length > 0 && currentTokens < this.options.maxTokens * 0.95) {
      const tree = this.buildFileTree(remainingFiles);
      sections.push(`\n## Additional Files (tree only)\n\n${tree}`);
    }

    return { content: sections.join('\n\n'), manifest };
  }

  private formatFile(file: ParsedFile, _level: CompressionLevel): string {
    return `## ${file.relativePath}\n\n\`\`\`${file.language || ''}\n${file.content}\n\`\`\``;
  }

  private compressToSignatures(file: ParsedFile): string {
    const lines: string[] = [`## ${file.relativePath} (signatures)`];

    if (file.imports.length > 0) {
      lines.push('\n// Imports');
      for (const imp of file.imports.slice(0, 10)) {
        lines.push(`import { ${imp.specifiers.join(', ')} } from '${imp.source}'`);
      }
      if (file.imports.length > 10) {
        lines.push(`// ... and ${file.imports.length - 10} more imports`);
      }
    }

    lines.push('');

    for (const symbol of file.symbols) {
      if (symbol.docComment && this.options.includeDocstrings) {
        lines.push(symbol.docComment);
      }
      lines.push(symbol.signature);

      if (symbol.children && symbol.kind === 'class') {
        for (const child of symbol.children) {
          lines.push(`  ${child.signature}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  private formatTypesOnly(file: ParsedFile, typeSymbols: Symbol[]): string {
    const lines: string[] = [`## ${file.relativePath} (types)`];
    lines.push('');

    for (const symbol of typeSymbols) {
      if (symbol.body) {
        lines.push(symbol.body);
      } else {
        lines.push(symbol.signature);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private buildFileTree(files: RankedFile[]): string {
    const tree: Record<string, unknown> = {};

    for (const file of files) {
      const parts = file.relativePath.split('/');
      let current = tree;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          current[part] = `(${file.lines} lines)`;
        } else {
          current[part] = current[part] || {};
          current = current[part] as Record<string, unknown>;
        }
      }
    }

    return this.renderTree(tree, '');
  }

  private renderTree(node: Record<string, unknown>, indent: string): string {
    const lines: string[] = [];
    const entries = Object.entries(node);

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      const isLast = i === entries.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      const childIndent = isLast ? '    ' : '│   ';

      if (typeof value === 'string') {
        lines.push(`${indent}${prefix}${key} ${value}`);
      } else {
        lines.push(`${indent}${prefix}${key}/`);
        lines.push(this.renderTree(value as Record<string, unknown>, indent + childIndent));
      }
    }

    return lines.join('\n');
  }
}

export function createCompressor(options: CompressorOptions): Compressor {
  return new Compressor(options);
}

export async function compress(
  basePath: string,
  options?: Partial<CompressionConfig>
): Promise<CompressionResult> {
  const compressor = new Compressor({ basePath, ...options } as CompressorOptions);
  return compressor.compress();
}
