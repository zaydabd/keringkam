// Screenshots of the scene from the dev server, fast even with the screen locked or the app
// hidden: it drives this PC's own Chrome (playwright-core, no browser download) with the
// browser's background slow-down switched off, on the real GPU. It waits only until the loading
// veil is gone, then saves the shot and prints how long each step took.
//   npm run shot -- [out.png] [--q=eye=0,1.2,-11&yaw=180&pitch=-6&fov=60] [--window]
//                   [--size=800x580] [--url=http://localhost:5173] [--settle=1] [--headed]
// --q      query parameters for the page (the free camera, debug=nopost, garden=off ...)
// --window press "Look out of the window" once loaded, and shoot that view
// --settle seconds to wait after the veil is gone (the veil fades for 1.2 s), default 1.5
// --console=text  print the page's console lines that contain `text` (e.g. --console=[garden])
import { chromium } from 'playwright-core';

const t0 = Date.now();
const times = [];
const mark = (step) => {
  const now = Date.now();
  times.push([step, ((now - (times.at(-1)?.[2] ?? t0)) / 1000).toFixed(1), now]);
};

const argv = process.argv.slice(2);
const args = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), ''] : [a.slice(2, i), a.slice(i + 1)]; }));
const out = argv.find((a) => !a.startsWith('--')) ?? 'shot.png';
const [width, height] = (args.size ?? '800x580').split('x').map(Number);
const url = `${args.url ?? 'http://localhost:5173'}/${args.q ? `?${args.q}` : ''}`;
const settle = Number(args.settle ?? 1.5) * 1000;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !('headed' in args),
  args: [
    // keep full speed when hidden, occluded or with the screen locked
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    // the real GPU, also headless
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--use-angle=d3d11',
  ],
});
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const logs = [];
if (args.console) page.on('console', (m) => m.text().includes(args.console) && logs.push(m.text()));
mark('start browser');

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('canvas') && !document.querySelector('.veil'), null, { timeout: 300000, polling: 250 });
mark('load scene');

if ('window' in args) {
  await page.getByRole('button', { name: 'Look out of the window' }).click();
  await page.waitForTimeout(4000); // the camera's move
  mark('move to window');
}
await page.waitForTimeout(settle);
await page.screenshot({ path: out });
mark('screenshot');

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  return gl?.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? 'no WebGL';
});
await browser.close();
for (const [step, s] of times) console.log(`${step.padEnd(16)} ${s} s`);
console.log(`${'total'.padEnd(16)} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`saved ${out} (${gpu})`);
if (logs.length) console.log(logs.join('\n'));
if (errors.length) console.log(`page errors:\n${errors.join('\n')}`);
