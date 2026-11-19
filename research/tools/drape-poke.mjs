// Does the furniture poke through a cloth? Settles a fabric (interior/drape.js), builds the mesh
// the page draws (fabrics.js fabricGeometry: the grid smoothed to twice as many points) and
// samples every triangle finely (about 2 mm apart) against the visible table top (the rounded box
// buildTable draws, furniture.js). A sample inside the top is a place where the wood shows
// through the cloth: reported as the depth (mm) and the number of triangles.
// Run (from the repo root): node research/tools/drape-poke.mjs [table ...]
// Loads the modules through Vite (fabrics.js uses import.meta.glob), so no browser is needed.
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { PLAN } = await server.ssrLoadModule('/src/lib/three/scene/interior/plan.js');
  const { drape } = await server.ssrLoadModule('/src/lib/three/scene/interior/drape.js');
  const { fabricGeometry } = await server.ssrLoadModule('/src/lib/three/scene/interior/fabrics.js');
  const names = process.argv.slice(2);
  let ok = true;
  for (const place of PLAN.fabrics.filter((f) => f.on.startsWith('table') && (!names.length || names.includes(f.name)))) {
    const t = PLAN.tables[Number(place.on.split(' ')[1])];
    // The top as buildTable draws it: w x 0.035 x d, corners rounded 6 mm.
    const c = [(t.x0 + t.x1) / 2, t.h - 0.0175, (t.z0 + t.z1) / 2];
    const half = [(t.x1 - t.x0) / 2, 0.0175, (t.z1 - t.z0) / 2];
    const rr = Math.min(0.006, 0.035 / 4);
    const sdf = (x, y, z) => {
      const q = [Math.abs(x - c[0]) - (half[0] - rr), Math.abs(y - c[1]) - (half[1] - rr), Math.abs(z - c[2]) - (half[2] - rr)];
      return Math.hypot(...q.map((v) => Math.max(v, 0))) + Math.min(Math.max(...q), 0) - rr;
    };
    const r = drape(place);
    const g = fabricGeometry(r, { u0: 0, u1: 1, v0: 0, v1: 1 }, place);
    const P = g.attributes.position.array;
    const I = g.index.array;
    let worst = 0, at = null, hit = 0, lift = 0;
    for (let k = 0; k < I.length; k += 3) {
      const [a, b, e] = [I[k] * 3, I[k + 1] * 3, I[k + 2] * 3];
      const span = Math.max(Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]), Math.hypot(P[a] - P[e], P[a + 1] - P[e + 1], P[a + 2] - P[e + 2]));
      const n = Math.max(2, Math.ceil(span / 0.002));
      let inTri = false;
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n - i; j++) {
          const u = i / n, v = j / n, w = 1 - u - v;
          const x = P[a] * w + P[b] * u + P[e] * v, y = P[a + 1] * w + P[b + 1] * u + P[e + 1] * v, z = P[a + 2] * w + P[b + 2] * u + P[e + 2] * v;
          const d = sdf(x, y, z);
          if (d < 0) inTri = true;
          if (d < worst) { worst = d; at = [x, y, z]; }
          // How high the cloth stands over the top's flat face (a raised corner shows here).
          if (Math.abs(x - c[0]) < half[0] && Math.abs(z - c[2]) < half[2]) lift = Math.max(lift, y - t.h);
        }
      if (inTri) hit++;
    }
    const pass = worst > -0.0005;
    ok &&= pass;
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${place.name}: wood through the cloth by ${(-worst * 1000).toFixed(1)} mm, ${hit} of ${I.length / 3} triangles${at ? ` (worst at x ${(at[0] - c[0]).toFixed(3)}, y ${(at[1] - t.h).toFixed(3)}, z ${(at[2] - c[2]).toFixed(3)} from the top's centre)` : ''}; cloth up to ${(lift * 1000).toFixed(1)} mm over the top; ${r.steps} steps, ${r.ms.toFixed(0)} ms`);
  }
  process.exitCode = ok ? 0 : 1;
} finally {
  await server.close();
}
