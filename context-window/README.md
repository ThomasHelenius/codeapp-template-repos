# context-window

<div align="center">

**Intelligent code compression for LLM context windows**

[![npm version](https://img.shields.io/npm/v/context-window.svg)](https://www.npmjs.com/package/context-window)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Getting Started](#getting-started) • [Strategies](#compression-strategies) • [CLI](#cli-commands) • [API](#programmatic-usage)

</div>

---

## The Problem

Your codebase has 50,000 lines. GPT-4's context window fits ~8,000 lines. What do you include?

**context-window** intelligently compresses your codebase to maximize useful information within token limits:

- **Parser-aware** compression (not just line truncation)
- **Smart ranking** by file importance
- **Multiple strategies** for different use cases
- **Accurate token counting** with tiktoken

## Getting Started

### Installation

```bash
# npm
npm install -g context-window

# pnpm
pnpm add -g context-window

# yarn
yarn global add context-window
```

### Quick Start

```bash
# Compress current directory to clipboard
cw compress --copy

# Compress with specific token limit
cw compress --max-tokens 32000

# Show codebase statistics
cw stats
```

## Compression Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| `full` | Include complete files until limit | Small codebases |
| `balanced` | Smart mix of full, signatures, types, tree | **General use (default)** |
| `signatures` | Function/class signatures only | API overview |
| `types` | Types, interfaces, enums only | Type-heavy codebases |
| `tree` | File tree only | Large codebases |

### How `balanced` Works

```
┌──────────────────────────────────────────────────────────┐
│                   BALANCED STRATEGY                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Top 20% files (by importance)     → Full content        │
│  Next 30% files                    → Signatures only     │
│  Next 30% files                    → Types only          │
│  Bottom 20% files                  → File tree           │
│                                                          │
│  Importance Score = recency + centrality + focus match   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## CLI Commands

### `cw compress`

Compress a codebase for LLM context.

```bash
cw compress [path] [options]

Options:
  -m, --max-tokens <n>     Maximum tokens (default: 128000)
  -s, --strategy <name>    Strategy: full, balanced, signatures, types, tree
  -o, --output <file>      Output to file
  --copy                   Copy to clipboard
  -f, --format <format>    Output format: markdown, xml, json, plain
  --include <patterns...>  Include glob patterns
  --exclude <patterns...>  Exclude glob patterns
  --focus <patterns...>    Prioritize specific files
  --include-tests          Include test files
  --no-stats               Exclude stats from output
```

### Examples

```bash
# Compress src directory, copy to clipboard
cw compress src --copy

# Focus on specific module
cw compress --focus "src/auth/**" --max-tokens 16000

# Signatures only for API documentation
cw compress --strategy signatures -o api-context.md

# Types only for type-heavy analysis
cw compress --strategy types --include "**/*.ts"

# Exclude tests and generated files
cw compress --exclude "**/*.test.ts" "**/*.generated.ts"
```

### `cw stats`

Show codebase statistics.

```bash
cw stats [path]

# Output
╭──────────────────────────────╮
│   Codebase Statistics        │
│                              │
│   Total Files: 234           │
│   Total Lines: 45,678        │
│   Total Size: 1.2 MB         │
│   Scan Time: 42ms            │
╰──────────────────────────────╯

Languages:
┌────────────┬───────┬────────┐
│ Language   │ Files │ %      │
├────────────┼───────┼────────┤
│ typescript │ 180   │ 76.9%  │
│ json       │ 32    │ 13.7%  │
│ markdown   │ 15    │ 6.4%   │
└────────────┴───────┴────────┘
```

### `cw models`

List supported models and token limits.

```bash
cw models

# Output
┌─────────────────┬─────────────┬──────────────┐
│ Model           │ Token Limit │ Est. Lines   │
├─────────────────┼─────────────┼──────────────┤
│ gpt-4           │ 8.2K        │ ~1,024       │
│ gpt-4-turbo     │ 128K        │ ~16,000      │
│ claude-3-opus   │ 200K        │ ~25,000      │
└─────────────────┴─────────────┴──────────────┘
```

### `cw init`

Create a configuration file.

```bash
cw init

# Creates .contextwindow.yaml
```

## Configuration File

```yaml
# .contextwindow.yaml

maxTokens: 128000
strategy: balanced

include:
  - "src/**/*"
  - "lib/**/*"

exclude:
  - "**/node_modules/**"
  - "**/dist/**"
  - "**/*.test.*"

priorityPatterns:
  - "src/index.*"
  - "**/types/**"

includeTests: false
includeComments: true
includeDocstrings: true
```

## Programmatic Usage

```typescript
import { compress, scan, formatOutput } from 'context-window';

// Compress a directory
const result = await compress('./src', {
  maxTokens: 32000,
  strategy: 'balanced',
  focusFiles: ['src/api/**'],
});

console.log(result.content);
console.log(`Compressed ${result.stats.originalTokens} → ${result.stats.compressedTokens} tokens`);

// Get statistics
const stats = await scan('./src');
console.log(`${stats.files.length} files, ${stats.totalLines} lines`);

// Format output
const markdown = formatOutput(result, { format: 'markdown', includeStats: true });
const xml = formatOutput(result, { format: 'xml' });
```

## Output Formats

### Markdown (default)

```markdown
# Compression Stats

| Metric | Value |
|--------|-------|
| Files | 45 / 234 |
| Tokens | 31.2K / 156K |
| Compression | 80% reduction |

---

## src/index.ts

\`\`\`typescript
export function main() { ... }
\`\`\`
```

### XML

```xml
<context>
  <stats>
    <original_tokens>156000</original_tokens>
    <compressed_tokens>31200</compressed_tokens>
  </stats>
  <content>
    ...
  </content>
</context>
```

## Token Counting

context-window uses [tiktoken](https://github.com/openai/tiktoken) for accurate OpenAI-compatible token counting.

```typescript
import { countTokens, formatTokenCount } from 'context-window';

const tokens = countTokens('Hello, world!');
console.log(formatTokenCount(tokens)); // "4"
console.log(formatTokenCount(150000)); // "150K"
```

## Supported Languages

Full parsing support:
- TypeScript / JavaScript
- Python

Basic support (signature extraction):
- Go, Rust, Java, C/C++, C#, Ruby, PHP, Swift, Kotlin

## How It Works

1. **Scan** - Walk directory, respect .gitignore, detect languages
2. **Parse** - Extract symbols, imports, exports using language parsers
3. **Rank** - Score files by recency, centrality, and focus patterns
4. **Compress** - Apply strategy to fit within token budget
5. **Format** - Output as Markdown, XML, JSON, or plain text

## Roadmap

- [ ] VS Code extension
- [ ] Tree-sitter integration for more languages
- [ ] Semantic similarity for smart deduplication
- [ ] Watch mode for live updates
- [ ] Custom compression plugins

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
