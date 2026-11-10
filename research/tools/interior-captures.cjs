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
  seed1: ['seed=1', WIDE],
  seed2: ['seed=2', WIDE],
  'look-left': ['look=-1,0', WIDE],
  'look-right': ['look=1,0', WIDE],
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
    await page.goto(`http://localhost:5173/?${query || 'debug=final'}#/interior`, { waitUntil: 'domcontentloaded' });
    // the scene reports metrics after 45 frames; that is also "warm and steady"
    await page.waitForFunction(() => window.__interiorMetrics?.done, null, { timeout: 150000 }).catch(() => log.push('no metrics after 150 s'));
    await page.evaluate(() => document.querySelectorAll('header,.credit').forEach((e) => (e.style.display = 'none')));
    await page.screenshot({ path: `${out}/v-${name}.png` });
    console.log(`${name}: ${[...new Set(log)].join(' | ')}`);
    await page.close();
  }
  await browser.close();
})();
