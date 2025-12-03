# Contributing to kube-dashboard-lite

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Go 1.21 or later
- Access to a Kubernetes cluster (minikube, kind, or remote)
- Docker (for container builds)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourorg/kube-dashboard-lite.git
   cd kube-dashboard-lite
   ```

2. **Install dependencies**
   ```bash
   go mod download
   ```

3. **Run in development mode**
   ```bash
   go run ./cmd/kdl
   ```

4. **Run tests**
   ```bash
   make test
   ```

## Project Structure

```
kube-dashboard-lite/
├── cmd/
│   └── kdl/
│       └── main.go           # Entry point
├── internal/
│   ├── k8s/
│   │   ├── client.go         # Kubernetes client wrapper
│   │   └── types.go          # Type definitions
│   ├── server/
│   │   ├── server.go         # HTTP server
│   │   └── static/
│   │       └── index.html    # Embedded web UI
│   └── handlers/
│       └── handlers.go       # API handlers
├── Dockerfile
├── Makefile
└── README.md
```

## Development Guidelines

### Code Style

- Follow standard Go conventions
- Use `gofmt` for formatting
- Run `golangci-lint` before committing:
  ```bash
  make lint
  ```

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add namespace filtering to pod list
fix: handle nil pointer in log streaming
docs: update API reference for events endpoint
refactor: extract common handler logic
```

Prefixes:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test additions/modifications
- `chore:` - Build, CI, or maintenance tasks

### Testing

- Write tests for new features
- Ensure existing tests pass
- Test with different Kubernetes versions when possible

```bash
# Run all tests
make test

# Run with coverage
make test-coverage
```

### Web UI Development

The web UI is embedded in the binary as a single HTML file with inline CSS/JS:

- Located at `internal/server/static/index.html`
- Uses Tailwind CSS via CDN
- Alpine.js for reactivity
- Keep it minimal and dependency-free

## Making Changes

### For Bug Fixes

1. Create an issue describing the bug
2. Fork the repository
3. Create a branch: `git checkout -b fix/issue-number`
4. Make your changes
5. Test thoroughly
6. Submit a pull request

### For New Features

1. **Open an issue first** to discuss the feature
2. Wait for feedback before implementing
3. Fork and create a branch: `git checkout -b feat/feature-name`
4. Implement the feature
5. Add tests
6. Update documentation
7. Submit a pull request

## Pull Request Process

1. Update the README.md if needed
2. Ensure all tests pass
3. Ensure linting passes
4. Request review from maintainers

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Linting passes
- [ ] Commit messages follow conventions
- [ ] Changes are backward compatible

## Design Principles

When contributing, keep these principles in mind:

1. **Simplicity** - Single binary, no external dependencies
2. **Safety** - Read-only by default, explicit write mode
3. **Performance** - Minimal resource usage
4. **User Experience** - Instant setup, intuitive interface

## Areas for Contribution

### Good First Issues

- UI improvements
- Additional event types
- Documentation improvements
- Test coverage

### Larger Projects

- ConfigMap/Secret viewer
- Node information display
- Resource metrics integration
- Custom resource support

## Questions?

- Open an issue for questions
- Tag with `question` label

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
