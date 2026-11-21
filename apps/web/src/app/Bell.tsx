import { Bell as BellIcon, Hand, type LucideIcon, Send, SquareCheckBig } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { type AttentionKind, useAttention } from '../lib/frame-queries';
import { plural } from '../lib/format';
import { TONES } from '../lib/tone';
import { FormError } from '../components/Notice';

const KINDS: Record<AttentionKind, { icon: LucideIcon; tone: keyof typeof TONES }> = {
  approval: { icon: Hand, tone: 'wait' },
  task: { icon: SquareCheckBig, tone: 'info' },
  request: { icon: Send, tone: 'glow' },
};

/**
 * Everything that waits for the user, in one place (Phase 21, D4). The count
 * is what is still unresolved; there is no "mark as read".
 */
export function Bell() {
  const [open, setOpen] = useState(false);
  const attention = useAttention();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const total = attention.items.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const label =
    total === 0
      ? 'Avisos: nada esperando você'
      : `Avisos: ${plural(total, 'item esperando', 'itens esperando')} você`;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-10 place-items-center rounded-md text-dim hover:bg-sheet-raised hover:text-chalk"
      >
        <BellIcon className="size-5" aria-hidden />
        {total > 0 && (
          <span
            aria-hidden
            className={`absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full px-1 text-xs font-bold text-ink ${TONES.wait.dot}`}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <section
          id={panelId}
          aria-label="Esperando você"
          className="surface-glass fixed inset-x-2 top-16 z-30 max-h-[70vh] overflow-y-auto rounded-2xl p-2 sm:absolute sm:inset-x-auto sm:top-12 sm:right-0 sm:w-96"
        >
          <h2 className="px-2 py-1 font-semibold">Esperando você</h2>
          {attention.isError && (
            <FormError className="px-2 py-1">
              Não foi possível ler todos os avisos: a lista pode estar incompleta.
            </FormError>
          )}
          {attention.isPending && total === 0 ? (
            <p role="status" className="px-2 py-3 text-sm text-dim">
              Carregando…
            </p>
          ) : total === 0 ? (
            <p className="px-2 py-3 text-sm text-dim">
              Nada esperando você. Aprovações, tarefas paradas e pedidos entre áreas aparecem aqui.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {attention.items.map((item) => {
                const kind = KINDS[item.kind];
                const Icon = kind.icon;
                const tone = TONES[kind.tone];
                return (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 rounded-xl px-2 py-2 hover:bg-sheet-raised"
                    >
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone.tint}`}
                      >
                        <Icon className={`size-4 ${tone.text}`} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-medium">{item.title}</span>
                        <span className="block truncate text-xs text-dim">{item.detail}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
