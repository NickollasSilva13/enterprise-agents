import {
  Bot,
  Building2,
  CalendarClock,
  Cpu,
  Hand,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  ScrollText,
  Settings,
  Wrench,
} from 'lucide-react';

/** What a menu counter counts (Phase 21, D1): only what waits for the user. */
export type NavCounter = 'approvals' | 'tasks';

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly counter?: NavCounter;
  /** Addresses under `to` that belong to another item of the menu. */
  readonly except?: readonly string[];
}

export interface NavGroup {
  /** Shown above the items; none for the first group, which is the home. */
  readonly label?: string;
  readonly items: readonly NavItem[];
}

/**
 * The menu in groups (Phase 38): ten flat entries read as a wall, so they are
 * grouped by what the user is doing — following the work, the team that does
 * it, and how the platform runs.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    items: [
      { to: '/escritorio', label: 'Escritório', icon: Building2 },
      // The dashboard of before, now that the office is the home (Phase 29, D1).
      { to: '/relatorios', label: 'Relatórios', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Trabalho',
    items: [
      {
        to: '/tarefas',
        label: 'Tarefas',
        icon: ListTodo,
        counter: 'tasks',
        except: ['/tarefas/agendamentos'],
      },
      { to: '/tarefas/agendamentos', label: 'Automações', icon: CalendarClock },
      { to: '/aprovacoes', label: 'Aprovações', icon: Hand, counter: 'approvals' },
    ],
  },
  {
    label: 'Equipe',
    items: [
      { to: '/agentes', label: 'Agentes', icon: Bot },
      { to: '/modelos', label: 'Modelos de IA', icon: Cpu },
      { to: '/ferramentas', label: 'Ferramentas', icon: Wrench },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/logs', label: 'Logs', icon: ScrollText },
      { to: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Whether `item` is the menu entry of the page at `pathname`. */
export function isCurrent(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return under(item.to) && !(item.except ?? []).some(under);
}

export interface PlannedArea {
  readonly path: string;
  readonly title: string;
  readonly phase: number;
  readonly summary: string;
  /** What the user will be able to do here. */
  readonly capabilities: readonly string[];
}

/** The help entry, at the foot of the menu (Phase 21, D1; built in Phase 32). */
export const HELP_ITEM = { to: '/ajuda', label: 'Precisa de ajuda?' } as const;

/**
 * Areas that exist in the navigation but are not built yet. Each one is
 * replaced by its real page in the phase named here (RNF-12). None is left.
 */
export const PLANNED_AREAS: readonly PlannedArea[] = [];
