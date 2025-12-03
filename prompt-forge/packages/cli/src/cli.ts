#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import { table } from 'table';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PromptRegistry,
  TemplateEngine,
  TestRunner,
  TestFileSchema,
  type Prompt,
  type Variable,
  type PromptTest,
  type TestResult,
} from '@prompt-forge/core';
import * as yaml from 'yaml';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('forge')
  .description('CLI for versioning, testing, and managing LLM prompts')
  .version(VERSION);

program
  .command('init')
  .description('Initialize a new prompt-forge project')
  .option('-f, --format <format>', 'File format (yaml or json)', 'yaml')
  .action(async (options) => {
    const ext = options.format === 'json' ? 'json' : 'yaml';
    const promptsFile = `prompts.${ext}`;
    const testsFile = `prompts.test.${ext}`;

    if (fs.existsSync(promptsFile)) {
      console.log(chalk.yellow(`⚠ ${promptsFile} already exists`));
      return;
    }

    const initialPrompts = {
      version: '1.0',
      prompts: [
        {
          id: 'greeting',
          name: 'Simple Greeting',
          description: 'A simple greeting prompt',
          template: 'Hello {{name}}! How can I help you today?',
          variables: [
            {
              name: 'name',
              type: 'string',
              description: 'The name of the user',
              required: true,
            },
          ],
          version: '1.0.0',
          tags: ['example', 'greeting'],
          metadata: {
            model: 'gpt-3.5-turbo',
            maxTokens: 100,
            temperature: 0.7,
          },
        },
      ],
    };

    const initialTests = {
      version: '1.0',
      tests: [
        {
          id: 'greeting-test-1',
          name: 'Basic greeting test',
          promptId: 'greeting',
          inputs: {
            name: 'Alice',
          },
          assertions: [
            {
              type: 'contains',
              value: 'Alice',
              message: 'Should contain the user name',
            },
            {
              type: 'contains',
              value: 'Hello',
              message: 'Should start with Hello',
            },
          ],
        },
      ],
    };

    const content = ext === 'json'
      ? JSON.stringify(initialPrompts, null, 2)
      : yaml.stringify(initialPrompts);

    const testContent = ext === 'json'
      ? JSON.stringify(initialTests, null, 2)
      : yaml.stringify(initialTests);

    fs.writeFileSync(promptsFile, content);
    fs.writeFileSync(testsFile, testContent);

    console.log(
      boxen(
        `${chalk.green('✓')} Initialized prompt-forge project\n\n` +
        `Created:\n` +
        `  ${chalk.cyan(promptsFile)} - Your prompts\n` +
        `  ${chalk.cyan(testsFile)} - Your tests\n\n` +
        `Next steps:\n` +
        `  ${chalk.dim('1.')} Edit ${promptsFile} to add your prompts\n` +
        `  ${chalk.dim('2.')} Run ${chalk.cyan('forge list')} to see your prompts\n` +
        `  ${chalk.dim('3.')} Run ${chalk.cyan('forge test')} to run tests`,
        {
          padding: 1,
          borderColor: 'green',
          borderStyle: 'round',
        }
      )
    );
  });

program
  .command('list')
  .alias('ls')
  .description('List all prompts')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const registry = new PromptRegistry();
      registry.loadSync();

      let prompts = registry.list();

      if (options.tag) {
        prompts = prompts.filter((p: { tags: string[] }) => p.tags.includes(options.tag));
      }

      if (prompts.length === 0) {
        console.log(chalk.yellow('No prompts found'));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(prompts, null, 2));
        return;
      }

      const data = [
        [
          chalk.bold('ID'),
          chalk.bold('Name'),
          chalk.bold('Version'),
          chalk.bold('Tags'),
          chalk.bold('Variables'),
        ],
        ...prompts.map((p) => [
          chalk.cyan(p.id),
          p.name,
          chalk.dim(p.version),
          p.tags.join(', ') || chalk.dim('-'),
          p.variables.map((v) => v.name).join(', ') || chalk.dim('-'),
        ]),
      ];

      console.log(table(data));
      console.log(chalk.dim(`${prompts.length} prompt(s) found`));
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('show <id>')
  .description('Show details of a prompt')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const registry = new PromptRegistry();
      registry.loadSync();

      const prompt = registry.get(id);

      if (!prompt) {
        console.error(chalk.red(`Prompt not found: ${id}`));
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(prompt, null, 2));
        return;
      }

      console.log(
        boxen(
          `${chalk.bold.cyan(prompt.name)} ${chalk.dim(`v${prompt.version}`)}\n` +
          `${chalk.dim('ID:')} ${prompt.id}\n` +
          (prompt.description ? `${chalk.dim('Description:')} ${prompt.description}\n` : '') +
          (prompt.tags.length ? `${chalk.dim('Tags:')} ${prompt.tags.join(', ')}\n` : '') +
          `\n${chalk.bold('Template:')}\n${chalk.white(prompt.template)}\n` +
          (prompt.variables.length
            ? `\n${chalk.bold('Variables:')}\n${prompt.variables
                .map((v) => `  • ${chalk.cyan(v.name)} (${v.type})${v.required ? '' : chalk.dim(' optional')}`)
                .join('\n')}`
            : ''),
          {
            padding: 1,
            borderColor: 'cyan',
            borderStyle: 'round',
          }
        )
      );
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('render <id>')
  .description('Render a prompt with variables')
  .option('-v, --var <var...>', 'Variables in key=value format')
  .option('--json <json>', 'Variables as JSON string')
  .option('-c, --copy', 'Copy to clipboard')
  .action(async (id, options) => {
    try {
      const registry = new PromptRegistry();
      registry.loadSync();

      const prompt = registry.get(id);

      if (!prompt) {
        console.error(chalk.red(`Prompt not found: ${id}`));
        process.exit(1);
      }

      let variables: Record<string, unknown> = {};

      if (options.json) {
        variables = JSON.parse(options.json);
      } else if (options.var) {
        for (const v of options.var) {
          const [key, ...valueParts] = v.split('=');
          variables[key] = valueParts.join('=');
        }
      }

      const engine = new TemplateEngine();
      const result = engine.renderPrompt(prompt, variables, { strict: true });

      console.log(chalk.bold('Rendered prompt:\n'));
      console.log(result.content);

      if (result.missingVariables.length > 0) {
        console.log(
          chalk.yellow(`\n⚠ Missing variables: ${result.missingVariables.join(', ')}`)
        );
      }

      if (options.copy) {
        const { default: clipboardy } = await import('clipboardy');
        await clipboardy.write(result.content);
        console.log(chalk.green('\n✓ Copied to clipboard'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Run prompt tests')
  .option('-f, --file <file>', 'Test file path')
  .option('-p, --prompt <id>', 'Run tests for specific prompt')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const registry = new PromptRegistry();
      registry.loadSync();

      const testFile = options.file || findTestFile();

      if (!testFile) {
        console.log(chalk.yellow('No test file found. Create a prompts.test.yaml file.'));
        return;
      }

      const content = fs.readFileSync(testFile, 'utf-8');
      const ext = path.extname(testFile).toLowerCase();
      const data = ext === '.json' ? JSON.parse(content) : yaml.parse(content);
      const validated = TestFileSchema.parse(data);

      let tests = validated.tests;

      if (options.prompt) {
        tests = tests.filter((t) => t.promptId === options.prompt);
      }

      if (tests.length === 0) {
        console.log(chalk.yellow('No tests found'));
        return;
      }

      const runner = new TestRunner();
      const prompts = new Map(registry.list().map((p) => [p.id, p]));
      const results = await runner.runAll(prompts, tests);

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log(chalk.bold(`\nRunning ${tests.length} test(s)...\n`));

      for (const result of results) {
        const status = result.passed
          ? chalk.green('✓ PASS')
          : chalk.red('✗ FAIL');

        console.log(`${status} ${result.testName} ${chalk.dim(`(${result.duration}ms)`)}`);

        if (!result.passed) {
          if (result.error) {
            console.log(chalk.red(`  Error: ${result.error}`));
          }

          for (const assertion of result.assertions) {
            if (!assertion.passed) {
              console.log(
                chalk.red(`  • ${assertion.type}: expected ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(assertion.actual)}`)
              );
              if (assertion.message) {
                console.log(chalk.dim(`    ${assertion.message}`));
              }
            }
          }
        }
      }

      const passed = results.filter((r) => r.passed).length;
      const failed = results.filter((r) => !r.passed).length;

      console.log(
        `\n${chalk.bold('Results:')} ${chalk.green(`${passed} passed`)}, ${chalk.red(`${failed} failed`)}`
      );

      if (failed > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate prompt files')
  .option('-f, --file <file>', 'Prompt file path')
  .action(async (options) => {
    try {
      const registry = new PromptRegistry();

      try {
        registry.loadSync(options.file);
        const prompts = registry.list();
        console.log(chalk.green(`✓ Valid: ${prompts.length} prompt(s) found`));

        const engine = new TemplateEngine();

        for (const prompt of prompts) {
          const validation = engine.validate(prompt.template);
          if (!validation.valid) {
            console.log(chalk.yellow(`⚠ Template warning in ${prompt.id}:`));
            validation.errors.forEach((e) => console.log(chalk.dim(`  ${e}`)));
          }
        }
      } catch (error) {
        console.error(chalk.red('✗ Invalid:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

function findTestFile(): string | null {
  const candidates = [
    'prompts.test.yaml',
    'prompts.test.yml',
    'prompts.test.json',
    'tests/prompts.yaml',
    'tests/prompts.yml',
    'tests/prompts.json',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

program.parse();
