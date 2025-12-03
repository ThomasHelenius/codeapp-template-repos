export interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
  lines: number;
  language: Language | null;
  lastModified: Date;
  extension: string;
}

export interface TokenizedFile extends FileInfo {
  tokens: number;
  content: string;
}

export interface ParsedFile extends TokenizedFile {
  symbols: Symbol[];
  imports: ImportInfo[];
  exports: ExportInfo[];
}

export interface Symbol {
  name: string;
  kind: SymbolKind;
  signature: string;
  body?: string;
  startLine: number;
  endLine: number;
  docComment?: string;
  isExported: boolean;
  children?: Symbol[];
}

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'constant'
  | 'property';

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  line: number;
}

export interface ExportInfo {
  name: string;
  kind: SymbolKind;
  isDefault: boolean;
  line: number;
}

export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'markdown'
  | 'json'
  | 'yaml'
  | 'toml';

export type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type CompressionStrategy = 'full' | 'balanced' | 'signatures' | 'types' | 'tree' | 'custom';

export interface CompressionConfig {
  maxTokens: number;
  strategy: CompressionStrategy;
  include?: string[];
  exclude?: string[];
  priorityPatterns?: string[];
  includeTests?: boolean;
  includeComments?: boolean;
  includeDocstrings?: boolean;
  focusFiles?: string[];
  focusSymbols?: string[];
  customRules?: CompressionRule[];
}

export interface CompressionRule {
  pattern: string;
  level: CompressionLevel;
}

export interface CompressionResult {
  content: string;
  stats: CompressionStats;
  manifest: FileManifest[];
}

export interface CompressionStats {
  originalFiles: number;
  includedFiles: number;
  excludedFiles: number;
  originalLines: number;
  compressedLines: number;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  strategy: CompressionStrategy;
  processingTime: number;
}

export interface FileManifest {
  path: string;
  compressionLevel: CompressionLevel;
  originalTokens: number;
  compressedTokens: number;
  includedSymbols: string[];
  reason: string;
}

export interface ScanOptions {
  basePath: string;
  include?: string[];
  exclude?: string[];
  respectGitignore?: boolean;
  maxFileSize?: number;
  maxFiles?: number;
}

export interface RankingFactors {
  recency: number;
  centrality: number;
  size: number;
  isEntryPoint: boolean;
  isTest: boolean;
  isGenerated: boolean;
  matchesFocus: boolean;
}

export interface RankedFile extends ParsedFile {
  score: number;
  factors: RankingFactors;
}

export const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/venv/**',
  '**/.venv/**',
  '**/target/**',
  '**/vendor/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/*.lock',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/.DS_Store',
  '**/Thumbs.db',
];

export const LANGUAGE_EXTENSIONS: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
};
