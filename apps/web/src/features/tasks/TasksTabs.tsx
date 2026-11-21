import { ArrowLeftRight, CalendarClock, Kanban, LayoutTemplate } from 'lucide-react';
import { type SectionTab, SectionTabs } from '../../components/SectionTabs';

/** The screens of the work section (Phase 38), one click from each other. */
const TASK_TABS: readonly SectionTab[] = [
  { to: '/tarefas', label: 'Quadro', icon: Kanban },
  { to: '/tarefas/pedidos', label: 'Pedidos entre áreas', icon: ArrowLeftRight },
  { to: '/tarefas/agendamentos', label: 'Agendamentos', icon: CalendarClock },
  { to: '/tarefas/modelos', label: 'Modelos de fluxo', icon: LayoutTemplate },
];

export function TasksTabs() {
  return <SectionTabs label="Seções de Tarefas" tabs={TASK_TABS} />;
}
