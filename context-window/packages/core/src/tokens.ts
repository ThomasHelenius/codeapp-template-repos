import { Tiktoken, encoding_for_model } from 'tiktoken';

export type TokenModel = 'gpt-4' | 'gpt-4o' | 'gpt-3.5-turbo' | 'claude' | 'default';

let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    // Use cl100k_base encoding (used by GPT-4, GPT-3.5-turbo)
    encoder = encoding_for_model('gpt-4');
  }
  return encoder as Tiktoken;
}

export function countTokens(text: string): number {
  try {
    const enc = getEncoder();
    return enc.encode(text).length;
  } catch {
    // Fallback: rough estimate based on character count
    return Math.ceil(text.length / 4);
  }
}

export function countTokensForFile(content: string, _language?: string): number {
  return countTokens(content);
}

export function estimateTokens(text: string): number {
  // Quick estimation without actual tokenization
  // Average token is ~4 characters in code
  return Math.ceil(text.length / 4);
}

export function truncateToTokens(text: string, maxTokens: number): string {
  const enc = getEncoder();
  const tokens = enc.encode(text);

  if (tokens.length <= maxTokens) {
    return text;
  }

  const truncated = tokens.slice(0, maxTokens);
  return new TextDecoder().decode(enc.decode(truncated));
}

export function tokenStats(text: string): {
  tokens: number;
  characters: number;
  lines: number;
  avgTokensPerLine: number;
} {
  const tokens = countTokens(text);
  const characters = text.length;
  const lines = text.split('\n').length;

  return {
    tokens,
    characters,
    lines,
    avgTokensPerLine: lines > 0 ? tokens / lines : 0,
  };
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export const TOKEN_LIMITS: Record<string, number> = {
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-3.5-turbo': 16385,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-2': 100000,
};

export function getTokenLimit(model: string): number {
  return TOKEN_LIMITS[model] || 8192;
}
