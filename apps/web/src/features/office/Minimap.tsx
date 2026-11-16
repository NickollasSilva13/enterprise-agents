import type { OfficeAgent, OfficeLayout } from '@ea/shared';
import { memo, type MouseEvent, useEffect, useRef } from 'react';
import { Ground } from './art/architecture';
import type { OfficeSceneState } from './OfficeScene';
import type { Rect, Viewport } from './viewport';

const WIDTH = 176;

const MiniGround = memo(function MiniGround({ layout }: { layout: OfficeLayout }) {
  return <Ground layout={layout} />;
});

/**
 * The whole office in small, with a dot for each agent and the part the main
 * view shows. A click there moves the view. A mouse shortcut only: the same
 * is done with the zoom buttons and by dragging the scene.
 */
export function Minimap({
  layout,
  bounds,
  agents,
  scene,
  viewport,
  className = '',
}: {
  layout: OfficeLayout;
  bounds: Rect;
  agents: readonly OfficeAgent[];
  scene: OfficeSceneState;
  viewport: Viewport;
  className?: string;
}) {
  const frame = useRef<SVGRectElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const height = Math.round((WIDTH * bounds.height) / bounds.width);

  useEffect(
    () =>
      viewport.subscribe((visible) => {
        const element = frame.current;
        if (!element) return;
        element.setAttribute('x', visible.x.toFixed(1));
        element.setAttribute('y', visible.y.toFixed(1));
        element.setAttribute('width', visible.width.toFixed(1));
        element.setAttribute('height', visible.height.toFixed(1));
      }),
    [viewport],
  );

  const moveTo = (event: MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    viewport.centerOn(
      bounds.x + ((event.clientX - box.left) / box.width) * bounds.width,
      bounds.y + ((event.clientY - box.top) / box.height) * bounds.height,
    );
  };

  return (
    <div
      className={`rounded-xl border border-line-strong bg-ink/85 p-1.5 shadow-lg ${className}`}
      aria-hidden
    >
      <svg
        ref={svg}
        width={WIDTH}
        height={height}
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        className="block cursor-pointer"
        onClick={moveTo}
        data-minimap
      >
        <MiniGround layout={layout} />
        {agents.map((agent) => {
          const view = scene.view(agent.id);
          if (!view || (!view.seated && !view.standing)) return null;
          return (
            <g key={agent.id} ref={scene.sprite(agent.id, 'dot')}>
              <circle r="9" cy="-6" fill="#7c5cff" stroke="#f4f1ff" strokeWidth="3" />
            </g>
          );
        })}
        <rect ref={frame} fill="none" stroke="#f4f1ff" strokeWidth="6" rx="8" />
      </svg>
    </div>
  );
}
