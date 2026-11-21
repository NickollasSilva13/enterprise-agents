import { type Part, type Piece, placed } from '../pieces';
import {
  BUSH,
  type Ink,
  inkOf,
  LAMP_LIT,
  lamp,
  bench,
  table,
  tree,
  pick,
  STONE,
  WOOD,
  WOOD_DARK,
} from '../kit';
import {
  alongLine,
  type Bed,
  FLOWERS,
  heightAt,
  type ParkPlan,
  type Point,
  shoreDistance,
} from './plan';

// The park's volumes (Phase 33): every tree, bench, lamp and stone of the
// plan as pieces, coloured for the hour (`dusk`, 0 by day and 1 at night).
// Plain data, so the clearance of the office is tested on exactly what is
// drawn.

function bed(spot: Bed, z: number, ink: Ink): Piece[] {
  const parts: Part[] = [
    {
      dx: 0,
      dy: 0,
      dz: -0.04,
      w: spot.w,
      d: spot.d,
      h: 0.16,
      color: ink.tone('#d8cfc0'),
      shape: 'soft',
    },
    {
      dx: 0,
      dy: 0,
      dz: 0,
      w: spot.w - 0.14,
      d: spot.d - 0.14,
      h: 0.15,
      color: ink.tone('#5a3f2e'),
      shape: 'soft',
    },
  ];
  const across = Math.max(1, Math.round((spot.w - 0.3) / 0.16));
  const deep = Math.max(1, Math.round((spot.d - 0.3) / 0.16));
  spot.tones.slice(0, across * deep).forEach((tone, index) => {
    const column = index % across;
    const row = Math.floor(index / across);
    const dx = -spot.w / 2 + 0.22 + column * ((spot.w - 0.44) / Math.max(1, across - 1));
    const dy = -spot.d / 2 + 0.22 + row * ((spot.d - 0.44) / Math.max(1, deep - 1));
    parts.push(
      { dx, dy, dz: 0.13, w: 0.16, d: 0.16, h: 0.12, color: ink.tone('#3f7f3c'), shape: 'dot' },
      {
        dx,
        dy,
        dz: 0.2,
        w: 0.11,
        d: 0.11,
        h: 0.09,
        color: ink.tone(FLOWERS[tone] ?? '#ffffff'),
        shape: 'dot',
      },
    );
  });
  return placed(spot.x, spot.y, z, spot.yaw, parts);
}

function gazebo(center: Point, z: number, ink: Ink): Piece[] {
  const white = ink.tone('#f2eefb');
  const parts: Part[] = [
    {
      dx: 0,
      dy: 0,
      dz: -0.1,
      w: 3.5,
      d: 3.5,
      h: 0.2,
      color: ink.tone('#d4cde3'),
      shape: 'drum',
      sides: 8,
    },
    {
      dx: 0,
      dy: 0,
      dz: 0,
      w: 3.0,
      d: 3.0,
      h: 0.3,
      color: ink.tone('#e6e0f2'),
      shape: 'drum',
      sides: 8,
    },
    { dx: 0, dy: 0, dz: 1.8, w: 2.9, d: 2.9, h: 0.14, color: white, shape: 'drum', sides: 8 },
    { dx: 0, dy: 0, dz: 1.9, w: 3.6, d: 3.6, h: 0.08, color: white, shape: 'drum', sides: 8 },
    {
      dx: 0,
      dy: 0,
      dz: 1.95,
      w: 3.6,
      d: 3.6,
      h: 1.15,
      color: ink.tone('#6d55c9'),
      shape: 'cone',
      sides: 8,
      shade: 0.25,
    },
    { dx: 0, dy: 0, dz: 3.05, w: 0.08, d: 0.08, h: 0.3, color: ink.tone('#e8c46a'), shape: 'drum' },
    { dx: 0, dy: 0, dz: 3.3, w: 0.2, d: 0.2, h: 0.2, color: ink.tone('#e8c46a'), shape: 'ball' },
  ];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index * Math.PI) / 4 + Math.PI / 8;
    const r = 1.3;
    parts.push({
      dx: Math.cos(angle) * r,
      dy: Math.sin(angle) * r,
      dz: 0.3,
      w: 0.12,
      d: 0.12,
      h: 1.5,
      color: white,
    });
    // A low rail between the posts, but at the way in (toward the path).
    if (index === 2) continue;
    const middle = angle + Math.PI / 8;
    const rr = r * Math.cos(Math.PI / 8);
    parts.push({
      dx: Math.cos(middle) * rr,
      dy: Math.sin(middle) * rr,
      dz: 0.72,
      w: 0.06,
      d: 0.95,
      h: 0.06,
      color: white,
      yaw: -middle,
    });
    if (ink.lit)
      parts.push({
        dx: Math.cos(angle) * 1.62,
        dy: Math.sin(angle) * 1.62,
        dz: 1.86,
        w: 0.09,
        d: 0.09,
        h: 0.09,
        color: LAMP_LIT,
        shape: 'dot',
        surface: 'glow',
      });
  }
  if (ink.lit)
    parts.push({
      dx: 0,
      dy: 0,
      dz: 1.76,
      w: 2.7,
      d: 2.7,
      h: 0.04,
      color: '#e9c98c',
      shape: 'drum',
      sides: 8,
      surface: 'glow',
    });
  return placed(center.x, center.y, z, Math.PI / 2, parts);
}

function fountain(center: Point, z: number, ink: Ink): Piece[] {
  const stone = ink.tone('#ddd6c9');
  const parts: Part[] = [
    { dx: 0, dy: 0, dz: -0.05, w: 2.1, d: 2.1, h: 0.36, color: stone, shape: 'drum', sides: 8 },
    {
      dx: 0,
      dy: 0,
      dz: 0.26,
      w: 1.84,
      d: 1.84,
      h: 0.03,
      color: '#5aa6c8',
      shape: 'drum',
      sides: 8,
      surface: 'gloss',
    },
    { dx: 0, dy: 0, dz: 0.25, w: 0.32, d: 0.32, h: 0.75, color: stone, shape: 'drum', sides: 8 },
    {
      dx: 0,
      dy: 0,
      dz: 0.98,
      w: 1.05,
      d: 1.05,
      h: 0.14,
      color: stone,
      shape: 'drum',
      sides: 12,
      shade: 0.4,
    },
    {
      dx: 0,
      dy: 0,
      dz: 1.1,
      w: 0.9,
      d: 0.9,
      h: 0.03,
      color: '#6cb4d4',
      shape: 'drum',
      sides: 12,
      surface: 'gloss',
    },
    { dx: 0, dy: 0, dz: 1.1, w: 0.14, d: 0.14, h: 0.32, color: stone, shape: 'drum', sides: 8 },
    { dx: 0, dy: 0, dz: 1.4, w: 0.24, d: 0.24, h: 0.22, color: stone, shape: 'ball' },
  ];
  // Light under the water's edge at night, in the purple of the office.
  if (ink.lit)
    for (let index = 0; index < 8; index += 1) {
      const angle = (index * Math.PI) / 4;
      parts.push({
        dx: Math.cos(angle) * 0.86,
        dy: Math.sin(angle) * 0.86,
        dz: 0.27,
        w: 0.12,
        d: 0.12,
        h: 0.04,
        color: '#c9a8ff',
        shape: 'dot',
        surface: 'glow',
      });
    }
  return placed(center.x, center.y, z, 0, parts);
}

/** Flagstones along a path, two or three across, each a little turned. */
function paving(plan: ParkPlan, ink: Ink): Piece[] {
  const stones: Piece[] = [];
  let n = 0;
  for (const path of plan.paths) {
    const across = Math.max(2, Math.round(path.width / 0.46));
    for (const spot of alongLine(path.line, 0.46, 0.2)) {
      // The plaza and the bridge have their own floors.
      if (Math.hypot(spot.x - plan.plaza.x, spot.y - plan.plaza.y) < plan.plaza.radius - 0.1)
        continue;
      if (shoreDistance(plan.lake, spot.x, spot.y) < 0.35) continue;
      for (let k = 0; k < across; k += 1) {
        n += 1;
        const offset = (k - (across - 1) / 2) * (path.width / across);
        const x = spot.x + Math.cos(spot.yaw) * offset;
        const y = spot.y - Math.sin(spot.yaw) * offset;
        const jitter = ((n * 7919) % 100) / 100;
        stones.push({
          x,
          y,
          z: heightAt(plan, x, y) - 0.04,
          w: path.width / across - 0.06 - jitter * 0.04,
          d: 0.4 - jitter * 0.05,
          h: 0.08,
          color: ink.tone(pick(STONE, n * 13)),
          // Plain boxes: thousands of stones, and a bevel this thin does not show.
          shape: 'box',
          yaw: spot.yaw + (jitter - 0.5) * 0.12,
        });
      }
    }
  }
  return stones;
}

/** The plaza: rings of stone round the fountain. */
function plaza(plan: ParkPlan, ink: Ink): Piece[] {
  const stones: Piece[] = [];
  const z = heightAt(plan, plan.plaza.x, plan.plaza.y);
  for (const [ring, radius] of [1.42, 1.86, 2.3].entries()) {
    const count = Math.round((Math.PI * 2 * radius) / 0.5);
    for (let index = 0; index < count; index += 1) {
      const angle = ((index + ring * 0.5) / count) * Math.PI * 2;
      stones.push({
        x: plan.plaza.x + Math.cos(angle) * radius,
        y: plan.plaza.y + Math.sin(angle) * radius,
        z: z - 0.04,
        w: 0.4,
        d: 0.44,
        h: 0.08,
        color: ink.tone(ring === 2 ? '#b9ae98' : pick(STONE, index + ring)),
        // Plain boxes: thousands of stones, and a bevel this thin does not show.
        shape: 'box',
        yaw: -angle,
      });
    }
  }
  return stones;
}

/** The arched wooden bridge over the neck of the lake, with its rails. */
function bridge(plan: ParkPlan, ink: Ink): Piece[] {
  const { from, to } = plan.bridge;
  const wood = ink.tone(WOOD);
  const dark = ink.tone(WOOD_DARK);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.round(length / 0.22);
  const base = plan.lake.level + 0.16;
  const rise = 0.45;
  const at = (t: number) => base + rise * Math.sin(Math.PI * t);
  const pieces: Piece[] = [];
  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const slope = Math.atan(((rise * Math.PI) / length) * Math.cos(Math.PI * t));
    pieces.push({
      x,
      y,
      z: at(t),
      w: 1.35,
      d: 0.2,
      h: 0.06,
      color: index % 2 ? wood : dark,
      shape: 'soft',
      tilt: slope,
    });
    if (index % 4 === 0)
      for (const side of [-0.66, 0.66])
        pieces.push({
          x: x + side,
          y,
          z: at(t) - (index === 0 || index === count ? 0.2 : 0),
          w: 0.08,
          d: 0.08,
          h: 0.58,
          color: dark,
        });
  }
  // Each rail is a run of short boards following the arch.
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const slope = Math.atan(((rise * Math.PI) / length) * Math.cos(Math.PI * t));
    for (const side of [-0.66, 0.66])
      pieces.push({
        x: x + side,
        y,
        z: at(t) + 0.5,
        w: 0.07,
        d: 0.24,
        h: 0.06,
        color: wood,
        tilt: slope,
      });
  }
  return pieces;
}

/** The deck out over the lake, on posts, with a lamp at its end. */
function deck(plan: ParkPlan, ink: Ink): Piece[] {
  const { deck: spot } = plan;
  const wood = ink.tone(WOOD);
  const dark = ink.tone(WOOD_DARK);
  const top = plan.lake.level + 0.2;
  const z = 0;
  const parts: Part[] = [];
  const count = Math.round(spot.length / 0.22);
  for (let index = 0; index <= count; index += 1)
    parts.push({
      dx: 0,
      dy: index * 0.22,
      dz: top,
      w: 1.3,
      d: 0.19,
      h: 0.06,
      color: index % 3 ? wood : dark,
      shape: 'soft',
    });
  for (const dy of [0.1, spot.length])
    for (const dx of [-0.6, 0.6])
      parts.push({
        dx,
        dy,
        dz: plan.lake.level - 0.4,
        w: 0.1,
        d: 0.1,
        h: 0.62,
        color: dark,
        shape: 'drum',
        sides: 6,
      });
  return [
    ...placed(spot.x, spot.y, z, spot.yaw, parts),
    ...lamp(
      {
        x: spot.x + Math.sin(spot.yaw) * spot.length + Math.cos(spot.yaw) * 0.55,
        y: spot.y + Math.cos(spot.yaw) * spot.length - Math.sin(spot.yaw) * 0.55,
        yaw: spot.yaw,
      },
      top + 0.06,
      ink,
    ),
  ];
}

function water(plan: ParkPlan, ink: Ink): Piece[] {
  const pieces: Piece[] = [];
  const level = plan.lake.level;
  for (const reed of plan.reeds)
    for (let index = 0; index < 6; index += 1) {
      const angle = index * 1.7;
      const h = 0.55 + (index % 3) * 0.15;
      pieces.push({
        x: reed.x + Math.cos(angle) * 0.16,
        y: reed.y + Math.sin(angle) * 0.16,
        z: level - 0.2,
        w: 0.06,
        d: 0.06,
        h,
        color: ink.tone(index % 2 ? '#7f9a45' : '#6a883c'),
        shape: 'cone',
        sides: 4,
        tilt: (index % 3) * 0.08 - 0.08,
        yaw: angle,
      });
      if (index % 3 === 0)
        pieces.push({
          x: reed.x + Math.cos(angle) * 0.16,
          y: reed.y + Math.sin(angle) * 0.16,
          z: level - 0.2 + h * 0.62,
          w: 0.06,
          d: 0.06,
          h: 0.14,
          color: ink.tone('#6b4a30'),
          shape: 'drum',
          sides: 6,
        });
    }
  for (const lily of plan.lilies) {
    pieces.push({
      x: lily.x,
      y: lily.y,
      z: level + 0.005,
      w: lily.size,
      d: lily.size,
      h: 0.02,
      color: ink.tone('#4f9a4a'),
      shape: 'drum',
      sides: 9,
    });
    if (lily.bloom)
      pieces.push({
        x: lily.x,
        y: lily.y,
        z: level + 0.02,
        w: 0.12,
        d: 0.12,
        h: 0.08,
        color: ink.tone('#ff9ec4'),
        shape: 'dot',
      });
  }
  for (const duck of plan.ducks)
    pieces.push(
      ...placed(duck.x, duck.y, level, duck.yaw, [
        {
          dx: 0,
          dy: 0,
          dz: -0.04,
          w: 0.22,
          d: 0.36,
          h: 0.18,
          color: ink.tone('#f4f2ea'),
          shape: 'ball',
        },
        {
          dx: 0,
          dy: 0.16,
          dz: 0.12,
          w: 0.14,
          d: 0.14,
          h: 0.14,
          color: ink.tone('#f4f2ea'),
          shape: 'ball',
        },
        { dx: 0, dy: 0.26, dz: 0.15, w: 0.06, d: 0.09, h: 0.03, color: ink.tone('#f0a030') },
        {
          dx: 0,
          dy: -0.17,
          dz: 0.04,
          w: 0.1,
          d: 0.1,
          h: 0.1,
          color: ink.tone('#e9e6dc'),
          shape: 'cone',
          sides: 4,
          tilt: -0.9,
        },
      ]),
    );
  return pieces;
}

/** Every volume of the park at this hour. */
export function parkPieces(plan: ParkPlan, dusk: number): Piece[] {
  const ink = inkOf(dusk);
  const ground = (x: number, y: number) => heightAt(plan, x, y);
  const pieces: Piece[] = [
    ...paving(plan, ink),
    ...plaza(plan, ink),
    ...fountain(plan.plaza, ground(plan.plaza.x, plan.plaza.y), ink),
    ...gazebo(plan.gazebo, ground(plan.gazebo.x, plan.gazebo.y), ink),
    ...bridge(plan, ink),
    ...deck(plan, ink),
    ...water(plan, ink),
  ];
  for (const each of plan.trees) pieces.push(...tree(each, ground(each.x, each.y), ink));
  for (const each of plan.benches) pieces.push(...bench(each, ground(each.x, each.y), ink));
  for (const each of plan.lamps) pieces.push(...lamp(each, ground(each.x, each.y), ink));
  for (const each of plan.tables) pieces.push(...table(each, ground(each.x, each.y), ink));
  for (const each of plan.beds) pieces.push(...bed(each, ground(each.x, each.y), ink));
  for (const [n, bush] of plan.bushes.entries()) {
    const z = ground(bush.x, bush.y) - 0.08;
    pieces.push({
      x: bush.x,
      y: bush.y,
      z,
      w: bush.size * 1.25,
      d: bush.size * 1.1,
      h: bush.size * 0.85,
      color: ink.tone(pick(BUSH, n)),
      shape: 'blob',
      surface: 'facet',
      seed: n * 97,
      shade: 0.3,
    });
    if (bush.bloom !== null)
      for (let k = 0; k < 6; k += 1) {
        const angle = k * 1.05 + n;
        pieces.push({
          x: bush.x + Math.cos(angle) * bush.size * 0.42,
          y: bush.y + Math.sin(angle) * bush.size * 0.38,
          z: z + bush.size * (0.4 + (k % 3) * 0.12),
          w: 0.1,
          d: 0.1,
          h: 0.09,
          color: ink.tone(FLOWERS[bush.bloom] ?? '#ffffff'),
          shape: 'dot',
        });
      }
  }
  for (const rock of plan.rocks) {
    const z = ground(rock.x, rock.y);
    pieces.push({
      x: rock.x,
      y: rock.y,
      z: z - rock.size * 0.18,
      w: rock.size * 1.3,
      d: rock.size,
      h: rock.size * 0.7,
      color: ink.tone(pick(['#8e8a96', '#a29fa8', '#7d7a86'], rock.seed)),
      shape: 'blob',
      surface: 'facet',
      seed: rock.seed,
      yaw: rock.seed / 100,
      shade: 0.3,
    });
  }
  for (const blossom of plan.blossoms)
    pieces.push({
      x: blossom.x,
      y: blossom.y,
      z: ground(blossom.x, blossom.y) - 0.01,
      w: 0.08,
      d: 0.08,
      h: 0.07,
      color: ink.tone(FLOWERS[blossom.tone] ?? '#ffffff'),
      shape: 'dot',
    });
  if (ink.night)
    for (const fly of plan.fireflies)
      pieces.push({
        x: fly.x,
        y: fly.y,
        z: fly.z,
        w: 0.06,
        d: 0.06,
        h: 0.06,
        color: '#eaff9e',
        shape: 'dot',
        surface: 'glow',
      });
  return pieces;
}
