import { searchRank } from '@ea/shared';
import {
  Bot,
  FolderKanban,
  type LucideIcon,
  Monitor,
  Search,
  SquareCheckBig,
  X,
} from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../lib/errors';
import { useSearch } from '../lib/frame-queries';
import { NAV_ITEMS } from './navigation';

/** Screens found without asking the server: the menu and the pages under it. */
const SCREENS: readonly { readonly label: string; readonly to: string }[] = [
  ...NAV_ITEMS.map(({ label, to }) => ({ label, to })),
  { label: 'Agendamentos', to: '/tarefas/agendamentos' },
  { label: 'Pedidos entre áreas', to: '/tarefas/pedidos' },
  { label: 'Modelos de fluxo', to: '/tarefas/modelos' },
  { label: 'Novo agente', to: '/agentes/novo' },
  { label: 'Editar o escritório', to: '/escritorio/editar' },
  { label: 'Ajuda e guia de uso', to: '/ajuda' },
];

const TASK_STATE_LABEL = {
  pending: 'Pedido a aprovar',
  open: 'Aberta',
  done: 'Concluída',
  cancelled: 'Cancelada',
} as const;

interface Hit {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly to: string;
}

interface Group {
  readonly title: string;
  readonly icon: LucideIcon;
  readonly hits: readonly Hit[];
}

/** The text in the box, settled for a moment before the server is asked. */
function useSettled(value: string, ms = 150): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * Global search (Phase 21, D3), opened by Ctrl K or the search button: a
 * combobox over a list, used with the arrows, Enter and Escape. Screens are
 * matched here; agents, areas and tasks by the server.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const settled = useSettled(query);
  const search = useSearch(settled);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement;
    input.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  const groups = useMemo<Group[]>(() => {
    const wanted = query.trim();
    if (wanted === '') return [];
    const screens = SCREENS.flatMap((screen) => {
      const rank = searchRank(screen.label, wanted);
      return rank === null ? [] : [{ screen, rank }];
    })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5)
      .map(({ screen }) => ({
        key: `screen-${screen.to}`,
        label: screen.label,
        detail: 'Tela',
        to: screen.to,
      }));
    const data = search.data;
    return [
      { title: 'Telas', icon: Monitor, hits: screens },
      {
        title: 'Agentes',
        icon: Bot,
        hits: (data?.agents ?? []).map((agent) => ({
          key: `agent-${agent.id}`,
          label: agent.name,
          detail: agent.areaName ?? 'Sem área',
          to: `/agentes/${agent.id}`,
        })),
      },
      {
        title: 'Áreas',
        icon: FolderKanban,
        hits: (data?.areas ?? []).map((area) => ({
          key: `area-${area.id}`,
          label: area.name,
          detail: 'Quadro de tarefas',
          to: `/tarefas?area=${area.id}`,
        })),
      },
      {
        title: 'Tarefas',
        icon: SquareCheckBig,
        hits: (data?.tasks ?? []).map((task) => ({
          key: `task-${task.id}`,
          label: task.title,
          detail: `${task.areaName} · ${TASK_STATE_LABEL[task.state]}`,
          to: `/tarefas/${task.id}`,
        })),
      },
    ].filter((group) => group.hits.length > 0);
  }, [query, search.data]);

  const hits = groups.flatMap((group) => group.hits);
  const current = hits[Math.min(active, hits.length - 1)];
  const optionId = (hit: Hit) => `${listId}-${hit.key}`;

  const open = (hit: Hit) => {
    onClose();
    void navigate(hit.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (hits.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (Math.min(index, hits.length - 1) + step + hits.length) % hits.length);
    } else if (event.key === 'Enter' && current) {
      event.preventDefault();
      open(current);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const waiting = query.trim() !== '' && (settled !== query || search.isFetching);
  const failed = search.isError && !search.data;

  return (
    <div className="fixed inset-0 z-30 flex justify-center sm:items-start sm:p-4 sm:pt-[12vh]">
      <div className="absolute inset-0 bg-ink/75" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="surface-glass relative flex h-full w-full flex-col overflow-hidden sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-2xl"
      >
        <h2 id={titleId} className="sr-only">
          Buscar
        </h2>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-5 shrink-0 text-dim" aria-hidden />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-label="Buscar agentes, áreas, tarefas e telas"
            aria-expanded={hits.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current ? optionId(current) : undefined}
            placeholder="Buscar agentes, áreas, tarefas e telas"
            value={query}
            maxLength={100}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="min-h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-dim"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar a busca"
            className="grid size-10 shrink-0 place-items-center rounded-md text-dim hover:bg-sheet-raised hover:text-chalk"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div id={listId} role="listbox" aria-label="Resultados">
            {groups.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.title} role="group" aria-label={group.title} className="mb-2">
                  <p className="px-2 py-1 text-xs font-semibold text-dim">{group.title}</p>
                  {group.hits.map((hit) => {
                    const selected = hit === current;
                    return (
                      <div
                        key={hit.key}
                        id={optionId(hit)}
                        role="option"
                        aria-selected={selected}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => open(hit)}
                        onMouseMove={() => setActive(hits.indexOf(hit))}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 ${
                          selected ? 'bg-accent text-white' : 'hover:bg-sheet-raised'
                        }`}
                      >
                        <Icon
                          className={`size-4 shrink-0 ${selected ? 'text-white' : 'text-dim'}`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{hit.label}</span>
                          <span
                            className={`block truncate text-xs ${selected ? 'text-white' : 'text-dim'}`}
                          >
                            {hit.detail}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <p role="status" className="px-2 py-3 text-sm text-dim empty:hidden">
            {query.trim() === ''
              ? 'Digite o nome de um agente, de uma área, de uma tarefa ou de uma tela.'
              : failed
                ? `Não foi possível buscar: ${errorMessage(search.error)}`
                : waiting
                  ? hits.length === 0
                    ? 'Procurando…'
                    : ''
                  : hits.length === 0
                    ? `Nada encontrado para "${query.trim()}".`
                    : ''}
          </p>
        </div>
        <p className="hidden border-t border-line px-4 py-2 text-xs text-dim sm:block">
          Setas para escolher, Enter para abrir, Esc para fechar.
        </p>
      </div>
    </div>
  );
}
