# Contributing to prompt-forge

Thank you for your interest in contributing to prompt-forge! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Setup

```bash
# Clone the repository
git clone https://github.com/yourorg/prompt-forge.git
cd prompt-forge

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Project Structure

```
prompt-forge/
├── packages/
│   ├── core/          # Core library (types, registry, templating)
│   └── cli/           # CLI application
├── examples/          # Example projects
└── docs/              # Documentation
```

## Development Workflow

### Making Changes

1. Create a new branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Add tests for new functionality
4. Run tests: `pnpm test`
5. Run linting: `pnpm lint`
6. Commit using conventional commits

### Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

Examples:
```
feat: add semantic similarity assertion type
fix: handle empty template variables
docs: add examples for JSON schema validation
```

### Pull Requests

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass
4. Request review from maintainers

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Meaningful variable and function names
- Comments for complex logic only

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for specific package
pnpm --filter @prompt-forge/core test
```

## Reporting Issues

When reporting issues, please include:

1. prompt-forge version
2. Node.js version
3. Operating system
4. Minimal reproduction case
5. Expected vs actual behavior

## Feature Requests

We welcome feature requests! Please:

1. Check existing issues first
2. Describe the use case
3. Provide examples if possible

## Code of Conduct

Be respectful and constructive. We're all here to build something useful together.

## Questions?

Open a GitHub Discussion or reach out to maintainers.

Thank you for contributing!
