import { z } from 'zod';
import { AGENT_LIMITS } from './agents';
import {
  AREA_ACCESS,
  type AreaAccess,
  STAGE_KINDS,
  type StageKind,
  TRANSITION_ACTORS,
  type TransitionActor,
} from './enums';
import { workflowUpdateSchema } from './tasks';

// Ready-made workflows with good practice built in (Phase 16, D7) and the
// user's own (Phase 18). Applying one copies it into a new area: changing the
// area later never changes the template, and the other way round. Tool
// grants in a template always start as "ask": the user loosens what they want
// (the same rule as importing agents). A template never carries keys,
// addresses, models, ids or "allow" (Phase 18, D2).

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

/** What a template is made of, apart from its id and name. */
export interface TemplateContent {
  readonly description: string;
  /** The good practice the template carries, shown when choosing it. */
  readonly practices: readonly string[];
  readonly roles: readonly TemplateRole[];
  readonly stages: readonly TemplateStage[];
  readonly transitions: readonly TemplateTransition[];
}

export interface WorkflowTemplate extends TemplateContent {
  readonly id: string;
  readonly name: string;
}

export const TEMPLATE_ORIGINS = ['builtin', 'user'] as const;
export type TemplateOrigin = (typeof TEMPLATE_ORIGINS)[number];

export const TEMPLATE_LIMITS = {
  name: 60,
  description: 500,
  practice: 300,
  practices: 10,
  roles: 12,
  toolsPerRole: 30,
  /** Templates of the user (Phase 18). */
  saved: 100,
} as const;

// ---- Schemas ----------------------------------------------------------------

const key = z.string().min(1).max(40);
const sameText = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, 'Dê um nome ao modelo.')
  .max(TEMPLATE_LIMITS.name, `O nome pode ter até ${TEMPLATE_LIMITS.name} caracteres.`);

const descriptionSchema = z
  .string()
  .trim()
  .max(
    TEMPLATE_LIMITS.description,
    `A descrição pode ter até ${TEMPLATE_LIMITS.description} caracteres.`,
  );

const practicesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Uma boa prática não pode ficar vazia.')
      .max(
        TEMPLATE_LIMITS.practice,
        `Cada boa prática pode ter até ${TEMPLATE_LIMITS.practice} caracteres.`,
      ),
  )
  .max(TEMPLATE_LIMITS.practices, `Até ${TEMPLATE_LIMITS.practices} boas práticas.`);

const templateRoleSchema = z.strictObject({
  key,
  name: z.string().trim().min(1).max(AGENT_LIMITS.name),
  objective: z.string().max(AGENT_LIMITS.objective),
  systemPrompt: z.string().max(AGENT_LIMITS.systemPrompt),
  tools: z.array(z.string().min(1).max(64)).max(TEMPLATE_LIMITS.toolsPerRole),
  areaAccess: z.enum(AREA_ACCESS),
});

const templateStageSchema = z.strictObject({
  key,
  name: z.string().trim().min(1).max(40),
  kind: z.enum(STAGE_KINDS),
  role: key.nullable(),
});

const templateTransitionSchema = z.strictObject({
  from: key,
  to: key,
  actor: z.enum(TRANSITION_ACTORS),
});

/**
 * The content of a template, checked with the same rules as a workflow saved
 * by the editor (a stage's role stands where an agent would), plus the rules
 * of roles.
 */
export const templateContentSchema = z
  .strictObject({
    description: descriptionSchema,
    practices: practicesSchema,
    roles: z.array(templateRoleSchema).max(TEMPLATE_LIMITS.roles),
    stages: z.array(templateStageSchema),
    transitions: z.array(templateTransitionSchema),
  })
  .superRefine((content, context) => {
    const problem = (message: string, path: (string | number)[]) =>
      context.addIssue({ code: 'custom', message, path });
    const roleKeys = new Set(content.roles.map((role) => role.key));
    if (roleKeys.size !== content.roles.length) {
      problem('Há dois papéis com a mesma chave.', ['roles']);
    }
    content.roles.forEach((role, index) => {
      if (content.roles.findIndex((other) => sameText(other.name, role.name)) !== index) {
        problem(`Já existe um papel chamado "${role.name}".`, ['roles', index, 'name']);
      }
    });
    content.stages.forEach((stage, index) => {
      if (stage.role !== null && !roleKeys.has(stage.role)) {
        problem(`A etapa "${stage.name}" aponta para um papel que não existe.`, [
          'stages',
          index,
          'role',
        ]);
      }
    });
    const workflow = workflowUpdateSchema.safeParse({
      stages: content.stages.map((stage) => ({
        key: stage.key,
        name: stage.name,
        kind: stage.kind,
        agentId: stage.role,
      })),
      transitions: content.transitions,
    });
    if (!workflow.success) {
      for (const issue of workflow.error.issues) {
        problem(
          issue.message,
          issue.path.map((part) => (typeof part === 'symbol' ? '' : part)),
        );
      }
    }
  });

export const workflowTemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  origin: z.enum(TEMPLATE_ORIGINS),
  description: z.string(),
  practices: z.array(z.string()),
  roles: z.array(
    z.object({
      name: z.string(),
      objective: z.string(),
      tools: z.array(z.string()),
      areaAccess: z.enum(AREA_ACCESS),
    }),
  ),
  stages: z.array(z.object({ name: z.string(), kind: z.enum(STAGE_KINDS) })),
});
export type WorkflowTemplateSummary = z.infer<typeof workflowTemplateSummarySchema>;

export const workflowTemplateListSchema = z.object({
  templates: z.array(workflowTemplateSummarySchema),
});

export function templateSummary(
  template: WorkflowTemplate,
  origin: TemplateOrigin,
): WorkflowTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    origin,
    description: template.description,
    practices: [...template.practices],
    roles: template.roles.map((role) => ({
      name: role.name,
      objective: role.objective,
      tools: [...role.tools],
      areaAccess: role.areaAccess,
    })),
    stages: template.stages.map((stage) => ({ name: stage.name, kind: stage.kind })),
  };
}

/** Saves the workflow of an area, and the agents on its stages, as a template (D3). */
export const templateFromAreaSchema = z.strictObject({
  areaId: key,
  name: templateNameSchema,
  /** Defaults to the area's description. */
  description: descriptionSchema.optional(),
  practices: practicesSchema.default([]),
});
export type TemplateFromArea = z.infer<typeof templateFromAreaSchema>;

export const templateUpdateSchema = z
  .strictObject({
    name: templateNameSchema.optional(),
    description: descriptionSchema.optional(),
    practices: practicesSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Nada para alterar.');
export type TemplateUpdate = z.infer<typeof templateUpdateSchema>;

// ---- File (D4) ----------------------------------------------------------------

export const TEMPLATE_EXPORT_FORMAT = 'enterprise-agents/workflow-template';
export const TEMPLATE_EXPORT_VERSION = 1;

export const templateExportSchema = z.strictObject({
  format: z.literal(
    TEMPLATE_EXPORT_FORMAT,
    'Este não é um arquivo de modelo de fluxo do Enterprise Agents.',
  ),
  version: z.literal(
    TEMPLATE_EXPORT_VERSION,
    'Este arquivo é de uma versão que esta instalação não sabe ler.',
  ),
  exportedAt: z.string().max(40).optional(),
  template: z.strictObject({
    name: templateNameSchema,
    content: templateContentSchema,
  }),
});
export type TemplateExport = z.infer<typeof templateExportSchema>;

export const templateImportResultSchema = z.object({
  template: workflowTemplateSummarySchema,
  warnings: z.array(z.string()),
});
export type TemplateImportResult = z.infer<typeof templateImportResultSchema>;

// ---- Ready-made templates ---------------------------------------------------------

const HOW_TO_WORK = [
  'Você trabalha numa tarefa de um quadro. A tarefa chega com título, descrição, critérios de aceite e as notas de quem passou por ela antes.',
  'A pasta compartilhada da área é acessada pelo prefixo "area/" nas ferramentas de arquivo, por exemplo "area/src/app.js". Sem o prefixo, o caminho é a sua pasta pessoal.',
  'Ao terminar a sua parte, mova a tarefa com a ferramenta move_task, sempre com uma nota clara para quem vem depois. Use comment_task para registrar dúvidas ou decisões. Se não puder continuar, explique num comentário e termine sem mover: a tarefa irá para o usuário.',
].join('\n');

const prompt = (...parts: string[]) => [...parts, HOW_TO_WORK].join('\n\n');

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
        systemPrompt: prompt(
          'Você é responsável pelo produto nesta área.',
          'Quando uma tarefa chega, escreva a especificação: objetivo, contexto, o que está fora do escopo e uma lista de critérios de aceite que alguém consiga verificar um a um.',
          'Se faltar informação essencial, registre as perguntas com comment_task e termine sem mover a tarefa.',
          'Com a especificação pronta, mova a tarefa para Desenvolvimento e coloque a especificação inteira na nota.',
        ),
        tools: ['read_file', 'list_dir', 'write_file'],
        areaAccess: 'write',
      },
      {
        key: 'desenvolvimento',
        name: 'Desenvolvimento',
        objective: 'Implementar o que foi especificado, na pasta compartilhada da área.',
        systemPrompt: prompt(
          'Você desenvolve nesta área.',
          'Implemente o que a especificação pede, nos arquivos da pasta da área (prefixo "area/"). Leia o que já existe antes de mudar.',
          'Se a tarefa voltou de Testes, corrija exatamente cada problema apontado na nota e diga, na sua nota, como cada um foi resolvido.',
          'Ao terminar, mova a tarefa para Testes com uma nota que diga o que foi feito, quais arquivos mudaram e como verificar cada critério de aceite.',
        ),
        tools: ['read_file', 'list_dir', 'write_file'],
        areaAccess: 'write',
      },
      {
        key: 'testes',
        name: 'Testes',
        objective: 'Verificar o trabalho contra cada critério de aceite.',
        systemPrompt: prompt(
          'Você testa nesta área. Você não corrige o que testa: só lê a pasta da área.',
          'Confira o trabalho contra cada critério de aceite, lendo os arquivos em "area/". Para cada critério, diga se passou ou falhou e por quê.',
          'Se algum critério falhar, devolva a tarefa para Desenvolvimento com uma nota que liste cada problema e como reproduzi-lo.',
          'Se todos passarem, mova a tarefa para Sua revisão com o resumo da verificação.',
        ),
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
  {
    id: 'marketing',
    name: 'Marketing',
    description:
      'Um briefing vira texto, passa por uma revisão e só fica pronto com a sua aprovação.',
    practices: [
      'Todo texto nasce de um briefing com público, objetivo, mensagem principal e tom.',
      'A revisão devolve o texto à redação com cada ajuste descrito.',
      'Quem revisa só lê a pasta da área: não reescreve o que revisa.',
      'Nada fica pronto sem a sua aprovação. A plataforma não publica em lugar nenhum: o texto aprovado fica na pasta da área.',
    ],
    roles: [
      {
        key: 'estrategia',
        name: 'Estratégia',
        objective: 'Transformar pedidos em briefings claros, com público, objetivo e mensagem.',
        systemPrompt: prompt(
          'Você cuida da estratégia de marketing nesta área.',
          'Quando uma tarefa chega, escreva o briefing em "area/briefings/": público, objetivo, mensagem principal, tom, canal, tamanho e o que não dizer. Se precisar consultar uma página pública, use fetch_url e cite de onde veio cada informação.',
          'Se faltar informação essencial, registre as perguntas com comment_task e termine sem mover a tarefa.',
          'Com o briefing pronto, mova a tarefa para Redação com o caminho do arquivo e um resumo do briefing na nota.',
        ),
        tools: ['read_file', 'list_dir', 'write_file', 'fetch_url'],
        areaAccess: 'write',
      },
      {
        key: 'redacao',
        name: 'Redação',
        objective: 'Escrever o texto que o briefing pede, no tom e no tamanho certos.',
        systemPrompt: prompt(
          'Você escreve nesta área.',
          'Leia o briefing e escreva o texto em "area/textos/". Siga o tom, o tamanho e o canal pedidos; não invente dados, números ou depoimentos.',
          'Se a tarefa voltou da Revisão, faça exatamente cada ajuste pedido e diga, na sua nota, como resolveu cada um.',
          'Ao terminar, mova a tarefa para Revisão com o caminho do texto na nota.',
        ),
        tools: ['read_file', 'list_dir', 'write_file'],
        areaAccess: 'write',
      },
      {
        key: 'revisao',
        name: 'Revisão de marketing',
        objective: 'Conferir o texto contra o briefing antes de ele chegar a você.',
        systemPrompt: prompt(
          'Você revisa textos nesta área. Você não reescreve o que revisa: só lê a pasta da área.',
          'Confira o texto contra o briefing: público, mensagem, tom, tamanho, clareza, ortografia e afirmações que precisariam de fonte.',
          'Se algo precisar mudar, devolva a tarefa para Redação com a lista de ajustes, cada um com o trecho e o motivo.',
          'Se estiver bom, mova a tarefa para Sua aprovação com o resumo da revisão.',
        ),
        tools: ['read_file', 'list_dir'],
        areaAccess: 'read',
      },
    ],
    stages: [
      { key: 'briefing', name: 'Briefing', kind: 'agent', role: 'estrategia' },
      { key: 'redacao', name: 'Redação', kind: 'agent', role: 'redacao' },
      { key: 'revisao', name: 'Revisão', kind: 'agent', role: 'revisao' },
      { key: 'aprovacao', name: 'Sua aprovação', kind: 'human', role: null },
      { key: 'publicado', name: 'Publicado', kind: 'done', role: null },
    ],
    transitions: [
      { from: 'briefing', to: 'redacao', actor: 'both' },
      { from: 'redacao', to: 'revisao', actor: 'both' },
      { from: 'revisao', to: 'redacao', actor: 'both' },
      { from: 'revisao', to: 'aprovacao', actor: 'both' },
      { from: 'aprovacao', to: 'publicado', actor: 'human' },
      { from: 'aprovacao', to: 'redacao', actor: 'human' },
      { from: 'aprovacao', to: 'briefing', actor: 'human' },
      { from: 'publicado', to: 'briefing', actor: 'human' },
    ],
  },
  {
    id: 'dados',
    name: 'Dados',
    description:
      'Um pedido de números é entendido, analisado e conferido por outro agente antes da entrega.',
    practices: [
      'Todo pedido vira uma pergunta clara e um método antes da análise.',
      'Cada número entregue diz de onde veio e como foi calculado.',
      'Outro agente confere os números antes da entrega, só lendo a pasta da área, e devolve o que não bater.',
      'A primeira etapa recebe pedidos de outras áreas; a entrega vai em "area/entregas/<pedido>/".',
    ],
    roles: [
      {
        key: 'analise',
        name: 'Análise de dados',
        objective: 'Responder perguntas com números, dizendo de onde vem cada um.',
        systemPrompt: prompt(
          'Você analisa dados nesta área.',
          'Na etapa Pedido: reescreva o pedido como uma pergunta clara, diga quais dados vai usar (arquivos em "area/" ou páginas públicas, com fetch_url) e qual método. Se faltar dado essencial, registre o que falta com comment_task e termine sem mover. Com o plano pronto, mova a tarefa para Análise com o plano na nota.',
          'Na etapa Análise: faça a análise e grave o resultado em "area/analises/". Para cada número, diga a fonte e o cálculo; não invente dados. Se a tarefa voltou da Validação, corrija cada divergência apontada. Ao terminar, mova para Validação com o caminho do resultado na nota.',
          'Se a tarefa for um pedido de outra área, a entrega final vai em "area/entregas/<id do pedido>/".',
        ),
        tools: ['read_file', 'list_dir', 'write_file', 'fetch_url'],
        areaAccess: 'write',
      },
      {
        key: 'validacao',
        name: 'Validação de dados',
        objective: 'Conferir os números da análise antes da entrega.',
        systemPrompt: prompt(
          'Você confere análises nesta área. Você não corrige o que confere: só lê a pasta da área.',
          'Refaça os cálculos principais a partir das fontes citadas, confira se a pergunta foi respondida e se cada número tem fonte.',
          'Se algo não bater, devolva a tarefa para Análise com cada divergência: o número, o que você encontrou e como chegou nele.',
          'Se tudo bater, mova a tarefa para Entregue com o resumo da conferência e a resposta em poucas linhas.',
        ),
        tools: ['read_file', 'list_dir'],
        areaAccess: 'read',
      },
    ],
    stages: [
      { key: 'pedido', name: 'Pedido', kind: 'agent', role: 'analise' },
      { key: 'analise', name: 'Análise', kind: 'agent', role: 'analise' },
      { key: 'validacao', name: 'Validação', kind: 'agent', role: 'validacao' },
      { key: 'entregue', name: 'Entregue', kind: 'done', role: null },
    ],
    transitions: [
      { from: 'pedido', to: 'analise', actor: 'both' },
      { from: 'analise', to: 'validacao', actor: 'both' },
      { from: 'validacao', to: 'analise', actor: 'both' },
      { from: 'validacao', to: 'entregue', actor: 'both' },
      { from: 'entregue', to: 'pedido', actor: 'human' },
    ],
  },
  {
    id: 'produto',
    name: 'Produto',
    description:
      'Ideias viram especificações, você prioriza, e a especificação vira pedido para outra área.',
    practices: [
      'Toda ideia vira uma especificação com problema, proposta e critérios de aceite antes de ser priorizada.',
      'Só você prioriza: nada é enviado a outra área sem passar por você.',
      'A especificação segue como pedido para outra área (Pedidos entre áreas). Crie antes a regra que deixa esta área pedir à outra.',
    ],
    roles: [
      {
        key: 'produto',
        name: 'Gestão de produto',
        objective: 'Transformar ideias em especificações e levá-las à área que vai fazer.',
        systemPrompt: prompt(
          'Você cuida do produto nesta área.',
          'Na etapa Especificação: escreva em "area/especificacoes/" o problema, para quem é, a proposta, o que fica fora e critérios de aceite verificáveis. Se faltar informação essencial, registre as perguntas com comment_task e termine sem mover. Com a especificação pronta, mova a tarefa para Priorização com um resumo na nota.',
          'Na etapa Envio: use request_from_area para pedir o trabalho à área indicada na tarefa (ou à única que o briefing mostrar), com a especificação na descrição, os critérios de aceite e o arquivo da especificação junto. Se nenhuma área puder ser acionada, explique num comentário e termine sem mover. Depois que a outra área entregar (a entrega aparece no histórico e em "area/recebidos/"), mova a tarefa para Enviado com um resumo da entrega.',
        ),
        tools: ['read_file', 'list_dir', 'write_file'],
        areaAccess: 'write',
      },
    ],
    stages: [
      { key: 'ideia', name: 'Ideia', kind: 'human', role: null },
      { key: 'especificacao', name: 'Especificação', kind: 'agent', role: 'produto' },
      { key: 'priorizacao', name: 'Priorização', kind: 'human', role: null },
      { key: 'envio', name: 'Envio', kind: 'agent', role: 'produto' },
      { key: 'enviado', name: 'Enviado', kind: 'done', role: null },
    ],
    transitions: [
      { from: 'ideia', to: 'especificacao', actor: 'human' },
      { from: 'especificacao', to: 'priorizacao', actor: 'both' },
      { from: 'priorizacao', to: 'envio', actor: 'human' },
      { from: 'priorizacao', to: 'especificacao', actor: 'human' },
      { from: 'priorizacao', to: 'ideia', actor: 'human' },
      { from: 'envio', to: 'enviado', actor: 'both' },
      { from: 'envio', to: 'priorizacao', actor: 'both' },
      { from: 'enviado', to: 'ideia', actor: 'human' },
    ],
  },
  {
    id: 'conteudo',
    name: 'Conteúdo e documentação',
    description:
      'Um rascunho passa por uma revisão técnica e por uma revisão de texto antes de ficar pronto.',
    practices: [
      'Dois revisores com focos diferentes: um confere se está correto, o outro se está claro.',
      'Cada revisor só lê a pasta da área e devolve ao rascunho com cada ajuste descrito.',
      'O texto pronto fica na pasta da área; a plataforma não publica em lugar nenhum.',
    ],
    roles: [
      {
        key: 'autoria',
        name: 'Autoria',
        objective: 'Escrever documentação e conteúdo corretos e fáceis de seguir.',
        systemPrompt: prompt(
          'Você escreve documentação e conteúdo nesta área.',
          'Escreva o texto em "area/docs/", lendo antes o que já existe na pasta da área. Prefira frases curtas, exemplos concretos e passos numerados quando houver procedimento.',
          'Se a tarefa voltou de uma revisão, faça exatamente cada ajuste pedido e diga, na sua nota, como resolveu cada um.',
          'Ao terminar, mova a tarefa para Revisão técnica com o caminho do texto na nota.',
        ),
        tools: ['read_file', 'list_dir', 'write_file'],
        areaAccess: 'write',
      },
      {
        key: 'tecnica',
        name: 'Revisão técnica',
        objective: 'Conferir se o que o texto afirma está correto e completo.',
        systemPrompt: prompt(
          'Você faz a revisão técnica nesta área. Você não reescreve o que revisa: só lê a pasta da área.',
          'Confira cada afirmação, comando, nome e passo contra o que existe na pasta da área. Aponte o que estiver errado, faltando ou desatualizado.',
          'Se algo precisar mudar, devolva a tarefa para Rascunho com a lista de ajustes, cada um com o trecho e o motivo.',
          'Se estiver correto, mova a tarefa para Revisão de texto com o resumo da revisão.',
        ),
        tools: ['read_file', 'list_dir'],
        areaAccess: 'read',
      },
      {
        key: 'texto',
        name: 'Revisão de texto',
        objective: 'Conferir se o texto está claro, consistente e sem erros.',
        systemPrompt: prompt(
          'Você faz a revisão de texto nesta área. Você não reescreve o que revisa: só lê a pasta da área.',
          'Confira clareza, ordem das ideias, consistência de termos, ortografia e gramática. Não mude o conteúdo técnico.',
          'Se algo precisar mudar, devolva a tarefa para Rascunho com a lista de ajustes, cada um com o trecho e o motivo.',
          'Se estiver bom, mova a tarefa para Publicado com o resumo da revisão.',
        ),
        tools: ['read_file', 'list_dir'],
        areaAccess: 'read',
      },
    ],
    stages: [
      { key: 'rascunho', name: 'Rascunho', kind: 'agent', role: 'autoria' },
      { key: 'tecnica', name: 'Revisão técnica', kind: 'agent', role: 'tecnica' },
      { key: 'texto', name: 'Revisão de texto', kind: 'agent', role: 'texto' },
      { key: 'publicado', name: 'Publicado', kind: 'done', role: null },
    ],
    transitions: [
      { from: 'rascunho', to: 'tecnica', actor: 'both' },
      { from: 'tecnica', to: 'rascunho', actor: 'both' },
      { from: 'tecnica', to: 'texto', actor: 'both' },
      { from: 'texto', to: 'rascunho', actor: 'both' },
      { from: 'texto', to: 'publicado', actor: 'both' },
      { from: 'publicado', to: 'rascunho', actor: 'human' },
    ],
  },
];
