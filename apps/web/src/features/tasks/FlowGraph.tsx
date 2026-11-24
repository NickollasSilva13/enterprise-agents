import type { TransitionActor } from '@ea/shared';
import { type KeyboardEvent, useId } from 'react';
import { TONES } from '../../lib/tone';
import type { SIZES } from './flow-graph';
import {
  type FlowRole,
  type FlowStage,
  type FlowTransition,
  fitName,
  layoutFlow,
  type Orientation,
} from './flow-graph';

// The workflow drawn (Phase 39, D5): stage cards in order, arrows to the next
// stage, arcs ahead above and returns below (dashed). In the editor a card is
// a button that selects the stage; in the template catalogue it is a picture.

const ACTOR_SHORT: Record<TransitionActor, string> = {
  agent: 'agente',
  human: 'você',
  both: 'ambos',
};

const KIND_TONE = { agent: null, human: TONES.info.ink, done: TONES.idle.ink } as const;

export function FlowGraph({
  stages,
  transitions,
  roles,
  orientation = 'row',
  size = 'full',
  selected = null,
  current = null,
  onSelect,
  label,
}: {
  stages: readonly FlowStage[];
  transitions: readonly FlowTransition[];
  roles: readonly FlowRole[];
  orientation?: Orientation;
  size?: keyof typeof SIZES;
  /** The stage being edited. */
  selected?: string | null;
  /** Where the simulated task is. */
  current?: string | null;
  onSelect?: (key: string) => void;
  /** What the picture shows, for screen readers. */
  label: string;
}) {
  const marker = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const layout = layoutFlow(stages, transitions, orientation, size);
  const compact = size === 'compact';
  const roleOf = (stage: FlowStage) => roles.find((role) => role.key === stage.role);

  const keyDown = (key: string) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(key);
    }
  };

  return (
    <svg
      role={onSelect ? 'group' : 'img'}
      aria-label={label}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      className="block max-w-none"
    >
      <defs>
        <marker
          id={`${marker}-arrow`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M2 1L8 5L2 9"
            fill="none"
            stroke="context-stroke"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      {layout.edges.map((edge) => (
        <g key={edge.id} className={edge.kind === 'back' ? TONES.wait.ink : 'text-line-strong'}>
          <path
            d={edge.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={compact ? 1.2 : 1.5}
            strokeDasharray={edge.kind === 'back' ? '5 4' : undefined}
            markerEnd={`url(#${marker}-arrow)`}
          />
          {!compact && (
            <text
              x={edge.label.x}
              y={edge.label.y}
              // Down the page, labels go beside the arrow, away from the cards.
              textAnchor={
                orientation === 'row' ? 'middle' : edge.kind === 'ahead' ? 'end' : 'start'
              }
              className="fill-dim text-xs"
            >
              {ACTOR_SHORT[edge.actor]}
            </text>
          )}
        </g>
      ))}

      {layout.nodes.map((node) => {
        const stage = stages.find((entry) => entry.key === node.key);
        if (!stage) return null;
        const role = roleOf(stage);
        const tone = KIND_TONE[stage.kind];
        const isSelected = selected === stage.key;
        const isCurrent = current === stage.key;
        const busy = role?.agents?.filter((agent) => agent.busy).length ?? 0;
        const detail =
          stage.kind === 'agent'
            ? role
              ? role.name
              : 'sem papel'
            : stage.kind === 'human'
              ? 'você decide'
              : 'fim';
        const people =
          stage.kind === 'agent' && role?.agents
            ? role.agents.length === 0
              ? 'ninguém no papel'
              : `${role.agents.length} agente${role.agents.length > 1 ? 's' : ''}${busy > 0 ? ` · ${busy} ocupado${busy > 1 ? 's' : ''}` : ''}`
            : null;
        const name = stage.name || '(sem nome)';
        return (
          <g
            key={node.key}
            {...(onSelect
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-pressed': isSelected,
                  'aria-label': `${name}: ${detail}${people ? `, ${people}` : ''}`,
                  onClick: () => onSelect(stage.key),
                  onKeyDown: keyDown(stage.key),
                  className: 'cursor-pointer outline-none [&:focus-visible>rect]:stroke-glow',
                }
              : {})}
          >
            <title>{name}</title>
            <rect
              x={node.x}
              y={node.y}
              width={node.w}
              height={node.h}
              rx={compact ? 6 : 10}
              className={`${tone ?? 'text-line'} ${stage.kind === 'agent' ? 'fill-sheet-raised' : 'fill-sheet'}`}
              stroke={isSelected ? undefined : 'currentColor'}
              strokeWidth={isSelected || isCurrent ? 2.5 : 1}
            />
            {tone && (
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx={compact ? 6 : 10}
                className={tone}
                fill="currentColor"
                fillOpacity={0.12}
                pointerEvents="none"
              />
            )}
            {(isSelected || isCurrent) && (
              <rect
                x={node.x - 3}
                y={node.y - 3}
                width={node.w + 6}
                height={node.h + 6}
                rx={compact ? 8 : 12}
                fill="none"
                className={isCurrent ? TONES.ok.ink : TONES.glow.ink}
                stroke="currentColor"
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
            <text
              x={node.x + node.w / 2}
              y={node.y + (compact ? 18 : 22)}
              textAnchor="middle"
              className={`fill-chalk font-semibold ${compact ? 'text-xs' : 'text-sm'}`}
            >
              {fitName(name, size)}
            </text>
            <text
              x={node.x + node.w / 2}
              y={node.y + (compact ? 34 : 42)}
              textAnchor="middle"
              className="fill-dim text-xs"
            >
              {fitName(detail, size)}
            </text>
            {people && !compact && (
              <text
                x={node.x + node.w / 2}
                y={node.y + 60}
                textAnchor="middle"
                className="fill-dim text-xs"
              >
                {people}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** The key to the picture: what each kind of arrow and card means. */
export function FlowLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-dim" aria-label="Legenda">
      <li className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden="true" className="text-line-strong">
          <line x1="0" y1="4" x2="22" y2="4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        segue adiante
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden="true" className={TONES.wait.ink}>
          <line
            x1="0"
            y1="4"
            x2="22"
            y2="4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        </svg>
        devolução
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`size-2.5 rounded-sm ${TONES.info.dot}`} />
        etapa sua
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`size-2.5 rounded-sm ${TONES.idle.dot}`} />
        fim
      </li>
      <li>agente / você / ambos: quem pode levar a tarefa</li>
    </ul>
  );
}
