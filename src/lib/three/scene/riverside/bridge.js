// The Darul Hana Bridge: the user's own model of it (a Blender export, uploaded 2026-11-25),
// made compact by scripts/build-bridge.mjs (the posts and cables rebuilt with 6 sides; nothing
// else changed), placed in the river and painted here. It replaced the first, procedural version
// (see git history before this pass).
//
// Sourced (https://en.wikipedia.org/wiki/Darul_Hana_Bridge and https://ktas.com.my/?p=531):
// S-shaped, cable-stayed, two towers of about 48-50 m, total length 276 m or about 335 m (the
// sources disagree). The model is to scale with itself; BRIDGE.scale sets it to those sizes.
//
// The look (the user's choice, 2026-11-26, from test renders): mostly white, the viewing
// platforms' roofs in the Assembly building's gold, a hand-painted albedo whose brush strokes only
// ever lighten the paint (no dark "spray"), painted light (tops a little warm, undersides a little
// cool), pale worn edges. The outlines are the scene's own ink pass, as for everything outside.
//
// Look pass (the user asked for one, 2026-11-26): the truss and the cables get no ink of their own
// (layers.js SOFT_INK_LAYER), so the deck reads as one clean curve and the cables as fine pale
// lines; the piers are dark and wet where they meet the water, with a ring of foam round each;
// the towers a little warm on the side the sun is on and cool on the other; the platform roofs
// catch a gold shine.

import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import modelUrl from '../../../../assets/models/darul-hana-bridge.bin?url';
import { createContract } from './contract.js';
import { NO_INK_LAYER, SOFT_INK_LAYER, MIRROR_LAYER } from '../layers.js';
import { OUTSIDE_THEME } from '../themes/index.js';
import { BRIDGE, bridgePoint, bridgePiers, inRiver } from './bridgePlace.js';

export { BRIDGE, bridgePoint, bridgePiers, inRiver };

// The model's parts, in the file's order (scripts/build-bridge.mjs PARTS).
const PARTS = ['body', 'walk', 'roof', 'pier', 'tower', 'cable'];
// Inked as everything outside, or soft: no ink of their own, hiding the ink behind them.
const INKED = ['walk', 'roof', 'pier', 'tower'];
const SOFT = ['body', 'cable'];
// The foam round each pier at the water: from the pier's footprint outwards, metres, and its
// opacity there (a stylisation, judged in the window shot).
const FOAM = { rings: [[0, 0.9], [0.8, 0.6], [4.5, 0]], lift: 0.03, steps: 48 };

/** Reads the model file (see scripts/build-bridge.mjs for the layout). */
function parse(buffer) {
  const view = new DataView(buffer);
  const headLength = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headLength)));
  const [min, max] = header.bounds;
  let at = 8 + headLength;
  const parts = {};
  for (const p of header.parts) {
    const q = new Uint16Array(buffer, at, p.vertices * 3);
    at += Math.ceil((p.vertices * 6) / 4) * 4;
    const index = p.wide ? new Uint32Array(buffer, at, p.indices) : new Uint16Array(buffer, at, p.indices);
    at += Math.ceil((index.byteLength) / 4) * 4;
    const position = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) position[i] = min[i % 3] + (q[i] / 65535) * (max[i % 3] - min[i % 3]);
    parts[p.name] = { position, index: Array.from(index) };
  }
  return parts;
}

/** Model positions (x, y, z flat) to the world: scaled, turned, moved; a pier's foot under the water. */
function placed(position, name, { place, water, bankY }) {
  const B = BRIDGE;
  const a = THREE.MathUtils.degToRad(place.yaw), c = Math.cos(a), s = Math.sin(a);
  const p = position.slice();
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i] * B.scale, z = p[i + 2] * B.scale * place.mirror;
    p[i] = x * c - z * s + place.x;
    p[i + 2] = x * s + z * c + place.z;
    // the ramps' feet on the bank; a pier's foot under the water
    p[i + 1] = name === 'pier' && p[i + 1] < B.model.pierBottom ? water - B.pierFoot : bankY + (p[i + 1] - B.model.ground) * B.scale;
  }
  return p;
}

/**
 * Each stay cable's axis as a line (two points per cable): a thin prism seen from 100 m and more
 * is under a pixel wide and breaks into dashes, and with no ink of its own nothing joins them.
 * A line is always one pixel, unbroken. The cable part is prisms of 2 x SIDES vertices in order
 * (scripts/build-bridge.mjs), so the ends are the centres of each prism's two rings.
 */
export function cableLines(parts, at, color) {
  const P = placed(parts.cable.position, 'cable', at);
  const per = 12; // 2 rings x 6 sides
  const pos = [];
  for (let i = 0; i + per * 3 <= P.length; i += per * 3) {
    for (const ring of [0, 1]) {
      const c = [0, 0, 0];
      for (let k = 0; k < per / 2; k++) for (let j = 0; j < 3; j++) c[j] += P[i + (ring * per / 2 + k) * 3 + j] / (per / 2);
      pos.push(...c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return { geometry: g, color };
}

/**
 * Model parts to one world-space geometry: placed, the piers carried down under the water, smooth
 * normals within BRIDGE.crease, one linear vertex colour per part (the ink pass draws a seam
 * where two parts' colours meet).
 */
export function bridgeGeometry(parts, { place, water, bankY }, colors, names = PARTS) {
  const B = BRIDGE;
  const pieces = [];
  for (const name of names) {
    const part = parts[name];
    if (!part?.index.length) continue;
    const p = placed(part.position, name, { place, water, bankY });
    const index = part.index.slice();
    if (place.mirror < 0) for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]]; // keep the faces outward
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setIndex(index);
    const smooth = toCreasedNormals(g, THREE.MathUtils.degToRad(B.crease));
    g.dispose();
    const n = smooth.attributes.position.count;
    const color = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.set(colors[name], i * 3);
    smooth.setAttribute('color', new THREE.BufferAttribute(color, 3));
    smooth.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    pieces.push(smooth);
  }
  // one geometry: concatenate the non-indexed pieces
  const count = pieces.reduce((k, g) => k + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [attr, size] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) {
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const g of pieces) {
      arr.set(g.attributes[attr].array, o);
      o += g.attributes[attr].array.length;
    }
    out.setAttribute(attr, new THREE.BufferAttribute(arr, size));
  }
  for (const g of pieces) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/**
 * A ring of foam round each tower pier where it meets the water: rounded rectangles round the
 * pier's footprint (its model vertices at the bottom, sorted to the nearest pier), opacity in the
 * vertex colour's alpha, fading out (FOAM).
 */
export function foamGeometry(parts, { place, water }, color) {
  const B = BRIDGE, P = parts.pier.position;
  const boxes = B.model.piers.map(() => [Infinity, Infinity, -Infinity, -Infinity]);
  for (let i = 0; i < P.length; i += 3) {
    if (P[i + 1] >= B.model.pierBottom) continue;
    const [x, z] = [P[i], P[i + 2]];
    let k = 0, best = Infinity;
    B.model.piers.forEach(([px, pz], j) => {
      const d = Math.hypot(x - px, z - pz);
      if (d < best) [best, k] = [d, j];
    });
    const b = boxes[k];
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], z); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], z);
  }
  const pos = [], col = [], index = [];
  const n = FOAM.steps, R = FOAM.rings;
  for (const [x0, z0, x1, z1] of boxes) {
    if (!(x1 > x0)) continue;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    const base = pos.length / 3;
    for (const [out, alpha] of R) {
      const o = out / B.scale; // metres to model units
      for (let k = 0; k < n; k++) {
        const t = (k / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
        // a superellipse (power 4): a rectangle with rounded corners
        const ex = Math.sign(c) * Math.sqrt(Math.abs(c)), ez = Math.sign(s) * Math.sqrt(Math.abs(s));
        const [wx, wz] = bridgePoint([cx + ex * (hx + o), cz + ez * (hz + o)], place);
        pos.push(wx, water + FOAM.lift, wz);
        col.push(...color, alpha);
      }
    }
    for (let r = 0; r + 1 < R.length; r++) {
      for (let k = 0; k < n; k++) {
        const a = base + r * n + k, b = base + r * n + ((k + 1) % n), a2 = a + n, b2 = b + n;
        index.push(a, a2, b, b, a2, b2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** What was built, measured. Throws on a failed check. */
export function checkBridge(geometry, { place, water, bankY }) {
  const B = BRIDGE;
  const pos = geometry.attributes.position;
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  const ends = B.model.ends.map((e) => bridgePoint(e, place));
  const piers = bridgePiers(place);
  const length = Math.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]);
  const k = B.scale / B.real; // built at this share of real size (BRIDGE.scale)
  const c = createContract('bridge');
  c.range('tower height above water in metres (sources: 48 to 50, times the size share)', top - water, 47 * k, 51 * k);
  c.range('ramp foot to ramp foot in metres (sources: 276 to about 335 overall, times the size share)', length, 230 * k, 340 * k);
  c.is('tower piers standing in the river', piers.filter(inRiver).length, place.piersInRiver);
  return { length: +length.toFixed(1), height: +(top - water).toFixed(1), piers: piers.map((p) => p.map((v) => +v.toFixed(1))), contract: c.assert() };
}

/**
 * The bridge, empty until the model file is loaded (`ready` resolves then): a group of the inked
 * parts, the soft parts (no ink of their own; SOFT_INK_LAYER) and the foam at the piers.
 * `material` is the scene's toon paint; the painted albedo is added to it here (not in the flat,
 * clay and silhouette checks: `painted` false). `sun`: the direction to the sun (world).
 */
export function createBridge({ place, water, bankY, material, painted, sun = new THREE.Vector3(0, 1, 0) }) {
  const colors = { ...OUTSIDE_THEME.bridge, roof: OUTSIDE_THEME.assembly.gold };
  if (painted) paintBridge(material, { water, sun });
  const group = new THREE.Group();
  group.name = 'bridge';
  const make = (name, mat, layers) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.name = name;
    mesh.frustumCulled = false; // until the geometry arrives
    mesh.layers.set(layers[0]);
    for (const l of layers.slice(1)) mesh.layers.enable(l);
    group.add(mesh);
    return mesh;
  };
  const inked = make('bridge', material, [0, MIRROR_LAYER]);
  const soft = make('bridge-soft', material, [NO_INK_LAYER, SOFT_INK_LAYER, MIRROR_LAYER]);
  const foamMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const foam = painted ? make('bridge-foam', foamMaterial, [NO_INK_LAYER]) : null;
  const lineMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(...colors.cable) });
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
  lines.name = 'bridge-cables';
  lines.layers.set(NO_INK_LAYER);
  lines.layers.enable(MIRROR_LAYER);
  lines.frustumCulled = false;
  if (painted) group.add(lines);
  const ready = fetch(modelUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`bridge model: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buffer) => {
      const parts = parse(buffer);
      const at = { place, water, bankY };
      const set = (mesh, geometry) => {
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        mesh.frustumCulled = true;
      };
      set(inked, bridgeGeometry(parts, at, colors, INKED));
      set(soft, bridgeGeometry(parts, at, colors, SOFT));
      if (foam) set(foam, foamGeometry(parts, at, colors.foam));
      set(lines, cableLines(parts, at, colors.cable).geometry);
      const report = checkBridge(inked.geometry, at);
      report.triangles = (inked.geometry.attributes.position.count + soft.geometry.attributes.position.count) / 3;
      return report;
    });
  return {
    mesh: group,
    ready,
    dispose() {
      foamMaterial.dispose();
      lineMaterial.dispose();
      lines.geometry.dispose();
      for (const m of group.children) m.geometry.dispose();
    },
  };
}

const NOISE = /* glsl */ `
float bH(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float bN(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(bH(i),bH(i+vec3(1,0,0)),f.x),mix(bH(i+vec3(0,1,0)),bH(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(bH(i+vec3(0,0,1)),bH(i+vec3(1,0,1)),f.x),mix(bH(i+vec3(0,1,1)),bH(i+vec3(1,1,1)),f.x),f.y),f.z);}
float bF(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*bN(p);p*=2.03;a*=.5;}return s;}
// strokes smeared along the slope of a second noise ("slope blur", 80.lv Ghibli guide)
float bSlope(vec3 p){vec3 q=p;for(int i=0;i<2;i++){float e=.15,c=bF(q*.7);
 vec3 g=vec3(bF(q*.7+vec3(e,0,0))-c,bF(q*.7+vec3(0,e,0))-c,bF(q*.7+vec3(0,0,e))-c)/e;q+=normalize(g+1e-4)*.25;}return bF(q);}
`;

/** The hand-painted albedo on the bridge's toon paint (BRIDGE.paint). */
function paintBridge(material, { water, sun }) {
  const L = sun.clone().normalize();
  const P = BRIDGE.paint;
  const f = (v) => v.toFixed(3);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBridgeP;\nvarying vec3 vBridgeN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBridgeP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBridgeN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBridgeP;\nvarying vec3 vBridgeN;\n' + NOISE)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  {
    vec3 P = vBridgeP / ${f(BRIDGE.scale)};
    vec3 an = pow(abs(normalize(vBridgeN)), vec3(4.)); an /= an.x + an.y + an.z;
    float stroke = bSlope(vec3(P.y*1.2, P.z*.35, P.x*.1)*1.4)*an.x + bSlope(vec3(P.x*.35, P.z*1.2, P.y*.1)*1.4)*an.y + bSlope(vec3(P.x*.35, P.y*1.2, P.z*.1)*1.4)*an.z;
    float sharp = clamp((smoothstep(.25, .75, stroke) - .5) * (1.6 + 2.*${f(P.stroke)}) + .5, 0., 1.);
    vec3 base = diffuseColor.rgb;
    float hv = bF(P*vec3(.8, 2.4, .8) + 5.);
    vec3 paint = mix(base*vec3(.84, .94, 1.12), base*vec3(1.12, 1., .82), smoothstep(.3, .7, hv)*${f(P.hue)} + (1. - ${f(P.hue)})*.5);
    paint *= mix(1., 1. + .12*${f(P.stroke)} + .04, sharp); // strokes only lighten
    vec3 Nw = normalize(vBridgeN); if (!gl_FrontFacing) Nw = -Nw;
    paint *= mix(mix(vec3(.62, .66, .82), vec3(1.), 1. - ${f(P.bake)}), mix(vec3(1.12, 1.06, .94), vec3(1.), 1. - ${f(P.bake)}), smoothstep(.15, .85, Nw.y*.5 + .5));
    paint *= mix(vec3(1.06, .98, .92), vec3(.93, .98, 1.06), bF(vBridgeP*.013 + 11.)*${f(P.vary)});
    vec3 dn = fwidth(Nw); float wear = smoothstep(.2, .55, clamp((dn.x + dn.y + dn.z)*6., 0., 1.)*(.6 + .8*bF(P*3.)));
    paint = mix(paint, min(paint*1.4 + .08, vec3(1.)), wear*${f(P.edge)});
    // the sun's side a little warm, the other a little cool (the towers' shape in the white)
    vec3 Ls = vec3(${f(L.x)}, ${f(L.y)}, ${f(L.z)});
    float lit = dot(Nw, Ls);
    paint *= mix(vec3(.94, .97, 1.05), vec3(1.07, 1.02, .93), smoothstep(-.35, .45, lit)) * mix(1., 1. + ${f(P.rim)}, smoothstep(.55, .9, lit));
    // the platform roofs' gold catches a shine where the sun's reflection meets the eye
    float gold = step(base.b * 2.5, base.r) * step(.4, base.r);
    vec3 V = normalize(cameraPosition - vBridgeP);
    float shine = pow(max(dot(reflect(-Ls, Nw), V), 0.), 6.);
    paint += gold * ${f(P.shine)} * smoothstep(.25, .75, shine) * vec3(1., .86, .5);
    // the piers dark and wet for the first two metres above the water
    paint *= mix(vec3(.45, .45, .49), vec3(1.), smoothstep(${f(water + 0.15)}, ${f(water + P.wet)}, vBridgeP.y));
    diffuseColor.rgb = paint;
  }`,
      );
  };
}
