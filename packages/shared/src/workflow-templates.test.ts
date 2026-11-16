import { describe, expect, it } from 'vitest';
import {
  templateContentSchema,
  templateExportSchema,
  WORKFLOW_TEMPLATES,
} from './workflow-templates';

// The ready-made templates (Phase 16 and 18) pass the same rules as a template
// saved by the user, and the rules catch what would break an area.

const content = (template: (typeof WORKFLOW_TEMPLATES)[number]) => ({
  description: template.description,
  practices: [...template.practices],
  roles: template.roles.map((role) => ({ ...role, tools: [...role.tools] })),
  stages: template.stages.map((stage) => ({ ...stage })),
  transitions: template.transitions.map((transition) => ({ ...transition })),
});

describe('workflow templates', () => {
  it('has the five ready-made templates, each valid', () => {
    expect(WORKFLOW_TEMPLATES.map((template) => template.id)).toEqual([
      'desenvolvimento',
      'marketing',
      'dados',
      'produto',
      'conteudo',
    ]);
    for (const template of WORKFLOW_TEMPLATES) {
      const parsed = templateContentSchema.safeParse(content(template));
      expect(parsed.success, `${template.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      // Every role works some stage, and every agent stage has a role.
      for (const role of template.roles) {
        expect(
          template.stages.some((stage) => stage.role === role.key),
          role.key,
        ).toBe(true);
      }
      for (const stage of template.stages.filter((entry) => entry.kind === 'agent')) {
        expect(stage.role, stage.key).not.toBeNull();
      }
    }
  });

  it('keeps reviewers away from writing what they review', () => {
    const reviewers = WORKFLOW_TEMPLATES.flatMap((template) => template.roles).filter((role) =>
      /revis|testes|valida/i.test(role.key + role.name),
    );
    expect(reviewers.length).toBeGreaterThanOrEqual(5);
    for (const role of reviewers) {
      expect(role.areaAccess, role.name).toBe('read');
      expect(role.tools, role.name).not.toContain('write_file');
    }
  });

  it('suggests only tools that are not of high risk', () => {
    const suggested = new Set(
      WORKFLOW_TEMPLATES.flatMap((template) => template.roles.flatMap((role) => role.tools)),
    );
    expect([...suggested].sort()).toEqual(['fetch_url', 'list_dir', 'read_file', 'write_file']);
  });

  it('refuses a stage pointing at a missing role, repeated roles and a broken flow', () => {
    const base = content(WORKFLOW_TEMPLATES[0]!);
    const messages = (value: unknown) =>
      templateContentSchema.safeParse(value).error?.issues.map((issue) => issue.message) ?? [];

    expect(
      messages({
        ...base,
        stages: base.stages.map((stage, index) => (index === 0 ? { ...stage, role: 'x' } : stage)),
      }),
    ).toContain('A etapa "Refinamento" aponta para um papel que não existe.');
    expect(
      messages({ ...base, roles: [base.roles[0], { ...base.roles[0], key: 'outro' }] }),
    ).toEqual(expect.arrayContaining(['Já existe um papel chamado "Produto".']));
    expect(
      messages({ ...base, stages: base.stages.filter((stage) => stage.kind !== 'done') }),
    ).toContain('O fluxo precisa de uma etapa final.');
    expect(
      messages({
        ...base,
        transitions: [{ from: 'revisao', to: 'concluido', actor: 'agent' }],
      }),
    ).toContain('Só você pode tirar uma tarefa de "Sua revisão".');
  });

  it('reads only its own file format', () => {
    const file = {
      format: 'enterprise-agents/workflow-template',
      version: 1,
      template: { name: 'Meu fluxo', content: content(WORKFLOW_TEMPLATES[1]!) },
    };
    expect(templateExportSchema.safeParse(file).success).toBe(true);
    expect(
      templateExportSchema.safeParse({ ...file, format: 'enterprise-agents/agents' }).error
        ?.issues[0]?.message,
    ).toBe('Este não é um arquivo de modelo de fluxo do Enterprise Agents.');
    expect(templateExportSchema.safeParse({ ...file, version: 2 }).success).toBe(false);
    // Nothing beyond the known fields: no model, key or permission rides along.
    expect(
      templateExportSchema.safeParse({
        ...file,
        template: { ...file.template, model: { name: 'x', provider: 'y' } },
      }).success,
    ).toBe(false);
    const role = { ...file.template.content.roles[0]!, permission: 'allow' };
    expect(
      templateExportSchema.safeParse({
        ...file,
        template: { ...file.template, content: { ...file.template.content, roles: [role] } },
      }).success,
    ).toBe(false);
  });
});
