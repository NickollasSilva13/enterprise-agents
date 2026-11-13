import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { OpenAiCompatibleProvider } from './openai-compatible';
import type { ModelProvider, ProviderSettings } from './types';

/** Builds the adapter for a configured provider. Injectable, so tests can swap it. */
export type ProviderFactory = (settings: ProviderSettings) => ModelProvider;

export const createProvider: ProviderFactory = (settings) => {
  switch (settings.kind) {
    case 'ollama':
      return new OllamaProvider(settings);
    case 'openai_compatible':
      return new OpenAiCompatibleProvider(settings);
    case 'anthropic':
      return new AnthropicProvider(settings);
  }
};
