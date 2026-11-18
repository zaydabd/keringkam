// Performance run for #/interior: the seat shot, the move to the window, the window shot
// (src/lib/three/scene/perf.js does the measuring; this only drives a browser and prints it).
// Needs Playwright (not a project dependency) and the dev server (npm run dev) or vite preview.
//   node research/tools/perf-run.cjs [out.json] [--size=wide|phone|WxH] [--dpr=n] [--hold=s] [--theme=name]
//        [--seed=n] [--url=http://localhost:5173] [--gl=swiftshader|default] [--shot=out.png]
//        [--q=a=1&b=2] (more query parameters, e.g. --q=paint=1)
//        [--memory] estimated GPU memory: the scene's textures and the render targets, by size
// --gl=swiftshader (default) is the software renderer: it always works headless, but its frame
// times are CPU times, not a real GPU's. On a machine with a GPU, use --gl=default and compare.
// Numbers from a real device: open /?perf#/interior there; the result shows in a panel.
const { chromium } = require('playwright');
const fs = require('fs');

const SIZES = { wide: [1240, 894], phone: [437, 946] };
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), ''] : [a.slice(2, i), a.slice(i + 1)]; }));
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
const [w, h] = SIZES[args.size ?? 'wide'] ?? (args.size ?? '').split('x').map(Number);
const dpr = Number(args.dpr ?? 1);
const url = args.url ?? 'http://localhost:5173';
const query = new URLSearchParams({ perf: args.hold ?? '3', ...(args.seed ? { seed: args.seed } : {}), ...(args.theme ? { theme: args.theme } : {}), ...Object.fromEntries(new URLSearchParams(args.q ?? '')) });
const glArgs = (args.gl ?? 'swiftshader') === 'swiftshader' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];

(async () => {
  const browser = await chromium.launch({ args: glArgs });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/?${query}#/interior`, { waitUntil: 'domcontentloaded' });
  const ok = await page.waitForFunction(() => window.__perf?.done, null, { timeout: 900000, polling: 500 }).then(() => true, () => false);
  if (!ok) {
    console.error('the run did not finish (no window.__perf.done)', errors.join('\n'));
    await browser.close();
    process.exit(1);
  }
  const r = await page.evaluate(() => window.__perf);
  if ('memory' in args)
    r.gpuMemory = await page.evaluate(() => {
      const { scene, composer, outline, landscape } = window.__interior;
      // Estimates: compressed textures by their data; the rest as RGBA8 (4 B a pixel), with mips 4/3;
      // render targets by type (half float RGBA 8 B, bytes 4 B) plus a 4 B depth buffer if they have one.
      const seen = new Set();
      const list = [];
      const targets = [];
      const addTarget = (t, name) => {
        if (!t?.isWebGLRenderTarget || seen.has(t)) return;
        seen.add(t);
        seen.add(t.texture);
        if (t.depthTexture) seen.add(t.depthTexture);
        const bpp = t.texture.type === 1016 || t.texture.type === 1015 ? (t.texture.type === 1015 ? 16 : 8) : 4; // HalfFloatType, FloatType
        const bytes = t.width * t.height * (bpp + (t.depthBuffer ? 4 : 0));
        targets.push({ name, size: `${t.width}x${t.height}`, MB: +(bytes / 2 ** 20).toFixed(2) });
      };
      addTarget(composer.renderTarget1, 'composer 1');
      addTarget(composer.renderTarget2, 'composer 2');
      for (const [i, pass] of composer.passes.entries()) for (const [k, v] of Object.entries(pass)) addTarget(v, `pass ${i} ${pass.constructor.name}.${k}`);
      for (const [k, v] of Object.entries(outline)) addTarget(v, `outline.${k}`);
      for (const [k, v] of Object.entries(landscape)) addTarget(v, `landscape.${k}`);
      // Targets kept in closures (the ink's edge buffer, the river's mirror) show up as textures in
      // shader uniforms: counted from their texture's size and type.
      const addUniformTextures = (uniforms, name) => {
        for (const [k, u] of Object.entries(uniforms ?? {})) {
          const t = u?.value;
          if (!t?.isTexture || seen.has(t) || !(t.isRenderTargetTexture || t.isDepthTexture)) continue;
          seen.add(t);
          const bpp = t.isDepthTexture ? 4 : t.type === 1016 ? 8 : t.type === 1015 ? 16 : 4;
          targets.push({ name: `${name}.${k}`, size: `${t.image.width}x${t.image.height}`, MB: +((t.image.width * t.image.height * bpp) / 2 ** 20).toFixed(2) });
        }
      };
      addUniformTextures(outline.material?.uniforms, 'ink');
      scene.traverse((o) => {
        for (const m of [o.material].flat().filter(Boolean)) addUniformTextures(m.uniforms, `material ${m.name || o.name}`);
      });
      scene.traverse((o) => {
        if (o.isLight && o.shadow?.map) addTarget(o.shadow.map, `shadow ${o.name || o.type}`);
        if (o.isMesh) for (const v of Object.values(o)) addTarget(v, `mesh ${o.name}`);
      });
      scene.traverse((o) => {
        for (const m of [o.material].flat().filter(Boolean))
          for (const v of Object.values(m)) {
            if (!v?.isTexture || seen.has(v)) continue;
            seen.add(v);
            const img = v.image ?? {};
            const bytes = v.isCompressedTexture ? v.mipmaps.reduce((a, l) => a + l.data.byteLength, 0) : (img.width ?? 0) * (img.height ?? 0) * 4 * (v.generateMipmaps ? 4 / 3 : 1);
            list.push({ name: v.name || m.name || o.name, size: `${img.width}x${img.height}`, MB: +(bytes / 2 ** 20).toFixed(2), compressed: !!v.isCompressedTexture });
          }
      });
      list.sort((a, b) => b.MB - a.MB);
      targets.sort((a, b) => b.MB - a.MB);
      const sum = (l) => +l.reduce((a, x) => a + x.MB, 0).toFixed(1);
      return { texturesMB: sum(list), targetsMB: sum(targets), sceneTextures: list, targets };
    });
  if (args.shot) await page.screenshot({ path: args.shot });
  await browser.close();
  r.run = { size: [w, h], dpr, gl: args.gl ?? 'swiftshader', url: `/?${query}#/interior` };
  if (out) fs.writeFileSync(out, JSON.stringify(r, null, 1));

  const f = (s) => (s ? `${s.median}/${s.p95}/${s.max}` : 'n/a');
  console.log(`size ${w}x${h} css, dpr ${dpr}, buffer ${r.env.drawingBuffer.join('x')}, gl ${r.run.gl}`);
  console.log(`gpu ${r.env.gpu}; GPU timer ${r.env.gpuTimer ? 'yes' : 'no'}`);
  console.log(`load: build ${r.load.buildMs} ms (outside ${r.load.outsideMs} ms), first frame ${r.load.firstFrameMs} ms, page to first frame ${r.load.firstFrameAtMs} ms, to ready ${r.load.readyAtMs} ms`);
  console.log(`switch to window (meter render): cpu ${r.switch?.cpuMs} ms, gpu ${r.switch?.gpuMs ?? 'n/a'} ms`);
  console.table(
    Object.fromEntries(
      Object.entries(r.phases).map(([k, p]) => [
        k,
        { frames: p.frames, fps: p.fps, 'frame ms med/p95/max': f(p.intervalMs), 'cpu ms': f(p.cpuMs), 'gpu ms': f(p.gpuMs), '>33ms': p.over33, calls: p.calls.join('-'), triangles: p.triangles.join('-') },
      ]),
    ),
  );
  console.log('passes, median per frame (gpu ms / draw calls / triangles):');
  console.table(
    Object.fromEntries(
      ['seat', 'move', 'window'].filter((k) => r.phases[k]).map((k) => [k, Object.fromEntries(Object.entries(r.phases[k].passes).map(([s, p]) => [s, `${p.gpuMs ?? '-'} / ${p.calls} / ${p.triangles}`]))]),
    ),
  );
  console.log(`long frames: ${r.long.length}`, r.long.slice(0, 10).map((l) => `${l.phase}#${l.i} ${l.intervalMs}ms`).join(', '));
  console.log('memory', JSON.stringify(r.memory));
  if (r.gpuMemory) {
    console.log(`GPU memory, estimated: scene textures ${r.gpuMemory.texturesMB} MB, render targets ${r.gpuMemory.targetsMB} MB`);
    console.table(r.gpuMemory.sceneTextures.slice(0, 20));
    console.table(r.gpuMemory.targets);
  }
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
})();
