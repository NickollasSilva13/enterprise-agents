import type { AreaAccess, WorkflowTemplateSummary } from '@ea/shared';
import { FlowGraph } from './FlowGraph';

const ACCESS_LABEL: Record<AreaAccess, string> = {
  none: 'sem acesso à pasta da área',
  read: 'lê a pasta da área',
  write: 'lê e escreve na pasta da área',
};

/**
 * What applying a template creates: its flow (drawn since Phase 39), its
 * roles with the area access and the tools an agent in each starts with, and
 * the good practice it carries (Phase 18, D4: shown before applying).
 */
export function TemplateDetails({ template }: { template: WorkflowTemplateSummary }) {
  return (
    <div className="space-y-2 text-sm">
      {template.description && <p>{template.description}</p>}
      <div>
        <p className="font-semibold">Fluxo</p>
        <div
          className="overflow-x-auto py-1"
          tabIndex={0}
          role="region"
          aria-label="Desenho do fluxo"
        >
          <FlowGraph
            size="compact"
            // The catalogue's column is narrow: the flow goes down the page.
            orientation="column"
            stages={template.stages}
            transitions={template.transitions.map((transition) => ({
              ...transition,
              id: `${transition.from}>${transition.to}`,
            }))}
            roles={template.roles.map((role) => ({ key: role.key, name: role.name, agents: null }))}
            label={`Etapas: ${template.stages.map((stage) => stage.name).join(' → ')}`}
          />
        </div>
      </div>
      <div>
        <p className="font-semibold">Papéis</p>
        {template.roles.length > 0 ? (
          <ul className="space-y-1 text-dim">
            {template.roles.map((role) => (
              <li key={role.name}>
                <span className="text-chalk">{role.name}</span>
                {role.objective && `: ${role.objective}`}{' '}
                <span className="block text-xs">
                  {ACCESS_LABEL[role.areaAccess]}
                  {role.tools.length > 0 && ` · ferramentas: ${role.tools.join(', ')}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-dim">Nenhum: as etapas de agente ficam sem papel.</p>
        )}
      </div>
      {template.practices.length > 0 && (
        <div>
          <p className="font-semibold">Boas práticas</p>
          <ul className="list-disc pl-5 text-dim">
            {template.practices.map((practice) => (
              <li key={practice}>{practice}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
