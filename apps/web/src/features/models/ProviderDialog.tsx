import {
  type Provider,
  providerIsExternal,
  PROVIDER_KIND_INFO,
  PROVIDER_LIMITS,
  providerCreateSchema,
  type ProviderUpdate,
} from '@ea/shared';
import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Form';
import { ProviderLogo } from '../../components/ProviderLogo';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useCreateProvider, useSyncModels, useUpdateProvider } from '../../lib/provider-queries';
import { ExternalNotice } from './ExternalNotice';
import { FormError } from '../../components/Notice';
import {
  PRESET_GROUPS,
  type PresetGroup,
  type PresetId,
  presetById,
  presetOf,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from './presets';

type Errors = Partial<Record<'name' | 'baseUrl' | 'command' | 'apiKey', string>>;

interface ProviderDialogProps {
  /** The provider being edited; absent to add a new one. */
  provider?: Provider;
  onClose: () => void;
}

/** The mark of a provider on a small tile, the same in the form and on the cards. */
export function LogoTile({ preset, size = 'md' }: { preset: PresetId; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg border border-line bg-sheet-raised text-chalk ${
        size === 'lg' ? 'size-11' : 'size-9'
      }`}
    >
      <ProviderLogo preset={preset} className={size === 'lg' ? 'size-6' : 'size-5'} />
    </span>
  );
}

interface PresetPickerProps {
  selected: ProviderPreset;
  onSelect: (preset: ProviderPreset) => void;
}

/**
 * The services, in two tabs: those reached by an API and the harnesses run
 * on this computer, which work differently (subscription, no key).
 */
function PresetPicker({ selected, onSelect }: PresetPickerProps) {
  const id = useId();
  const tabs = useRef<Record<PresetGroup, HTMLButtonElement | null>>({ api: null, harness: null });
  const group = selected.group;
  const groupInfo = PRESET_GROUPS.find((candidate) => candidate.id === group);

  const openGroup = (next: PresetGroup) => {
    if (next === group) return;
    const first = PROVIDER_PRESETS.find((preset) => preset.group === next);
    if (first) onSelect(first);
  };

  // Arrow keys move between the tabs, as the tabs pattern expects.
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = PRESET_GROUPS.findIndex((candidate) => candidate.id === group);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = PRESET_GROUPS[(index + step + PRESET_GROUPS.length) % PRESET_GROUPS.length];
    if (!next) return;
    openGroup(next.id);
    tabs.current[next.id]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Forma de conexão"
        className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-ink p-1"
      >
        {PRESET_GROUPS.map((candidate) => {
          const active = candidate.id === group;
          return (
            <button
              key={candidate.id}
              ref={(element) => {
                tabs.current[candidate.id] = element;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${candidate.id}`}
              aria-selected={active}
              aria-controls={`${id}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => openGroup(candidate.id)}
              onKeyDown={onTabKey}
              className={`min-h-9 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow ${
                active ? 'bg-sheet-raised text-chalk shadow-lift' : 'text-dim hover:text-chalk'
              }`}
            >
              {candidate.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${group}`}
        className="mt-3"
      >
        {groupInfo && <p className="mb-3 text-sm text-dim">{groupInfo.description}</p>}
        <fieldset>
          <legend className="sr-only">Provedor</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
            {PROVIDER_PRESETS.filter((preset) => preset.group === group).map((preset) => (
              <label
                key={preset.id}
                className="relative flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-sheet px-2.5 py-2 text-sm font-semibold transition-colors hover:border-line-strong has-[:checked]:border-glow has-[:checked]:bg-sheet-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-glow"
              >
                <input
                  type="radio"
                  name={`${id}-preset`}
                  value={preset.id}
                  checked={preset.id === selected.id}
                  onChange={() => onSelect(preset)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                <LogoTile preset={preset.id} />
                <span className="min-w-0 leading-tight">{preset.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-2 text-sm text-dim">{selected.description}</p>
      </div>
    </div>
  );
}

export function ProviderDialog({ provider, onClose }: ProviderDialogProps) {
  const [preset, setPreset] = useState<ProviderPreset>(() =>
    provider ? presetOf(provider) : presetById('ollama'),
  );
  const kind = preset.kind;
  const info = PROVIDER_KIND_INFO[kind];
  const [name, setName] = useState(provider?.name ?? preset.defaultName);
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? preset.baseUrl);
  const [command, setCommand] = useState(provider?.command ?? info.defaultCommand);
  /** A harness is run as a program; the other kinds answer at an address. */
  const isCommand = info.transport === 'command';
  const [apiKey, setApiKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const create = useCreateProvider();
  const update = useUpdateProvider();
  const sync = useSyncModels();
  const notify = useToast();

  const failure = create.error ?? update.error;
  const generalError =
    failure && Object.keys(fieldErrors(failure)).length === 0 ? errorMessage(failure) : undefined;
  const saving = create.isPending || update.isPending;

  /** Choosing a service fills in its usual name and address. */
  const choosePreset = (next: ProviderPreset) => {
    setPreset(next);
    setName(next.defaultName);
    setBaseUrl(next.baseUrl);
    setCommand(PROVIDER_KIND_INFO[next.kind].defaultCommand);
    setApiKey('');
    setErrors({});
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const typedKey = apiKey.trim();
    const parsed = providerCreateSchema.safeParse({
      name,
      kind,
      ...(isCommand ? { command } : { baseUrl }),
      ...(typedKey ? { apiKey: typedKey } : {}),
    });
    const problems: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Errors;
        problems[field] ??= issue.message;
      }
    }
    if (!provider && preset.apiKey === 'required' && !typedKey) {
      problems.apiKey = `${preset.label} exige uma chave de API.`;
    }
    if (!parsed.success || Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    const onError = (error: unknown) => setErrors(fieldErrors(error));

    if (provider) {
      const patch: ProviderUpdate = isCommand
        ? { name: parsed.data.name, command: parsed.data.command }
        : { name: parsed.data.name, baseUrl: parsed.data.baseUrl };
      if (typedKey) patch.apiKey = typedKey;
      else if (removeKey) patch.apiKey = null;
      update.mutate(
        { id: provider.id, patch },
        {
          onSuccess: (saved) => {
            notify(`${saved.name} salvo.`);
            onClose();
          },
          onError,
        },
      );
      return;
    }

    create.mutate(parsed.data, {
      onSuccess: (saved) => {
        notify(`${saved.name} adicionado. Buscando os modelos…`);
        // Fetch its models right away, so the user lands on a useful screen.
        sync.mutate(saved.id, {
          onError: (error) => notify(errorMessage(error), 'fail'),
        });
        onClose();
      },
      onError,
    });
  };

  const keyHint = (() => {
    if (provider?.hasApiKey) {
      return `Deixe vazio para manter a chave atual (${provider.apiKeyHint ?? '…'}).`;
    }
    if (preset.apiKey === 'optional') return 'Deixe vazio se o serviço não pedir chave.';
    return 'Fica guardada no cofre de credenciais do sistema, fora do banco de dados.';
  })();

  return (
    <Modal
      title={provider ? 'Editar provedor' : 'Adicionar provedor'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="provider-form" disabled={saving}>
            {provider ? 'Salvar provedor' : 'Adicionar provedor'}
          </Button>
        </>
      }
    >
      <form id="provider-form" onSubmit={submit} noValidate className="space-y-4">
        {provider ? (
          <p className="flex items-center gap-3 text-sm text-dim">
            <LogoTile preset={preset.id} />
            {preset.label}
          </p>
        ) : (
          <PresetPicker selected={preset} onSelect={choosePreset} />
        )}

        <TextField
          label="Nome"
          value={name}
          maxLength={PROVIDER_LIMITS.name}
          error={errors.name}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((current) => ({ ...current, name: undefined }));
          }}
        />

        {isCommand ? (
          <TextField
            label="Comando"
            value={command}
            maxLength={PROVIDER_LIMITS.command}
            error={errors.command}
            hint="Programa do harness, já instalado e conectado neste computador. Só o nome ou o caminho, sem argumentos."
            onChange={(event) => {
              setCommand(event.target.value);
              setErrors((current) => ({ ...current, command: undefined }));
            }}
          />
        ) : (
          <TextField
            label="Endereço"
            value={baseUrl}
            inputMode="url"
            maxLength={PROVIDER_LIMITS.baseUrl}
            error={errors.baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value);
              setErrors((current) => ({ ...current, baseUrl: undefined }));
            }}
          />
        )}

        {isCommand && (
          <p className="text-sm text-dim">
            Agentes deste provedor usam a sua assinatura do harness, sem chave de API e sem custo
            por token. Eles usam as ferramentas da plataforma conforme as permissões de cada agente,
            nunca as do próprio harness. Cada passo com ferramenta executa o programa de novo, então
            a resposta demora mais que a de um provedor de API.
          </p>
        )}

        {preset.apiKey !== 'none' && (
          <TextField
            label="Chave de API"
            type="password"
            autoComplete="off"
            value={apiKey}
            disabled={removeKey}
            maxLength={PROVIDER_LIMITS.apiKey}
            error={errors.apiKey}
            hint={keyHint}
            onChange={(event) => {
              setApiKey(event.target.value);
              setErrors((current) => ({ ...current, apiKey: undefined }));
            }}
          />
        )}

        {provider?.hasApiKey && info.apiKey === 'optional' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={removeKey}
              onChange={(event) => {
                setRemoveKey(event.target.checked);
                setApiKey('');
              }}
            />
            Remover a chave guardada
          </label>
        )}

        {providerIsExternal(kind, isCommand ? null : baseUrl) && (
          <ExternalNotice harness={isCommand} />
        )}

        {generalError && <FormError>{generalError}</FormError>}
      </form>
    </Modal>
  );
}
