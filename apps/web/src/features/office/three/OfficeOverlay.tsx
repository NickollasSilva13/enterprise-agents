import type { OfficeAgent, OfficeLayout, OfficeProject } from '@ea/shared';
import { useCallback } from 'react';
import { CHARACTER_HEIGHT, SEATED_HEIGHT } from '../../../components/pixel-art/character';
import { areaName } from '../art/architecture';
import type { AgentFigure, BalloonInfo, OfficeSceneState, SpriteRole } from '../OfficeScene';
import { HEIGHTS, type OfficeView } from './view';

// The SVG layer over the 3D office (Phase 24, D3): in the pixels of the
// drawing, projected with the same view as the camera. It carries what the
// canvas cannot: the room signs and balloons in HTML, the clicks on agents,
// and the marks the tests and the panel rely on (`data-sitter`,
// `data-walker`, `data-area-floor`). Positions are written to the
// `transform` attribute, never to `style` (CSP).

interface OverlayProps {
  readonly layout: OfficeLayout;
  readonly projects: readonly OfficeProject[];
  readonly agents: readonly OfficeAgent[];
  readonly figures: ReadonlyMap<string, AgentFigure>;
  readonly balloons: ReadonlyMap<string, BalloonInfo>;
  readonly view: OfficeView;
  readonly light: number;
  readonly scene: OfficeSceneState;
  readonly onAgent: (agent: OfficeAgent) => void;
  /** The agent lit in the scene (Phase 29, D3), marked for the tests. */
  readonly lit?: string | null;
}

const fmt = (value: number) => value.toFixed(1);

export function OfficeOverlay({
  layout,
  projects,
  agents,
  figures,
  balloons,
  view,
  light,
  scene,
  onAgent,
  lit = null,
}: OverlayProps) {
  /** Keeps an element of this layer at an agent's position. */
  const anchor = useCallback(
    (agentId: string, role: SpriteRole) => (element: SVGGElement | null) =>
      scene.track(
        agentId,
        role,
        element
          ? (x, y, seated) => {
              const at = view.project(x, y, seated ? HEIGHTS.seat : 0);
              element.setAttribute('transform', `translate(${fmt(at.x)} ${fmt(at.y)})`);
            }
          : null,
      ),
    [scene, view],
  );
  const tall = HEIGHTS.character * view.zoom;
  const wide = tall / 2;
  return (
    <svg
      className="office-overlay pointer-events-none absolute inset-0 size-full select-none"
      viewBox={`0 0 ${fmt(view.width)} ${fmt(view.height)}`}
      aria-hidden
    >
      <g data-surroundings={layout.surroundings} data-light={light.toFixed(2)} />
      {layout.areas.map((area) => {
        const corners = [
          view.project(area.x, area.y),
          view.project(area.x + area.width, area.y),
          view.project(area.x + area.width, area.y + area.height),
          view.project(area.x, area.y + area.height),
        ];
        return (
          <g key={area.id} data-area-floor={area.id}>
            <polygon points={corners.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ')} fill="none" />
          </g>
        );
      })}
      <RoomSigns layout={layout} projects={projects} view={view} />
      {agents.map((agent) => {
        const figure = figures.get(agent.id);
        if (!figure) return null;
        // The box the character takes on screen: feet at the anchor, or hips when seated.
        const above = figure.seated ? (SEATED_HEIGHT / CHARACTER_HEIGHT) * tall : tall;
        const below = figure.seated ? tall - above : 0;
        return (
          <g
            key={agent.id}
            ref={anchor(agent.id, 'body')}
            data-lit={lit === agent.id ? 'true' : undefined}
            {...(figure.seated
              ? { 'data-sitter': agent.id }
              : { 'data-walker': agent.id, 'data-moving': figure.moving ? 'true' : 'false' })}
          >
            <rect
              x={fmt(-wide / 2)}
              y={fmt(-above)}
              width={fmt(wide)}
              height={fmt(above + below)}
              fill="transparent"
              className="pointer-events-auto cursor-pointer"
              onClick={() => onAgent(agent)}
            />
          </g>
        );
      })}
      {agents.map((agent) => {
        const balloon = balloons.get(agent.id);
        const figure = figures.get(agent.id);
        if (!balloon || !figure) return null;
        const above = figure.seated ? (SEATED_HEIGHT / CHARACTER_HEIGHT) * tall : tall;
        return (
          <g key={agent.id} ref={anchor(agent.id, 'balloon')}>
            <foreignObject
              x="-90"
              y={fmt(-above - 54)}
              width="180"
              height="50"
              className="overflow-visible"
            >
              <div className="flex h-full items-end justify-center">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onAgent(agent)}
                  className={`office-balloon pointer-events-auto max-w-full px-2 py-1 text-center text-xs leading-tight ${
                    balloon.tone === 'strong' ? 'font-semibold' : ''
                  }`}
                >
                  <span className="line-clamp-2">{balloon.text}</span>
                </button>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

/** The name of each room above its back wall and the words on the murals, in HTML. */
export function RoomSigns({
  layout,
  projects,
  view,
}: {
  layout: OfficeLayout;
  projects: readonly OfficeProject[];
  view: OfficeView;
}) {
  return (
    <>
      {layout.areas.map((area) => {
        const at = view.project(area.x + area.width / 2, area.y, HEIGHTS.wall + 0.15);
        return (
          <foreignObject key={area.id} x={at.x - 100} y={at.y - 28} width="200" height="28">
            <div className="flex h-full items-end justify-center">
              <span className="office-sign max-w-full truncate">{areaName(area, projects)}</span>
            </div>
          </foreignObject>
        );
      })}
      {layout.items
        .filter((item) => item.kind === 'mural' && item.label)
        .map((item) => {
          const turned = item.facing === 'e' || item.facing === 'w';
          const at = view.project(item.x + (turned ? 0.5 : 1), item.y + (turned ? 1 : 0.5), 0.7);
          return (
            <foreignObject key={item.id} x={at.x - 60} y={at.y - 14} width="120" height="28">
              <div className="flex h-full items-center justify-center">
                <span className="office-mural">{item.label}</span>
              </div>
            </foreignObject>
          );
        })}
    </>
  );
}
