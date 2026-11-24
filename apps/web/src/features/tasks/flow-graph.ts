import type { StageKind, TransitionActor } from '@ea/shared';

// The workflow as a picture (Phase 39, D5), as plain data: where each stage
// card goes and the path of each arrow, the flow told in sentences, what is
// wrong with it, and a task walked through it. No React and no DOM, so the
// editor, the template catalogue and the tests share it.

export interface FlowStage {
  readonly key: string;
  readonly name: string;
  readonly kind: StageKind;
  /** The role's key (editor) or name (template), for agent stages. */
  readonly role: string | null;
}

export interface FlowTransition {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly actor: TransitionActor;
}

export interface FlowRole {
  readonly key: string;
  readonly name: string;
  /** Agents that have the role; null when not known (a template). */
  readonly agents: readonly { readonly name: string; readonly busy: boolean }[] | null;
}

export type Orientation = 'row' | 'column';

export interface NodeBox {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface EdgePath {
  readonly id: string;
  /** Next stage in order, a jump ahead, or back to an earlier stage (a return). */
  readonly kind: 'next' | 'ahead' | 'back';
  readonly d: string;
  readonly label: { readonly x: number; readonly y: number };
  readonly actor: TransitionActor;
  readonly from: string;
  readonly to: string;
}

export interface FlowLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly NodeBox[];
  readonly edges: readonly EdgePath[];
}

export const SIZES = {
  full: { w: 156, h: 72, gap: 60, lane: 26, pad: 14 },
  compact: { w: 124, h: 44, gap: 30, lane: 14, pad: 8 },
} as const;

/**
 * Puts the stages in order, left to right (or top to bottom), and draws each
 * transition: to the next stage, a straight arrow; ahead past others, an arc
 * on one side; back to an earlier stage, an arc on the other side. Arcs whose
 * spans overlap go on different lanes, so none runs over another.
 */
export function layoutFlow(
  stages: readonly FlowStage[],
  transitions: readonly FlowTransition[],
  orientation: Orientation = 'row',
  size: keyof typeof SIZES = 'full',
): FlowLayout {
  const { w, h, gap, lane, pad } = SIZES[size];
  const index = new Map(stages.map((stage, position) => [stage.key, position] as const));
  const valid = transitions.filter(
    (transition) =>
      index.has(transition.from) && index.has(transition.to) && transition.from !== transition.to,
  );
  const spanOf = (transition: FlowTransition) => {
    const a = index.get(transition.from) ?? 0;
    const b = index.get(transition.to) ?? 0;
    return { a, b, low: Math.min(a, b), high: Math.max(a, b) };
  };
  const ahead = valid.filter((transition) => {
    const { a, b } = spanOf(transition);
    return b > a + 1;
  });
  const back = valid.filter((transition) => {
    const { a, b } = spanOf(transition);
    return b < a;
  });
  const lanesOf = (arcs: readonly FlowTransition[]) => {
    // Shorter spans nearer the cards; each takes the first lane free over its span.
    const sorted = [...arcs].sort((x, y) => {
      const sx = spanOf(x);
      const sy = spanOf(y);
      return sx.high - sx.low - (sy.high - sy.low) || sx.low - sy.low;
    });
    const taken: { low: number; high: number }[][] = [];
    const laneOf = new Map<string, number>();
    for (const arc of sorted) {
      const { low, high } = spanOf(arc);
      let level = 0;
      while (taken[level]?.some((used) => low < used.high && high > used.low)) level += 1;
      (taken[level] ??= []).push({ low, high });
      laneOf.set(arc.id, level);
    }
    return { laneOf, count: taken.length };
  };
  const above = lanesOf(ahead);
  const below = lanesOf(back);
  const before = pad + above.count * lane;
  const along = (position: number) => pad + position * (w + gap);

  const nodes: NodeBox[] = stages.map((stage, position) =>
    orientation === 'row'
      ? { key: stage.key, x: along(position), y: before, w, h }
      : // In a column, the arcs go to the sides: ahead on the left, back on the right.
        { key: stage.key, x: before, y: pad + position * (h + gap * 0.6), w, h },
  );
  const step = orientation === 'row' ? w + gap : h + gap * 0.6;
  const first = nodes[0];
  const centre = (position: number) =>
    orientation === 'row' ? along(position) + w / 2 : pad + position * step + h / 2;

  const edges: EdgePath[] = valid.map((transition) => {
    const { a, b } = spanOf(transition);
    if (b === a + 1) {
      if (orientation === 'row') {
        const y = before + h / 2;
        const x1 = along(a) + w;
        const x2 = along(b) - 2;
        return {
          id: transition.id,
          kind: 'next',
          d: `M ${x1} ${y} L ${x2} ${y}`,
          label: { x: (x1 + x2) / 2, y: y - 8 },
          actor: transition.actor,
          from: transition.from,
          to: transition.to,
        };
      }
      const x = before + w / 2;
      const y1 = pad + a * step + h;
      const y2 = pad + b * step - 2;
      return {
        id: transition.id,
        kind: 'next',
        d: `M ${x} ${y1} L ${x} ${y2}`,
        label: { x: x + 10, y: (y1 + y2) / 2 },
        actor: transition.actor,
        from: transition.from,
        to: transition.to,
      };
    }
    const isBack = b < a;
    const level = (isBack ? below : above).laneOf.get(transition.id) ?? 0;
    // Arrows leave a little to one side of the centre and arrive on the other,
    // so a stage with arrows both ways keeps them apart.
    const shift = isBack ? 10 : -10;
    if (orientation === 'row') {
      const yEdge = isBack ? before + h : before;
      const yLane = isBack ? yEdge + (level + 1) * lane : yEdge - (level + 1) * lane;
      const x1 = centre(a) + shift;
      const x2 = centre(b) - shift;
      const yEnd = isBack ? yEdge + 2 : yEdge - 2;
      return {
        id: transition.id,
        kind: isBack ? 'back' : 'ahead',
        d: `M ${x1} ${yEdge} L ${x1} ${yLane} L ${x2} ${yLane} L ${x2} ${yEnd}`,
        label: { x: (x1 + x2) / 2, y: yLane + (isBack ? 12 : -5) },
        actor: transition.actor,
        from: transition.from,
        to: transition.to,
      };
    }
    const xEdge = isBack ? before + w : before;
    const xLane = isBack ? xEdge + (level + 1) * lane : xEdge - (level + 1) * lane;
    const y1 = centre(a) + shift;
    const y2 = centre(b) - shift;
    const xEnd = isBack ? xEdge + 2 : xEdge - 2;
    return {
      id: transition.id,
      kind: isBack ? 'back' : 'ahead',
      d: `M ${xEdge} ${y1} L ${xLane} ${y1} L ${xLane} ${y2} L ${xEnd} ${y2}`,
      label: { x: xLane + (isBack ? 4 : -4), y: (y1 + y2) / 2 },
      actor: transition.actor,
      from: transition.from,
      to: transition.to,
    };
  });

  const count = stages.length;
  if (orientation === 'row') {
    return {
      width: count === 0 ? pad * 2 : along(count - 1) + w + pad,
      height: before + h + below.count * lane + pad + (below.count > 0 ? 6 : 0),
      nodes,
      edges,
    };
  }
  return {
    width: before + w + below.count * lane + pad + (below.count > 0 ? 6 : 0),
    height: count === 0 || !first ? pad * 2 : pad + (count - 1) * step + h + pad,
    nodes,
    edges,
  };
}

const ACTOR_WORDS: Record<TransitionActor, string> = {
  agent: 'o agente leva',
  human: 'só você leva',
  both: 'o agente ou você levam',
};

const list = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1] ?? ''}`;

/** Who works a stage, in words: the role and its agents, you, or nobody (the end). */
export function whoWorks(stage: FlowStage, roles: readonly FlowRole[]): string {
  if (stage.kind === 'human') return 'você decide';
  if (stage.kind === 'done') return 'a tarefa termina';
  const role = roles.find((entry) => entry.key === stage.role);
  if (!role) return 'ninguém: falta o papel';
  if (role.agents === null) return `o papel ${role.name}`;
  if (role.agents.length === 0) return `o papel ${role.name}, ainda sem agentes`;
  if (role.agents.length === 1) return `${role.agents[0]?.name ?? ''} (${role.name})`;
  return `o primeiro livre entre ${list(role.agents.map((agent) => agent.name))} (${role.name})`;
}

/** The flow told in sentences, one per stage, from the drawing itself. */
export function flowSentences(
  stages: readonly FlowStage[],
  transitions: readonly FlowTransition[],
  roles: readonly FlowRole[],
): string[] {
  const byKey = new Map(stages.map((stage) => [stage.key, stage] as const));
  const order = new Map(stages.map((stage, position) => [stage.key, position] as const));
  return stages.map((stage, position) => {
    const head = position === 0 ? `Uma tarefa nova chega em ${stage.name}` : `Em ${stage.name}`;
    const who =
      stage.kind === 'agent'
        ? `, onde trabalha ${whoWorks(stage, roles)}`
        : stage.kind === 'human'
          ? ', onde a tarefa espera a sua decisão'
          : '';
    if (stage.kind === 'done') return `${head}, a tarefa está concluída.`;
    const exits = transitions
      .filter((transition) => transition.from === stage.key && byKey.has(transition.to))
      .map((transition) => {
        const target = byKey.get(transition.to);
        const backwards = (order.get(transition.to) ?? 0) < position;
        const actor = stage.kind === 'agent' ? transition.actor : 'human';
        return `${backwards ? 'volta para' : 'segue para'} ${target?.name ?? ''} (${ACTOR_WORDS[actor]})`;
      });
    if (exits.length === 0) return `${head}${who}. Daqui ela não tem para onde ir.`;
    return `${head}${who}. Daqui ${exits.length === 1 ? exits[0] : `${exits.slice(0, -1).join('; ')}; ou ${exits[exits.length - 1] ?? ''}`}.`;
  });
}

export interface FlowWarning {
  readonly stage: string | null;
  readonly text: string;
}

/**
 * What would make tasks stop or get lost: a stage with no way out, an agent
 * stage without a role or with a role nobody has, stages no task can reach,
 * and no way to the end.
 */
export function flowWarnings(
  stages: readonly FlowStage[],
  transitions: readonly FlowTransition[],
  roles: readonly FlowRole[],
): FlowWarning[] {
  const warnings: FlowWarning[] = [];
  const keys = new Set(stages.map((stage) => stage.key));
  const valid = transitions.filter(
    (transition) => keys.has(transition.from) && keys.has(transition.to),
  );
  for (const stage of stages) {
    if (stage.kind === 'agent') {
      const role = roles.find((entry) => entry.key === stage.role);
      if (!role) {
        warnings.push({
          stage: stage.key,
          text: `${stage.name || 'Uma etapa'} não tem papel: as tarefas param ali.`,
        });
      } else if (role.agents !== null && role.agents.length === 0) {
        warnings.push({
          stage: stage.key,
          text: `Ninguém tem o papel ${role.name}, de ${stage.name}: dê esse papel a um agente da equipe.`,
        });
      }
    }
    if (stage.kind !== 'done' && !valid.some((transition) => transition.from === stage.key)) {
      warnings.push({
        stage: stage.key,
        text: `${stage.name || 'Uma etapa'} não tem saída: uma tarefa que chega lá não anda mais.`,
      });
    }
  }
  const [start] = stages;
  if (start) {
    const reached = new Set([start.key]);
    const queue = [start.key];
    while (queue.length > 0) {
      const at = queue.shift() ?? '';
      for (const transition of valid) {
        if (transition.from === at && !reached.has(transition.to)) {
          reached.add(transition.to);
          queue.push(transition.to);
        }
      }
    }
    for (const stage of stages) {
      if (!reached.has(stage.key)) {
        warnings.push({
          stage: stage.key,
          text: `Nenhuma tarefa chega a ${stage.name || 'uma etapa'} saindo de ${start.name}.`,
        });
      }
    }
    if (
      stages.some((stage) => stage.kind === 'done') &&
      !stages.some((stage) => stage.kind === 'done' && reached.has(stage.key))
    ) {
      warnings.push({ stage: null, text: 'Não há caminho até uma etapa final.' });
    }
  }
  return warnings;
}

/** The ways out of a stage, for the simulation: next ones first, returns last. */
export function exitsOf(
  stageKey: string,
  stages: readonly FlowStage[],
  transitions: readonly FlowTransition[],
): { transition: FlowTransition; stage: FlowStage; back: boolean }[] {
  const order = new Map(stages.map((stage, position) => [stage.key, position] as const));
  const here = order.get(stageKey) ?? 0;
  return transitions
    .filter((transition) => transition.from === stageKey && order.has(transition.to))
    .flatMap((transition) => {
      const stage = stages.find((entry) => entry.key === transition.to);
      return stage ? [{ transition, stage, back: (order.get(stage.key) ?? 0) < here }] : [];
    })
    .sort(
      (x, y) =>
        Number(x.back) - Number(y.back) ||
        (order.get(x.stage.key) ?? 0) - (order.get(y.stage.key) ?? 0),
    );
}

/** A name cut to fit a card, with an ellipsis. */
export const fitName = (name: string, size: keyof typeof SIZES = 'full'): string => {
  const max = size === 'full' ? 19 : 17;
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
};
