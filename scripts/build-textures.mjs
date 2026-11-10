// Converts the source PNGs into GPU-compressed KTX2 (Basis Universal ETC1S) textures.
//
// For each PNG in src/assets/textures/fabrics/ it writes two files to
// src/assets/textures/fabrics-ktx2/<group>/:
//   <name>.preview.ktx2  long edge 512px  (loads first, ~tens of KB)
//   <name>.ktx2          long edge 2048px (full quality, swapped in after)
// plus manifest.json with each image's group and pixel size.
//
// Run: npm run textures            (skips outputs newer than their PNG)
//      npm run textures -- --force (re-encodes everything)

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(root, 'src/assets/textures/fabrics');
const OUT_DIR = path.join(root, 'src/assets/textures/fabrics-ktx2');

export const SIZES = [
  { suffix: '.preview', maxSize: 512 },
  { suffix: '', maxSize: 2048 },
];

// ---- worker: encodes one PNG into every size ----
if (process.argv[2] === '--worker') {
  const sharp = (await import('sharp')).default;
  const { encodeToKTX2 } = await import('ktx2-encoder');

  const imageDecoder = async (buf) => {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  };

  process.on('message', async ({ src, outBase }) => {
    for (const { suffix, maxSize } of SIZES) {
      // GPUs reject compressed textures whose base size is not a multiple of 4,
      // so round both sides to one. The stretch is under 1% and the plane in the
      // scene uses the original aspect ratio, which cancels it out.
      const { width, height } = await sharp(src).metadata();
      const scale = Math.min(1, maxSize / Math.max(width, height));
      const toFour = (n) => Math.max(4, Math.round((n * scale) / 4) * 4);
      const png = await sharp(src)
        .resize(toFour(width), toFour(height), { fit: 'fill' })
        .png()
        .toBuffer();
      const ktx2 = await encodeToKTX2(new Uint8Array(png), {
        isUASTC: false, // ETC1S: smallest download, transcodes on every GPU
        qualityLevel: 255,
        compressionLevel: 2,
        generateMipmap: true,
        isPerceptual: true, // colour photos are sRGB
        isSetKTX2SRGBTransferFunc: true,
        imageDecoder,
      });
      fs.writeFileSync(`${outBase}${suffix}.ktx2`, ktx2);
    }
    process.send({ done: src });
  });
} else {
  await main();
}

async function main() {
  const force = process.argv.includes('--force');
  const sharp = (await import('sharp')).default;

  const groups = fs.readdirSync(SRC_DIR).filter((g) => fs.statSync(path.join(SRC_DIR, g)).isDirectory()).sort();
  const manifest = [];
  const jobs = [];

  for (const group of groups) {
    fs.mkdirSync(path.join(OUT_DIR, group), { recursive: true });
    for (const file of fs.readdirSync(path.join(SRC_DIR, group)).filter((f) => f.endsWith('.png')).sort()) {
      const src = path.join(SRC_DIR, group, file);
      const name = file.replace(/\.png$/, '');
      const outBase = path.join(OUT_DIR, group, name);
      const { width, height } = await sharp(src).metadata();
      manifest.push({ group, name, width, height });

      const srcTime = fs.statSync(src).mtimeMs;
      const upToDate = SIZES.every(({ suffix }) => {
        const out = `${outBase}${suffix}.ktx2`;
        return fs.existsSync(out) && fs.statSync(out).mtimeMs >= srcTime;
      });
      if (force || !upToDate) jobs.push({ src, outBase });
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${manifest.length} images, ${jobs.length} to encode`);
  if (!jobs.length) return;

  const workers = Math.min(os.cpus().length, jobs.length);
  let done = 0;
  await Promise.all(
    Array.from({ length: workers }, () => new Promise((resolve, reject) => {
      // silent: the Basis encoder prints a lot to stdout
      const child = fork(fileURLToPath(import.meta.url), ['--worker'], { silent: true });
      child.stderr.pipe(process.stderr);
      const next = () => {
        const job = jobs.shift();
        if (!job) { child.kill(); return resolve(); }
        child.send(job);
      };
      child.on('message', ({ done: src }) => {
        console.log(`[${++done}] ${path.relative(root, src)}`);
        next();
      });
      child.on('exit', (code) => { if (code && jobs.length) reject(new Error(`worker exited ${code}`)); });
      next();
    })),
  );
}
