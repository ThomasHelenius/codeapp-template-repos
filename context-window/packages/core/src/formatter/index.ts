import { CompressionResult, CompressionStats, FileManifest } from '../types.js';
import { formatTokenCount } from '../tokens.js';

export type OutputFormat = 'markdown' | 'xml' | 'plain' | 'json';

export interface FormatOptions {
  format: OutputFormat;
  includeStats?: boolean;
  includeManifest?: boolean;
  wrapInCodeBlocks?: boolean;
}

export function formatOutput(result: CompressionResult, options: FormatOptions): string {
  switch (options.format) {
    case 'xml':
      return formatXml(result, options);
    case 'json':
      return formatJson(result);
    case 'plain':
      return formatPlain(result, options);
    case 'markdown':
    default:
      return formatMarkdown(result, options);
  }
}

function formatMarkdown(result: CompressionResult, options: FormatOptions): string {
  const sections: string[] = [];

  if (options.includeStats) {
    sections.push(formatStatsMarkdown(result.stats));
  }

  sections.push(result.content);

  if (options.includeManifest) {
    sections.push(formatManifestMarkdown(result.manifest));
  }

  return sections.join('\n\n---\n\n');
}

function formatXml(result: CompressionResult, options: FormatOptions): string {
  const sections: string[] = ['<context>'];

  if (options.includeStats) {
    sections.push('  <stats>');
    sections.push(`    <original_files>${result.stats.originalFiles}</original_files>`);
    sections.push(`    <included_files>${result.stats.includedFiles}</included_files>`);
    sections.push(`    <original_tokens>${result.stats.originalTokens}</original_tokens>`);
    sections.push(`    <compressed_tokens>${result.stats.compressedTokens}</compressed_tokens>`);
    sections.push(`    <compression_ratio>${(result.stats.compressionRatio * 100).toFixed(1)}%</compression_ratio>`);
    sections.push('  </stats>');
  }

  sections.push('  <content>');
  sections.push(result.content.split('\n').map((line) => `    ${line}`).join('\n'));
  sections.push('  </content>');

  if (options.includeManifest) {
    sections.push('  <manifest>');
    for (const file of result.manifest) {
      sections.push(`    <file path="${file.path}" level="${file.compressionLevel}" tokens="${file.compressedTokens}" />`);
    }
    sections.push('  </manifest>');
  }

  sections.push('</context>');

  return sections.join('\n');
}

function formatJson(result: CompressionResult): string {
  return JSON.stringify(
    {
      stats: result.stats,
      manifest: result.manifest,
      content: result.content,
    },
    null,
    2
  );
}

function formatPlain(result: CompressionResult, options: FormatOptions): string {
  const sections: string[] = [];

  if (options.includeStats) {
    sections.push(formatStatsPlain(result.stats));
    sections.push('');
  }

  sections.push(result.content);

  return sections.join('\n');
}

function formatStatsMarkdown(stats: CompressionStats): string {
  const ratio = (stats.compressionRatio * 100).toFixed(1);

  return `# Compression Stats

| Metric | Value |
|--------|-------|
| Files | ${stats.includedFiles} / ${stats.originalFiles} |
| Lines | ${stats.compressedLines.toLocaleString()} / ${stats.originalLines.toLocaleString()} |
| Tokens | ${formatTokenCount(stats.compressedTokens)} / ${formatTokenCount(stats.originalTokens)} |
| Compression | ${ratio}% reduction |
| Strategy | ${stats.strategy} |
| Time | ${stats.processingTime}ms |`;
}

function formatStatsPlain(stats: CompressionStats): string {
  const ratio = (stats.compressionRatio * 100).toFixed(1);

  return `Compression Stats
─────────────────
Files:       ${stats.includedFiles} / ${stats.originalFiles}
Lines:       ${stats.compressedLines.toLocaleString()} / ${stats.originalLines.toLocaleString()}
Tokens:      ${formatTokenCount(stats.compressedTokens)} / ${formatTokenCount(stats.originalTokens)}
Compression: ${ratio}% reduction
Strategy:    ${stats.strategy}
Time:        ${stats.processingTime}ms`;
}

function formatManifestMarkdown(manifest: FileManifest[]): string {
  const lines: string[] = ['# Included Files', ''];

  for (const file of manifest) {
    const level = ['full', 'no-comments', 'signatures', 'types', 'exports', 'tree'][file.compressionLevel];
    lines.push(`- **${file.path}** (${level}, ${file.compressedTokens} tokens)`);
  }

  return lines.join('\n');
}

export function createStatsTable(stats: CompressionStats): string[][] {
  return [
    ['Metric', 'Original', 'Compressed', 'Change'],
    ['Files', String(stats.originalFiles), String(stats.includedFiles), `${stats.excludedFiles} excluded`],
    ['Lines', stats.originalLines.toLocaleString(), stats.compressedLines.toLocaleString(), ''],
    ['Tokens', formatTokenCount(stats.originalTokens), formatTokenCount(stats.compressedTokens), `${(stats.compressionRatio * 100).toFixed(1)}% ↓`],
  ];
}
