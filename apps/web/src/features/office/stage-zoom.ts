import { useEffect, useState } from 'react';

// Zooming and panning the office on the home screen: the wheel zooms around the
// pointer and dragging with the mouse moves the view; scrolling back out
// shows the whole office again. The state is a frame of the whole drawing, in fractions
// of it, so the same frame drives the 3D camera (`zoomedView`) and the SVG
// fallback (`viewBox`).

/** The part of the drawing shown: its top-left corner and its size, as fractions of the whole. */
export interface Frame {
  readonly x: number;
  readonly y: number;
  /** 1 shows everything; 1/4 shows a quarter of the width and of the height. */
  readonly size: number;
}

export const WHOLE: Frame = { x: 0, y: 0, size: 1 };
export const MAX_ZOOM = 6;
export const ZOOM_STEP = 1.3;
/** Pointer travel, in pixels, after which a press is a drag and not a click. */
const DRAG_THRESHOLD = 5;

/** Keeps the frame inside the drawing, between the whole office and the closest zoom. */
export function clampFrame(frame: Frame): Frame {
  const size = Math.min(1, Math.max(1 / MAX_ZOOM, frame.size));
  const limit = 1 - size;
  return {
    size,
    x: Math.min(limit, Math.max(0, frame.x)),
    y: Math.min(limit, Math.max(0, frame.y)),
  };
}

/**
 * Zooms by `factor` (above 1 comes closer) keeping the point at `around`, a
 * fraction of the screen, where it is.
 */
export function zoomFrame(
  frame: Frame,
  factor: number,
  around: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Frame {
  const pointX = frame.x + around.x * frame.size;
  const pointY = frame.y + around.y * frame.size;
  const size = Math.min(1, Math.max(1 / MAX_ZOOM, frame.size / factor));
  return clampFrame({ size, x: pointX - around.x * size, y: pointY - around.y * size });
}

/** Moves the frame by a drag of `dx`, `dy` fractions of the screen. */
export const panFrame = (frame: Frame, dx: number, dy: number): Frame =>
  clampFrame({ ...frame, x: frame.x - dx * frame.size, y: frame.y - dy * frame.size });

/** The frame the office shows, moved by the wheel and the mouse on `stage`. */
export function useStageZoom(stage: HTMLElement | null): { frame: Frame } {
  const [frame, setFrame] = useState<Frame>(WHOLE);

  useEffect(() => {
    if (!stage) return;
    const fraction = (event: { clientX: number; clientY: number }) => {
      const box = stage.getBoundingClientRect();
      return {
        x: (event.clientX - box.left) / Math.max(1, box.width),
        y: (event.clientY - box.top) / Math.max(1, box.height),
      };
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const around = fraction(event);
      setFrame((current) => zoomFrame(current, factor, around));
    };

    // Only the mouse pans: on a touch screen a finger on the scene scrolls the page.
    let press: { x: number; y: number; id: number } | null = null;
    let dragged = false;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      press = { x: event.clientX, y: event.clientY, id: event.pointerId };
      dragged = false;
    };
    const move = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragged = true;
      const box = stage.getBoundingClientRect();
      press = { ...press, x: event.clientX, y: event.clientY };
      setFrame((current) =>
        panFrame(current, dx / Math.max(1, box.width), dy / Math.max(1, box.height)),
      );
    };
    const up = (event: PointerEvent) => {
      if (press && event.pointerId === press.id) press = null;
    };
    // A press that moved the view is not a click on whoever was under it.
    const click = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    };

    stage.addEventListener('wheel', wheel, { passive: false });
    stage.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    stage.addEventListener('click', click, true);
    return () => {
      stage.removeEventListener('wheel', wheel);
      stage.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      stage.removeEventListener('click', click, true);
    };
  }, [stage]);

  return { frame };
}
