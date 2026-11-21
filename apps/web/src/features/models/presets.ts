import { type Provider, PROVIDER_KIND_INFO, type ProviderKind } from '@ea/shared';

/**
 * The services offered when adding a provider. Most of them speak the OpenAI
 * protocol, so they are the `openai_compatible` kind with the service's own
 * address: the server needs nothing new, and an address typed by hand still
 * works as before. A preset is only a starting point in the form; what is
 * stored is the kind and the address.
 */
export type PresetId =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'openrouter'
  | 'compatible'
  | 'claude_code'
  | 'codex';

/** How the provider is reached: a service over its API, or a harness on this computer. */
export type PresetGroup = 'api' | 'harness';

export interface ProviderPreset {
  readonly id: PresetId;
  readonly group: PresetGroup;
  readonly kind: ProviderKind;
  readonly label: string;
  readonly defaultName: string;
  /** Empty for a harness, and for the generic entry, whose address the user types. */
  readonly baseUrl: string;
  readonly apiKey: 'none' | 'optional' | 'required';
  readonly description: string;
}

const compatible = (
  id: PresetId,
  label: string,
  baseUrl: string,
  description: string,
): ProviderPreset => ({
  id,
  group: 'api',
  kind: 'openai_compatible',
  label,
  defaultName: label,
  baseUrl,
  apiKey: 'required',
  description,
});

const fromKind = (
  id: PresetId,
  group: PresetGroup,
  kind: ProviderKind,
  label: string,
): ProviderPreset => {
  const info = PROVIDER_KIND_INFO[kind];
  return {
    id,
    group,
    kind,
    label,
    defaultName: info.defaultName,
    baseUrl: info.defaultBaseUrl,
    apiKey: info.apiKey,
    description: info.description,
  };
};

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  fromKind('ollama', 'api', 'ollama', 'Ollama'),
  compatible(
    'openai',
    'OpenAI',
    'https://api.openai.com/v1',
    'Modelos GPT, pela API da OpenAI. Cobrado por uso.',
  ),
  fromKind('anthropic', 'api', 'anthropic', 'Anthropic'),
  compatible(
    'google',
    'Google',
    'https://generativelanguage.googleapis.com/v1beta/openai',
    'Modelos Gemini, pela API do Google AI Studio. Tem cota gratuita; acima dela, cobrado por uso.',
  ),
  compatible(
    'deepseek',
    'DeepSeek',
    'https://api.deepseek.com/v1',
    'Modelos DeepSeek, pela API da DeepSeek. Cobrado por uso.',
  ),
  compatible(
    'groq',
    'Groq',
    'https://api.groq.com/openai/v1',
    'Modelos abertos (Llama, Qwen e outros) com resposta muito rápida, pela API da Groq.',
  ),
  compatible(
    'mistral',
    'Mistral',
    'https://api.mistral.ai/v1',
    'Modelos Mistral, pela API da Mistral AI. Cobrado por uso.',
  ),
  compatible(
    'openrouter',
    'OpenRouter',
    'https://openrouter.ai/api/v1',
    'Uma chave só para modelos de vários fornecedores, pela OpenRouter. Cobrado por uso.',
  ),
  {
    id: 'compatible',
    group: 'api',
    kind: 'openai_compatible',
    label: 'Outro compatível',
    defaultName: 'Provedor compatível',
    baseUrl: '',
    apiKey: 'optional',
    description:
      'LM Studio, vLLM e outros serviços com o protocolo da OpenAI. Informe o endereço com a versão, como http://127.0.0.1:1234/v1.',
  },
  fromKind('claude_code', 'harness', 'claude_code', 'Claude Code'),
  fromKind('codex', 'harness', 'codex', 'Codex'),
];

export const PRESET_GROUPS: readonly { id: PresetGroup; label: string; description: string }[] = [
  {
    id: 'api',
    label: 'API',
    description: 'Serviços acessados por endereço, com chave de API, ou o Ollama neste computador.',
  },
  {
    id: 'harness',
    label: 'Harness',
    description:
      'Programas já instalados e conectados neste computador, que usam a sua assinatura em vez de chave de API.',
  },
];

export function presetById(id: PresetId): ProviderPreset {
  const preset = PROVIDER_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown provider preset: ${id}`);
  return preset;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Which preset a stored provider came from, told by its kind and the host of
 * its address (the preset itself is not stored). A compatible provider at an
 * address of no known service is the generic entry.
 */
export function presetOf(provider: Pick<Provider, 'kind' | 'baseUrl'>): ProviderPreset {
  const host = provider.baseUrl === null ? null : hostOf(provider.baseUrl);
  const match = PROVIDER_PRESETS.find(
    (preset) =>
      preset.kind === provider.kind &&
      (preset.kind !== 'openai_compatible' ||
        (preset.baseUrl !== '' && hostOf(preset.baseUrl) === host)),
  );
  return match ?? presetById('compatible');
}
