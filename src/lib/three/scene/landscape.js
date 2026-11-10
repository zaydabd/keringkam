// The painted landscape around the kampung interior: sky dome with cumulus, jungle canopy as
// toon-shaded blob clusters, coconut palms and banana plants by the rail (H1, H6).
// Everything here is on layer 1, so the ink outline pass skips it (it reads as a painted backdrop).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintSky, paintFrond, paintBananaLeaf, paintLeafClump, paintBark, paintPalmTrunk } from './paint.js';
import { toonGradient } from './toon.js';

/**
 * A leaf as a strip along a curve: out along `dir` for `len`, rising then drooping, folded
 * into a shallow V along the midrib. UV x runs base to tip, y across (0..1).
 */
function leafStrip(base, dir, len, width, rise, droop, fold, twist = 0, segs = 10) {
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const positions = [];
  const uvs = [];
  const index = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = base.clone().addScaledVector(dir, len * t).addScaledVector(up, len * (rise * t - droop * t * t));
    const tw = twist * t;
    for (let k = 0; k < 3; k++) {
      const s = k - 1;
      const p = c
        .clone()
        .addScaledVector(side, s * (width / 2) * Math.cos(tw))
        .addScaledVector(up, -fold * Math.abs(s) * (width / 2) + s * (width / 2) * Math.sin(tw));
      positions.push(p.x, p.y, p.z);
      uvs.push(t, k / 2);
    }
    if (i < segs) {
      const a = i * 3;
      index.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function tint(g, r, gc, b) {
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([r, gc, b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Vertex colours lighter on top and darker underneath, so backlit blobs still read as round. */
function skyLit(g, c) {
  const nor = g.attributes.normal;
  const colors = new Float32Array(nor.count * 3);
  for (let i = 0; i < nor.count; i++) {
    const k = 0.62 + 0.55 * Math.max(0, nor.getY(i)) + 0.12 * nor.getX(i);
    colors.set([c.r * k, c.g * k * 1.02, c.b * k * 1.08], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function createLandscape({ gradientMap, rand, groundY }) {
  const group = new THREE.Group();
  const disposables = [];
  // Foliage gets a softer ramp: in soft afternoon light the shaded side of a tree stays green.
  const leafRamp = toonGradient([[0.6, 0.68, 0.8], [0.86, 0.86, 0.86], [1.0, 0.98, 0.92]]);
  disposables.push(leafRamp);
  const toon = (opts) => {
    const m = new THREE.MeshToonMaterial({ gradientMap, ...opts });
    disposables.push(m);
    return m;
  };

  // Sky dome.
  const skyTex = paintSky();
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 48, 24), skyMat);
  sky.rotation.y = 2.4; // put the big clouds over the jungle in view
  sky.renderOrder = -1;
  disposables.push(skyTex, skyMat);
  group.add(sky);

  // Ground. The house stands on a rise: the land falls away from about 9 m out, so from the
  // veranda you look over the nearer trees to the far canopy and the sky, as in H1.
  const gy = (x, z) => groundY - Math.min(10, 0.19 * Math.max(0, Math.hypot(x, z) - 9));
  const groundGeo = new THREE.PlaneGeometry(400, 400, 80, 80).rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, gy(gp.getX(i), gp.getZ(i)));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, toon({ color: '#93ad62' }));
  ground.receiveShadow = true;
  group.add(ground);

  // Jungle canopy. Each tree is a trunk and a cluster of blobs. Each blob is a dark core plus
  // painted leaf-clump cards scattered over its surface; the cards take the blob's sphere normal,
  // so the light falls on the clump as one soft mass while the edge breaks up into leaves.
  const blobs = [];
  const trunks = [];
  const blob = new THREE.IcosahedronGeometry(1, 2);
  const cardPos = [];
  const cardNor = [];
  const cardCol = [];
  const cardUv = [];
  const cardIdx = [];
  const d = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const p = new THREE.Vector3();
  const plane = new THREE.Vector3();
  const addCards = (centre, radius, squash, color, count) => {
    for (let k = 0; k < count; k++) {
      // a random direction, biased upward and towards the outside of the tree
      d.set(rand() * 2 - 1, rand() * 2 - 0.7, rand() * 2 - 1).normalize();
      p.set(d.x * radius, d.y * radius * squash, d.z * radius).multiplyScalar(0.82 + rand() * 0.2).add(centre);
      plane.set(d.x + (rand() - 0.5) * 0.7, d.y + (rand() - 0.5) * 0.7, d.z + (rand() - 0.5) * 0.7).normalize();
      t1.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(plane).normalize();
      t2.crossVectors(plane, t1);
      const s = radius * (0.32 + rand() * 0.16) + 0.18;
      const light = 0.78 + 0.5 * Math.max(0, d.y) + 0.12 * d.x + (rand() - 0.5) * 0.12;
      const n0 = cardPos.length / 3;
      for (const [a, b, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
        cardPos.push(p.x + (t1.x * a + t2.x * b) * s, p.y + (t1.y * a + t2.y * b) * s, p.z + (t1.z * a + t2.z * b) * s);
        cardNor.push(d.x, d.y, d.z);
        cardCol.push(color.r * light, color.g * light * 1.02, color.b * light * 1.08);
        cardUv.push(u, v);
      }
      cardIdx.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3);
    }
  };
  const away = (minR, maxR, margin = 2.5) => {
    // anywhere around the house except behind the right-hand wall, and never inside the house
    // footprint (x -5..5, z -4..4, eaves 1.3 m) plus a margin for the crown
    for (;;) {
      const a = Math.PI * (0.35 + rand() * 1.4);
      const rad = minR + rand() * (maxR - minR);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (Math.abs(x) > 6.3 + margin || Math.abs(z) > 5.3 + margin) return [x, z, rad];
    }
  };
  const centre = new THREE.Vector3();
  // trees, then undergrowth bushes close to the house (h = 0: the crown sits on the ground)
  const plants = [];
  for (let i = 0; i < 210; i++) {
    // The tree line starts well down the slope, leaving a clearing of grass, palms and bananas
    // by the house (H1). Taller trees further out.
    const r = away(24, 62, 3.5);
    const far = Math.min(1, (r[2] - 24) / 30);
    plants.push({ r, h: (0.5 + rand() * 0.7) * (3 + 4 * far), crown: 1.9 + rand() * 1.6 });
  }
  for (let i = 0; i < 70; i++) plants.push({ r: away(6.5, 22, 1.6), h: -1.3, crown: 1.1 + rand() * 1.1, bush: true });
  for (const { r: [x, z, dist], h, crown, bush } of plants) {
    const ground0 = gy(x, z);
    if (!bush) {
      // a tapering, slightly leaning trunk; pale and dark barks mixed
      const len = h + crown * 0.6;
      const tr = new THREE.CylinderGeometry(0.1 + crown * 0.02, 0.16 + crown * 0.05, len, 8, 3);
      tr.translate(0, len / 2, 0);
      tr.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3, 0, 0));
      tr.translate(x, ground0, z);
      const tone = 0.7 + rand() * 0.5;
      trunks.push(tint(tr, tone, tone * (0.96 + rand() * 0.06), tone * (0.9 + rand() * 0.1)));
    }
    const base = new THREE.Color().setHSL(0.24 + rand() * 0.1, 0.32 + rand() * 0.2, (bush ? 0.27 : 0.24) + rand() * 0.12);
    const n = bush ? 3 + Math.floor(rand() * 3) : 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const s = crown * (0.55 + rand() * 0.45);
      const squash = 0.75 + rand() * 0.2;
      centre.set(x + (rand() - 0.5) * crown * 1.4, ground0 + h + crown * 0.5 + (rand() - 0.2) * crown * 0.9, z + (rand() - 0.5) * crown * 1.4);
      const c = base.clone().offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.3) * 0.08);
      const g = blob.clone();
      g.scale(s * 0.8, s * squash * 0.8, s * 0.8);
      g.translate(centre.x, centre.y, centre.z);
      blobs.push(skyLit(g, c.clone().offsetHSL(0.03, -0.05, -0.08).multiplyScalar(0.62))); // dark interior
      // fewer cards on the far trees: they are small on screen
      addCards(centre, s, squash, c, Math.round((dist < 40 ? 14 : 10) + s * 4));
    }
  }
  blob.dispose();
  const canopy = new THREE.Mesh(mergeGeometries(blobs), toon({ color: '#ffffff', vertexColors: true, gradientMap: leafRamp }));
  const barkTex = paintBark();
  disposables.push(barkTex);
  const trunkMesh = new THREE.Mesh(mergeGeometries(trunks), toon({ color: '#d8ccb8', map: barkTex, vertexColors: true }));
  for (const g of [...blobs, ...trunks]) g.dispose();
  const cards = new THREE.BufferGeometry();
  cards.setAttribute('position', new THREE.Float32BufferAttribute(cardPos, 3));
  cards.setAttribute('normal', new THREE.Float32BufferAttribute(cardNor, 3));
  cards.setAttribute('color', new THREE.Float32BufferAttribute(cardCol, 3));
  cards.setAttribute('uv', new THREE.Float32BufferAttribute(cardUv, 2));
  cards.setIndex(cardIdx);
  const clumpTex = paintLeafClump();
  disposables.push(clumpTex);
  // Front side only: a double-sided card would flip its normal and shade backwards.
  const foliage = new THREE.Mesh(cards, toon({ color: '#ffffff', map: clumpTex, vertexColors: true, alphaTest: 0.5, gradientMap: leafRamp }));
  group.add(canopy, trunkMesh, foliage);

  // Coconut palms (H1).
  const frondTex = paintFrond();
  const leafMat = (map, color = '#ffffff') => toon({ map, color, alphaTest: 0.5, side: THREE.DoubleSide });
  disposables.push(frondTex);
  const fronds = [];
  const palmTrunks = [];
  const palm = (x, z, h, lean) => {
    const g0 = gy(x, z);
    const top = new THREE.Vector3(x + lean.x * h * 0.3, g0 + h, z + lean.y * h * 0.3);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x, g0, z),
      new THREE.Vector3(x + lean.x * h * 0.05, g0 + h * 0.55, z + lean.y * h * 0.05),
      top,
    );
    palmTrunks.push(new THREE.TubeGeometry(curve, 10, 0.13, 7, false));
    const n = 11;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand() * 0.4;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const len = 2.6 + rand() * 1.0;
      fronds.push(leafStrip(top, dir, len, 1.15, 0.35 + rand() * 0.25, 0.9 + rand() * 0.5, 0.35, (rand() - 0.5) * 0.6));
    }
  };
  for (let i = 0; i < 30; i++) {
    const [x, z] = away(8, 26, 4.5);
    // short enough that the crowns show under the eave, not above it
    palm(x, z, 3.4 + rand() * 2.4 + (-groundY + gy(x, z)) * -0.6, new THREE.Vector2(rand() - 0.5, rand() - 0.5));
  }
  const palmMesh = new THREE.Mesh(mergeGeometries(fronds), leafMat(frondTex, '#b9cfa6'));
  const palmTrunkTex = paintPalmTrunk();
  disposables.push(palmTrunkTex);
  const palmTrunkMesh = new THREE.Mesh(mergeGeometries(palmTrunks), toon({ color: '#e0d6c4', map: palmTrunkTex }));
  for (const g of [...fronds, ...palmTrunks]) g.dispose();
  group.add(palmMesh, palmTrunkMesh);

  // Banana plants just outside the rail, their leaves showing over it (H1, H6).
  const bananaTex = paintBananaLeaf();
  disposables.push(bananaTex);
  const leaves = [];
  const stems = [];
  const banana = (x, z, h) => {
    const top = new THREE.Vector3(x, gy(x, z) + h, z);
    stems.push(new THREE.CylinderGeometry(0.1, 0.16, h, 6).translate(x, gy(x, z) + h / 2, z));
    const n = 5 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      leaves.push(leafStrip(top, dir, 1.1 + rand() * 0.5, 0.46, 0.9 + rand() * 0.5, 0.9 + rand() * 0.6, 0.15, (rand() - 0.5) * 0.8, 8));
    }
  };
  const bananaSpots = [
    [-3.6, -6.6], [0.2, -7.2], [2.8, -6.4],
    [-7.0, -2.4], [-7.4, 1.2], [-8.4, -6.2], [5.4, -7.6],
  ];
  for (const [x, z] of bananaSpots) banana(x + (rand() - 0.5) * 0.6, z + (rand() - 0.5) * 0.6, 2.2 + rand() * 0.6);
  const bananaMesh = new THREE.Mesh(mergeGeometries(leaves), leafMat(bananaTex, '#c4cdb4'));
  const stemMesh = new THREE.Mesh(mergeGeometries(stems), toon({ color: '#7d9a4c' }));
  for (const g of [...leaves, ...stems]) g.dispose();
  group.add(bananaMesh, stemMesh);

  group.traverse((o) => o.layers.set(1));

  return {
    group,
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      for (const d of disposables) d.dispose();
    },
  };
}
