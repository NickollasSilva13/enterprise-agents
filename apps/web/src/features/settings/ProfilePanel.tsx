import { type Appearance, defaultAppearance, PROFILE_LIMITS, profileSchema } from '@ea/shared';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { PROFILE_CHARACTER_ID } from '../../app/YouCard';
import { Button } from '../../components/Button';
import { Switch, TextField } from '../../components/Form';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { useProfile, useSaveProfile } from '../../lib/frame-queries';
import { AppearanceFields } from '../agents/AppearanceFields';

/**
 * The user's card (Phase 21, D5): a name and a character, both optional,
 * shown at the foot of the menu. It is not a login.
 */
export function ProfilePanel() {
  const profile = useProfile();
  const save = useSaveProfile();
  const notify = useToast();
  const titleId = useId();
  const [name, setName] = useState('');
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [error, setError] = useState<string | undefined>();

  // The form starts from what is saved, once it arrives.
  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.name ?? '');
    setAppearance(profile.data.appearance);
  }, [profile.data]);

  // Opened from the card ("#voce"): bring the panel into view.
  useEffect(() => {
    if (window.location.hash === '#voce') document.getElementById('voce')?.scrollIntoView();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = profileSchema.safeParse({ name, appearance });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    save.mutate(parsed.data, {
      onSuccess: () => notify('Perfil salvo.'),
      onError: (failure) => notify(`Não foi possível salvar: ${errorMessage(failure)}`, 'fail'),
    });
  };

  return (
    <section
      id="voce"
      aria-labelledby={titleId}
      className="mb-6 max-w-3xl scroll-mt-20 rounded-lg border border-line bg-sheet"
    >
      <header className="border-b border-line px-4 py-3">
        <h2 id={titleId} className="text-base font-semibold">
          Você
        </h2>
        <p className="text-sm text-dim">
          Como você aparece no rodapé do menu. Os dois campos são opcionais.
        </p>
      </header>
      {profile.isPending && <LoadingState label="Carregando o perfil…" />}
      {profile.error && !profile.data && (
        <ErrorState
          title="Não foi possível carregar o perfil."
          error={profile.error}
          onRetry={() => void profile.refetch()}
        />
      )}
      {profile.data && (
        <form onSubmit={submit} className="space-y-4 p-4" noValidate>
          <TextField
            label="Seu nome"
            value={name}
            maxLength={PROFILE_LIMITS.name}
            onChange={(event) => setName(event.target.value)}
            hint={`Até ${PROFILE_LIMITS.name} caracteres. Sem nome, o cartão diz "Você".`}
            error={error}
            autoComplete="nickname"
          />
          <Switch
            label="Usar um personagem"
            checked={appearance !== null}
            onChange={(on) => setAppearance(on ? defaultAppearance(PROFILE_CHARACTER_ID) : null)}
          >
            Usar um personagem
          </Switch>
          {appearance && (
            <AppearanceFields
              agentId={PROFILE_CHARACTER_ID}
              value={appearance}
              // The robot of the editor is "no look" for an agent; here it is a look of its own.
              onChange={(look) => setAppearance(look ?? defaultAppearance(PROFILE_CHARACTER_ID))}
            />
          )}
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Salvar perfil
          </Button>
        </form>
      )}
    </section>
  );
}
