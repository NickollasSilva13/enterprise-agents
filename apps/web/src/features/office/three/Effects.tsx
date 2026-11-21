import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// The finish of the 3D office (Phase 25), all from three.js itself, with no
// new dependency: a soft room reflected by glass and polished floors, ambient
// occlusion where things meet, and a controlled bloom that only catches what
// is brighter than white (neon, screens, lit windows, lamps).

/** A neutral room reflected by the glass and the polished surfaces. */
export function Reflections({ strength }: { strength: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, scene]);
  useLayoutEffect(() => {
    scene.environmentIntensity = strength;
  }, [scene, strength]);
  return null;
}

/** Samples per pixel of the scene's render target (WebGL 2 caps it to what the card allows). */
export const MSAA_SAMPLES = 4;

/**
 * Draws the scene through the effects instead of directly: a render, ambient
 * occlusion, bloom and the output (tone mapping and colour space). Taking the
 * frame with priority 1 stops the plain render of the library.
 */
export function Effects({ bloom }: { bloom: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const { composer, glowPass } = useMemo(() => {
    // The scene is drawn into the composer's own target, not the screen, so
    // the canvas `antialias` never reaches it and every edge came out jagged.
    // A multisampled target smooths them (MSAA, resolved before the effects
    // read it); the type is the half float the composer uses by default.
    const target = new THREE.WebGLRenderTarget(size.width, size.height, {
      type: THREE.HalfFloatType,
      samples: MSAA_SAMPLES,
    });
    const result = new EffectComposer(gl, target);
    result.addPass(new RenderPass(scene, camera));
    const occlusion = new GTAOPass(scene, camera, size.width, size.height);
    occlusion.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.2, thickness: 1, scale: 1 });
    occlusion.blendIntensity = 0.85;
    result.addPass(occlusion);
    const glowing = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.5, 0.4, 1.05);
    result.addPass(glowing);
    result.addPass(new OutputPass());
    return { composer: result, glowPass: glowing };
    // The passes follow the size below; they are built once per renderer and camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  useEffect(() => () => composer.dispose(), [composer]);
  useLayoutEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size.width, size.height]);
  useLayoutEffect(() => {
    glowPass.strength = bloom;
  }, [glowPass, bloom]);
  useFrame(() => composer.render(), 1);
  return null;
}
