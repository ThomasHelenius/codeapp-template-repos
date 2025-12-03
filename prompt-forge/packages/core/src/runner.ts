import { Assertion, Prompt, PromptTest } from './types.js';
import { TemplateEngine } from './template.js';

export interface TestResult {
  testId: string;
  testName: string;
  promptId: string;
  passed: boolean;
  renderedPrompt: string;
  output?: string;
  assertions: AssertionResult[];
  duration: number;
  error?: string;
}

export interface AssertionResult {
  type: Assertion['type'];
  passed: boolean;
  expected: unknown;
  actual?: unknown;
  message?: string;
}

export interface ExecutorOptions {
  execute: (prompt: string, options?: ExecuteOptions) => Promise<string>;
}

export interface ExecuteOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class TestRunner {
  private templateEngine: TemplateEngine;
  private executor?: ExecutorOptions['execute'];

  constructor(options?: { executor?: ExecutorOptions['execute'] }) {
    this.templateEngine = new TemplateEngine();
    this.executor = options?.executor;
  }

  setExecutor(executor: ExecutorOptions['execute']): void {
    this.executor = executor;
  }

  async run(prompt: Prompt, test: PromptTest): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const { content: renderedPrompt } = this.templateEngine.renderPrompt(
        prompt,
        test.inputs,
        { strict: true }
      );

      let output: string | undefined;

      if (this.executor) {
        output = await this.executor(renderedPrompt, {
          model: prompt.metadata.model,
          maxTokens: prompt.metadata.maxTokens,
          temperature: prompt.metadata.temperature,
        });
      } else if (test.expectedOutput) {
        output = test.expectedOutput;
      }

      const assertionResults = output
        ? this.runAssertions(test.assertions, output)
        : [];

      const passed = assertionResults.every((r) => r.passed);

      return {
        testId: test.id,
        testName: test.name,
        promptId: prompt.id,
        passed,
        renderedPrompt,
        output,
        assertions: assertionResults,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testId: test.id,
        testName: test.name,
        promptId: prompt.id,
        passed: false,
        renderedPrompt: '',
        assertions: [],
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async runAll(prompts: Map<string, Prompt>, tests: PromptTest[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const test of tests) {
      const prompt = prompts.get(test.promptId);
      if (!prompt) {
        results.push({
          testId: test.id,
          testName: test.name,
          promptId: test.promptId,
          passed: false,
          renderedPrompt: '',
          assertions: [],
          duration: 0,
          error: `Prompt not found: ${test.promptId}`,
        });
        continue;
      }

      const result = await this.run(prompt, test);
      results.push(result);
    }

    return results;
  }

  runAssertions(assertions: Assertion[], output: string): AssertionResult[] {
    return assertions.map((assertion) => this.runAssertion(assertion, output));
  }

  private runAssertion(assertion: Assertion, output: string): AssertionResult {
    const base = {
      type: assertion.type,
      expected: assertion.value,
      message: assertion.message,
    };

    switch (assertion.type) {
      case 'contains':
        return {
          ...base,
          passed: output.includes(String(assertion.value)),
          actual: output.includes(String(assertion.value)) ? 'found' : 'not found',
        };

      case 'not_contains':
        return {
          ...base,
          passed: !output.includes(String(assertion.value)),
          actual: output.includes(String(assertion.value)) ? 'found' : 'not found',
        };

      case 'regex': {
        const regex = new RegExp(String(assertion.value));
        const match = regex.test(output);
        return {
          ...base,
          passed: match,
          actual: match ? 'matched' : 'no match',
        };
      }

      case 'equals':
        return {
          ...base,
          passed: output.trim() === String(assertion.value).trim(),
          actual: output.trim(),
        };

      case 'starts_with':
        return {
          ...base,
          passed: output.startsWith(String(assertion.value)),
          actual: output.substring(0, String(assertion.value).length),
        };

      case 'ends_with':
        return {
          ...base,
          passed: output.endsWith(String(assertion.value)),
          actual: output.substring(output.length - String(assertion.value).length),
        };

      case 'length_min':
        return {
          ...base,
          passed: output.length >= Number(assertion.value),
          actual: output.length,
        };

      case 'length_max':
        return {
          ...base,
          passed: output.length <= Number(assertion.value),
          actual: output.length,
        };

      case 'json_schema':
        try {
          const parsed = JSON.parse(output);
          return {
            ...base,
            passed: this.validateJsonSchema(parsed, assertion.value),
            actual: parsed,
          };
        } catch {
          return {
            ...base,
            passed: false,
            actual: 'Invalid JSON',
          };
        }

      default:
        return {
          ...base,
          passed: false,
          actual: 'Unknown assertion type',
        };
    }
  }

  private validateJsonSchema(data: unknown, schema: unknown): boolean {
    if (typeof schema !== 'object' || schema === null) {
      return false;
    }

    const schemaObj = schema as Record<string, unknown>;

    if (schemaObj.type) {
      const actualType = Array.isArray(data) ? 'array' : typeof data;
      if (actualType !== schemaObj.type) {
        return false;
      }
    }

    if (schemaObj.properties && typeof data === 'object' && data !== null) {
      const props = schemaObj.properties as Record<string, unknown>;
      const dataObj = data as Record<string, unknown>;

      for (const [key, propSchema] of Object.entries(props)) {
        if (!(key in dataObj)) {
          const required = (schemaObj.required as string[]) || [];
          if (required.includes(key)) {
            return false;
          }
        } else if (!this.validateJsonSchema(dataObj[key], propSchema)) {
          return false;
        }
      }
    }

    return true;
  }
}

export function createTestRunner(options?: { executor?: ExecutorOptions['execute'] }): TestRunner {
  return new TestRunner(options);
}
