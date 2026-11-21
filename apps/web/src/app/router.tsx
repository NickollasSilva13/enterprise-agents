import { Link, Navigate, type RouteObject } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { AgentFormPage } from '../features/agents/AgentFormPage';
import { AgentsPage } from '../features/agents/AgentsPage';
import { ApprovalsPage } from '../features/approvals/ApprovalsPage';
import { ChatPage } from '../features/chat/ChatPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { LogsPage } from '../features/logs/LogsPage';
import { RunDetailPage } from '../features/logs/RunDetailPage';
import { ModelsPage } from '../features/models/ModelsPage';
import { OfficeEditorPage } from '../features/office/editor/OfficeEditorPage';
import { OfficePage } from '../features/office/OfficePage';
import { HelpPage } from '../features/help/HelpPage';
import { PlannedPage } from '../features/planned/PlannedPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { RequestsPage } from '../features/tasks/RequestsPage';
import { SchedulesPage } from '../features/tasks/SchedulesPage';
import { TaskPage } from '../features/tasks/TaskPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { TemplatesPage } from '../features/tasks/TemplatesPage';
import { WorkflowEditorPage } from '../features/tasks/WorkflowEditorPage';
import { ToolsPage } from '../features/tools/ToolsPage';
import { AppLayout } from './AppLayout';
import { PLANNED_AREAS } from './navigation';
import { LINK } from '../components/TextLink';

function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Página não encontrada"
        description="Este endereço não existe na aplicação."
      />
      <Link to="/escritorio" className={LINK}>
        Voltar ao escritório
      </Link>
    </>
  );
}

/*
 * The reference of the visual system (Phase 20) shows example values, which
 * the product never does (rule 5): it exists in development and in the build
 * of the end-to-end tests (vite build --mode e2e) only. The mode is replaced
 * at build time, so the product build drops the page and its chunk.
 */
const referenceRoutes: RouteObject[] =
  import.meta.env.DEV || import.meta.env.MODE === 'e2e'
    ? [
        {
          path: 'referencia',
          lazy: async () => ({
            Component: (await import('../features/reference/ReferencePage')).ReferencePage,
          }),
        },
      ]
    : [];

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      // The office is the home of the platform (Phase 29, D1).
      { index: true, element: <Navigate to="/escritorio" replace /> },
      { path: 'relatorios', element: <DashboardPage /> },
      { path: 'escritorio', element: <OfficePage /> },
      { path: 'escritorio/editar', element: <OfficeEditorPage /> },
      { path: 'agentes', element: <AgentsPage /> },
      { path: 'agentes/novo', element: <AgentFormPage /> },
      { path: 'agentes/:id', element: <AgentFormPage /> },
      { path: 'agentes/:id/conversa', element: <ChatPage /> },
      { path: 'agentes/:id/conversa/:conversationId', element: <ChatPage /> },
      { path: 'tarefas', element: <TasksPage /> },
      { path: 'tarefas/fluxo/:areaId', element: <WorkflowEditorPage /> },
      { path: 'tarefas/pedidos', element: <RequestsPage /> },
      { path: 'tarefas/modelos', element: <TemplatesPage /> },
      { path: 'tarefas/agendamentos', element: <SchedulesPage /> },
      { path: 'tarefas/:taskId', element: <TaskPage /> },
      { path: 'logs', element: <LogsPage /> },
      { path: 'logs/:runId', element: <RunDetailPage /> },
      { path: 'modelos', element: <ModelsPage /> },
      { path: 'ferramentas', element: <ToolsPage /> },
      { path: 'aprovacoes', element: <ApprovalsPage /> },
      { path: 'configuracoes', element: <SettingsPage /> },
      { path: 'ajuda', element: <HelpPage /> },
      ...referenceRoutes,
      ...PLANNED_AREAS.map((area) => ({
        path: area.path.slice(1),
        element: <PlannedPage area={area} />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
