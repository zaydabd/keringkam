// The Sarawak State Legislative Assembly building (Dewan Undangan Negeri), seen across the river.
// Built the way .claude/skills/threejs-procedural-architecture asks: settings -> a serialisable
// plan (tiers and module placements, checked) -> registered module builders working in local
// frames -> triangles per material slot. Nothing here makes triangles while deciding the building.
//
// Sourced: 114 m tall, a nine-pointed-star plan, an umbrella ("payung negara") roof
// (https://en.wikipedia.org/wiki/New_Sarawak_State_Legislative_Assembly_Building).
// Estimated from the reference painting R3: every other size (tier heights, radii, rib spacing).

import { createContract } from './contract.js';

export const ASSEMBLY = {
  height: 114, // sourced
  points: 9, // sourced: nine-pointed star
  podium: { radius: 58, height: 9 },
  body: { tip: 42, valley: 34, height: 37, bays: 3 }, // the screen of tall pointed ribs
  eave: { radius: 47, drop: 4 }, // gold skirt above the ribs
  pavilion: { size: 13, height: 9, radius: 41 }, // small gold roofs on the star points
  drum: { tip: 26, valley: 21, height: 9 },
  roof: { radius: 40, top: 100, rings: 14, flare: 6 }, // the umbrella
  colors: { gold: [1.0, 0.62, 0.12], rib: [0.95, 0.88, 0.72], glass: [0.3, 0.38, 0.46], stone: [0.84, 0.8, 0.68] },
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
    { name: 'roof', role: 'roof', y0: y3 - 4, y1: s.roof.top, plan: 'star', tip: s.roof.radius, valley: s.roof.radius * 0.86 },
    { name: 'spire', role: 'roof', y0: s.roof.top, y1: s.height, plan: 'round', radius: 1.6 },
  ];
  const placements = [];
  const faces = s.points * 2; // each star point has two faces
  for (const tier of ['body', 'drum']) {
    const bays = tier === 'body' ? s.body.bays : 1;
    for (let face = 0; face < faces; face++) for (let bay = 0; bay < bays; bay++) placements.push({ module: 'arch-rib', tier, face, bay, bays });
  }
  for (let i = 0; i < s.points; i++) placements.push({ module: 'pavilion', tier: 'body', point: i });
  placements.push({ module: 'eave-ring', tier: 'body' }, { module: 'payung', tier: 'roof' }, { module: 'spire', tier: 'spire' }, { module: 'podium-steps', tier: 'podium' });
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

// Module builders. Façade modules work in the frame of their face: `o` the face's bottom-left
// corner, `u` along the face, `v` up, `n` out of the face (unit vectors), `w` x `h` its size.
const MODULES = {
  'arch-rib'({ writer, o, u, n, w, h, colors }) {
    const at = (a, b, c) => [o[0] + u[0] * a + n[0] * c, o[1] + b, o[2] + u[2] * a + n[2] * c];
    const t = Math.min(0.9, w * 0.11); // rib thickness
    const depth = 1.2;
    const spring = h * 0.72; // where the pointed arch starts
    const bar = (a0, b0, a1, b1) => {
      // a box from (a0, b0) to (a1, b1) on the face, standing `depth` proud of it
      const mid = at((a0 + a1) / 2, (b0 + b1) / 2, depth / 2);
      const len = Math.hypot(a1 - a0, b1 - b0) / 2;
      const dx = (a1 - a0) / (len * 2);
      const dy = (b1 - b0) / (len * 2);
      const along = [u[0] * dx * len, dy * len, u[2] * dx * len];
      const across = [u[0] * -dy * (t / 2), dx * (t / 2), u[2] * -dy * (t / 2)];
      writer.box('rib', mid, across, along, [n[0] * depth / 2, 0, n[2] * depth / 2], colors.rib);
    };
    bar(t / 2, 0, t / 2, spring); // left rib
    bar(w - t / 2, 0, w - t / 2, spring); // right rib
    bar(t / 2, spring, w / 2, h - t / 2); // the two sides of the pointed arch
    bar(w - t / 2, spring, w / 2, h - t / 2);
    bar(w / 2, 0, w / 2, spring * 0.92); // a slimmer middle mullion
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
};

/**
 * Compiles a plan into triangles per slot (gold, rib, glass, stone), in the building's own frame
 * (origin at the centre of its base). Returns the writer's slots plus a report.
 */
export function compileAssembly(plan, writer) {
  const s = plan.settings;
  const C = s.colors;
  const n = s.points;
  const usage = {};
  const use = (id) => (usage[id] = (usage[id] ?? 0) + 1);
  const before = writer.triangles();
  const tier = (name) => plan.tiers.find((t) => t.name === name);
  const missing = [...new Set(plan.placements.map((p) => p.module))].filter((id) => !MODULES[id] && !['eave-ring', 'payung', 'spire', 'podium-steps'].includes(id));
  if (missing.length) throw new Error(`assembly: no builder for ${missing.join(', ')}`);
  if (plan.diagnostics.duplicateSurfaceOwners.length) throw new Error(`assembly: duplicate owners ${plan.diagnostics.duplicateSurfaceOwners.join(', ')}`);

  // Mass first (closed on its own): podium, the two star prisms, their decks.
  const pod = tier('podium');
  const sides = 36;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    const p = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
    writer.quad('stone', p(a0, pod.radius, pod.y0), p(a1, pod.radius, pod.y0), p(a1, pod.radius - 3, pod.y1), p(a0, pod.radius - 3, pod.y1), C.stone);
    writer.tri('stone', p(a0, pod.radius - 3, pod.y1), p(a1, pod.radius - 3, pod.y1), [0, pod.y1, 0], C.stone);
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

  // Placements, each through its registered builder.
  for (const p of plan.placements) {
    use(p.module);
    if (p.module === 'arch-rib') {
      const t = tier(p.tier);
      const a = starPoint(n, t.tip, t.valley, p.face, t.y0), b = starPoint(n, t.tip, t.valley, p.face + 1, t.y0);
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const u = [(b[0] - a[0]) / len, 0, (b[2] - a[2]) / len];
      const nrm = [u[2], 0, -u[0]]; // out of the face (the outline runs clockwise seen from above)
      const w = len / p.bays;
      MODULES['arch-rib']({ writer, o: [a[0] + u[0] * w * p.bay, t.y0, a[2] + u[2] * w * p.bay], u, n: nrm, w, h: t.y1 - t.y0, colors: C });
    } else if (p.module === 'pavilion') {
      const t = tier('body');
      const a = (p.point / n) * Math.PI * 2;
      MODULES.pavilion({ writer, centre: [Math.sin(a) * s.pavilion.radius, t.y1 - 1, Math.cos(a) * s.pavilion.radius], size: s.pavilion.size, height: s.pavilion.height, colors: C });
    } else if (p.module === 'eave-ring') {
      const t = tier('body');
      for (let i = 0; i < n * 2; i++) {
        const lo0 = starPoint(n, s.eave.radius, s.eave.radius * 0.9, i, t.y1 - s.eave.drop), lo1 = starPoint(n, s.eave.radius, s.eave.radius * 0.9, i + 1, t.y1 - s.eave.drop);
        const hi0 = starPoint(n, t.tip - 4, t.valley - 4, i, t.y1 + 1.5), hi1 = starPoint(n, t.tip - 4, t.valley - 4, i + 1, t.y1 + 1.5);
        writer.quad('gold', lo0, lo1, hi1, hi0, C.gold, [[0, 0], [4, 0], [4, 3], [0, 3]]);
      }
    } else if (p.module === 'payung') {
      // The umbrella: star-shaped rings, wide and flared at the eave, drawn in to the spire.
      const t = tier('roof');
      const R = s.roof;
      // A concave tent (R3): the radius falls evenly while the height rises as f^1.7, so the
      // roof is steep under the spire and nearly flat at the eave, where the points kick up.
      const ring = (k) => {
        const f = k / R.rings;
        const r = R.radius * (1 - f) + 1.6 * f;
        const y = t.y0 + (t.y1 - t.y0) * f ** 1.7;
        const lift = R.flare * (1 - f) ** 4; // the ribs kick up at the eave
        const pts = [];
        for (let i = 0; i < n * 2; i++) {
          const a = (i / (n * 2)) * Math.PI * 2;
          const tip = i % 2 === 0;
          const rr = tip ? r : r * (0.8 + 0.2 * f);
          pts.push([Math.sin(a) * rr, y + (tip ? lift : 0), Math.cos(a) * rr]);
        }
        return pts;
      };
      let lower = ring(0);
      for (let k = 1; k <= R.rings; k++) {
        const upper = ring(k);
        for (let i = 0; i < n * 2; i++) {
          const j = (i + 1) % (n * 2);
          writer.quad('gold', lower[i], lower[j], upper[j], upper[i], C.gold, [[0, k * 1.5], [3, k * 1.5], [3, k * 1.5 + 1.5], [0, k * 1.5 + 1.5]]);
        }
        lower = upper;
      }
      // underside, so the roof is closed when seen from below
      const first = ring(0);
      for (let i = 0; i < n * 2; i++) writer.tri('stone', first[(i + 1) % (n * 2)], first[i], [0, t.y0 + 2, 0], C.stone);
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
        const q = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
        writer.quad('stone', q(a0, pod.radius + 6, pod.y0 - 3), q(a1, pod.radius + 6, pod.y0 - 3), q(a1, pod.radius, pod.y0 + 3), q(a0, pod.radius, pod.y0 + 3), C.stone);
      }
    }
  }

  const after = writer.triangles();
  const triangles = {};
  for (const k of Object.keys(after)) triangles[k] = after[k] - (before[k] ?? 0);
  const contract = createContract('assembly');
  contract.is('height (sourced: 114 m)', plan.tiers.at(-1).y1, 114);
  contract.is('star points (sourced: 9)', s.points, 9);
  contract.is('duplicate surface owners', plan.diagnostics.duplicateSurfaceOwners.length, 0);
  contract.is('rib modules = faces x bays', usage['arch-rib'], n * 2 * (s.body.bays + 1));
  contract.range('roof rise over half-width', (tier('roof').y1 - tier('roof').y0) / s.roof.radius, 1.0, 1.8);
  contract.max('triangles', Object.values(triangles).reduce((a, b) => a + b, 0), 6000);
  return { tiers: plan.tiers.map((t) => ({ name: t.name, role: t.role, y0: t.y0, y1: t.y1 })), moduleUsage: usage, triangles, contract: contract.assert() };
}
