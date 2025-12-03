import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { Prompt, PromptFile, PromptFileSchema, PromptSchema } from './types.js';

export interface RegistryOptions {
  basePath?: string;
  filePattern?: string;
}

export class PromptRegistry {
  private prompts: Map<string, Prompt> = new Map();
  private basePath: string;

  constructor(options: RegistryOptions = {}) {
    this.basePath = options.basePath || process.cwd();
  }

  async load(filePath?: string): Promise<void> {
    const targetPath = filePath || this.findPromptFile();
    if (!targetPath) {
      throw new Error('No prompt file found. Create a prompts.yaml or prompts.json file.');
    }

    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(this.basePath, targetPath);

    const content = await fs.promises.readFile(absolutePath, 'utf-8');
    const data = this.parseFile(absolutePath, content);

    const validated = PromptFileSchema.parse(data);

    for (const prompt of validated.prompts) {
      this.prompts.set(prompt.id, prompt);
    }
  }

  loadSync(filePath?: string): void {
    const targetPath = filePath || this.findPromptFile();
    if (!targetPath) {
      throw new Error('No prompt file found. Create a prompts.yaml or prompts.json file.');
    }

    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(this.basePath, targetPath);

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const data = this.parseFile(absolutePath, content);

    const validated = PromptFileSchema.parse(data);

    for (const prompt of validated.prompts) {
      this.prompts.set(prompt.id, prompt);
    }
  }

  private findPromptFile(): string | null {
    const candidates = [
      'prompts.yaml',
      'prompts.yml',
      'prompts.json',
      '.prompts/index.yaml',
      '.prompts/index.yml',
      '.prompts/index.json',
    ];

    for (const candidate of candidates) {
      const fullPath = path.join(this.basePath, candidate);
      if (fs.existsSync(fullPath)) {
        return candidate;
      }
    }

    return null;
  }

  private parseFile(filePath: string, content: string): unknown {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      return yaml.parse(content);
    }

    if (ext === '.json') {
      return JSON.parse(content);
    }

    throw new Error(`Unsupported file format: ${ext}`);
  }

  get(id: string): Prompt | undefined {
    return this.prompts.get(id);
  }

  getOrThrow(id: string): Prompt {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      throw new Error(`Prompt not found: ${id}`);
    }
    return prompt;
  }

  getByVersion(id: string, version: string): Prompt | undefined {
    const prompt = this.prompts.get(id);
    if (prompt && prompt.version === version) {
      return prompt;
    }
    return undefined;
  }

  list(): Prompt[] {
    return Array.from(this.prompts.values());
  }

  listByTag(tag: string): Prompt[] {
    return this.list().filter((p) => p.tags.includes(tag));
  }

  has(id: string): boolean {
    return this.prompts.has(id);
  }

  add(prompt: Prompt): void {
    const validated = PromptSchema.parse(prompt);
    this.prompts.set(validated.id, validated);
  }

  remove(id: string): boolean {
    return this.prompts.delete(id);
  }

  clear(): void {
    this.prompts.clear();
  }

  async save(filePath: string): Promise<void> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.basePath, filePath);

    const data: PromptFile = {
      version: '1.0',
      prompts: this.list(),
    };

    const ext = path.extname(absolutePath).toLowerCase();
    let content: string;

    if (ext === '.yaml' || ext === '.yml') {
      content = yaml.stringify(data);
    } else if (ext === '.json') {
      content = JSON.stringify(data, null, 2);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, content, 'utf-8');
  }

  get size(): number {
    return this.prompts.size;
  }
}

export function createRegistry(options?: RegistryOptions): PromptRegistry {
  return new PromptRegistry(options);
}
