// The painted landscape around the kampung interior: sky dome with cumulus, jungle canopy as
// toon-shaded blob clusters, coconut palms and banana plants by the rail (H1, H6).
// Everything here is on layer 1, so the ink outline pass skips it (it reads as a painted backdrop).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintSky, paintFrond, paintBananaLeaf } from './paint.js';

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

  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), toon({ color: '#93ad62' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.receiveShadow = true;
  group.add(ground);

  // Jungle canopy: each tree is a trunk and a cluster of blobs; all merged into two meshes.
  const blobs = [];
  const trunks = [];
  const blob = new THREE.IcosahedronGeometry(1, 2);
  const away = (minR, maxR) => {
    // anywhere around the house except behind the right-hand wall
    const a = Math.PI * (0.35 + rand() * 1.4);
    const rad = minR + rand() * (maxR - minR);
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  };
  for (let i = 0; i < 170; i++) {
    const [x, z] = away(10, 50);
    const h = 1.5 + rand() * 7;
    const crown = 1.5 + rand() * 1.9;
    const tr = new THREE.CylinderGeometry(0.18, 0.3, h, 6);
    tr.translate(x, groundY + h / 2, z);
    trunks.push(tint(tr, 1, 1, 1));
    const hue = rand();
    const base = new THREE.Color().setHSL(0.25 + hue * 0.09, 0.3 + rand() * 0.18, 0.24 + rand() * 0.12);
    const n = 6 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const g = blob.clone();
      const s = crown * (0.55 + rand() * 0.45);
      g.scale(s, s * (0.75 + rand() * 0.2), s);
      g.translate(x + (rand() - 0.5) * crown * 1.3, groundY + h + (rand() - 0.2) * crown * 0.9, z + (rand() - 0.5) * crown * 1.3);
      const c = base.clone().offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.3) * 0.08);
      blobs.push(skyLit(g, c));
    }
  }
  blob.dispose();
  const canopy = new THREE.Mesh(mergeGeometries(blobs), toon({ color: '#ffffff', vertexColors: true }));
  const trunkMesh = new THREE.Mesh(mergeGeometries(trunks), toon({ color: '#6b5a48', vertexColors: true }));
  for (const g of [...blobs, ...trunks]) g.dispose();
  group.add(canopy, trunkMesh);

  // Coconut palms (H1).
  const frondTex = paintFrond();
  const leafMat = (map) => toon({ map, alphaTest: 0.5, side: THREE.DoubleSide });
  disposables.push(frondTex);
  const fronds = [];
  const palmTrunks = [];
  const palm = (x, z, h, lean) => {
    const top = new THREE.Vector3(x + lean.x * h * 0.3, groundY + h, z + lean.y * h * 0.3);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x, groundY, z),
      new THREE.Vector3(x + lean.x * h * 0.05, groundY + h * 0.55, z + lean.y * h * 0.05),
      top,
    );
    palmTrunks.push(new THREE.TubeGeometry(curve, 10, 0.15, 6, false));
    const n = 11;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand() * 0.4;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const len = 2.6 + rand() * 1.0;
      fronds.push(leafStrip(top, dir, len, 1.5, 0.35 + rand() * 0.25, 0.9 + rand() * 0.5, 0.35, (rand() - 0.5) * 0.6));
    }
  };
  for (let i = 0; i < 16; i++) {
    const [x, z] = away(9, 30);
    palm(x, z, 7 + rand() * 6, new THREE.Vector2(rand() - 0.5, rand() - 0.5));
  }
  const palmMesh = new THREE.Mesh(mergeGeometries(fronds), leafMat(frondTex));
  const palmTrunkMesh = new THREE.Mesh(mergeGeometries(palmTrunks), toon({ color: '#8a7a64' }));
  for (const g of [...fronds, ...palmTrunks]) g.dispose();
  group.add(palmMesh, palmTrunkMesh);

  // Banana plants just outside the rail, their leaves showing over it (H1, H6).
  const bananaTex = paintBananaLeaf();
  disposables.push(bananaTex);
  const leaves = [];
  const stems = [];
  const banana = (x, z, h) => {
    const top = new THREE.Vector3(x, groundY + h, z);
    stems.push(new THREE.CylinderGeometry(0.1, 0.16, h, 6).translate(x, groundY + h / 2, z));
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
  const bananaMesh = new THREE.Mesh(mergeGeometries(leaves), leafMat(bananaTex));
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
