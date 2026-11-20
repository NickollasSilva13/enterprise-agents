import { useLayoutEffect, useState } from 'react';

/**
 * Whether this browser can draw the 3D office (Phase 24, D4). Without WebGL
 * (an old machine, a locked-down browser, the tests' jsdom) the SVG office of
 * Phases 14 to 23 is shown instead.
 */
export function hasWebGL(): boolean {
  if (typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The size of an element in CSS pixels, followed as it changes; null before
 * it is measured. Give `ref` to the element: it may appear after the first render.
 */
export function useElementSize(): {
  ref: (element: HTMLElement | null) => void;
  size: Size | null;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      setSize((last) =>
        last && Math.abs(last.width - width) < 0.5 && Math.abs(last.height - height) < 0.5
          ? last
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, size };
}
