import { WORKFLOW_TEMPLATES } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import {
  exitsOf,
  type FlowRole,
  type FlowStage,
  type FlowTransition,
  flowSentences,
  flowWarnings,
  layoutFlow,
  whoWorks,
} from './flow-graph';

const stages: FlowStage[] = [
  { key: 'a', name: 'Refinamento', kind: 'agent', role: 'po' },
  { key: 'b', name: 'Desenvolvimento', kind: 'agent', role: 'dev' },
  { key: 'c', name: 'Testes', kind: 'agent', role: 'qa' },
  { key: 'd', name: 'Sua revisão', kind: 'human', role: null },
  { key: 'e', name: 'Concluído', kind: 'done', role: null },
];
const transitions: FlowTransition[] = [
  { id: '1', from: 'a', to: 'b', actor: 'agent' },
  { id: '2', from: 'b', to: 'c', actor: 'agent' },
  { id: '3', from: 'c', to: 'd', actor: 'agent' },
  { id: '4', from: 'c', to: 'b', actor: 'agent' },
  { id: '5', from: 'd', to: 'e', actor: 'human' },
  { id: '6', from: 'd', to: 'a', actor: 'human' },
  { id: '7', from: 'a', to: 'c', actor: 'both' },
];
const roles: FlowRole[] = [
  { key: 'po', name: 'Produto', agents: [{ name: 'Paula', busy: false }] },
  {
    key: 'dev',
    name: 'Dev',
    agents: [
      { name: 'Dev 1', busy: true },
      { name: 'Dev 2', busy: false },
    ],
  },
  { key: 'qa', name: 'QA', agents: [] },
];

describe('the drawing of a flow (Phase 39, D5)', () => {
  it.each(['row', 'column'] as const)(
    'keeps every card and arc apart, inside the picture (%s)',
    (orientation) => {
      const layout = layoutFlow(stages, transitions, orientation);
      expect(layout.nodes).toHaveLength(5);
      for (const [index, node] of layout.nodes.entries()) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.x + node.w).toBeLessThanOrEqual(layout.width);
        expect(node.y + node.h).toBeLessThanOrEqual(layout.height);
        for (const other of layout.nodes.slice(index + 1)) {
          const apart =
            node.x + node.w <= other.x ||
            other.x + other.w <= node.x ||
            node.y + node.h <= other.y ||
            other.y + other.h <= node.y;
          expect(apart).toBe(true);
        }
      }
      expect(layout.edges.map((edge) => [edge.id, edge.kind])).toEqual([
        ['1', 'next'],
        ['2', 'next'],
        ['3', 'next'],
        ['4', 'back'],
        ['5', 'next'],
        ['6', 'back'],
        ['7', 'ahead'],
      ]);
      // Every point of every arrow is inside the picture.
      for (const edge of layout.edges) {
        const numbers = edge.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
        for (let i = 0; i < numbers.length; i += 2) {
          expect(numbers[i]).toBeGreaterThanOrEqual(0);
          expect(numbers[i]).toBeLessThanOrEqual(layout.width);
          expect(numbers[i + 1]).toBeGreaterThanOrEqual(0);
          expect(numbers[i + 1]).toBeLessThanOrEqual(layout.height);
        }
      }
    },
  );

  it('puts overlapping returns on different lanes', () => {
    const layout = layoutFlow(stages, transitions, 'row');
    const laneOf = (id: string) => {
      const numbers = layout.edges
        .find((edge) => edge.id === id)
        ?.d.match(/\d+/g)
        ?.map(Number);
      return numbers?.[3];
    };
    // Testes → Desenvolvimento lies within Sua revisão → Refinamento: two lanes.
    expect(laneOf('4')).not.toBe(laneOf('6'));
  });

  it('draws every ready-made template without loose arrows', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const layout = layoutFlow(
        template.stages,
        template.transitions.map((transition, index) => ({ ...transition, id: String(index) })),
        'row',
        'compact',
      );
      expect(layout.edges, template.id).toHaveLength(template.transitions.length);
    }
  });
});

describe('the flow in words', () => {
  it('says who works each stage and where the task goes from there', () => {
    expect(flowSentences(stages, transitions, roles)).toEqual([
      'Uma tarefa nova chega em Refinamento, onde trabalha Paula (Produto). Daqui segue para Desenvolvimento (o agente leva); ou segue para Testes (o agente ou você levam).',
      'Em Desenvolvimento, onde trabalha o primeiro livre entre Dev 1 ou Dev 2 (Dev). Daqui segue para Testes (o agente leva).',
      'Em Testes, onde trabalha o papel QA, ainda sem agentes. Daqui segue para Sua revisão (o agente leva); ou volta para Desenvolvimento (o agente leva).',
      'Em Sua revisão, onde a tarefa espera a sua decisão. Daqui segue para Concluído (só você leva); ou volta para Refinamento (só você leva).',
      'Em Concluído, a tarefa está concluída.',
    ]);
    expect(whoWorks({ key: 'x', name: 'X', kind: 'agent', role: null }, roles)).toBe(
      'ninguém: falta o papel',
    );
  });

  it('lists the ways out of a stage, the returns last', () => {
    expect(exitsOf('c', stages, transitions).map((exit) => [exit.stage.name, exit.back])).toEqual([
      ['Sua revisão', false],
      ['Desenvolvimento', true],
    ]);
  });
});

describe('what needs attention', () => {
  it('points out a role nobody has, a stage without a role or a way out, and the unreachable', () => {
    const broken: FlowStage[] = [
      ...stages.slice(0, 4),
      { key: 'z', name: 'Esquecida', kind: 'agent', role: null },
      stages[4]!,
    ];
    const warnings = flowWarnings(
      broken,
      transitions.filter((transition) => transition.id !== '5'),
      roles,
    ).map((warning) => warning.text);
    expect(warnings).toEqual([
      'Ninguém tem o papel QA, de Testes: dê esse papel a um agente da equipe.',
      'Esquecida não tem papel: as tarefas param ali.',
      'Esquecida não tem saída: uma tarefa que chega lá não anda mais.',
      'Nenhuma tarefa chega a Esquecida saindo de Refinamento.',
      'Nenhuma tarefa chega a Concluído saindo de Refinamento.',
      'Não há caminho até uma etapa final.',
    ]);
  });

  it('has nothing to say about a sound flow', () => {
    const staffed = roles.map((role) =>
      role.key === 'qa' ? { ...role, agents: [{ name: 'Quim', busy: false }] } : role,
    );
    expect(flowWarnings(stages, transitions, staffed)).toEqual([]);
  });
});
