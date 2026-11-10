// usage: node in.cjs <outdir> <tag> [wait]
const { chromium } = require('playwright');
(async () => {
  const [S, tag, wait = '9000'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.setDefaultTimeout(120000);
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => ['error', 'warning'].includes(m.type()) && errs.push(m.text()));
  await p.goto('http://localhost:5173/#/interior', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(+wait);
  await p.screenshot({ path: `${S}/in-${tag}.png` });
  console.log('errors', [...new Set(errs)].slice(0, 6));
  await b.close();
})();
