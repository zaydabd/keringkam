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
      manifest.push({ group, name, width, height, details: await findDetails(sharp, src) });

      const srcTime = fs.statSync(src).mtimeMs;
      const upToDate = SIZES.every(({ suffix }) => {
        const out = `${outBase}${suffix}.ktx2`;
        return fs.existsSync(out) && fs.statSync(out).mtimeMs >= srcTime;
      });
      if (force || !upToDate) jobs.push({ src, outBase });
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest) + '\n');
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

/**
 * Finds the most detailed square areas of an image (highest average edge strength, e.g.
 * dense embroidery), ignoring transparent parts. Returns up to `count` non-overlapping
 * areas as { u, v, size }: centre in texture coordinates (v = 0 at the bottom, as in
 * three.js) and side length as a fraction of the image's shorter side.
 */
async function findDetails(sharp, src, count = 5) {
  const { data, info } = await sharp(src)
    .resize(256, 256, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const lum = new Float32Array(w * h);
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
    alpha[i] = data[i * 4 + 3] / 255;
  }
  // Sobel edge strength.
  const edge = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const at = (dx, dy) => lum[(y + dy) * w + x + dx];
      const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
      const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
      edge[y * w + x] = Math.hypot(gx, gy);
    }
  }
  const size = 0.2; // window side, as a fraction of the shorter side
  const win = Math.max(8, Math.round(size * Math.min(w, h)));
  const step = Math.max(2, Math.round(win / 4));
  const windows = [];
  for (let y = 0; y + win <= h; y += step) {
    for (let x = 0; x + win <= w; x += step) {
      let sum = 0;
      let opaque = 0;
      for (let yy = y; yy < y + win; yy++) {
        for (let xx = x; xx < x + win; xx++) {
          sum += edge[yy * w + xx];
          opaque += alpha[yy * w + xx];
        }
      }
      if (opaque / (win * win) < 0.97) continue; // skip windows that touch the cut-out edge
      windows.push({ x: x + win / 2, y: y + win / 2, score: sum / (win * win) });
    }
  }
  windows.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of windows) {
    if (picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) > win * 1.1)) picked.push(c);
    if (picked.length === count) break;
  }
  const round = (n) => Math.round(n * 1000) / 1000;
  return picked.map((p) => ({ u: round(p.x / w), v: round(1 - p.y / h), size }));
}
