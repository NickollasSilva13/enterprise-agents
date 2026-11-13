import {
  isExternalUrl,
  type Provider,
  PROVIDER_KIND_INFO,
  PROVIDER_KINDS,
  PROVIDER_LIMITS,
  providerCreateSchema,
  type ProviderKind,
  type ProviderUpdate,
} from '@ea/shared';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/Button';
import { SelectField, TextField } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useCreateProvider, useSyncModels, useUpdateProvider } from '../../lib/provider-queries';
import { ExternalNotice } from './ExternalNotice';

type Errors = Partial<Record<'name' | 'baseUrl' | 'apiKey', string>>;

interface ProviderDialogProps {
  /** The provider being edited; absent to add a new one. */
  provider?: Provider;
  onClose: () => void;
}

export function ProviderDialog({ provider, onClose }: ProviderDialogProps) {
  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? 'ollama');
  const info = PROVIDER_KIND_INFO[kind];
  const [name, setName] = useState(provider?.name ?? info.defaultName);
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? info.defaultBaseUrl);
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

  /** Choosing a kind fills in its usual name and address. */
  const chooseKind = (next: ProviderKind) => {
    setKind(next);
    setName(PROVIDER_KIND_INFO[next].defaultName);
    setBaseUrl(PROVIDER_KIND_INFO[next].defaultBaseUrl);
    setApiKey('');
    setErrors({});
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const typedKey = apiKey.trim();
    const parsed = providerCreateSchema.safeParse({
      name,
      kind,
      baseUrl,
      ...(typedKey ? { apiKey: typedKey } : {}),
    });
    const problems: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Errors;
        problems[field] ??= issue.message;
      }
    }
    if (!provider && info.apiKey === 'required' && !typedKey) {
      problems.apiKey = `${info.label} exige uma chave de API.`;
    }
    if (!parsed.success || Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    const onError = (error: unknown) => setErrors(fieldErrors(error));

    if (provider) {
      const patch: ProviderUpdate = { name: parsed.data.name, baseUrl: parsed.data.baseUrl };
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
    if (info.apiKey === 'optional') return 'Deixe vazio se o serviço não pedir chave.';
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
        {!provider && (
          <SelectField
            label="Tipo"
            value={kind}
            onChange={(event) => chooseKind(event.target.value as ProviderKind)}
            hint={info.description}
          >
            {PROVIDER_KINDS.map((option) => (
              <option key={option} value={option}>
                {PROVIDER_KIND_INFO[option].label}
              </option>
            ))}
          </SelectField>
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

        {info.apiKey !== 'none' && (
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

        {isExternalUrl(baseUrl) && <ExternalNotice />}

        {generalError && (
          <p role="alert" className="text-sm text-fail">
            {generalError}
          </p>
        )}
      </form>
    </Modal>
  );
}
