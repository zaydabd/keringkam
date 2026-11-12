// Painted effects done in the materials, not in the geometry: the wall darkening, the polished
// board gloss and the soft shadows under the furniture (after R2).

import * as THREE from 'three';
import { INTERIOR_THEME as THEME } from '../themes/interior.js';
import { PLAN } from './plan.js';

const vec3 = (a) => `vec3(${a.map((n) => n.toFixed(2)).join(', ')})`; // a linear colour, written into GLSL

/**
 * R2's walls are darker low down and lighter up near the ceiling. Done in the material, not in the
 * vertex colours: the ink pass tells parts apart by their vertex colour.
 */
export function shadeWalls(material, top) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWallY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWallY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWallY;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(0.66, 1.14, smoothstep(0.0, ${top.toFixed(2)}, vWallY));`);
  };
}

/**
 * Polished boards (R2): the floor and the table tops mirror the bright windows, and the floor
 * mirrors the red cloth. Done in the material: each fragment's view ray is reflected off the
 * (level) surface and followed to the window wall or to the cloth; where it lands in an opening
 * the board is painted lighter. The mirror image is blurred more the further the ray travels, and
 * stretched along the boards, as a real polished floor does. `falloff` darkens the boards away
 * from the windows (R2's foreground floor is in shade). `view` shows the mask alone.
 */
export function glossBoards(material, { window, clothTint, strength = 0.6, cloth = 0, falloff = 0, light = 1, view = false }) {
  const { z0 } = PLAN.room;
  const W = PLAN.window;
  const F = PLAN.frame;
  const wins = PLAN.backWindows.map((w) => `refl += box(H.x, ${w.x0.toFixed(2)}, ${w.x1.toFixed(2)}, wx) * open;`).join('\n      ');
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
    float gNoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(gHash(i), gHash(i + 1.0), f); }`,
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
        ${wins}
      }
      // boards are not evenly polished: streaks along the grain, and each plank a little different
      // The fine streaks fade out once they are smaller than a pixel (no shimmer far away).
      float fine = mix(gNoise(vGlossP.x * 31.0), 0.5, smoothstep(0.35, 1.2, fwidth(vGlossP.x * 31.0)));
      float broad = gNoise(vGlossP.x * 6.3 + 2.0);
      float breaks = smoothstep(0.25, 0.6, gNoise(vGlossP.z * 2.1 + floor(vGlossP.x * 5.5) * 3.7)); // gaps along a board
      float streak = (0.3 + 0.7 * fine) * (0.45 + 0.75 * broad) * (0.55 + 0.45 * breaks);
      float plank = clamp(0.8 + (vColor.r - 1.0) * 6.0, 0.45, 1.15);
      float fres = 0.3 + 0.7 * pow(1.0 - abs(Vd.y), 2.0); // stronger at a glancing angle
      float gloss = min(0.85, clamp(refl, 0.0, 1.0) * streak * plank * fres * ${strength.toFixed(2)} * (1.0 - ${falloff > 0 ? '0.85' : '0.0'} * towards));
      // the red cloth, mirrored in the floor
      float red = 0.0;
      if (${cloth.toFixed(2)} > 0.0) {
        float tc = (${((F.front + F.back) / 2).toFixed(2)} - vGlossP.y) / Rd.y;
        vec3 Hc = vGlossP + Rd * tc - vec3(${F.x.toFixed(2)}, 0.0, ${F.z.toFixed(2)});
        float cs = ${Math.cos(F.ry).toFixed(4)}, sn = ${Math.sin(F.ry).toFixed(4)};
        vec2 L = vec2(cs * Hc.x - sn * Hc.z, sn * Hc.x + cs * Hc.z); // into the frame's own axes
        red = box(L.x, ${(-F.w / 2).toFixed(2)}, ${(F.w / 2).toFixed(2)}, 0.5) * box(L.y, ${(-F.d / 2).toFixed(2)}, ${(F.d / 2).toFixed(2)}, 0.5);
        // R2 also lets the red spill onto the open floor beside the frame (towards the room)
        vec2 spill = (vGlossP.xz - vec2(${(F.x - 0.95).toFixed(2)}, ${(F.z + 0.1).toFixed(2)})) / vec2(0.42, 0.3);
        red = max(red, 0.8 * exp(-dot(spill, spill)));
        red *= (0.5 + 0.5 * streak) * ${cloth.toFixed(2)};
      }
      ${view ? 'outgoingLight = vec3(gloss) + vec3(red, 0.0, 0.0);' : `outgoingLight = mix(outgoingLight, ${vec3(window)} * ${light.toFixed(2)}, gloss); outgoingLight = mix(outgoingLight, outgoingLight * ${vec3(clothTint.multiply)} + ${vec3(clothTint.add)} * ${light.toFixed(2)}, red);`} // the red is a tint: the boards keep their value
    }
    #include <opaque_fragment>`,
      );
  };
}

/**
 * Soft shadows under the furniture (R2 paints one under every piece). The sun only reaches the
 * boards by the windows, so these are painted on: a dark, soft-edged patch on the floor under each
 * piece, pulled a little towards the viewer (the light comes from the windows behind).
 */
export function buildContactShadows(texture) {
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
  const pull = 0.28;
  for (const sItem of [PLAN.settee, ...PLAN.chairs]) {
    patch(sItem.x, sItem.z + pull, sItem.w * 1.5, sItem.d * 2.1, sItem.ry);
    patch(sItem.x, sItem.z + 0.08, sItem.w * 1.15, sItem.d * 1.3, sItem.ry, core);
  }
  for (const t of PLAN.tables) {
    patch((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2 + pull, (t.x1 - t.x0) * 1.35, (t.z1 - t.z0) * 2.0);
    patch((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2 + 0.1, (t.x1 - t.x0) * 1.12, (t.z1 - t.z0) * 1.35, 0, core);
  }
  const F = PLAN.frame;
  patch(F.x, F.z + pull, F.w * 2.6, F.d * 3.0, F.ry);
  patch(F.x, F.z + 0.1, F.w * 1.9, F.d * 1.7, F.ry, core);
  return { group, mat, core };
}
