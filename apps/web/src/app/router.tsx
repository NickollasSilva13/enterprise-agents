import { Link, type RouteObject } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { AgentFormPage } from '../features/agents/AgentFormPage';
import { AgentsPage } from '../features/agents/AgentsPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ModelsPage } from '../features/models/ModelsPage';
import { OfficePage } from '../features/office/OfficePage';
import { PlannedPage } from '../features/planned/PlannedPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppLayout } from './AppLayout';
import { PLANNED_AREAS } from './navigation';

function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Página não encontrada"
        description="Este endereço não existe na aplicação."
      />
      <Link to="/" className="text-info underline underline-offset-4">
        Voltar ao painel
      </Link>
    </>
  );
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'escritorio', element: <OfficePage /> },
      { path: 'agentes', element: <AgentsPage /> },
      { path: 'agentes/novo', element: <AgentFormPage /> },
      { path: 'agentes/:id', element: <AgentFormPage /> },
      { path: 'modelos', element: <ModelsPage /> },
      { path: 'configuracoes', element: <SettingsPage /> },
      ...PLANNED_AREAS.map((area) => ({
        path: area.path.slice(1),
        element: <PlannedPage area={area} />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
