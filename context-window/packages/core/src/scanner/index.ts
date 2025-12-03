import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore from 'ignore';
import { globby } from 'globby';
import {
  FileInfo,
  ScanOptions,
  DEFAULT_EXCLUDE_PATTERNS,
  LANGUAGE_EXTENSIONS,
  Language,
} from '../types.js';

export interface ScanResult {
  files: FileInfo[];
  totalSize: number;
  totalLines: number;
  byLanguage: Record<string, number>;
  scanTime: number;
}

export class Scanner {
  private options: Required<ScanOptions>;
  private gitignore: ReturnType<typeof ignore> | null = null;

  constructor(options: ScanOptions) {
    this.options = {
      basePath: options.basePath,
      include: options.include || ['**/*'],
      exclude: options.exclude || DEFAULT_EXCLUDE_PATTERNS,
      respectGitignore: options.respectGitignore ?? true,
      maxFileSize: options.maxFileSize || 1024 * 1024, // 1MB
      maxFiles: options.maxFiles || 10000,
    };
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();

    if (this.options.respectGitignore) {
      this.loadGitignore();
    }

    const files = await this.findFiles();
    const fileInfos = await this.processFiles(files);

    const byLanguage: Record<string, number> = {};
    let totalSize = 0;
    let totalLines = 0;

    for (const file of fileInfos) {
      totalSize += file.size;
      totalLines += file.lines;
      const lang = file.language || 'unknown';
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;
    }

    return {
      files: fileInfos,
      totalSize,
      totalLines,
      byLanguage,
      scanTime: Date.now() - startTime,
    };
  }

  private loadGitignore(): void {
    const gitignorePath = path.join(this.options.basePath, '.gitignore');

    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      this.gitignore = ignore().add(content);
    }
  }

  private async findFiles(): Promise<string[]> {
    const patterns = this.options.include;
    const ignorePatterns = this.options.exclude;

    const files = await globby(patterns, {
      cwd: this.options.basePath,
      ignore: ignorePatterns,
      absolute: false,
      onlyFiles: true,
      followSymbolicLinks: false,
      dot: false,
    });

    let filtered = files;

    if (this.gitignore) {
      filtered = files.filter((file) => !this.gitignore!.ignores(file));
    }

    // Apply max files limit
    if (filtered.length > this.options.maxFiles) {
      filtered = filtered.slice(0, this.options.maxFiles);
    }

    return filtered;
  }

  private async processFiles(files: string[]): Promise<FileInfo[]> {
    const results: FileInfo[] = [];

    for (const relativePath of files) {
      const absolutePath = path.join(this.options.basePath, relativePath);

      try {
        const stat = await fs.promises.stat(absolutePath);

        // Skip files that are too large
        if (stat.size > this.options.maxFileSize) {
          continue;
        }

        // Skip binary files
        if (await this.isBinary(absolutePath)) {
          continue;
        }

        const content = await fs.promises.readFile(absolutePath, 'utf-8');
        const lines = content.split('\n').length;
        const ext = path.extname(relativePath).toLowerCase();

        results.push({
          path: absolutePath,
          relativePath,
          size: stat.size,
          lines,
          language: this.detectLanguage(ext),
          lastModified: stat.mtime,
          extension: ext,
        });
      } catch {
        // Skip files that can't be read
        continue;
      }
    }

    return results;
  }

  private detectLanguage(extension: string): Language | null {
    return LANGUAGE_EXTENSIONS[extension] || null;
  }

  private async isBinary(filePath: string): Promise<boolean> {
    const buffer = Buffer.alloc(512);
    const fd = await fs.promises.open(filePath, 'r');

    try {
      const { bytesRead } = await fd.read(buffer, 0, 512, 0);

      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }

      return false;
    } finally {
      await fd.close();
    }
  }
}

export function createScanner(options: ScanOptions): Scanner {
  return new Scanner(options);
}

export async function scan(basePath: string, options?: Partial<ScanOptions>): Promise<ScanResult> {
  const scanner = new Scanner({ basePath, ...options });
  return scanner.scan();
}
