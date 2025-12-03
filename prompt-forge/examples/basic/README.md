# Basic Example

This example demonstrates the core features of prompt-forge.

## Prompts Included

| ID | Description |
|----|-------------|
| `greeting` | Simple personalized greeting |
| `summarize` | Text summarization with style options |
| `code-review` | Code review feedback generator |
| `extract-entities` | Structured data extraction |

## Usage

```bash
# List all prompts
forge list

# View a specific prompt
forge show summarize

# Render a prompt
forge render greeting -v name="Alice" -v company="Acme"

# Render with JSON input
forge render extract-entities --json '{"text": "John works at Google", "entities": ["name", "company"]}'

# Run all tests
forge test

# Run tests for specific prompt
forge test --prompt summarize
```

## Files

- `prompts.yaml` - Prompt definitions
- `prompts.test.yaml` - Test cases
