# OpenAI Integration Example

This example shows how to use prompt-forge with OpenAI's API.

## Setup

```bash
# Install dependencies
npm install prompt-forge openai

# Set your API key
export OPENAI_API_KEY=sk-...
```

## Usage

```bash
# Run the example
npx tsx example.ts
```

## Features Demonstrated

1. **Loading prompts** from YAML
2. **Rendering** with variables
3. **Executing** with OpenAI API
4. **Testing** with live LLM execution

## Prompts Included

| ID | Description |
|----|-------------|
| `chat-assistant` | Configurable chat assistant with persona |
| `json-generator` | Converts natural language to JSON |
| `translator` | Language translation with options |

## Example Output

```
Available prompts:
  - chat-assistant: Chat Assistant
  - json-generator: JSON Generator
  - translator: Language Translator

--- Rendered Prompt ---
You are a geography expert, a helpful assistant.

User: What is the capital of France?

Respond helpfully and enthusiastically.

--- OpenAI Response ---
Paris is the capital of France! It's a magnificent city known for...

--- Running Tests with Live Execution ---
Test "Chat assistant responds about capitals": PASSED
```
