import type { Team, WorkflowTemplateSummary } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import {
  chooseTeam,
  chooseTemplate,
  describeFunction,
  freeTeamName,
  initialFunction,
  rolesFor,
} from './team-role';

const template: WorkflowTemplateSummary = {
  id: 'desenvolvimento',
  name: 'Desenvolvimento',
  origin: 'builtin',
  description: '',
  practices: [],
  roles: [
    {
      key: 'dev',
      name: 'Dev',
      objective: 'Implementar.',
      systemPrompt: 'Implemente.',
      tools: ['write_file'],
      areaAccess: 'write',
    },
    {
      key: 'qa',
      name: 'QA',
      objective: 'Testar.',
      systemPrompt: 'Teste.',
      tools: [],
      areaAccess: 'read',
    },
  ],
  stages: [
    { key: 'd', name: 'Desenvolvimento', kind: 'agent', role: 'dev' },
    { key: 't', name: 'Testes', kind: 'agent', role: 'qa' },
    { key: 'f', name: 'Fim', kind: 'done', role: null },
  ],
  transitions: [],
};

const site: Team = {
  areaId: 'p1',
  areaName: 'Site',
  templateId: 'desenvolvimento',
  templateName: 'Desenvolvimento',
  roles: [
    {
      id: 'r-dev',
      name: 'Dev',
      agents: [{ id: 'a1', name: 'Ana' }],
      stages: ['Desenvolvimento'],
    },
    { id: 'r-qa', name: 'QA', agents: [], stages: ['Testes'] },
  ],
};
const handmade: Team = {
  areaId: 'p2',
  areaName: 'Pesquisa',
  templateId: null,
  templateName: null,
  roles: [],
};

describe('choosing a function in the company (Phase 39, D2)', () => {
  it('picks the only team of the template, or a new one named after it', () => {
    expect(chooseTemplate('desenvolvimento', [site, handmade], [template])).toEqual({
      templateId: 'desenvolvimento',
      team: { kind: 'existing', areaId: 'p1' },
      roleKey: null,
    });
    expect(chooseTemplate('desenvolvimento', [handmade], [template]).team).toEqual({
      kind: 'new',
      name: 'Desenvolvimento',
    });
    expect(freeTeamName('Desenvolvimento', ['desenvolvimento', 'Desenvolvimento 2'])).toBe(
      'Desenvolvimento 3',
    );
  });

  it('offers the roles of the team, or of the template for a new team, with suggestions', () => {
    const existing = rolesFor(
      { templateId: 'desenvolvimento', team: { kind: 'existing', areaId: 'p1' }, roleKey: null },
      [site],
      [template],
      null,
    );
    expect(existing.map((role) => [role.key, role.others, role.suggestion?.systemPrompt])).toEqual([
      ['r-dev', ['Ana'], 'Implemente.'],
      ['r-qa', [], 'Teste.'],
    ]);
    const fresh = rolesFor(
      { templateId: 'desenvolvimento', team: { kind: 'new', name: 'Loja' }, roleKey: null },
      [site],
      [template],
      null,
    );
    expect(fresh.map((role) => [role.key, role.stages])).toEqual([
      ['dev', ['Desenvolvimento']],
      ['qa', ['Testes']],
    ]);
  });

  it('keeps the role by name when the team changes', () => {
    const values = {
      templateId: 'desenvolvimento',
      team: { kind: 'existing', areaId: 'p1' },
      roleKey: 'r-qa',
    } as const;
    expect(chooseTeam(values, { kind: 'new', name: 'Loja' }, [site], [template]).roleKey).toBe(
      'qa',
    );
  });

  it('starts from where the agent is, and says it in words', () => {
    const values = initialFunction({ projectId: 'p1', roleId: 'r-dev' }, [site, handmade]);
    expect(values).toEqual({
      templateId: 'desenvolvimento',
      team: { kind: 'existing', areaId: 'p1' },
      roleKey: 'r-dev',
    });
    expect(describeFunction(values, [site], [template], null)).toBe(
      'Entra na etapa Desenvolvimento da equipe Site, ao lado de Ana. Com 2 agentes no papel, 2 tarefas podem andar ao mesmo tempo ali.',
    );
    // The agent itself is never its own company.
    expect(describeFunction(values, [site], [template], 'a1')).toBe(
      'Entra na etapa Desenvolvimento da equipe Site.',
    );
    expect(
      describeFunction(initialFunction(undefined, [site]), [site], [template], null),
    ).toContain('Sem equipe');
  });
});
