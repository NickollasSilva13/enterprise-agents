import { isExternalUrl, providerCreateSchema } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { presetById, presetOf, PROVIDER_PRESETS } from './presets';

describe('provider presets', () => {
  it('fills in a valid provider for every service', () => {
    for (const preset of PROVIDER_PRESETS) {
      if (preset.id === 'compatible') continue;
      const parsed = providerCreateSchema.safeParse({
        name: preset.defaultName,
        kind: preset.kind,
        ...(preset.group === 'harness' ? { command: 'programa' } : { baseUrl: preset.baseUrl }),
      });
      expect(parsed.success, preset.id).toBe(true);
    }
  });

  it('asks for a key on every paid service and leaves the harnesses apart', () => {
    for (const id of [
      'openai',
      'anthropic',
      'google',
      'deepseek',
      'groq',
      'mistral',
      'openrouter',
    ] as const) {
      const preset = presetById(id);
      expect(preset.group).toBe('api');
      expect(preset.apiKey).toBe('required');
      expect(isExternalUrl(preset.baseUrl)).toBe(true);
    }
    expect(
      PROVIDER_PRESETS.filter((preset) => preset.group === 'harness').map((p) => p.id),
    ).toEqual(['claude_code', 'codex']);
  });

  it('tells the service of a stored provider by the host of its address', () => {
    const at = (baseUrl: string) => presetOf({ kind: 'openai_compatible', baseUrl }).id;
    expect(at('https://api.openai.com/v1')).toBe('openai');
    expect(at('https://generativelanguage.googleapis.com/v1beta/openai')).toBe('google');
    expect(at('https://api.deepseek.com')).toBe('deepseek');
    expect(at('https://api.groq.com/openai/v1')).toBe('groq');
    expect(at('https://api.mistral.ai/v1')).toBe('mistral');
    expect(at('https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(at('http://127.0.0.1:1234/v1')).toBe('compatible');
    expect(at('não é endereço')).toBe('compatible');
    expect(presetOf({ kind: 'anthropic', baseUrl: 'https://api.anthropic.com' }).id).toBe(
      'anthropic',
    );
    expect(presetOf({ kind: 'ollama', baseUrl: 'http://127.0.0.1:11434' }).id).toBe('ollama');
    expect(presetOf({ kind: 'codex', baseUrl: null }).id).toBe('codex');
  });
});
