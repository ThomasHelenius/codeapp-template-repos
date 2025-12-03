# prompt-forge

<div align="center">

**Version control, testing, and management for LLM prompts**

[![npm version](https://img.shields.io/npm/v/prompt-forge.svg)](https://www.npmjs.com/package/prompt-forge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Getting Started](#getting-started) • [Documentation](#documentation) • [Examples](#examples) • [Contributing](#contributing)

</div>

---

## Why prompt-forge?

Prompts are code. They deserve the same rigor as your application code:

- **Version Control** - Track changes to prompts over time with semantic versioning
- **Testing** - Write assertions to catch regressions before they hit production
- **Templating** - Use variables with Mustache-style `{{placeholders}}`
- **Validation** - Catch errors before runtime with schema validation
- **CLI** - Manage prompts from the command line or CI/CD pipelines

## Getting Started

### Installation

```bash
# npm
npm install -g prompt-forge

# pnpm
pnpm add -g prompt-forge

# yarn
yarn global add prompt-forge
```

### Initialize a Project

```bash
forge init
```

This creates two files:

- `prompts.yaml` - Your prompt definitions
- `prompts.test.yaml` - Tests for your prompts

### Define Your Prompts

```yaml
# prompts.yaml
version: "1.0"
prompts:
  - id: summarize
    name: Text Summarizer
    description: Summarizes text to key points
    version: "1.0.0"
    template: |
      Summarize the following text in {{style}} style.
      Keep it under {{max_words}} words.

      Text:
      {{text}}
    variables:
      - name: text
        type: string
        required: true
      - name: style
        type: string
        default: concise
      - name: max_words
        type: number
        default: 100
    tags:
      - summarization
      - text
    metadata:
      model: gpt-4
      temperature: 0.3
```

### Write Tests

```yaml
# prompts.test.yaml
version: "1.0"
tests:
  - id: summarize-test-1
    name: Basic summarization
    promptId: summarize
    inputs:
      text: "Long article content here..."
      style: bullet-points
      max_words: 50
    assertions:
      - type: contains
        value: "•"
        message: Should contain bullet points
      - type: length_max
        value: 500
        message: Should be concise
```

### Run Tests

```bash
forge test
```

```
Running 1 test(s)...

✓ PASS Basic summarization (2ms)

Results: 1 passed, 0 failed
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `forge init` | Initialize a new project |
| `forge list` | List all prompts |
| `forge show <id>` | Show prompt details |
| `forge render <id>` | Render a prompt with variables |
| `forge test` | Run prompt tests |
| `forge validate` | Validate prompt files |

### Examples

```bash
# List prompts filtered by tag
forge list --tag summarization

# Render with variables
forge render summarize -v text="Hello world" -v style=formal

# Render with JSON variables
forge render summarize --json '{"text": "Hello", "style": "casual"}'

# Copy rendered prompt to clipboard
forge render summarize -v text="Test" --copy

# Run tests for specific prompt
forge test --prompt summarize

# Output as JSON
forge list --json
```

## Programmatic Usage

```typescript
import { PromptRegistry, TemplateEngine, TestRunner } from 'prompt-forge';

// Load prompts
const registry = new PromptRegistry();
await registry.load('prompts.yaml');

// Get a prompt
const prompt = registry.get('summarize');

// Render with variables
const engine = new TemplateEngine();
const { content } = engine.renderPrompt(prompt, {
  text: 'Your text here',
  style: 'bullet-points',
});

console.log(content);
```

## Assertion Types

| Type | Description | Example |
|------|-------------|---------|
| `contains` | Output contains value | `{ type: 'contains', value: 'hello' }` |
| `not_contains` | Output doesn't contain value | `{ type: 'not_contains', value: 'error' }` |
| `regex` | Output matches regex | `{ type: 'regex', value: '^Hello.*' }` |
| `equals` | Output equals value (trimmed) | `{ type: 'equals', value: 'exact match' }` |
| `starts_with` | Output starts with value | `{ type: 'starts_with', value: 'Summary:' }` |
| `ends_with` | Output ends with value | `{ type: 'ends_with', value: '.' }` |
| `length_min` | Minimum output length | `{ type: 'length_min', value: 100 }` |
| `length_max` | Maximum output length | `{ type: 'length_max', value: 500 }` |
| `json_schema` | Validates JSON structure | `{ type: 'json_schema', value: { type: 'object' } }` |

## File Formats

prompt-forge supports both YAML and JSON:

- `prompts.yaml` / `prompts.yml` / `prompts.json`
- `prompts.test.yaml` / `prompts.test.yml` / `prompts.test.json`

## CI/CD Integration

### GitHub Actions

```yaml
name: Test Prompts
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g prompt-forge
      - run: forge validate
      - run: forge test
```

## Roadmap

- [ ] A/B testing support
- [ ] Execution logging & analytics
- [ ] Web dashboard
- [ ] LangChain integration
- [ ] VS Code extension

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT
