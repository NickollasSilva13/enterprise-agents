import { UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { AgentAvatar } from '../components/AgentAvatar';
import { useProfile } from '../lib/frame-queries';

/** The id the user's character is drawn from (a robot takes its colours from it). */
export const PROFILE_CHARACTER_ID = 'voce';

/**
 * The user's own card at the foot of the menu (Phase 21, D5): name and
 * character, both optional. Not a login: the platform has a single user.
 */
export function YouCard({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useProfile();
  const name = data?.name ?? null;
  return (
    <Link
      to="/configuracoes#voce"
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-lg border border-line p-2 transition-colors hover:border-line-strong hover:bg-sheet-raised"
    >
      {data?.appearance ? (
        <AgentAvatar agentId={PROFILE_CHARACTER_ID} appearance={data.appearance} size={36} />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sheet-raised text-dim">
          <UserRound className="size-5" aria-hidden />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{name ?? 'Você'}</span>
        <span className="block text-xs text-dim">{name ? 'Você · seu perfil' : 'Seu perfil'}</span>
      </span>
    </Link>
  );
}
