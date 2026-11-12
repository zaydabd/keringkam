// Performance run for #/interior: the seat shot, the move to the window, the window shot
// (src/lib/three/scene/perf.js does the measuring; this only drives a browser and prints it).
// Needs Playwright (not a project dependency) and the dev server (npm run dev) or vite preview.
//   node research/tools/perf-run.cjs [out.json] [--size=wide|phone|WxH] [--dpr=n] [--hold=s]
//        [--seed=n] [--url=http://localhost:5173] [--gl=swiftshader|default] [--shot=out.png]
// --gl=swiftshader (default) is the software renderer: it always works headless, but its frame
// times are CPU times, not a real GPU's. On a machine with a GPU, use --gl=default and compare.
// Numbers from a real device: open /?perf#/interior there; the result shows in a panel.
const { chromium } = require('playwright');
const fs = require('fs');

const SIZES = { wide: [1240, 894], phone: [437, 946] };
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
const [w, h] = SIZES[args.size ?? 'wide'] ?? (args.size ?? '').split('x').map(Number);
const dpr = Number(args.dpr ?? 1);
const url = args.url ?? 'http://localhost:5173';
const query = new URLSearchParams({ perf: args.hold ?? '3', ...(args.seed ? { seed: args.seed } : {}) });
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
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
})();
