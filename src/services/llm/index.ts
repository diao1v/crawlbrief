import { config } from '../../config.js';
import { LLMError } from '../../lib/errors.js';
import { AnthropicProvider } from './anthropic.js';
import { AzureProvider } from './azure.js';
import { OpenAIProvider } from './openai.js';
import type { LLMProvider } from './types.js';

export type { LLMProvider } from './types.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { AzureProvider } from './azure.js';

let cachedProvider: LLMProvider | null = null;

export function createLLMProvider(): LLMProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  switch (config.CRAWLBRIEF_LLM_PROVIDER) {
    case 'openai':
      cachedProvider = new OpenAIProvider();
      break;
    case 'anthropic':
      cachedProvider = new AnthropicProvider();
      break;
    case 'azure':
      cachedProvider = new AzureProvider();
      break;
    default:
      throw new LLMError(`Unknown LLM provider: ${config.CRAWLBRIEF_LLM_PROVIDER}`);
  }

  return cachedProvider;
}

export function getLLMProvider(): LLMProvider {
  return createLLMProvider();
}
