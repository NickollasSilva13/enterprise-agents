import { AnthropicProvider } from './anthropic';
import { ClaudeCodeProvider } from './claude-code';
import { CodexProvider } from './codex';
import { OllamaProvider } from './ollama';
import { OpenAiCompatibleProvider } from './openai-compatible';
import {
  type CommandProviderSettings,
  type HttpProviderSettings,
  type ModelProvider,
  ProviderError,
  type ProviderSettings,
} from './types';

/** Builds the adapter for a configured provider. Injectable, so tests can swap it. */
export type ProviderFactory = (settings: ProviderSettings) => ModelProvider;

/** A stored provider always has the field its kind needs; a bug would not. */
function http(settings: ProviderSettings): HttpProviderSettings {
  if (!settings.baseUrl) {
    throw new ProviderError('invalid_response', undefined, 'provider without a base url');
  }
  return { ...settings, baseUrl: settings.baseUrl };
}

function command(settings: ProviderSettings): CommandProviderSettings {
  if (!settings.command) {
    throw new ProviderError('program_missing', undefined, 'provider without a command');
  }
  return { ...settings, command: settings.command };
}

export const createProvider: ProviderFactory = (settings) => {
  switch (settings.kind) {
    case 'ollama':
      return new OllamaProvider(http(settings));
    case 'openai_compatible':
      return new OpenAiCompatibleProvider(http(settings));
    case 'anthropic':
      return new AnthropicProvider(http(settings));
    case 'claude_code':
      return new ClaudeCodeProvider(command(settings));
    case 'codex':
      return new CodexProvider(command(settings));
  }
};
