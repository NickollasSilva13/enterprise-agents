import type { OfficeLayout } from '@ea/shared';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { Screen } from '../art/furniture';
import { Effects, Reflections } from './Effects';
import { CameraRig, Floors, Fog, Furniture, Lights, Walls } from './OfficeCanvas';
import { City, Sky, Street } from './Surroundings';
import { type OfficeView, type ViewRect, zoomedView } from './view';

// The office editor's picture in 3D (Phase 28): the same floor, walls,
// furniture, light and city as the office, without the people. The editor
// keeps its zoom and pan as the rectangle of the drawing it shows; the camera
// follows that rectangle (`zoomedView`), so the SVG layer of the editor, in
// the pixels of `base`, lies on the canvas at any zoom.

export interface EditorCanvasProps {
  readonly layout: OfficeLayout;
  /** The view of the whole office; the editor's rectangles are in its pixels. */
  readonly base: OfficeView;
  /** Calls the listener with the rectangle shown, now and on every change. */
  readonly follow: (listener: (visible: ViewRect) => void) => () => void;
  readonly light: number;
}

const NO_SCREENS: ReadonlyMap<number, Screen> = new Map();

export default function EditorCanvas({ layout, base, follow, light }: EditorCanvasProps) {
  const [visible, setVisible] = useState<ViewRect | null>(null);
  useEffect(() => follow(setVisible), [follow]);
  const view = useMemo(() => {
    // A rectangle of an older size of the drawing would stretch the picture.
    if (!visible || Math.abs(visible.width / visible.height - base.width / base.height) > 0.01)
      return base;
    return zoomedView(base, visible);
  }, [base, visible]);
  return (
    <Canvas
      orthographic
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      className="pointer-events-none absolute inset-0"
      aria-hidden
    >
      <CameraRig view={view} />
      <Sky light={light} />
      <Fog view={view} layout={layout} light={light} />
      <Reflections strength={0.22 + light * 0.08} />
      <Lights layout={layout} light={light} />
      <City layout={layout} light={light} />
      <Street layout={layout} light={light} />
      <Floors layout={layout} />
      <Furniture layout={layout} screens={NO_SCREENS} />
      <Walls layout={layout} />
      <Effects bloom={0.12 + (1 - light) * 0.5} />
    </Canvas>
  );
}
