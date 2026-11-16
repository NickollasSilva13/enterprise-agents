import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

// Panning and zooming the office. The view is the `viewBox` attribute of the
// scene's <svg>, written directly (no inline style, no React render per move).

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewState {
  /** Centre of the view, in scene units. */
  readonly cx: number;
  readonly cy: number;
  /** Screen pixels per scene unit. */
  readonly zoom: number;
}

const MAX_ZOOM = 6;
const ZOOM_STEP = 1.3;
/** Pointer travel, in pixels, after which a press is a drag and not a click. */
const DRAG_THRESHOLD = 5;

/** The zoom that shows all of `bounds` in a box of `size`. */
export const fitZoom = (bounds: Rect, size: { width: number; height: number }): number =>
  Math.max(0.05, Math.min(size.width / bounds.width, size.height / bounds.height));

/** The rectangle of scene units a view shows in a box of `size`. */
export function visibleRect(view: ViewState, size: { width: number; height: number }): Rect {
  const width = size.width / view.zoom;
  const height = size.height / view.zoom;
  return { x: view.cx - width / 2, y: view.cy - height / 2, width, height };
}

/** Keeps the centre over the office, so it cannot be dragged away and lost. */
export function clampView(view: ViewState, bounds: Rect, minZoom: number): ViewState {
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, view.zoom));
  const cx = Math.min(bounds.x + bounds.width, Math.max(bounds.x, view.cx));
  const cy = Math.min(bounds.y + bounds.height, Math.max(bounds.y, view.cy));
  return { cx, cy, zoom };
}

export interface Viewport {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  /** Shows the whole office. */
  readonly fit: () => void;
  readonly centerOn: (x: number, y: number) => void;
  /** Whether the last press on the scene moved it (so it was not a click). */
  readonly dragged: () => boolean;
  /** Calls `listener` with the visible rectangle every time it changes. */
  readonly subscribe: (listener: (visible: Rect) => void) => () => void;
}

export function useViewport(
  container: RefObject<HTMLElement | null>,
  svg: RefObject<SVGSVGElement | null>,
  bounds: Rect | null,
  /** Whether a press may pan the view; the editor keeps presses on furniture for itself. */
  shouldPan: (event: PointerEvent) => boolean = () => true,
): Viewport {
  const allowPan = useRef(shouldPan);
  useLayoutEffect(() => {
    allowPan.current = shouldPan;
  });
  const view = useRef<ViewState>({ cx: 0, cy: 0, zoom: 1 });
  const size = useRef({ width: 800, height: 500 });
  const listeners = useRef(new Set<(visible: Rect) => void>());
  const moved = useRef(false);

  const minZoom = useCallback(
    () => (bounds ? fitZoom(bounds, size.current) * 0.6 : 0.05),
    [bounds],
  );

  const apply = useCallback(() => {
    if (!bounds) return;
    view.current = clampView(view.current, bounds, minZoom());
    const visible = visibleRect(view.current, size.current);
    svg.current?.setAttribute(
      'viewBox',
      `${visible.x.toFixed(1)} ${visible.y.toFixed(1)} ${visible.width.toFixed(1)} ${visible.height.toFixed(1)}`,
    );
    for (const listener of listeners.current) listener(visible);
  }, [bounds, minZoom, svg]);

  const fit = useCallback(() => {
    if (!bounds) return;
    view.current = {
      cx: bounds.x + bounds.width / 2,
      cy: bounds.y + bounds.height / 2,
      zoom: fitZoom(bounds, size.current),
    };
    apply();
  }, [bounds, apply]);

  const zoomBy = useCallback(
    (factor: number, around?: { x: number; y: number }) => {
      const current = view.current;
      const zoom = current.zoom * factor;
      // Zooming around a point keeps that point under the pointer.
      const focus = around ?? { x: current.cx, y: current.cy };
      view.current = {
        zoom,
        cx: focus.x + (current.cx - focus.x) / factor,
        cy: focus.y + (current.cy - focus.y) / factor,
      };
      apply();
    },
    [apply],
  );

  // A new layout, or the first one: show all of it.
  useEffect(fit, [fit]);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const wasFit =
        bounds !== null && Math.abs(view.current.zoom - fitZoom(bounds, size.current)) < 1e-6;
      size.current = { width: box.width, height: box.height };
      if (wasFit) fit();
      else apply();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [container, bounds, fit, apply]);

  // Dragging and the wheel.
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    let press: { x: number; y: number; cx: number; cy: number; id: number } | null = null;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      moved.current = false;
      if (!allowPan.current(event)) return;
      press = {
        x: event.clientX,
        y: event.clientY,
        cx: view.current.cx,
        cy: view.current.cy,
        id: event.pointerId,
      };
    };
    const move = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (!moved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!moved.current) element.setPointerCapture?.(press.id);
      moved.current = true;
      view.current = {
        ...view.current,
        cx: press.cx - dx / view.current.zoom,
        cy: press.cy - dy / view.current.zoom,
      };
      apply();
    };
    const up = (event: PointerEvent) => {
      if (press && event.pointerId === press.id) press = null;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const visible = visibleRect(view.current, size.current);
      const around = {
        x: visible.x + ((event.clientX - box.left) / Math.max(1, box.width)) * visible.width,
        y: visible.y + ((event.clientY - box.top) / Math.max(1, box.height)) * visible.height,
      };
      zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, around);
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
    };
  }, [svg, apply, zoomBy, bounds]);

  return useMemo(
    () => ({
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(1 / ZOOM_STEP),
      fit,
      centerOn: (x: number, y: number) => {
        view.current = { ...view.current, cx: x, cy: y };
        apply();
      },
      dragged: () => moved.current,
      subscribe: (listener: (visible: Rect) => void) => {
        listeners.current.add(listener);
        listener(visibleRect(view.current, size.current));
        return () => listeners.current.delete(listener);
      },
    }),
    [zoomBy, fit, apply],
  );
}
