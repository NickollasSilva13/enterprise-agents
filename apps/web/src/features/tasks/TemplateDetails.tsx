import type { AreaAccess, WorkflowTemplateSummary } from '@ea/shared';

const ACCESS_LABEL: Record<AreaAccess, string> = {
  none: 'sem acesso à pasta da área',
  read: 'lê a pasta da área',
  write: 'lê e escreve na pasta da área',
};

/**
 * What applying a template creates: its stages, one agent per role with the
 * area access and the tools it starts with, and the good practice it carries
 * (Phase 18, D4: shown before applying).
 */
export function TemplateDetails({ template }: { template: WorkflowTemplateSummary }) {
  return (
    <div className="space-y-2 text-sm">
      {template.description && <p>{template.description}</p>}
      <div>
        <p className="font-semibold">Etapas</p>
        <p className="text-dim">{template.stages.map((stage) => stage.name).join(' → ')}</p>
      </div>
      <div>
        <p className="font-semibold">Agentes criados</p>
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
          <p className="text-dim">Nenhum: as etapas de agente ficam sem responsável.</p>
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
