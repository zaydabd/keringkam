// Painted effects done in the materials, not in the geometry: the wall darkening, the polished
// board gloss and the soft shadows under the furniture (after R2).

import * as THREE from 'three';
import { INTERIOR_THEME as THEME } from '../themes/index.js';
import { PLAN } from './plan.js';

const vec3 = (a) => `vec3(${a.map((n) => n.toFixed(2)).join(', ')})`; // a linear colour, written into GLSL

/**
 * R2's walls are darker low down and lighter up near the ceiling. Done in the material, not in the
 * vertex colours: the ink pass tells parts apart by their vertex colour. The window wall's inner
 * face (it looks along +z) is darker by `windowWall`: the windows light every wall but their own.
 */
export function shadeWalls(material, top, windowWall = 1) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWallY;\nvarying float vWallFace;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWallY = (modelMatrix * vec4(transformed, 1.0)).y;\nvWallFace = objectNormal.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWallY;\nvarying float vWallFace;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\ndiffuseColor.rgb *= mix(0.66, 1.14, smoothstep(0.0, ${top.toFixed(2)}, vWallY)) * mix(1.0, ${windowWall.toFixed(2)}, step(0.5, vWallFace));`,
      );
  };
}

/**
 * Polished boards (R2): the floor and the table tops mirror the bright windows. Done in the
 * material: each fragment's view ray is reflected off the (level) surface and followed to the
 * window wall; where it lands in an opening
 * the board is painted lighter. The mirror image is blurred more the further the ray travels, and
 * stretched along the boards, as a real polished floor does. `falloff` darkens the boards away
 * from the windows (R2's foreground floor is in shade). `plankVariation` is how much one board's
 * polish differs from the next (0: all alike). `view` shows the mask alone.
 */
export function glossBoards(material, { window, strength = 0.6, falloff = 0, plankVariation = 6, light = 1, view = false }) {
  const { z0 } = PLAN.room;
  const W = PLAN.window;
  const wins = PLAN.backWindows.map((w) => `refl += box(H.x, ${w.x0.toFixed(2)}, ${w.x1.toFixed(2)}, wx) * open;`).join('\n      ');
  const blockers = furnitureBlockers()
    .map(([x, z, ry, lo, hi, share]) => `seen -= ${share.toFixed(2)} * blocks(vGlossP, Rd, t, vec2(${x.toFixed(3)}, ${z.toFixed(3)}), ${ry.toFixed(4)}, vec3(${lo.map((v) => v.toFixed(3))}), vec3(${hi.map((v) => v.toFixed(3))}), ${hi[1] - lo[1] < hi[2] - lo[2]});`)
    .join('\n        ');
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlossP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGlossP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
    varying vec3 vGlossP;
    float box(float v, float a, float b, float w) { return smoothstep(a - w, a + w, v) * (1.0 - smoothstep(b - w, b + w, v)); }
    float gHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
    float gNoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(gHash(i), gHash(i + 1.0), f); }
    // How much of the mirrored window the box [lo, hi] hides (in the piece's own frame: centre c
    // on the floor, turned ry about y), along the ray o + d t, before the window wall at tMax.
    // The box is thin, so it counts as a flat sheet through its middle: level (a seat, a table
    // top) or upright (a chair back). Its edges are as blurred as the mirror image is at that
    // distance: little across the ray, much along it, as the image is stretched along the boards.
    // A ray that starts above a level sheet (a table top's own boards) is not hidden by it.
    float blocks(vec3 o, vec3 d, float tMax, vec2 c, float ry, vec3 lo, vec3 hi, bool level) {
      float ca = cos(ry), sa = sin(ry);
      vec2 p = o.xz - c;
      vec3 from = vec3(p.x * ca - p.y * sa, o.y, p.x * sa + p.y * ca);
      vec3 dir = vec3(d.x * ca - d.z * sa, d.y, d.x * sa + d.z * ca);
      vec3 mid = 0.5 * (lo + hi);
      float tb = level ? (mid.y - from.y) / max(dir.y, 1e-4) : (mid.z - from.z) / (abs(dir.z) < 1e-4 ? 1e-4 : dir.z);
      if (tb < 0.02 || tb > tMax) return 0.0;
      vec3 q = from + dir * tb;
      float across = 0.05 + 0.03 * tb;
      if (!level) return box(q.x, lo.x, hi.x, across) * box(q.y, lo.y, hi.y, 0.18 + 0.14 * tb);
      float along = clamp(0.14 * mid.y / (dir.y * dir.y + 0.02), across, 1.2);
      vec2 way = abs(normalize(dir.xz + 1e-5));
      return box(q.x, lo.x, hi.x, mix(across, along, way.x)) * box(q.z, lo.z, hi.z, mix(across, along, way.y));
    }`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
    {
      float towards = smoothstep(-2.6, -1.5, vGlossP.z); // 0 by the windows, 1 at the viewer's feet
      outgoingLight *= 1.0 - ${falloff.toFixed(2)} * towards;
      vec3 Vd = normalize(vGlossP - cameraPosition);
      vec3 Rd = vec3(Vd.x, abs(Vd.y), Vd.z); // mirrored off a level board
      float refl = 0.0;
      if (Rd.z < -0.001) {
        float t = (${z0.toFixed(2)} - vGlossP.z) / Rd.z;
        vec3 H = vGlossP + Rd * t;
        float wx = 0.05 + 0.03 * t; // blur grows with distance
        float wy = 0.18 + 0.14 * t; // and the image is stretched along the boards
        float open = box(H.y, ${W.lattice.toFixed(2)}, ${W.y1.toFixed(2)}, wy) + 0.35 * box(H.y, 0.0, ${W.lattice.toFixed(2)}, wy);
        // The furniture stands between the boards and the windows: what it hides is not mirrored.
        float seen = 1.0;
        ${blockers}
        ${wins}
        refl *= max(seen, 0.0);
      }
      // boards are not evenly polished: streaks along the grain, and each plank a little different
      // The fine streaks fade out once they are smaller than a pixel (no shimmer far away).
      float fine = mix(gNoise(vGlossP.x * 31.0), 0.5, smoothstep(0.35, 1.2, fwidth(vGlossP.x * 31.0)));
      float broad = gNoise(vGlossP.x * 6.3 + 2.0);
      float breaks = smoothstep(0.25, 0.6, gNoise(vGlossP.z * 2.1 + floor(vGlossP.x * 5.5) * 3.7)); // gaps along a board
      float streak = (0.3 + 0.7 * fine) * (0.45 + 0.75 * broad) * (0.55 + 0.45 * breaks);
      float plank = clamp(0.8 + (vColor.r - 1.0) * ${plankVariation.toFixed(1)}, 0.45, 1.15); // each board's own polish, from its tint
      float fres = 0.3 + 0.7 * pow(1.0 - abs(Vd.y), 2.0); // stronger at a glancing angle
      float gloss = min(0.85, clamp(refl, 0.0, 1.0) * streak * plank * fres * ${strength.toFixed(2)} * (1.0 - ${falloff > 0 ? '0.85' : '0.0'} * towards));
      ${view ? 'outgoingLight = vec3(gloss);' : `outgoingLight = mix(outgoingLight, ${vec3(window)} * ${light.toFixed(2)}, gloss);`}
    }
    #include <opaque_fragment>`,
      );
  };
}

/**
 * The furniture as a few boxes that hide the windows from the boards (glossBoards): each seat's
 * slats and apron, its back (an open lattice, so it hides only part), and each table top.
 * [x, z, ry, lo, hi, share]: lo and hi in the piece's own frame (front = +z), share 0-1.
 */
function furnitureBlockers() {
  const seats = [PLAN.settee, ...PLAN.chairs].flatMap(({ x, z, ry, w, d, back }) => [
    [x, z, ry, [-w / 2, 0.34, -d / 2], [w / 2, 0.44, d / 2], 1],
    [x, z, ry, [-w / 2, 0.44, -d / 2 - 0.06], [w / 2, back, -d / 2 + 0.04], 0.6],
  ]);
  const tables = PLAN.tables.map(({ x0, x1, z0, z1, h }) => [(x0 + x1) / 2, (z0 + z1) / 2, 0, [(x0 - x1) / 2, h - 0.06, (z0 - z1) / 2], [(x1 - x0) / 2, h, (z1 - z0) / 2], 1]);
  return [...seats, ...tables];
}

/**
 * Soft shadows under the furniture (R2 paints one under every piece). The sun only reaches the
 * boards by the windows, so these are painted on: a dark, soft-edged patch on the floor under each
 * piece, pulled a little the way `light` travels (the sky's light from the windows behind).
 */
export function buildContactShadows(texture, light) {
  const group = new THREE.Group();
  const shade = THEME.light.contactShadow;
  const mat = new THREE.MeshBasicMaterial({ map: texture, color: shade.color, transparent: true, opacity: shade.opacity, depthWrite: false, fog: false });
  const core = mat.clone(); // a darker, tighter patch right under each piece
  core.opacity = shade.core;
  const patch = (x, z, w, d, ry = 0, m = mat) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
    mesh.position.set(x, 0.004, z);
    mesh.rotation.y = ry;
    mesh.layers.set(1); // no ink outline
    group.add(mesh);
  };
  // Each patch is pulled the way the light travels along the floor: the soft one further, the core a little.
  const along = new THREE.Vector2(light.x, light.z).normalize();
  const [far, near] = [0.28, 0.09];
  for (const sItem of [PLAN.settee, ...PLAN.chairs]) {
    patch(sItem.x + along.x * far, sItem.z + along.y * far, sItem.w * 1.5, sItem.d * 2.1, sItem.ry);
    patch(sItem.x + along.x * near, sItem.z + along.y * near, sItem.w * 1.15, sItem.d * 1.3, sItem.ry, core);
  }
  for (const t of PLAN.tables) {
    const [x, z] = [(t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2];
    patch(x + along.x * far, z + along.y * far, (t.x1 - t.x0) * 1.35, (t.z1 - t.z0) * 2.0);
    patch(x + along.x * near, z + along.y * near, (t.x1 - t.x0) * 1.12, (t.z1 - t.z0) * 1.35, 0, core);
  }
  return { group, mat, core };
}
