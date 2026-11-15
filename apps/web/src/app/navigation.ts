import {
  Bot,
  Building2,
  Cpu,
  Hand,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  Settings,
  Wrench,
} from 'lucide-react';

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard },
  { to: '/escritorio', label: 'Escritório', icon: Building2 },
  { to: '/agentes', label: 'Agentes', icon: Bot },
  { to: '/modelos', label: 'Modelos', icon: Cpu },
  { to: '/ferramentas', label: 'Ferramentas', icon: Wrench },
  { to: '/aprovacoes', label: 'Aprovações', icon: Hand },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export interface PlannedArea {
  readonly path: string;
  readonly title: string;
  readonly phase: number;
  readonly summary: string;
  /** What the user will be able to do here. */
  readonly capabilities: readonly string[];
}

/**
 * Areas that exist in the navigation but are not built yet. Each one is
 * replaced by its real page in the phase named here (RNF-12).
 */
export const PLANNED_AREAS: readonly PlannedArea[] = [];
