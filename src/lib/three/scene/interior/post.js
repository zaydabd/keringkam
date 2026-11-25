// The interior's post-processing (interior.js): the scene, ambient occlusion, the ink, the
// watercolour pigment, the finish (tone map and grade) and anti-aliasing, in that order.

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { createOutline } from '../toon.js';
import { PIGMENT_SHADER, FINISH_SHADER, createPigmentField } from '../watercolour.js';
import { createAO } from '../ao.js';
import { AO, OUTLINES } from '../quality.js';
import { setUniforms } from './helpers.js';
import { REFERENCE_EXPOSURE } from '../meter.js';
import { INK_MASK_LAYER } from '../layers.js';

/**
 * Builds the pass chain. `quality` is the live settings object (quality.js; setQuality changes it
 * in place); `inkMask` is the lattice texture that masks the ink of the view behind it.
 */
export function createPost(renderer, scene, camera, { theme, quality: Q, params, off, debug, clay, stage, seed, inkMask }) {
  const num = (k) => (params.has(k) ? Number(params.get(k)) || 0 : null);

  const { color: ink, lineWidth, ...inkLook } = theme.ink;
  const outline = createOutline(renderer, scene, camera, { ink, lineWidth, mask: [{ layer: INK_MASK_LAYER, map: inkMask }] });
  setUniforms(outline.material.uniforms, inkLook);
  // The theme's ink, which the outlines setting (quality.js OUTLINES) scales.
  const inkBase = Object.fromEntries(Object.keys(OUTLINES.full).map((k) => [k, outline.material.uniforms[k].value]));
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Ambient occlusion (ao.js): darkens under the furniture and in the corners; before the ink.
  // The AO setting (quality.js AO): full is at most one AO pixel a CSS pixel, half is half that a
  // side, auto is half while the view moves and full when it holds still, off skips the pass.
  // ?aores=k: the AO buffer at k times the drawing buffer; ?aosamples=n (debug,
  // research/INTERIOR-NOTES.md, passes p1 and p2).
  const aoRes = num('aores');
  const aoScale = (moving = false) => aoRes ?? (moving ? (AO.moving[Q.ao] ?? AO.scale[Q.ao]) : AO.scale[Q.ao]) * Math.min(1, 1 / renderer.getPixelRatio());
  const ao = off.has('ao') || stage ? null : createAO(scene, camera, theme.light.ao, { view: debug === 'ao', bufferScale: aoScale, samples: num('aosamples') });
  if (ao) composer.addPass(ao);
  const inkPass = !off.has('ink') && !clay;
  if (inkPass) composer.addPass(new ShaderPass(outline.material));
  // Watercolour (watercolour.js): pigment in linear light, then the finish pass.
  const pigment = new ShaderPass(PIGMENT_SHADER);
  const finish = new ShaderPass(FINISH_SHADER);
  finish.material.toneMapped = false; // the shader tone-maps itself
  const { detail: paintDetail, ...paintLook } = theme.paint;
  setUniforms(pigment.uniforms, paintLook);
  setUniforms(finish.uniforms, theme.grade);
  const paintView = { 'paint-pigment': 1, 'paint-edge': 2, 'paint-bleed': 3 }[debug] ?? 0;
  pigment.uniforms.view.value = paintView;
  const pigmentField = createPigmentField(renderer, pigment.uniforms, { detail: paintDetail });
  pigmentField.update(seed);
  if (!off.has('pigment') && !clay) composer.addPass(pigment);
  finish.uniforms.view.value = debug === 'fabric-mask' ? 2 : off.has('grade') || paintView || clay ? 1 : 0; // 1: tone map and encode only, no grade; 2: the fabric mask
  // The fabrics keep most of their photo (theme.fabric; their material marks them with alpha 0).
  outline.material.uniforms.fabricKeep.value = pigment.uniforms.fabricKeep.value = finish.uniforms.fabricKeep.value = theme.fabric.keep;
  outline.material.uniforms.fabricInk.value = theme.fabric.ink;
  composer.addPass(finish);
  // ?set=pass.uniform:value,... (debug): overrides a post uniform, e.g. set=pigment.bleed:0 or set=ink.wobble:0.
  const overrides = [];
  for (const kv of (params.get('set') ?? '').split(',').filter(Boolean)) {
    const [path, v] = kv.split(':');
    const [pass, name] = path.split('.');
    const u = { ink: outline.material.uniforms, pigment: pigment.uniforms, finish: finish.uniforms }[pass]?.[name];
    if (u && typeof u.value === 'number') overrides.push([u, Number(v)]);
  }
  // Anti-aliasing (SMAA) on the finished, encoded image, where its edge thresholds were set: it
  // smooths the 1 px ink lines and geometry edges, which otherwise crawl as the view turns.
  // ?off=aa leaves it out. The anti-aliasing setting (quality.js): on, off, or auto: skipped at a
  // pixel ratio of 2 or more (setSize), where the lines are 2 device pixels wide and SMAA took 8%
  // of the sharpness (34% of the fine detail) at 2x, measured (research/INTERIOR-NOTES.md,
  // "Sharpness"). ?aa=1 keeps it at any ratio.
  const smaa = off.has('aa') ? null : new SMAAPass();
  if (smaa) {
    // Switched off, it keeps its two buffers (edges and blend weights) at one pixel instead of a
    // full screen each; setSize sets enabled before it sizes the passes.
    const setSize = smaa.setSize.bind(smaa);
    smaa.setSize = (w, h) => (smaa.enabled ? setSize(w, h) : setSize(1, 1));
    composer.addPass(smaa);
  }

  /**
   * The outlines and AO settings, then the ?set overrides over them. Outlines off also skips the
   * edge buffer (a second draw of the room).
   */
  function applyQuality() {
    const f = OUTLINES[Q.outlines];
    outline.setLines(inkPass && !!f);
    if (f) for (const k in f) outline.material.uniforms[k].value = inkBase[k] * f[k];
    for (const [u, v] of overrides) u.value = v;
    if (ao) ao.enabled = Q.ao !== 'off' || aoRes !== null;
  }
  applyQuality();

  return {
    composer, outline, ao, inkPass,
    applyQuality,
    setPixelRatio: (ratio) => composer.setPixelRatio(ratio),
    /** Sizes every pass for a canvas of w x h CSS pixels at the renderer's pixel ratio. */
    setSize(w, h) {
      const px = renderer.getPixelRatio();
      if (smaa) smaa.enabled = params.get('aa') === '1' || Q.aa === 'on' || (Q.aa === 'auto' && px < 2);
      composer.setSize(w, h);
      outline.setSize(w, h, px);
      pigment.uniforms.resolution.value.set(w * px, h * px);
      pigment.uniforms.scale.value = px;
      finish.uniforms.texel.value.set(1 / w, 1 / h);
    },
    // The ink and pigment passes work before the tone map: they need the exposure to judge what
    // counts as a dark or a mid tone.
    setExposure(value) {
      finish.uniforms.toneMappingExposure.value = value;
      outline.material.uniforms.exposure.value = value / REFERENCE_EXPOSURE; // its thresholds were tuned at that exposure
      pigment.uniforms.exposure.value = value;
      renderer.toneMappingExposure = value;
    },
    /** The ink's hand and the wash stay on the room when the view turns (toon.js VIEW_FIELD). */
    setView() {
      outline.setView();
      pigmentField.setView(camera);
    },
    render(dt) {
      if (inkPass) outline.render();
      composer.render(dt);
    },
    /** A pass's name for the ?perf timings. */
    passName: (pass) => (pass === pigment ? 'pigment' : pass === finish ? 'finish' : pass === smaa ? 'aa' : pass === ao ? 'ao' : pass instanceof RenderPass ? 'scene' : 'ink'),
    dispose() {
      ao?.dispose(); // GTAOPass's own targets and materials
      outline.dispose();
      pigment.dispose();
      pigmentField.dispose();
      finish.dispose();
      smaa?.dispose();
      composer.dispose();
    },
  };
}
