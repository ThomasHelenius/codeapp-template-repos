import { z } from 'zod';

export const VariableSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']).default('string'),
  description: z.string().optional(),
  required: z.boolean().default(true),
  default: z.any().optional(),
});

export const PromptMetadataSchema = z.object({
  author: z.string().optional(),
  created: z.string().datetime().optional(),
  updated: z.string().datetime().optional(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const PromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  template: z.string(),
  variables: z.array(VariableSchema).default([]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  tags: z.array(z.string()).default([]),
  metadata: PromptMetadataSchema.default({}),
});

export const AssertionSchema = z.object({
  type: z.enum([
    'contains',
    'not_contains',
    'regex',
    'json_schema',
    'length_min',
    'length_max',
    'equals',
    'starts_with',
    'ends_with',
  ]),
  value: z.any(),
  message: z.string().optional(),
});

export const PromptTestSchema = z.object({
  id: z.string(),
  name: z.string(),
  promptId: z.string(),
  inputs: z.record(z.any()).default({}),
  assertions: z.array(AssertionSchema).default([]),
  expectedOutput: z.string().optional(),
});

export const PromptExecutionSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  promptVersion: z.string(),
  variant: z.string().optional(),
  inputs: z.record(z.any()),
  output: z.string(),
  metrics: z.object({
    latencyMs: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
    cost: z.number().optional(),
    model: z.string(),
  }),
  timestamp: z.string().datetime(),
});

export const PromptFileSchema = z.object({
  version: z.literal('1.0'),
  prompts: z.array(PromptSchema),
});

export const TestFileSchema = z.object({
  version: z.literal('1.0'),
  tests: z.array(PromptTestSchema),
});

export type Variable = z.infer<typeof VariableSchema>;
export type PromptMetadata = z.infer<typeof PromptMetadataSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type Assertion = z.infer<typeof AssertionSchema>;
export type PromptTest = z.infer<typeof PromptTestSchema>;
export type PromptExecution = z.infer<typeof PromptExecutionSchema>;
export type PromptFile = z.infer<typeof PromptFileSchema>;
export type TestFile = z.infer<typeof TestFileSchema>;
