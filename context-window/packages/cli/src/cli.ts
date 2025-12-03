#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { table } from 'table';
import clipboardy from 'clipboardy';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  compress,
  scan,
  formatOutput,
  formatTokenCount,
  getTokenLimit,
  TOKEN_LIMITS,
  CompressionStrategy,
} from '@context-window/core';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('cw')
  .description('Intelligent code compression for LLM context windows')
  .version(VERSION);

program
  .command('compress')
  .alias('c')
  .description('Compress a codebase for LLM context')
  .argument('[path]', 'Path to compress', '.')
  .option('-m, --max-tokens <number>', 'Maximum tokens', '128000')
  .option('-s, --strategy <strategy>', 'Compression strategy (full, balanced, signatures, types, tree)', 'balanced')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option('--copy', 'Copy to clipboard')
  .option('-f, --format <format>', 'Output format (markdown, xml, json, plain)', 'markdown')
  .option('--include <patterns...>', 'Include patterns')
  .option('--exclude <patterns...>', 'Exclude patterns')
  .option('--focus <patterns...>', 'Focus on specific files/patterns')
  .option('--include-tests', 'Include test files')
  .option('--no-stats', 'Exclude stats from output')
  .option('--json', 'Output as JSON (shorthand for --format json)')
  .action(async (targetPath, options) => {
    const basePath = path.resolve(targetPath);

    if (!fs.existsSync(basePath)) {
      console.error(chalk.red(`Error: Path does not exist: ${basePath}`));
      process.exit(1);
    }

    const spinner = ora('Analyzing codebase...').start();

    try {
      const result = await compress(basePath, {
        maxTokens: parseInt(options.maxTokens, 10),
        strategy: options.strategy as CompressionStrategy,
        include: options.include,
        exclude: options.exclude,
        focusFiles: options.focus,
        includeTests: options.includeTests,
      });

      spinner.succeed('Compression complete');

      const format = options.json ? 'json' : options.format;
      const output = formatOutput(result, {
        format,
        includeStats: options.stats !== false,
        includeManifest: format === 'json',
      });

      if (options.output) {
        await fs.promises.writeFile(options.output, output);
        console.log(chalk.green(`✓ Output written to ${options.output}`));
      } else if (options.copy) {
        await clipboardy.write(output);
        console.log(chalk.green('✓ Copied to clipboard'));
      } else {
        console.log('\n' + output);
      }

      // Print summary
      console.log(
        boxen(
          `${chalk.bold('Compression Summary')}\n\n` +
          `Files: ${chalk.cyan(result.stats.includedFiles)} / ${result.stats.originalFiles}\n` +
          `Tokens: ${chalk.cyan(formatTokenCount(result.stats.compressedTokens))} / ${formatTokenCount(result.stats.originalTokens)}\n` +
          `Reduction: ${chalk.green((result.stats.compressionRatio * 100).toFixed(1) + '%')}\n` +
          `Time: ${result.stats.processingTime}ms`,
          { padding: 1, borderColor: 'cyan', borderStyle: 'round' }
        )
      );
    } catch (error) {
      spinner.fail('Compression failed');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('stats')
  .alias('s')
  .description('Show statistics about a codebase')
  .argument('[path]', 'Path to analyze', '.')
  .option('--json', 'Output as JSON')
  .action(async (targetPath, options) => {
    const basePath = path.resolve(targetPath);

    if (!fs.existsSync(basePath)) {
      console.error(chalk.red(`Error: Path does not exist: ${basePath}`));
      process.exit(1);
    }

    const spinner = ora('Scanning codebase...').start();

    try {
      const result = await scan(basePath);
      spinner.succeed(`Scanned ${result.files.length} files`);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // Summary box
      console.log(
        boxen(
          `${chalk.bold('Codebase Statistics')}\n\n` +
          `Total Files: ${chalk.cyan(result.files.length)}\n` +
          `Total Lines: ${chalk.cyan(result.totalLines.toLocaleString())}\n` +
          `Total Size: ${chalk.cyan(formatBytes(result.totalSize))}\n` +
          `Scan Time: ${result.scanTime}ms`,
          { padding: 1, borderColor: 'cyan', borderStyle: 'round' }
        )
      );

      // Language breakdown
      const langData = Object.entries(result.byLanguage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      if (langData.length > 0) {
        console.log('\n' + chalk.bold('Languages:'));
        const langTable = [
          [chalk.dim('Language'), chalk.dim('Files'), chalk.dim('%')],
          ...langData.map(([lang, count]) => [
            lang,
            String(count),
            ((count / result.files.length) * 100).toFixed(1) + '%',
          ]),
        ];
        console.log(table(langTable));
      }

      // Largest files
      const largestFiles = result.files
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 5);

      console.log(chalk.bold('Largest Files:'));
      const fileTable = [
        [chalk.dim('File'), chalk.dim('Lines'), chalk.dim('Size')],
        ...largestFiles.map((f) => [
          f.relativePath.length > 50
            ? '...' + f.relativePath.slice(-47)
            : f.relativePath,
          f.lines.toLocaleString(),
          formatBytes(f.size),
        ]),
      ];
      console.log(table(fileTable));

      // Token estimates
      console.log(chalk.bold('Token Estimates:'));
      const tokenEstimate = result.totalLines * 8; // Rough estimate
      const modelFit = Object.entries(TOKEN_LIMITS)
        .filter(([, limit]) => tokenEstimate <= limit)
        .slice(0, 3);

      if (modelFit.length > 0) {
        console.log(chalk.green(`  ✓ Estimated ${formatTokenCount(tokenEstimate)} tokens`));
        console.log(chalk.dim(`  Fits in: ${modelFit.map(([m]) => m).join(', ')}`));
      } else {
        console.log(chalk.yellow(`  ⚠ Estimated ${formatTokenCount(tokenEstimate)} tokens`));
        console.log(chalk.dim('  May need compression for most models'));
      }
    } catch (error) {
      spinner.fail('Scan failed');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('models')
  .description('List supported models and their token limits')
  .action(() => {
    console.log(chalk.bold('\nSupported Models:\n'));

    const data = Object.entries(TOKEN_LIMITS).map(([model, limit]) => [
      model,
      formatTokenCount(limit),
      `~${Math.floor(limit / 8).toLocaleString()} lines`,
    ]);

    console.log(
      table([
        [chalk.dim('Model'), chalk.dim('Token Limit'), chalk.dim('Est. Lines')],
        ...data,
      ])
    );
  });

program
  .command('init')
  .description('Create a context-window config file')
  .action(async () => {
    const configPath = '.contextwindow.yaml';

    if (fs.existsSync(configPath)) {
      console.log(chalk.yellow(`⚠ ${configPath} already exists`));
      return;
    }

    const config = `# context-window configuration
# See: https://github.com/yourorg/context-window

# Maximum tokens for output
maxTokens: 128000

# Compression strategy: full, balanced, signatures, types, tree
strategy: balanced

# Files to include (glob patterns)
include:
  - "src/**/*"
  - "lib/**/*"

# Files to exclude (glob patterns)
exclude:
  - "**/node_modules/**"
  - "**/dist/**"
  - "**/*.test.*"
  - "**/*.spec.*"

# Priority patterns (these files get full content)
priorityPatterns:
  - "src/index.*"
  - "src/main.*"
  - "**/types/**"

# Include test files
includeTests: false

# Include comments in output
includeComments: true

# Include docstrings
includeDocstrings: true
`;

    await fs.promises.writeFile(configPath, config);
    console.log(chalk.green(`✓ Created ${configPath}`));
  });

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

program.parse();
