import type { LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router';

export interface SectionTab {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

interface SectionTabsProps {
  /** Names the group for screen readers, e.g. "Seções de Tarefas". */
  label: string;
  tabs: readonly SectionTab[];
}

/**
 * The screens of one section side by side (Phase 38), so moving between them
 * is one click and the current one is always marked, instead of a row of
 * buttons in the header and a "back" link on each screen. On a phone the row
 * scrolls sideways rather than wrapping into a stack of buttons.
 */
export function SectionTabs({ label, tabs }: SectionTabsProps) {
  const { pathname } = useLocation();
  return (
    <nav aria-label={label} className="-mx-4 mb-6 border-b border-line sm:mx-0">
      <ul className="flex gap-1 overflow-x-auto overflow-y-hidden px-4 sm:px-0">
        {tabs.map(({ to, label: name, icon: Icon }) => {
          const current = pathname === to;
          return (
            <li key={to} className="shrink-0">
              <Link
                to={to}
                aria-current={current ? 'page' : undefined}
                className={`relative inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm transition-colors ${
                  current
                    ? 'border-accent font-semibold text-chalk'
                    : 'border-transparent text-dim hover:border-line-strong hover:text-chalk'
                }`}
              >
                <Icon className={`size-4 ${current ? 'text-glow' : ''}`} aria-hidden />
                {name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
