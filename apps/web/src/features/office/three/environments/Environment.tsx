import type { OfficeLayout } from '@ea/shared';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { horizonAt, Sky } from '../Surroundings';
import { cameraDirection, type OfficeView } from '../view';
import { environmentOf } from './registry';

// The environment the layout chose (`surroundings`), from the registry: its
// sky, the haze toward the horizon and its scene. The office is drawn apart
// and never depends on it.

/** Things far behind the office fade into the horizon, as in the proposal; the office never does. */
export function Fog({
  view,
  layout,
  color,
  start,
  depth: deep,
}: {
  view: OfficeView;
  layout: OfficeLayout;
  color: string;
  start: number;
  depth: number;
}) {
  const scene = useThree((state) => state.scene);
  const [dx, dy, dz] = cameraDirection();
  const [tx, ty, tz] = view.target;
  // Distance from the camera (100 tiles out from the target) to the farthest corner of the office.
  const depth = (x: number, z: number) => 100 - ((x - tx) * dx + (0 - ty) * dy + (z - tz) * dz);
  const near = Math.max(depth(0, 0), depth(layout.width, 0), depth(0, layout.height)) + start;
  useLayoutEffect(() => {
    scene.fog = new THREE.Fog(color, near, near + deep);
    return () => {
      scene.fog = null;
    };
  }, [scene, color, near, deep]);
  return null;
}

export function Environment({
  layout,
  view,
  light,
  reduced,
}: {
  layout: OfficeLayout;
  view: OfficeView;
  light: number;
  reduced: boolean;
}) {
  const environment = environmentOf(layout.surroundings);
  const { Scene } = environment;
  return (
    <>
      <Sky light={light} palette={environment.sky} />
      <Fog
        view={view}
        layout={layout}
        color={horizonAt(light, environment.sky)}
        start={environment.fog.start}
        depth={environment.fog.depth}
      />
      <Scene layout={layout} light={light} reduced={reduced} />
    </>
  );
}
