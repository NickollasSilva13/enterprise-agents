import type { Appearance } from '@ea/shared';
import { useEffect, useMemo, useState } from 'react';
import type { Framing, portraitOf } from '../features/office/three/portrait';

// The 3D pictures of the agents (the voxel figure of the office), for the
// avatars and the appearance editor. three.js loads on demand, once for the
// whole page; until it has, and on a browser without WebGL (and in the tests'
// jsdom), the hook gives null and the caller draws the 2D figure.

interface PortraitModule {
  readonly portraitOf: typeof portraitOf;
}

let loaded: PortraitModule | null = null;
let loading: Promise<PortraitModule | null> | null = null;

function load(): Promise<PortraitModule | null> {
  if (typeof navigator === 'undefined' || /jsdom/i.test(navigator.userAgent))
    return Promise.resolve(null);
  loading ??= import('../features/office/three/portrait')
    .then((module) => (loaded = module))
    .catch(() => null);
  return loading;
}

/** The picture of a look as a `data:` address, or null while it cannot be drawn. */
export function usePortrait(
  agentId: string,
  appearance: Appearance | null,
  framing: Framing = 'bust',
): string | null {
  const [ready, setReady] = useState(loaded !== null);
  useEffect(() => {
    if (ready) return;
    let live = true;
    void load().then((module) => {
      if (live && module) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);
  // Once loaded, a picture is drawn while rendering (and kept), so a new look shows with no flicker.
  const key = JSON.stringify([agentId, appearance, framing]);
  return useMemo(
    () => (ready && loaded ? loaded.portraitOf(agentId, appearance, framing) : null),
    // The key stands for the id, the look and the framing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, key],
  );
}
