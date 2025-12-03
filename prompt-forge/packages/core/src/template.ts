import Mustache from 'mustache';
import { Prompt, Variable } from './types.js';

export interface RenderOptions {
  strict?: boolean;
  escape?: boolean;
}

export interface RenderResult {
  content: string;
  variables: Record<string, unknown>;
  missingVariables: string[];
}

export class TemplateEngine {
  private escapeHtml: boolean;

  constructor(options: { escapeHtml?: boolean } = {}) {
    this.escapeHtml = options.escapeHtml ?? false;

    if (!this.escapeHtml) {
      Mustache.escape = (text: string) => text;
    }
  }

  render(template: string, variables: Record<string, unknown>, options: RenderOptions = {}): string {
    const { strict = false } = options;

    if (strict) {
      const missing = this.getMissingVariables(template, variables);
      if (missing.length > 0) {
        throw new Error(`Missing required variables: ${missing.join(', ')}`);
      }
    }

    return Mustache.render(template, variables);
  }

  renderPrompt(prompt: Prompt, variables: Record<string, unknown>, options: RenderOptions = {}): RenderResult {
    const processedVars = this.applyDefaults(prompt.variables, variables);
    const missingVariables = this.validateVariables(prompt.variables, processedVars);

    if (options.strict && missingVariables.length > 0) {
      throw new Error(`Missing required variables: ${missingVariables.join(', ')}`);
    }

    const content = Mustache.render(prompt.template, processedVars);

    return {
      content,
      variables: processedVars,
      missingVariables,
    };
  }

  private applyDefaults(
    schema: Variable[],
    provided: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...provided };

    for (const variable of schema) {
      if (!(variable.name in result) && variable.default !== undefined) {
        result[variable.name] = variable.default;
      }
    }

    return result;
  }

  private validateVariables(
    schema: Variable[],
    provided: Record<string, unknown>
  ): string[] {
    const missing: string[] = [];

    for (const variable of schema) {
      if (variable.required && !(variable.name in provided)) {
        missing.push(variable.name);
      }
    }

    return missing;
  }

  getMissingVariables(template: string, variables: Record<string, unknown>): string[] {
    const parsed = Mustache.parse(template);
    const required = new Set<string>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractVariables = (tokens: any[]) => {
      for (const token of tokens) {
        const tokenType = token[0];
        if (tokenType === 'name' || tokenType === '&' || tokenType === '{') {
          required.add(token[1]);
        } else if (tokenType === '#' || tokenType === '^') {
          required.add(token[1]);
          if (token[4] && Array.isArray(token[4])) {
            extractVariables(token[4]);
          }
        }
      }
    };

    extractVariables(parsed);

    return Array.from(required).filter((name) => {
      const parts = name.split('.');
      let current: unknown = variables;

      for (const part of parts) {
        if (current === null || current === undefined) {
          return true;
        }
        if (typeof current !== 'object') {
          return true;
        }
        current = (current as Record<string, unknown>)[part];
      }

      return current === undefined;
    });
  }

  extractVariableNames(template: string): string[] {
    const parsed = Mustache.parse(template);
    const names = new Set<string>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extract = (tokens: any[]) => {
      for (const token of tokens) {
        const tokenType = token[0];
        if (tokenType === 'name' || tokenType === '&' || tokenType === '{') {
          names.add(token[1].split('.')[0]);
        } else if (tokenType === '#' || tokenType === '^') {
          names.add(token[1].split('.')[0]);
          if (token[4] && Array.isArray(token[4])) {
            extract(token[4]);
          }
        }
      }
    };

    extract(parsed);
    return Array.from(names);
  }

  validate(template: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      Mustache.parse(template);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid template syntax');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export function createTemplateEngine(options?: { escapeHtml?: boolean }): TemplateEngine {
  return new TemplateEngine(options);
}

export function render(
  template: string,
  variables: Record<string, unknown>,
  options?: RenderOptions
): string {
  const engine = createTemplateEngine();
  return engine.render(template, variables, options);
}
