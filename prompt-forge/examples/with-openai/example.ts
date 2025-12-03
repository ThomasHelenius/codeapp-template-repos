/**
 * Example: Using prompt-forge with OpenAI
 *
 * This example shows how to:
 * 1. Load prompts from a YAML file
 * 2. Render prompts with variables
 * 3. Execute prompts with OpenAI
 * 4. Run tests with live LLM execution
 */

import OpenAI from 'openai';
import { PromptRegistry, TemplateEngine, TestRunner } from 'prompt-forge';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  // Load prompts
  const registry = new PromptRegistry();
  await registry.load('prompts.yaml');

  // List available prompts
  console.log('Available prompts:');
  for (const prompt of registry.list()) {
    console.log(`  - ${prompt.id}: ${prompt.name}`);
  }

  // Render and execute a prompt
  const chatPrompt = registry.getOrThrow('chat-assistant');
  const engine = new TemplateEngine();

  const { content } = engine.renderPrompt(chatPrompt, {
    message: 'What is the capital of France?',
    persona: 'a geography expert',
    tone: 'enthusiastically',
  });

  console.log('\n--- Rendered Prompt ---');
  console.log(content);

  // Execute with OpenAI
  console.log('\n--- OpenAI Response ---');
  const response = await openai.chat.completions.create({
    model: chatPrompt.metadata.model || 'gpt-4',
    messages: [{ role: 'user', content }],
    max_tokens: chatPrompt.metadata.maxTokens,
    temperature: chatPrompt.metadata.temperature,
  });

  console.log(response.choices[0]?.message?.content);

  // Run tests with live execution
  console.log('\n--- Running Tests with Live Execution ---');

  const runner = new TestRunner({
    executor: async (prompt, options) => {
      const completion = await openai.chat.completions.create({
        model: options?.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options?.maxTokens || 500,
        temperature: options?.temperature || 0.7,
      });
      return completion.choices[0]?.message?.content || '';
    },
  });

  // Create a simple test
  const testResult = await runner.run(chatPrompt, {
    id: 'chat-test',
    name: 'Chat assistant responds about capitals',
    promptId: 'chat-assistant',
    inputs: {
      message: 'What is the capital of Japan?',
      persona: 'a geography expert',
    },
    assertions: [
      { type: 'contains', value: 'Tokyo', message: 'Should mention Tokyo' },
      { type: 'length_min', value: 10, message: 'Should have substantial response' },
    ],
  });

  console.log(`Test "${testResult.testName}": ${testResult.passed ? 'PASSED' : 'FAILED'}`);
  if (!testResult.passed) {
    console.log('Assertions:');
    for (const assertion of testResult.assertions) {
      console.log(`  ${assertion.passed ? '✓' : '✗'} ${assertion.type}: ${assertion.message}`);
    }
  }
}

main().catch(console.error);
