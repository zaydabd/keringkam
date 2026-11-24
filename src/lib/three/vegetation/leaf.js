// A lobed, toothed vine leaf as real geometry (no texture, no alpha), for instancing.
// Local frame: the petiole root is at the origin, the leaf points along +Y and faces +Z.
// Length 1 from petiole root to blade tip; scale it per instance.
//
// The shape is a palmate leaf with three main lobes and two small basal lobes, drawn from the
// reference views (round lobes, fine teeth, a deep notch where the petiole joins, cupped blade,
// yellow-green veins). The lobe table is a design choice, not a measurement.

import * as THREE from 'three';

export const LEAF_SHAPE = {
  petiole: 0.2, // share of the length taken by the petiole
  // Lobes: angle from the tip direction (radians), reach, width (radians).
  lobes: [
    { angle: 0, reach: 1, width: 0.42 },
    { angle: 1.05, reach: 0.86, width: 0.4 },
    { angle: -1.05, reach: 0.86, width: 0.4 },
    { angle: 2.05, reach: 0.6, width: 0.36 },
    { angle: -2.05, reach: 0.6, width: 0.36 },
  ],
  body: 0.52, // radius between the lobes
  notch: 0.5, // half-angle of the notch at the petiole (radians)
  teeth: 18,
  toothDepth: 0.05,
  cup: 0.16, // the edge bends back
  fold: 0.12, // V fold along the midrib
  segments: 36,
};

export const LEAF_PAINT = {
  edge: new THREE.Color('#2f7d1f'),
  blade: new THREE.Color('#46a12a'),
  vein: new THREE.Color('#b5c23a'),
  petiole: new THREE.Color('#6a3a22'),
};

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Blade radius in the direction phi (0 = towards the tip), relative to the blade centre. */
export function bladeRadius(phi, shape = LEAF_SHAPE) {
  let r = shape.body;
  let vein = 0;
  for (const lobe of shape.lobes) {
    const d = wrapAngle(phi - lobe.angle) / lobe.width;
    const w = Math.exp(-d * d);
    r = Math.max(r, shape.body + (lobe.reach - shape.body) * w);
    vein = Math.max(vein, Math.exp(-d * d * 18));
  }
  // The notch where the petiole joins.
  const fromBase = Math.PI - Math.abs(wrapAngle(phi));
  const notch = THREE.MathUtils.smoothstep(fromBase, 0, shape.notch);
  r *= 0.25 + 0.75 * notch;
  // Fine teeth.
  const tooth = Math.abs(((phi / (Math.PI * 2)) * shape.teeth * 2) % 2 - 1);
  r *= 1 - shape.toothDepth * tooth * notch;
  return { r, vein };
}

export function createLeafGeometry(shape = LEAF_SHAPE, paint = LEAF_PAINT) {
  const seg = shape.segments;
  const bladeLen = 1 - shape.petiole;
  const R = bladeLen / 2; // the tip lobe reaches 1 * R from the centre
  const cy = shape.petiole + R * 0.92; // blade centre (the notch pulls the base in)

  const positions = [];
  const colors = [];
  const indices = [];
  const tmp = new THREE.Color();

  const bend = (x, y) => {
    const dx = x / R;
    const dy = (y - cy) / R;
    const d2 = dx * dx + dy * dy;
    return -shape.cup * R * d2 + shape.fold * Math.abs(x);
  };
  const push = (x, y, color) => {
    positions.push(x, y, bend(x, y));
    colors.push(color.r, color.g, color.b);
    return positions.length / 3 - 1;
  };

  // Centre, an inner ring at half radius, the toothed rim.
  const centre = push(0, cy, paint.vein);
  const inner = [];
  const rim = [];
  for (let i = 0; i < seg; i++) {
    const phi = (i / seg) * Math.PI * 2 - Math.PI; // starts at the base
    const { r, vein } = bladeRadius(phi, shape);
    const sx = Math.sin(phi);
    const sy = Math.cos(phi);
    tmp.copy(paint.blade).lerp(paint.vein, vein * 0.85);
    inner.push(push(sx * r * R * 0.5, cy + sy * r * R * 0.5, tmp));
    tmp.copy(paint.edge).lerp(paint.vein, vein * 0.25);
    rim.push(push(sx * r * R, cy + sy * r * R, tmp));
  }
  // Counter-clockwise seen from +Z, so the front faces +Z.
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    indices.push(centre, inner[j], inner[i]);
    indices.push(inner[i], inner[j], rim[i]);
    indices.push(inner[j], rim[j], rim[i]);
  }

  // Petiole: two crossed thin strips from the root to the blade base.
  const w = 0.025;
  const base = cy - R * bladeRadius(Math.PI, shape).r * 1.02;
  for (const [ax, az] of [
    [w, 0],
    [0, w],
  ]) {
    const a = positions.length / 3;
    positions.push(-ax, 0, -az, ax, 0, az, -ax * 0.6, base, -az * 0.6 + bend(0, base), ax * 0.6, base, az * 0.6 + bend(0, base));
    for (let k = 0; k < 4; k++) colors.push(paint.petiole.r, paint.petiole.g, paint.petiole.b);
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// A heart-shaped, smooth-edged leaf with a pointed tip (reference V2: glossy, no teeth, two
// rounded lobes either side of the petiole). The lobe table is a design choice.
export const HEART_LEAF_SHAPE = {
  petiole: 0.18,
  lobes: [
    { angle: 0, reach: 1, width: 0.32 },
    { angle: 1.75, reach: 0.74, width: 0.85 },
    { angle: -1.75, reach: 0.74, width: 0.85 },
  ],
  body: 0.5,
  notch: 0.3,
  teeth: 0,
  toothDepth: 0,
  cup: 0.12,
  fold: 0.18,
  segments: 24,
};

export const HEART_LEAF_PAINT = {
  edge: new THREE.Color('#1f5f1c'),
  blade: new THREE.Color('#3e8f2a'),
  vein: new THREE.Color('#8fc45a'),
  petiole: new THREE.Color('#7f9a4a'),
};

// Tree leaves. A crown carries thousands, so few segments. Both shapes are design choices (a
// generic birch and oak leaf from botany), not copied from the references.
// Birch: a small pointed oval with fine teeth.
export const BIRCH_LEAF_SHAPE = {
  petiole: 0.16,
  lobes: [{ angle: 0, reach: 1, width: 0.55 }],
  body: 0.5,
  notch: 0.35,
  teeth: 9,
  toothDepth: 0.06,
  cup: 0.14,
  fold: 0.12,
  segments: 10,
};

// Oak: an elongated blade with rounded lobes down each side.
export const OAK_LEAF_SHAPE = {
  petiole: 0.08,
  lobes: [
    { angle: 0, reach: 1, width: 0.28 },
    { angle: 0.75, reach: 0.82, width: 0.2 },
    { angle: -0.75, reach: 0.82, width: 0.2 },
    { angle: 1.45, reach: 0.74, width: 0.2 },
    { angle: -1.45, reach: 0.74, width: 0.2 },
    { angle: 2.15, reach: 0.58, width: 0.2 },
    { angle: -2.15, reach: 0.58, width: 0.2 },
  ],
  body: 0.46,
  notch: 0.45,
  teeth: 0,
  toothDepth: 0,
  cup: 0.12,
  fold: 0.1,
  segments: 16,
};

export const TUFT_LEAF_PAINT = {
  edge: new THREE.Color('#ffffff'),
  blade: new THREE.Color('#ffffff'),
  vein: new THREE.Color('#ffffff'),
  petiole: new THREE.Color('#d8d8d8'),
};
