import {
  type AreaAccess,
  PROJECT_LIMITS,
  type Team,
  teamRoleName,
  type WorkflowTemplateSummary,
} from '@ea/shared';

// "Função na empresa" in the agent form (Phase 39, D2): a template, a team
// (area) made from it or a new one, and a role in that team. Plain data, so
// the choices and the sentence that explains them are tested without a page.

/** Which team: none, one that exists, or a new one made from the template on saving. */
export type TeamPick =
  | { readonly kind: 'none' }
  | { readonly kind: 'existing'; readonly areaId: string }
  | { readonly kind: 'new'; readonly name: string };

export interface FunctionValues {
  /** The template the team comes from; null shows every team, made by hand or not. */
  readonly templateId: string | null;
  readonly team: TeamPick;
  /** An existing team's role id, or the template role's key for a new team. */
  readonly roleKey: string | null;
}

export interface RoleOption {
  readonly key: string;
  readonly name: string;
  /** Stages of the flow it works, in order. */
  readonly stages: readonly string[];
  /** Names of the agents that already have it (the agent itself left out). */
  readonly others: readonly string[];
  /** What the template suggests for whoever takes the role. */
  readonly suggestion: RoleSuggestion | null;
}

export interface RoleSuggestion {
  readonly objective: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly areaAccess: AreaAccess;
}

const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

/** The template's name, or with a number when a team already has it. */
export function freeTeamName(base: string, taken: readonly string[]): string {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '' : ` ${n}`;
    const name = base.slice(0, PROJECT_LIMITS.name - suffix.length).trimEnd() + suffix;
    if (!taken.some((other) => same(other, name))) return name;
  }
}

/** Where an agent stands now: its team, the template of that team and its role. */
export function initialFunction(
  agent: { projectId: string | null; roleId: string | null } | undefined,
  teams: readonly Team[],
): FunctionValues {
  const team = agent?.projectId ? teams.find((entry) => entry.areaId === agent.projectId) : null;
  if (!team) return { templateId: null, team: { kind: 'none' }, roleKey: null };
  return {
    templateId: team.templateId,
    team: { kind: 'existing', areaId: team.areaId },
    roleKey: agent?.roleId ?? null,
  };
}

/** The teams to offer: those of the template, or every team when none is chosen. */
export const teamsFor = (templateId: string | null, teams: readonly Team[]): readonly Team[] =>
  templateId === null ? teams : teams.filter((team) => team.templateId === templateId);

/**
 * Choosing a template picks its team for the user: the only one there is (or
 * the first), or a new one when there is none (D2). The role is left for the
 * user unless the team has only one.
 */
export function chooseTemplate(
  templateId: string | null,
  teams: readonly Team[],
  templates: readonly WorkflowTemplateSummary[],
): FunctionValues {
  if (templateId === null) return { templateId, team: { kind: 'none' }, roleKey: null };
  const template = templates.find((entry) => entry.id === templateId);
  const [first] = teamsFor(templateId, teams);
  const team: TeamPick = first
    ? { kind: 'existing', areaId: first.areaId }
    : {
        kind: 'new',
        name: freeTeamName(
          template?.name ?? 'Equipe',
          teams.map((entry) => entry.areaName),
        ),
      };
  return withOnlyRole({ templateId, team, roleKey: null }, teams, templates);
}

/** Picking another team keeps the role when the new team has one of the same name. */
export function chooseTeam(
  values: FunctionValues,
  team: TeamPick,
  teams: readonly Team[],
  templates: readonly WorkflowTemplateSummary[],
): FunctionValues {
  const before = rolesFor(values, teams, templates, null).find(
    (role) => role.key === values.roleKey,
  );
  const next = { ...values, team, roleKey: null };
  const kept = before
    ? rolesFor(next, teams, templates, null).find((role) => same(role.name, before.name))
    : undefined;
  return kept ? { ...next, roleKey: kept.key } : withOnlyRole(next, teams, templates);
}

function withOnlyRole(
  values: FunctionValues,
  teams: readonly Team[],
  templates: readonly WorkflowTemplateSummary[],
): FunctionValues {
  const roles = rolesFor(values, teams, templates, null);
  return roles.length === 1 ? { ...values, roleKey: roles[0]?.key ?? null } : values;
}

/** The roles of the team chosen, with what the template suggests for each. */
export function rolesFor(
  values: FunctionValues,
  teams: readonly Team[],
  templates: readonly WorkflowTemplateSummary[],
  agentId: string | null,
): RoleOption[] {
  const template = templates.find((entry) => entry.id === values.templateId);
  const suggestionFor = (name: string): RoleSuggestion | null => {
    const role = template?.roles.find((entry) => same(teamRoleName(entry.name), name));
    return role
      ? {
          objective: role.objective,
          systemPrompt: role.systemPrompt,
          tools: role.tools,
          areaAccess: role.areaAccess,
        }
      : null;
  };
  if (values.team.kind === 'new') {
    return (template?.roles ?? []).map((role) => ({
      key: role.key,
      name: teamRoleName(role.name),
      stages: (template?.stages ?? [])
        .filter((stage) => stage.role === role.key && stage.kind === 'agent')
        .map((stage) => stage.name),
      others: [],
      suggestion: suggestionFor(teamRoleName(role.name)),
    }));
  }
  if (values.team.kind === 'none') return [];
  const { areaId } = values.team;
  const team = teams.find((entry) => entry.areaId === areaId);
  return (team?.roles ?? []).map((role) => ({
    key: role.id,
    name: role.name,
    stages: role.stages,
    others: role.agents.filter((agent) => agent.id !== agentId).map((agent) => agent.name),
    suggestion: suggestionFor(role.name),
  }));
}

const list = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1] ?? ''}`;

/** In words: where the agent goes in, next to whom, and what having company means. */
export function describeFunction(
  values: FunctionValues,
  teams: readonly Team[],
  templates: readonly WorkflowTemplateSummary[],
  agentId: string | null,
): string {
  if (values.team.kind === 'none') {
    return 'Sem equipe: o agente atende só pela conversa e não recebe tarefas do quadro.';
  }
  const { team } = values;
  const phrase =
    team.kind === 'new'
      ? `nova equipe ${team.name.trim() || 'sem nome'}`
      : `equipe ${teams.find((entry) => entry.areaId === team.areaId)?.areaName ?? ''}`;
  const role = rolesFor(values, teams, templates, agentId).find(
    (entry) => entry.key === values.roleKey,
  );
  if (!role) {
    return `Entra na ${phrase} sem papel: fica na sala da equipe, mas não recebe tarefas do quadro. Escolha um papel para ele trabalhar nas etapas.`;
  }
  const where =
    role.stages.length === 0
      ? `na ${phrase} com o papel ${role.name}, que ainda não atende nenhuma etapa do fluxo`
      : `${role.stages.length > 1 ? 'nas etapas' : 'na etapa'} ${list(role.stages)} da ${phrase}`;
  const company =
    role.others.length === 0
      ? ''
      : `, ao lado de ${list(role.others)}. Com ${role.others.length + 1} agentes no papel, ${role.others.length + 1} tarefas podem andar ao mesmo tempo ali`;
  return `Entra ${where}${company}.`;
}
