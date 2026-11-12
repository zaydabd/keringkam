// Validation captures for #/interior (after .claude/skills/threejs-visual-validation).
// Needs Playwright (not a project dependency) and the dev server on :5173.
//   node research/tools/interior-captures.cjs <outdir> [set]
// set = all (default) | quick (final, nopost, phone) | one view name.
// Each view is a fixed camera, seed and pointer position, so two runs give the same image.
const { chromium } = require('playwright');

const WIDE = { width: 1240, height: 894 }; // R1's aspect: the design view
const PHONE = { width: 437, height: 946 };
const VIEWS = {
  final: ['', WIDE],
  nopost: ['debug=nopost', WIDE],
  'off-ink': ['off=ink', WIDE],
  'off-pigment': ['off=pigment', WIDE],
  'off-grade': ['off=grade', WIDE],
  pigment: ['debug=paint-pigment', WIDE],
  edge: ['debug=paint-edge', WIDE],
  bleed: ['debug=paint-bleed', WIDE],
  gloss: ['debug=gloss', WIDE],
  near: ['cam=near', WIDE],
  far: ['cam=far', WIDE],
  phone: ['', PHONE],
  // ?theme=off: the clay render (the scene without its look)
  clay: ['theme=off', WIDE],
  'clay-window': ['theme=off&view=window&look=0,0', WIDE],
  'clay-phone': ['theme=off', PHONE],
  seed1: ['seed=1', WIDE],
  seed2: ['seed=2', WIDE],
  'look-left': ['look=-1,0', WIDE],
  'look-right': ['look=1,0', WIDE],
  'off-outside': ['off=outside', WIDE],
  // the window shot: standing at the middle window, looking out
  window: ['view=window&look=0,0', WIDE],
  'window-left': ['view=window&look=-1,0', WIDE],
  'window-right': ['view=window&look=1,0', WIDE],
  'window-phone': ['view=window&look=0,0', PHONE],
  'window-seed1': ['view=window&look=0,0&seed=1', WIDE],
  // the checks the architecture skill asks of a building: untextured, and outline only
  'outside-flat': ['view=window&look=0,0&debug=flat', WIDE],
  'outside-silhouette': ['view=window&look=0,0&debug=silhouette&off=ink,pigment,grade', WIDE],
  'assembly-close': ['eye=-40,25,-200&yaw=37&pitch=16&fov=40&look=0,0', WIDE],
  'assembly-close-flat': ['eye=-40,25,-200&yaw=37&pitch=16&fov=40&look=0,0&debug=flat', WIDE],
  'bridge-close': ['eye=-112,10,-58&yaw=32&pitch=13&fov=52&look=0,0', WIDE],
  // the river's wave model: its normal, its mirror strength, and what the pixel filter keeps
  'water-normal': ['view=window&look=0,0&debug=water-normal&off=ink,pigment,grade', WIDE],
  'water-fresnel': ['view=window&look=0,0&debug=water-fresnel&off=ink,pigment,grade', WIDE],
  'water-filter': ['view=window&look=0,0&debug=water-filter&off=ink,pigment,grade', WIDE],
};
const QUICK = ['final', 'nopost', 'phone'];

(async () => {
  const [out, set = 'all'] = process.argv.slice(2);
  const names = set === 'all' ? Object.keys(VIEWS) : set === 'quick' ? QUICK : set.split(',');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const name of names) {
    const [query, viewport] = VIEWS[name];
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(180000); // software rendering is slow
    const log = [];
    page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || /meter|metrics/.test(m.text())) log.push(m.text().slice(0, 600));
    });
    const clock = process.env.CLOCK ? `&t=${process.env.CLOCK}` : ''; // CLOCK=5: water stopped, for pixel diffs
    await page.goto(`http://localhost:5173/?${query || 'debug=final'}${clock}#/interior`, { waitUntil: 'domcontentloaded' });
    // the scene reports metrics after 45 frames; that is also "warm and steady"
    await page.waitForFunction(() => window.__interiorMetrics?.done, null, { timeout: 150000 }).catch(() => log.push('no metrics after 150 s'));
    await page.evaluate(() => document.querySelectorAll('header,.credit,.shot,.veil').forEach((e) => (e.style.display = 'none')));
    await page.screenshot({ path: `${out}/v-${name}.png` });
    console.log(`${name}: ${[...new Set(log)].join(' | ')}`);
    await page.close();
  }
  await browser.close();
})();
