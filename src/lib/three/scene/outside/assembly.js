// The Sarawak State Legislative Assembly building (Dewan Undangan Negeri), seen across the river.
// Built the way .claude/skills/threejs-procedural-architecture asks: settings -> a serialisable
// plan (tiers and module placements, checked) -> registered module builders working in local
// frames -> triangles per material slot. Nothing here makes triangles while deciding the building.
//
// Sourced: 114 m tall, a nine-pointed-star plan, an umbrella ("payung negara") roof
// (https://en.wikipedia.org/wiki/New_Sarawak_State_Legislative_Assembly_Building).
// Proportions read off two photos the user supplied (2026-11-11; a front view from the river and a
// raised three-quarter view), scaled by the sourced height: the arcaded body is the widest part; a
// flat white cornice on top of it carries a ring of small gold tent roofs; above it a recessed
// drum of V struts; then the main umbrella roof, nearly flat at an eave with many small points,
// steep under the spire; small gold umbrella kiosks on the lawn in front. Every size other than
// the height is an estimate from those photos.

import { createContract } from './contract.js';

export const ASSEMBLY = {
  height: 114, // sourced
  points: 9, // sourced: nine-pointed star (the body's plan)
  podium: { radius: 70, height: 6 },
  body: { tip: 62, valley: 56, height: 33, bays: 3 }, // the arcade of tall pointed arches, 6..39 m
  cornice: { radius: 66, depth: 1.6 }, // flat white slab on top of the body
  pavilion: { count: 18, size: 15, height: 9, radius: 58 }, // small gold tent roofs on the cornice
  drum: { tip: 28, valley: 25, height: 20 }, // recessed band of V struts, 39..59 m
  roof: { radius: 44, top: 100, rings: 14, points: 36, droop: 0.8, neck: 2 }, // the umbrella, eave at 59 m
  kiosks: { count: 7, gap: 11, from: 14, radius: 3.2, height: 4.5 }, // on the lawn, in front (towards +z)
  colors: { gold: [0.98, 0.62, 0.16], rib: [0.96, 0.92, 0.82], glass: [0.36, 0.27, 0.24], stone: [0.9, 0.88, 0.82] },
};

/** Tiers (bottom to top) and module placements. Pure data: no geometry. */
export function planAssembly(settings = ASSEMBLY) {
  const s = settings;
  const y1 = s.podium.height;
  const y2 = y1 + s.body.height;
  const y3 = y2 + s.drum.height;
  const tiers = [
    { name: 'podium', role: 'base', y0: 0, y1, plan: 'round', radius: s.podium.radius },
    { name: 'body', role: 'shaft', y0: y1, y1: y2, plan: 'star', tip: s.body.tip, valley: s.body.valley },
    { name: 'drum', role: 'crown', y0: y2, y1: y3, plan: 'star', tip: s.drum.tip, valley: s.drum.valley },
    { name: 'roof', role: 'roof', y0: y3, y1: s.roof.top, plan: 'round', radius: s.roof.radius },
    { name: 'spire', role: 'roof', y0: s.roof.top, y1: s.height, plan: 'round', radius: 1.6 },
  ];
  const placements = [];
  const faces = s.points * 2; // each star point has two faces
  for (let face = 0; face < faces; face++) {
    for (let bay = 0; bay < s.body.bays; bay++) placements.push({ module: 'arch-rib', tier: 'body', face, bay, bays: s.body.bays });
    placements.push({ module: 'v-strut', tier: 'drum', face });
  }
  for (let i = 0; i < s.pavilion.count; i++) placements.push({ module: 'pavilion', tier: 'body', point: i });
  for (let i = 0; i < s.kiosks.count; i++) placements.push({ module: 'kiosk', tier: 'podium', point: i });
  placements.push({ module: 'cornice', tier: 'body' }, { module: 'payung', tier: 'roof' }, { module: 'spire', tier: 'spire' }, { module: 'podium-steps', tier: 'podium' });
  // Each surface region has one owner.
  const seen = new Set();
  const duplicates = [];
  for (const p of placements) {
    const key = [p.module, p.tier, p.face ?? '', p.bay ?? '', p.point ?? ''].join(':');
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }
  return { settings: s, tiers, placements, diagnostics: { duplicateSurfaceOwners: duplicates } };
}

/** A point of the star outline at height y: vertex i of 2n (even = tip, odd = valley). */
function starPoint(n, tip, valley, i, y, twist = 0) {
  const a = (i / (n * 2)) * Math.PI * 2 + twist;
  const r = i % 2 === 0 ? tip : valley;
  return [Math.sin(a) * r, y, Math.cos(a) * r];
}

/** A bar from (a0, b0) to (a1, b1) on a face (o, u, n frame), `t` wide, standing `depth` proud of it. */
function faceBar(writer, slot, { o, u, n }, a0, b0, a1, b1, t, depth, color) {
  const at = (a, b, c) => [o[0] + u[0] * a + n[0] * c, o[1] + b, o[2] + u[2] * a + n[2] * c];
  const mid = at((a0 + a1) / 2, (b0 + b1) / 2, depth / 2);
  const len = Math.hypot(a1 - a0, b1 - b0) / 2;
  const dx = (a1 - a0) / (len * 2);
  const dy = (b1 - b0) / (len * 2);
  const along = [u[0] * dx * len, dy * len, u[2] * dx * len];
  const across = [u[0] * -dy * (t / 2), dx * (t / 2), u[2] * -dy * (t / 2)];
  writer.box(slot, mid, across, along, [(n[0] * depth) / 2, 0, (n[2] * depth) / 2], color);
}

// Module builders. Façade modules work in the frame of their face: `o` the face's bottom-left
// corner, `u` along the face, `n` out of the face (unit vectors), `w` x `h` its size.
const MODULES = {
  'arch-rib'({ writer, frame, w, h, colors }) {
    // a tall "tree" column each side, opening into a pointed arch (photos)
    const t = Math.min(0.9, w * 0.11);
    const spring = h * 0.68;
    const bar = (a0, b0, a1, b1, k = 1) => faceBar(writer, 'rib', frame, a0, b0, a1, b1, t * k, 1.2, colors.rib);
    bar(t / 2, 0, t / 2, spring);
    bar(w - t / 2, 0, w - t / 2, spring);
    bar(t / 2, spring, w / 2, h - t / 2);
    bar(w - t / 2, spring, w / 2, h - t / 2);
    bar(w / 2, 0, w / 2, spring * 0.9, 0.6); // a slimmer mullion
  },
  'v-strut'({ writer, frame, w, h, colors }) {
    // the recessed drum: struts in a V from the top corners to the middle of the bottom
    const t = 0.8;
    faceBar(writer, 'rib', frame, t / 2, h, w / 2, 0, t, 0.8, colors.rib);
    faceBar(writer, 'rib', frame, w - t / 2, h, w / 2, 0, t, 0.8, colors.rib);
  },
  pavilion({ writer, centre, size, height, colors }) {
    const [x, y, z] = centre;
    const a = Math.atan2(x, z);
    const c = Math.cos(a), s = Math.sin(a);
    const corner = (dx, dz) => [x + dx * c + dz * s, y, z - dx * s + dz * c];
    const k = size / 2;
    const base = [corner(-k, -k), corner(k, -k), corner(k, k), corner(-k, k)];
    const apex = [x, y + height, z];
    for (let i = 0; i < 4; i++) writer.tri('gold', base[i], base[(i + 1) % 4], apex, colors.gold, [0, 0], [size / 2, 0], [size / 4, height / 2]);
  },
  kiosk({ writer, centre, radius, height, colors }) {
    // a small gold umbrella on a post (photo 1)
    const [x, y, z] = centre;
    writer.box('rib', [x, y + height * 0.35, z], [0.15, 0, 0], [0, height * 0.35, 0], [0, 0, 0.15], colors.rib);
    const sides = 8;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const p = (a) => [x + Math.sin(a) * radius, y + height * 0.62, z + Math.cos(a) * radius];
      writer.tri('gold', p(a0), p(a1), [x, y + height, z], colors.gold);
    }
  },
};

/**
 * Compiles a plan into triangles per slot (gold, rib, glass, stone), in the building's own frame
 * (origin at the centre of its base; the front, towards the river, is +z). Returns a report.
 */
export function compileAssembly(plan, writer) {
  const s = plan.settings;
  const C = s.colors;
  const n = s.points;
  const usage = {};
  const use = (id) => (usage[id] = (usage[id] ?? 0) + 1);
  const before = writer.triangles();
  const tier = (name) => plan.tiers.find((t) => t.name === name);
  const own = ['cornice', 'payung', 'spire', 'podium-steps'];
  const missing = [...new Set(plan.placements.map((p) => p.module))].filter((id) => !MODULES[id] && !own.includes(id));
  if (missing.length) throw new Error(`assembly: no builder for ${missing.join(', ')}`);
  if (plan.diagnostics.duplicateSurfaceOwners.length) throw new Error(`assembly: duplicate owners ${plan.diagnostics.duplicateSurfaceOwners.join(', ')}`);

  // Mass first (closed on its own): podium, the two star prisms, their decks.
  const pod = tier('podium');
  const sides = 36;
  const p3 = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    writer.quad('stone', p3(a0, pod.radius, pod.y0), p3(a1, pod.radius, pod.y0), p3(a1, pod.radius - 3, pod.y1), p3(a0, pod.radius - 3, pod.y1), C.stone);
    writer.tri('stone', p3(a0, pod.radius - 3, pod.y1), p3(a1, pod.radius - 3, pod.y1), [0, pod.y1, 0], C.stone);
  }
  for (const name of ['body', 'drum']) {
    const t = tier(name);
    for (let i = 0; i < n * 2; i++) {
      const a = starPoint(n, t.tip, t.valley, i, t.y0), b = starPoint(n, t.tip, t.valley, i + 1, t.y0);
      const c = starPoint(n, t.tip, t.valley, i + 1, t.y1), d = starPoint(n, t.tip, t.valley, i, t.y1);
      writer.quad('glass', a, b, c, d, C.glass);
      writer.tri('stone', d, c, [0, t.y1, 0], C.stone); // deck
    }
  }
  const faceFrame = (t, face, bay = 0, bays = 1) => {
    const a = starPoint(n, t.tip, t.valley, face, t.y0), b = starPoint(n, t.tip, t.valley, face + 1, t.y0);
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const u = [(b[0] - a[0]) / len, 0, (b[2] - a[2]) / len];
    const nrm = [u[2], 0, -u[0]]; // out of the face (the outline runs clockwise seen from above)
    const w = len / bays;
    return { frame: { o: [a[0] + u[0] * w * bay, t.y0, a[2] + u[2] * w * bay], u, n: nrm }, w, h: t.y1 - t.y0 };
  };

  // Placements, each through its registered builder.
  for (const p of plan.placements) {
    use(p.module);
    if (p.module === 'arch-rib' || p.module === 'v-strut') {
      MODULES[p.module]({ writer, ...faceFrame(tier(p.tier), p.face, p.bay ?? 0, p.bays ?? 1), colors: C });
    } else if (p.module === 'pavilion') {
      const a = ((p.point + 0.5) / s.pavilion.count) * Math.PI * 2;
      MODULES.pavilion({ writer, centre: [Math.sin(a) * s.pavilion.radius, tier('body').y1 + s.cornice.depth, Math.cos(a) * s.pavilion.radius], size: s.pavilion.size, height: s.pavilion.height, colors: C });
    } else if (p.module === 'kiosk') {
      const K = s.kiosks;
      const x = (p.point - (K.count - 1) / 2) * K.gap;
      MODULES.kiosk({ writer, centre: [x, pod.y0, pod.radius + K.from], radius: K.radius * (Math.abs(x) > K.gap * 2.5 ? 1.4 : 1), height: K.height, colors: C });
    } else if (p.module === 'cornice') {
      // the flat white slab on top of the arcade (photos): a ring from the drum out past the body
      const y = tier('body').y1;
      const r0 = s.drum.valley, r1 = s.cornice.radius;
      for (let i = 0; i < sides * 2; i++) {
        const a0 = (i / (sides * 2)) * Math.PI * 2, a1 = ((i + 1) / (sides * 2)) * Math.PI * 2;
        writer.quad('stone', p3(a0, r0, y + s.cornice.depth), p3(a0, r1, y + s.cornice.depth), p3(a1, r1, y + s.cornice.depth), p3(a1, r0, y + s.cornice.depth), C.stone);
        writer.quad('stone', p3(a0, r1, y), p3(a1, r1, y), p3(a1, r1, y + s.cornice.depth), p3(a0, r1, y + s.cornice.depth), C.stone);
        writer.quad('stone', p3(a1, r1, y), p3(a0, r1, y), p3(a0, r0, y), p3(a1, r0, y), C.stone); // soffit
      }
    } else if (p.module === 'payung') {
      // The umbrella (photos): steep and narrow under the spire, flaring to an eave that is nearly
      // flat, edged with many small points that dip slightly; the valleys run up as ribs.
      const t = tier('roof');
      const R = s.roof;
      const m = R.points;
      const ring = (k) => {
        const f = k / R.rings;
        const r = R.radius * (1 - f) ** 1.25 + R.neck * f;
        const y = t.y0 + (t.y1 - t.y0) * f;
        const pts = [];
        for (let i = 0; i < m * 2; i++) {
          const a = (i / (m * 2)) * Math.PI * 2;
          const tip = i % 2 === 0;
          const rr = tip ? r : r * (0.93 + 0.07 * f);
          pts.push([Math.sin(a) * rr, y - (tip && k === 0 ? R.droop : 0), Math.cos(a) * rr]);
        }
        return pts;
      };
      let lower = ring(0);
      for (let k = 1; k <= R.rings; k++) {
        const upper = ring(k);
        for (let i = 0; i < m * 2; i++) {
          const j = (i + 1) % (m * 2);
          writer.quad('gold', lower[i], lower[j], upper[j], upper[i], C.gold, [[0, k * 1.5], [3, k * 1.5], [3, k * 1.5 + 1.5], [0, k * 1.5 + 1.5]]);
        }
        lower = upper;
      }
      // a pale band under the eave's zigzag (photos), and the underside down to the drum
      const first = ring(0);
      for (let i = 0; i < m * 2; i++) {
        const j = (i + 1) % (m * 2);
        const down = (q) => [q[0] * 0.97, q[1] - 1.4, q[2] * 0.97];
        writer.quad('stone', down(first[i]), down(first[j]), first[j], first[i], C.rib);
        writer.tri('stone', down(first[j]), down(first[i]), [0, t.y0 - 1, 0], C.stone);
      }
    } else if (p.module === 'spire') {
      const t = tier('spire');
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
        writer.tri('gold', [Math.sin(a0) * t.radius, t.y0 - 1, Math.cos(a0) * t.radius], [Math.sin(a1) * t.radius, t.y0 - 1, Math.cos(a1) * t.radius], [0, t.y1, 0], C.gold);
      }
    } else if (p.module === 'podium-steps') {
      // a lower apron in front of the podium, so the base steps down to the lawn
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
        writer.quad('stone', p3(a0, pod.radius + 6, pod.y0 - 3), p3(a1, pod.radius + 6, pod.y0 - 3), p3(a1, pod.radius, pod.y0 + 3), p3(a0, pod.radius, pod.y0 + 3), C.stone);
      }
    }
  }

  const after = writer.triangles();
  const triangles = {};
  for (const k of Object.keys(after)) triangles[k] = after[k] - (before[k] ?? 0);
  const roof = tier('roof');
  const contract = createContract('assembly');
  contract.is('height (sourced: 114 m)', plan.tiers.at(-1).y1, 114);
  contract.is('star points (sourced: 9)', s.points, 9);
  contract.is('duplicate surface owners', plan.diagnostics.duplicateSurfaceOwners.length, 0);
  contract.is('arch modules = faces x bays', usage['arch-rib'], n * 2 * s.body.bays);
  contract.is('drum strut modules = faces', usage['v-strut'], n * 2);
  // proportions read off the photos (tolerance about 10%)
  contract.range('eave height / total height (photos: 0.52)', roof.y0 / s.height, 0.47, 0.57);
  contract.range('roof eave radius / body radius (photos: 0.68)', s.roof.radius / s.body.tip, 0.61, 0.75);
  contract.range('roof rise / eave radius (photos: 0.93)', (roof.y1 - roof.y0) / s.roof.radius, 0.84, 1.02);
  contract.range('body top / total height (photos: 0.34)', tier('body').y1 / s.height, 0.31, 0.37);
  contract.max('triangles', Object.values(triangles).reduce((a, b) => a + b, 0), 8000);
  return { tiers: plan.tiers.map((t) => ({ name: t.name, role: t.role, y0: t.y0, y1: t.y1 })), moduleUsage: usage, triangles, contract: contract.assert() };
}
