// The Assembly building's module builders (assembly.js): one per module id in the plan, each
// writing its triangles into the material slots.

import { OUTSIDE_THEME } from '../../themes/index.js';
import { cross } from '../../../../utils/vec3.js';
import { ASSEMBLY } from './plan.js';
import { P, offset, beam, band, annulus, foldedRoof, treeColumn, zigzag, loft, roofTipRadius } from './geometry.js';

export const MODULES = {
  'tree-column'(ctx, p) {
    const { s, C } = ctx;
    const A = s.arcade;
    treeColumn(ctx.writer, { index: p.index, count: A.columns, ring: ctx.shape.ring, brim: ctx.shape.brim, y0: s.podium.height, y1: A.top, spring: A.spring, reach: A.reach, shaft: 1.2, arm: 0.7, mullion: 0.35, color: C.white });
    // Under each point of the star the column flares like a trumpet out to the brim's point
    // (model: a solid sweep from about half height, widening as it rises).
    const per = A.columns / s.points;
    if (p.index % per !== 0) return;
    const a = (p.index / A.columns) * Math.PI * 2;
    const r0 = ctx.shape.ring(a), r1 = s.brim.tip - 2.5;
    const y0 = s.podium.height + (A.top - s.podium.height) * 0.4;
    const n = 6;
    const at = (u) => P(a, r0 + (r1 - r0) * (1 - Math.cos(u)), y0 + (A.top - y0) * Math.sin(u));
    for (let k = 0; k < n; k++) {
      const u0 = (k / n) * (Math.PI / 2), u1 = ((k + 1) / n) * (Math.PI / 2);
      beam(ctx.writer, 'rib', at(u0), at(u1), [Math.sin(a), 0, Math.cos(a)], 1.4 + 3.2 * ((k + 0.5) / n) ** 2, 1.6, C.white);
    }
  },
  pyramid(ctx, p) {
    const { s, C, writer } = ctx;
    const Y = s.pyramid;
    const a = (p.index / s.points) * Math.PI * 2; // point 0 faces the river; each sits under a roof tip
    const y = s.brim.top;
    const centre = P(a, Y.radius, y);
    const u = [Math.cos(a), 0, -Math.sin(a)]; // along the ring
    const v = [Math.sin(a), 0, Math.cos(a)]; // outwards
    const k = Y.base / 2;
    const corner = (cu, cv) => offset(centre, [u, cu * k], [v, cv * k]);
    const base = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)]; // outer edge first
    const apex = [centre[0], Y.apex, centre[2]];
    for (let i = 0; i < 4; i++) writer.tri('gold', base[i], base[(i + 1) % 4], apex, i % 2 === 0 ? C.gold : C.goldShade);
  },
  kiosk(ctx, p) {
    const { s, C, writer } = ctx;
    const K = s.kiosk;
    const k = p.scale;
    const light = { ...C, ...OUTSIDE_THEME.kiosk }; // the kiosks' own gold (themes/outside.js kioskGold; the main roof's since pass e15c)
    if (p.scale > 1) {
      // the two at the sides: small copies of the main roof on four legs, with a spire (P1, P2)
      const y = 0;
      const c = [p.x, y, p.z];
      const R = { folds: K.folds, valley: K.eave * k, rValley: K.rValley * k, rTip: K.rTip * k, tipDrop: 0.5 * k, top: K.top * k, neck: 0.35 * k, power: 1.6, fascia: 0.25 * k };
      foldedRoof(writer, c, R, light, { rings: 5 });
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const foot = [c[0] + Math.sin(a) * K.legs * k, y, c[2] + Math.cos(a) * K.legs * k];
        beam(writer, 'rib', foot, [foot[0], y + K.eave * k - 0.3, foot[2]], [Math.sin(a), 0, Math.cos(a)], 0.22 * k, 0.22 * k, C.white, true);
      }
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
        const r = 0.3 * k;
        writer.tri('gold', [c[0] + Math.sin(a0) * r, y + K.top * k - 0.2, c[2] + Math.cos(a0) * r], [c[0] + Math.sin(a1) * r, y + K.top * k - 0.2, c[2] + Math.cos(a1) * r], [c[0], y + K.spire * k, c[2]], C.bronze);
      }
      return;
    }
    // the five in front: a square, slightly concave pyramid roof on a white post that branches
    // into four arms (P2)
    const y = s.terrace.height;
    const Q = s.kioskRow;
    const corner = (i, half, h) => {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      return [p.x + Math.sin(a) * half * Math.SQRT2, y + h, p.z + Math.cos(a) * half * Math.SQRT2];
    };
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const col = i % 2 ? light.goldShade : light.gold;
      // lower skirt (shallow), then the steeper upper part: a concave profile
      writer.quad('gold', corner(i, Q.half, Q.eave), corner(j, Q.half, Q.eave), corner(j, Q.half * 0.5, Q.eave + Q.rise * 0.35), corner(i, Q.half * 0.5, Q.eave + Q.rise * 0.35), col);
      writer.tri('gold', corner(i, Q.half * 0.5, Q.eave + Q.rise * 0.35), corner(j, Q.half * 0.5, Q.eave + Q.rise * 0.35), [p.x, y + Q.eave + Q.rise, p.z], col);
    }
    const fork = [p.x, y + Q.fork, p.z];
    beam(writer, 'rib', [p.x, y, p.z], fork, [0, 0, 1], 0.4, 0.4, C.white, true);
    for (let i = 0; i < 4; i++) beam(writer, 'rib', fork, corner(i, Q.half * 0.75, Q.eave - 0.1), [0, 0, 1], 0.25, 0.25, C.white, true);
  },
  podium({ s, C, writer, shape }) {
    band(writer, 'stone', 90, shape.podium, 0, shape.podium, s.podium.height, C.stone, false, 0);
    annulus(writer, 'stone', 90, shape.infill, shape.podium, s.podium.height, C.stone);
  },
  terrace({ s, C, writer }) {
    const T = s.terrace;
    writer.box('stone', [0, T.height / 2, T.z], [T.halfX, 0, 0], [0, T.height / 2, 0], [0, 0, T.halfZ], C.stone);
  },
  infill({ s, C, writer, shape }) {
    // dark brown glass (its colour and mullions are painted: paint.js paintAssembly) with salmon
    // floor bands in the concrete's slot (photo; pass e15)
    const A = s.arcade;
    const y0 = s.podium.height;
    const step = (A.top - y0) / A.floors;
    for (let f = 0; f < A.floors; f++) {
      const yb = y0 + f * step;
      band(writer, 'glass', 90, shape.infill, yb, shape.infill, yb + step - 1, C.glassTint);
      band(writer, 'stone', 90, shape.infill, yb + step - 1, shape.infill, yb + step, C.floor);
    }
  },
  brim({ s, C, writer, shape }) {
    // the star-shaped slab (90 segments put a vertex on every point and every valley), with a
    // low lip round its edge
    const B = s.brim;
    const y0 = s.arcade.top;
    const lipIn = (a) => shape.brim(a) - 0.7;
    const k = s.edges.slab; // its top and bottom outer edges cut (pass e16b)
    const cutIn = (a) => shape.brim(a) - k;
    const yTop = B.top + B.lip;
    annulus(writer, 'stone', 90, B.inner, lipIn, B.top, C.brim);
    band(writer, 'stone', 90, cutIn, y0, shape.brim, y0 + k, C.brimEdge);
    band(writer, 'stone', 90, shape.brim, y0 + k, shape.brim, yTop - k, C.brimEdge);
    band(writer, 'stone', 90, shape.brim, yTop - k, cutIn, yTop, C.brim);
    band(writer, 'stone', 90, lipIn, B.top, lipIn, yTop, C.rim, true);
    annulus(writer, 'stone', 90, lipIn, cutIn, yTop, C.brim);
    annulus(writer, 'stone', 90, shape.infill, cutIn, y0, C.soffit, true);
  },
  bowl({ s, C, writer }) {
    // the roof's underside: a deep dark bowl from the brim out to the rim's lower edge. Its folds
    // follow the roof's, fading towards the bottom.
    const R = s.roof;
    const W = s.bowl;
    const n = W.profile.length;
    const rings = W.profile.map(([r, y], k) => {
      const f = k / n; // 0 at the bottom
      const ratio = W.valleyRatio[0] + (W.valleyRatio[1] - W.valleyRatio[0]) * f;
      return zigzag(R.folds, [r, y], [r * ratio, y + (R.valley[1] - R.tip[1]) * f]);
    });
    rings.push(ctxRim(R).fasciaBottom);
    for (let k = 0; k < rings.length - 1; k++) loft(writer, 'stone', rings[k], rings[k + 1], (i) => (i % 2 ? C.bowlShade : C.bowl));
    // The struts: from every fold tip at the bowl's foot, one strut turns a fold's width left and
    // one right as it climbs to the fascia's lower edge, so neighbours cross half way (the X
    // lattice of the photos); a rib runs straight up each tip. They follow the bowl's outline at
    // the tips, `out` in front of it.
    const T = s.struts;
    const outline = [...W.profile, [R.tip[0] + R.rim, R.tip[1] - R.fascia]]; // (radius, height) at the tips, bottom to top
    const y0 = outline[0][1], y1 = outline.at(-1)[1];
    const radius = (y) => {
      for (let k = 0; k < outline.length - 1; k++) {
        const [ra, ya] = outline[k], [rb, yb] = outline[k + 1];
        if (y <= yb) return ra + ((rb - ra) * (y - ya)) / (yb - ya || 1);
      }
      return outline.at(-1)[0];
    };
    const fold = (Math.PI * 2) / R.folds;
    const strut = (a0, turn, col) => {
      const at = (t) => {
        const y = y0 + (y1 - y0) * t;
        return { a: a0 + turn * t, p: P(a0 + turn * t, radius(y) + T.out, y) };
      };
      for (let k = 0; k < T.segments; k++) {
        const u = at(k / T.segments), v = at((k + 1) / T.segments);
        const m = (u.a + v.a) / 2;
        beam(writer, 'gold', u.p, v.p, [Math.sin(m), 0, Math.cos(m)], T.width, T.depth, col);
      }
    };
    for (let i = 0; i < R.folds; i++) {
      const a = i * fold;
      for (let j = 0; j < T.perFold; j++) strut(a, (j % 2 ? -1 : 1) * fold, j % 2 ? C.goldShade : C.gold);
      if (T.posts) strut(a, 0, C.gold);
    }
  },
  payung({ s, C, writer }) {
    const R = s.roof;
    const rim = ctxRim(R);
    // the grey rim: a ledge round the gold, then the fascia hanging from its outer edge
    loft(writer, 'stone', rim.fasciaBottom, rim.outerLow, (i) => (i % 2 ? C.rimShade : C.rim));
    loft(writer, 'stone', rim.outerLow, rim.outerIn, () => C.rim); // its top edge cut (pass e16b)
    loft(writer, 'stone', rim.outerIn, rim.inner, () => C.rim);
    // the gold folds: tips follow the measured outline, valleys sit inside them, both narrowing to
    // the neck
    const rings = [];
    for (let k = 0; k <= R.rings; k++) {
      const f = k / R.rings;
      const yt = R.tip[1] + (R.top - R.tip[1]) * f;
      const yv = R.valley[1] + (R.top - R.valley[1]) * f;
      const rt = roofTipRadius(R, yt);
      const ratio = R.valley[0] / R.tip[0] + (0.95 - R.valley[0] / R.tip[0]) * f;
      rings.push(zigzag(R.folds, [rt, yt], [rt * ratio, yv]));
    }
    for (let k = 0; k < R.rings; k++) loft(writer, 'gold', rings[k], rings[k + 1], (i) => (i % 2 ? C.goldShade : C.gold));
  },
  neck({ s, C, writer }) {
    // the folds carry on up a short gold neck, between two light bands
    const R = s.roof, N = s.neck;
    const lower = zigzag(R.folds, [R.neck, R.top], [R.neck * 0.95, R.top]);
    const upper = zigzag(R.folds, [N.r1, N.top], [N.r1 * 0.95, N.top]);
    loft(writer, 'gold', lower, upper, (i) => (i % 2 ? C.goldShade : C.gold));
    for (const [y, h] of N.bands) {
      const r = R.neck + ((N.r1 - R.neck) * (y - R.top)) / (N.top - R.top) + 0.3;
      band(writer, 'stone', R.folds * 2, r, y - h, r, y + h + 0.3, C.band);
    }
  },
  cone({ s, C, writer }) {
    // the dark ribbed cone above the gold
    const K = s.cone;
    const y0 = s.neck.top;
    const m = K.ribs * 2;
    const ring = (r, y) => Array.from({ length: m }, (_, i) => P((i / m) * Math.PI * 2, i % 2 ? r * 0.9 : r, y));
    loft(writer, 'stone', ring(K.r0, y0), ring(K.r1, K.top), (i) => (i % 2 ? C.coneShade : C.cone));
  },
  needle({ s, C, writer }) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, b = ((i + 1) / 6) * Math.PI * 2;
      writer.tri('stone', P(a, s.needle.r, s.cone.top), P(b, s.needle.r, s.cone.top), [0, s.height, 0], C.cone);
    }
  },
};

/** The rim's three zigzags: inner (where the gold starts), outer, and the fascia's lower edge. */
export function ctxRim(R) {
  const out = (rh) => [rh[0] + R.rim, rh[1]];
  const down = (rh) => [rh[0] + R.rim, rh[1] - R.fascia];
  const k = ASSEMBLY.edges.slab;
  return {
    inner: zigzag(R.folds, R.tip, R.valley),
    outer: zigzag(R.folds, out(R.tip), out(R.valley)),
    outerLow: zigzag(R.folds, [R.tip[0] + R.rim, R.tip[1] - k], [R.valley[0] + R.rim, R.valley[1] - k]),
    outerIn: zigzag(R.folds, [R.tip[0] + R.rim - k, R.tip[1]], [R.valley[0] + R.rim - k, R.valley[1]]),
    fasciaBottom: zigzag(R.folds, down(R.tip), down(R.valley)),
  };
}
