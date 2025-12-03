# Contributing to context-window

Thank you for your interest in contributing! This document provides guidelines for contributors.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended)

### Setup

```bash
git clone https://github.com/yourorg/context-window.git
cd context-window
pnpm install
pnpm build
```

### Project Structure

```
context-window/
├── packages/
│   ├── core/              # Core library
│   │   ├── src/
│   │   │   ├── scanner/   # File discovery
│   │   │   ├── parser/    # Language parsing
│   │   │   ├── compressor/# Compression strategies
│   │   │   └── formatter/ # Output formatting
│   │   └── package.json
│   └── cli/               # CLI application
├── examples/
└── docs/
```

## Development

### Running the CLI

```bash
# Development mode
pnpm --filter context-window dev compress ./test-project

# After building
pnpm --filter context-window build
node packages/cli/bin/cw.js compress ./test-project
```

### Running Tests

```bash
pnpm test
```

### Adding a New Language Parser

1. Create a new parser class in `packages/core/src/parser/`
2. Implement the `LanguageParser` interface
3. Register it in the `parsers` map in `index.ts`
4. Add tests for the new parser

```typescript
export class GoParser extends LanguageParser {
  parse(content: string): ParseResult {
    // Implementation
  }
}
```

### Adding a New Compression Strategy

1. Add the strategy name to the `CompressionStrategy` type
2. Implement the strategy method in `Compressor` class
3. Add it to the `applyStrategy` switch statement

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Update documentation
6. Submit PR

## Code Style

- TypeScript strict mode
- ESLint + Prettier
- Conventional commits

## License

MIT
