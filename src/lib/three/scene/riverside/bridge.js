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

import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import modelUrl from '../../../../assets/models/darul-hana-bridge.bin?url';
import { createContract } from './contract.js';
import { OUTSIDE_THEME } from '../themes/index.js';
import { SITE } from '../world/site.js';

export const BRIDGE = {
  scale: 2.65, // metres per model unit: towers about 49 m above the water, about 318 m long (sources above)
  // Measured on the model (its own units, y up): where the ramps meet the ground, the tops of the
  // tower piers, and the plan positions [x, z] of the two tower piers and the two ramp feet.
  model: { ground: -3.05, pierTop: -1.98, pierBottom: -2.9, piers: [[24, -3.15], [73.8, -15.45]], ends: [[0.7, 0], [97.1, -18.8]] },
  pierFoot: 2, // the piers go this far under the water
  crease: 40, // degrees: smooth normals round the tubes, hard edges on the boxes
  // The painted albedo (a stylisation, judged in test renders): brush-stroke lightening, warm and
  // cool dabs, painted light, worn edges, world-scale colour drift.
  paint: { stroke: 0.9, hue: 0.45, bake: 0.85, edge: 0.5, vary: 0.6 },
};

// The model's parts, in the file's order (scripts/build-bridge.mjs PARTS), and their colours.
const PARTS = ['body', 'walk', 'roof', 'pier', 'tower', 'cable'];

/**
 * World position [x, z] of a model plan point [x, z] for a placement { x, z, yaw (degrees),
 * mirror (1 or -1) }: scaled, mirrored across the model's x axis if asked, turned, moved.
 */
export function bridgePoint([mx, mz], place, scale = BRIDGE.scale) {
  const a = THREE.MathUtils.degToRad(place.yaw), c = Math.cos(a), s = Math.sin(a);
  const x = mx * scale, z = mz * scale * place.mirror;
  return [x * c - z * s + place.x, x * s + z * c + place.z];
}

/** The two tower piers' centres [x, z] in the world, for the banks and the boats to keep clear of. */
export const bridgePiers = (place = SITE.bridge) => BRIDGE.model.piers.map((p) => bridgePoint(p, place));

/** True where [x, z] is on the river: beyond our waterline and short of the far one (SITE.farLine). */
export function inRiver([x, z]) {
  const L = SITE.farLine;
  let far = L[0][1];
  for (let i = 1; i < L.length; i++) {
    if (x <= L[i][0]) {
      far = L[i - 1][1] + ((L[i][1] - L[i - 1][1]) * (x - L[i - 1][0])) / (L[i][0] - L[i - 1][0]);
      break;
    }
    far = L[i][1];
  }
  return z < SITE.near.waterline && z > far;
}

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

/**
 * Model parts to one world-space geometry: placed, the piers carried down under the water, smooth
 * normals within BRIDGE.crease, one linear vertex colour per part (the ink pass draws a seam
 * where two parts' colours meet).
 */
export function bridgeGeometry(parts, { place, water, bankY }, colors) {
  const B = BRIDGE;
  const a = THREE.MathUtils.degToRad(place.yaw), c = Math.cos(a), s = Math.sin(a);
  const pieces = [];
  for (const name of PARTS) {
    const part = parts[name];
    if (!part?.index.length) continue;
    const p = part.position.slice();
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] * B.scale, z = p[i + 2] * B.scale * place.mirror;
      p[i] = x * c - z * s + place.x;
      p[i + 2] = x * s + z * c + place.z;
      // the ramps' feet on the bank; a pier's foot under the water
      p[i + 1] = name === 'pier' && p[i + 1] < B.model.pierBottom ? water - B.pierFoot : bankY + (p[i + 1] - B.model.ground) * B.scale;
    }
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

/** What was built, measured. Throws on a failed check. */
export function checkBridge(geometry, { place, water, bankY }) {
  const B = BRIDGE;
  const pos = geometry.attributes.position;
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  const ends = B.model.ends.map((e) => bridgePoint(e, place));
  const piers = bridgePiers(place);
  const length = Math.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]);
  const c = createContract('bridge');
  c.range('tower height above water in metres (sources: 48 to 50)', top - water, 47, 51);
  c.range('ramp foot to ramp foot in metres (sources: 276 to about 335 overall)', length, 230, 340);
  c.is('tower piers standing in the river', piers.filter(inRiver).length, place.piersInRiver);
  return { length: +length.toFixed(1), height: +(top - water).toFixed(1), piers: piers.map((p) => p.map((v) => +v.toFixed(1))), contract: c.assert() };
}

/**
 * The bridge's mesh, empty until the model file is loaded (`ready` resolves then). `material` is
 * the scene's toon paint; the painted albedo is added to it here (not in the flat, clay and
 * silhouette checks: `painted` false).
 */
export function createBridge({ place, water, bankY, material, painted }) {
  const colors = { ...OUTSIDE_THEME.bridge, roof: OUTSIDE_THEME.assembly.gold };
  if (painted) paintBridge(material);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = 'bridge';
  mesh.frustumCulled = false; // until the geometry arrives
  const ready = fetch(modelUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`bridge model: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buffer) => {
      const geometry = bridgeGeometry(parse(buffer), { place, water, bankY }, colors);
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      mesh.frustumCulled = true;
      return checkBridge(geometry, { place, water, bankY });
    });
  return { mesh, ready };
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
function paintBridge(material) {
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
    diffuseColor.rgb = paint;
  }`,
      );
  };
}
