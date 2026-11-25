// Guards against changes nobody meant to make: the seeded random numbers, the garden layout, the
// furniture plan and the Assembly building's geometry. Run with `npm test` (Node's own test
// runner, no browser). After an intended change, update the expected value here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mulberry32, shuffled, stratified } from '../src/lib/utils/rng.js';
import { LAYOUTS, LAYERS } from '../src/lib/three/scene/house/garden/layouts.js';
import { furnitureOverlaps } from '../src/lib/three/scene/house/furniture.js';
import { planAssembly, compileAssembly } from '../src/lib/three/scene/riverside/assembly.js';

const GARDEN_SHA1 = 'af2a38fef04e955e34bb4794e36d025474014dd9'; // the bougainvillea layout's slots and beds (the hedge outside the windows, no wall climbers: the user, 2026-11-25)
const sha1 = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex');

test('seeded random numbers are unchanged', () => {
  const r = mulberry32(1);
  assert.deepEqual([r(), r(), r()], [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  // the same seed gives the same sequence
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  assert.equal(shuffled(mulberry32(3), [1, 2, 3, 4, 5]).length, 5);
  assert.equal(stratified(mulberry32(3), 8).length, 8);
});

test('the garden layout is unchanged', () => {
  const L = LAYOUTS.bougainvillea;
  assert.deepEqual(Object.keys(LAYOUTS), ['bougainvillea']);
  assert.equal(L.slots.length, 17);
  assert.equal(L.beds.length, 3);
  for (const s of L.slots) assert.ok(LAYERS[s.layer], `slot layer ${s.layer} has no LAYERS entry`);
  assert.equal(sha1({ slots: L.slots, beds: L.beds }), GARDEN_SHA1);
});

test('no furniture overlaps', () => {
  assert.deepEqual(furnitureOverlaps(), []);
});

test('the Assembly building compiles to the same triangles and passes its checks', () => {
  const h = createHash('sha1');
  const counts = {};
  const writer = new Proxy({}, {
    get: (_, k) => (k === 'triangles' ? () => ({ ...counts }) : (...args) => {
      counts[args[0]] = (counts[args[0]] ?? 0) + 1;
      h.update(String(k) + JSON.stringify(args));
    }),
  });
  const report = compileAssembly(planAssembly(), writer); // throws if a contract check fails
  assert.deepEqual(report.triangles, { rib: 3618, gold: 2480, stone: 1547, glass: 270 });
  assert.equal(h.digest('hex'), '669387783f786722a2f356af7049b93a4a48d9a0');
});
