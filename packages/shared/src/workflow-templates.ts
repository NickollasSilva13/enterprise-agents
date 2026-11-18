import { z } from 'zod';
import type { AreaAccess, StageKind, TransitionActor } from './enums';

// Ready-made workflows with good practice built in (Phase 16, D7). Applying
// one copies it into a new area: changing the area later never changes the
// template, and the other way round. Tool grants in a template always start
// as "ask": the user loosens what they want (the same rule as importing
// agents).

export interface TemplateRole {
  /** Referred to by the stages of the template. */
  readonly key: string;
  /** Name of the agent created for this role. */
  readonly name: string;
  readonly objective: string;
  readonly systemPrompt: string;
  /** Tools suggested for the role; each one starts as "ask". */
  readonly tools: readonly string[];
  readonly areaAccess: AreaAccess;
}

export interface TemplateStage {
  readonly key: string;
  readonly name: string;
  readonly kind: StageKind;
  /** The role that works the stage; only for agent stages. */
  readonly role: string | null;
}

export interface TemplateTransition {
  readonly from: string;
  readonly to: string;
  readonly actor: TransitionActor;
}

export interface WorkflowTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The good practice the template carries, shown when choosing it. */
  readonly practices: readonly string[];
  readonly roles: readonly TemplateRole[];
  readonly stages: readonly TemplateStage[];
  readonly transitions: readonly TemplateTransition[];
}

const HOW_TO_WORK = [
  'Você trabalha numa tarefa de um quadro. A tarefa chega com título, descrição, critérios de aceite e as notas de quem passou por ela antes.',
  'A pasta compartilhada da área é acessada pelo prefixo "area/" nas ferramentas de arquivo, por exemplo "area/src/app.js". Sem o prefixo, o caminho é a sua pasta pessoal.',
  'Ao terminar a sua parte, mova a tarefa com a ferramenta move_task, sempre com uma nota clara para quem vem depois. Use comment_task para registrar dúvidas ou decisões. Se não puder continuar, explique num comentário e termine sem mover: a tarefa irá para o usuário.',
].join('\n');

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: 'desenvolvimento',
    name: 'Desenvolvimento',
    description:
      'Um pedido é refinado em especificação, implementado, testado e revisado por você antes de ser concluído.',
    practices: [
      'Toda tarefa ganha critérios de aceite verificáveis antes de ser implementada.',
      'Testes devolvem a tarefa ao desenvolvimento com cada problema descrito.',
      'Quem testa só lê a pasta da área: não corrige o que testa.',
      'Nada é concluído sem a sua revisão.',
    ],
    roles: [
      {
        key: 'produto',
        name: 'Produto',
        objective:
          'Transformar pedidos em especificações claras, com critérios de aceite verificáveis.',
        systemPrompt: [
          'Você é responsável pelo produto nesta área.',
          'Quando uma tarefa chega, escreva a especificação: objetivo, contexto, o que está fora do escopo e uma lista de critérios de aceite que alguém consiga verificar um a um.',
          'Se faltar informação essencial, registre as perguntas com comment_task e termine sem mover a tarefa.',
          'Com a especificação pronta, mova a tarefa para Desenvolvimento e coloque a especificação inteira na nota.',
          HOW_TO_WORK,
        ].join('\n\n'),
        tools: ['read_file', 'list_dir', 'write_file'],
        areaAccess: 'write',
      },
      {
        key: 'desenvolvimento',
        name: 'Desenvolvimento',
        objective: 'Implementar o que foi especificado, na pasta compartilhada da área.',
        systemPrompt: [
          'Você desenvolve nesta área.',
          'Implemente o que a especificação pede, nos arquivos da pasta da área (prefixo "area/"). Leia o que já existe antes de mudar.',
          'Se a tarefa voltou de Testes, corrija exatamente cada problema apontado na nota e diga, na sua nota, como cada um foi resolvido.',
          'Ao terminar, mova a tarefa para Testes com uma nota que diga o que foi feito, quais arquivos mudaram e como verificar cada critério de aceite.',
          HOW_TO_WORK,
        ].join('\n\n'),
        tools: ['read_file', 'list_dir', 'write_file'],
        areaAccess: 'write',
      },
      {
        key: 'testes',
        name: 'Testes',
        objective: 'Verificar o trabalho contra cada critério de aceite.',
        systemPrompt: [
          'Você testa nesta área. Você não corrige o que testa: só lê a pasta da área.',
          'Confira o trabalho contra cada critério de aceite, lendo os arquivos em "area/". Para cada critério, diga se passou ou falhou e por quê.',
          'Se algum critério falhar, devolva a tarefa para Desenvolvimento com uma nota que liste cada problema e como reproduzi-lo.',
          'Se todos passarem, mova a tarefa para Sua revisão com o resumo da verificação.',
          HOW_TO_WORK,
        ].join('\n\n'),
        tools: ['read_file', 'list_dir'],
        areaAccess: 'read',
      },
    ],
    stages: [
      { key: 'refinamento', name: 'Refinamento', kind: 'agent', role: 'produto' },
      { key: 'desenvolvimento', name: 'Desenvolvimento', kind: 'agent', role: 'desenvolvimento' },
      { key: 'testes', name: 'Testes', kind: 'agent', role: 'testes' },
      { key: 'revisao', name: 'Sua revisão', kind: 'human', role: null },
      { key: 'concluido', name: 'Concluído', kind: 'done', role: null },
    ],
    transitions: [
      { from: 'refinamento', to: 'desenvolvimento', actor: 'both' },
      { from: 'desenvolvimento', to: 'testes', actor: 'both' },
      { from: 'testes', to: 'desenvolvimento', actor: 'both' },
      { from: 'testes', to: 'revisao', actor: 'both' },
      { from: 'revisao', to: 'concluido', actor: 'human' },
      { from: 'revisao', to: 'desenvolvimento', actor: 'human' },
      { from: 'revisao', to: 'refinamento', actor: 'human' },
      { from: 'concluido', to: 'refinamento', actor: 'human' },
    ],
  },
];

export const workflowTemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  practices: z.array(z.string()),
  roles: z.array(z.object({ name: z.string(), objective: z.string() })),
  stages: z.array(z.object({ name: z.string(), kind: z.string() })),
});
export type WorkflowTemplateSummary = z.infer<typeof workflowTemplateSummarySchema>;

export const workflowTemplateListSchema = z.object({
  templates: z.array(workflowTemplateSummarySchema),
});

export function templateSummary(template: WorkflowTemplate): WorkflowTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    practices: [...template.practices],
    roles: template.roles.map((role) => ({ name: role.name, objective: role.objective })),
    stages: template.stages.map((stage) => ({ name: stage.name, kind: stage.kind })),
  };
}
