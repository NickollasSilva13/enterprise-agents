import { type Approval, APPROVAL_LIMITS, type ToolRisk } from '@ea/shared';
import { Check, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../lib/errors';
import { useDecideApproval } from '../lib/tool-queries';
import { Button } from './Button';

export const RISK: Record<ToolRisk, { label: string; tone: string }> = {
  low: { label: 'Risco baixo', tone: 'border-line-strong text-dim' },
  medium: { label: 'Risco médio', tone: 'border-wait text-wait' },
  high: { label: 'Risco alto', tone: 'border-fail text-fail' },
};

export function RiskBadge({ risk }: { risk: ToolRisk }) {
  return (
    <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-xs ${RISK[risk].tone}`}>
      {RISK[risk].label}
    </span>
  );
}

/** Exactly what the tool will receive: nothing is summarised or hidden (C-16). */
export function ArgumentList({ args }: { args: Approval['arguments'] }) {
  const entries = Object.entries(args);
  if (entries.length === 0) return <p className="text-sm text-dim">Sem argumentos.</p>;
  return (
    <dl className="space-y-2 text-sm">
      {entries.map(([name, value]) => (
        <div key={name}>
          <dt className="font-mono text-xs text-dim">{name}</dt>
          <dd>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-ink px-2.5 py-1.5 font-mono text-xs">
              {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            </pre>
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface ApprovalCardProps {
  approval: Approval;
  /** Where the card is shown; the heading level and the links follow it. */
  context?: 'queue' | 'chat';
}

/**
 * One action waiting for the user's decision (RF-54, UC-05): who asks, which
 * tool, the exact arguments, and the two answers.
 */
export function ApprovalCard({ approval, context = 'queue' }: ApprovalCardProps) {
  const decide = useDecideApproval();
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const answer = (decision: 'approve' | 'deny') =>
    decide.mutate({
      id: approval.id,
      decision,
      ...(decision === 'deny' && reason.trim() !== '' ? { reason: reason.trim() } : {}),
    });

  return (
    <article
      aria-label={`Aprovação pedida por ${approval.agentName}: ${approval.toolTitle}`}
      className="rounded-lg border border-wait bg-sheet p-4"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 basis-52 font-semibold">
          <span className="text-wait">{approval.agentName}</span> quer usar{' '}
          <span className="whitespace-nowrap">“{approval.toolTitle}”</span>
        </p>
        {approval.risk && <RiskBadge risk={approval.risk} />}
      </header>

      <div className="mt-3">
        <ArgumentList args={approval.arguments} />
      </div>

      <div className="mt-3">
        <label htmlFor={reasonId} className="mb-1 block text-sm text-dim">
          Motivo, se for negar (opcional; o agente recebe este texto)
        </label>
        <input
          id={reasonId}
          value={reason}
          maxLength={APPROVAL_LIMITS.reason}
          onChange={(event) => setReason(event.target.value)}
          className="w-full rounded-md border border-line-strong bg-ink px-3 py-2 text-sm text-chalk"
        />
      </div>

      {decide.error && (
        <p role="alert" className="mt-3 text-sm text-fail">
          {errorMessage(decide.error)}
        </p>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => answer('approve')} disabled={decide.isPending}>
          <Check className="size-4" aria-hidden />
          Aprovar
        </Button>
        <Button variant="danger" onClick={() => answer('deny')} disabled={decide.isPending}>
          <X className="size-4" aria-hidden />
          Negar
        </Button>
        {context === 'queue' && (
          <Link
            to={`/logs/${approval.runId}`}
            className="ml-auto text-sm text-info underline underline-offset-4"
          >
            Ver a execução
          </Link>
        )}
      </footer>
    </article>
  );
}
