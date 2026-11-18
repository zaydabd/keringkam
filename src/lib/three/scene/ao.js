// Ambient occlusion for the room: three.js GTAOPass (ground-truth ambient occlusion), worked out
// again only when the view changes. It darkens where surfaces close in on each other: under the
// seats and tables, round the legs' feet, in the corners. It multiplies the lit scene, before ink.
//
// The room never moves, so the AO of one view stays right until the camera moves or the screen
// changes size: between those it only blends the AO it already has (two full-screen draws instead
// of a second scene render, the AO and the denoise). This is the step before baking it.
//
// Meshes with userData.noAO are left out of the AO's own depth and normal render: cut-outs
// (the lattice, the carving) and sheer cloth would read as solid panels there.

import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { VIEW_FIELD, setViewField } from './toon.js';

const PD_RADIUS = 10; // the denoise radius, in drawing-buffer pixels

class StillAOPass extends GTAOPass {
  constructor(scene, camera, look, { bufferScale, samples = 24 } = {}) {
    super(scene, camera, 1, 1);
    this.bufferScale = bufferScale; // () => the AO buffer's size relative to the drawing buffer
    const { intensity, radius, distanceExponent, thickness, scale } = look;
    this.updateGtaoMaterial({ radius, distanceExponent, thickness, scale, samples });
    this.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: PD_RADIUS, rings: 3, samples });
    this.blendIntensity = intensity;
    this.seen = { view: new THREE.Matrix4(), projection: new THREE.Matrix4(), fresh: false };
    // Both the AO and its denoiser turn their samples by a small noise texture tiled over the
    // screen, so the AO's dither stayed put while the room moved under it, and re-dithered on
    // every turn. Here each pixel reads the noise at its direction in the world (toon.js
    // VIEW_FIELD), at whole texels, so a point in the room keeps its dither as the view turns.
    for (const material of [this.gtaoMaterial, this.pdMaterial]) {
      const from = 'vec2 noiseUv = vUv * resolution / noiseResolution;';
      if (!material.fragmentShader.includes(from)) {
        console.warn('ao: the GTAO noise lookup has changed (three.js update?); the AO stays screen-dithered');
        continue;
      }
      material.uniforms.viewRotation = { value: new THREE.Matrix3() };
      material.uniforms.focal = { value: 1000 };
      material.fragmentShader = material.fragmentShader
        .replace('uniform vec2 resolution;', `uniform vec2 resolution;\nuniform mat3 viewRotation;\nuniform float focal;\n${VIEW_FIELD}`)
        .replace(from, 'vec2 noiseUv = (floor(viewField(vUv * resolution, resolution, viewRotation, focal)) + 0.5) / noiseResolution;');
      material.needsUpdate = true;
    }
  }

  setSize(width, height) {
    // The AO is soft shading: it is worked out at CSS-pixel resolution (half the buffer on a 2x
    // screen, as drawn on the design view at 1x) and the blend reads it back filtered.
    const k = this.bufferScale?.() ?? 1;
    super.setSize(Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)));
    // The denoiser's radius is in its own buffer's pixels: scaled so it covers the same part of the screen.
    this.pdMaterial.uniforms.radius.value = PD_RADIUS * k;
    this.seen.fresh = false;
  }

  _overrideVisibility() {
    super._overrideVisibility();
    this.scene.traverse((o) => {
      if (o.userData.noAO && o.visible) {
        o.visible = false;
        this._visibilityCache.push(o);
      }
    });
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const { seen, camera } = this;
    camera.updateMatrixWorld();
    const still = seen.fresh && seen.view.equals(camera.matrixWorld) && seen.projection.equals(camera.projectionMatrix);
    if (!still || this.output !== GTAOPass.OUTPUT.Default) {
      seen.view.copy(camera.matrixWorld);
      seen.projection.copy(camera.projectionMatrix);
      seen.fresh = true;
      for (const material of [this.gtaoMaterial, this.pdMaterial]) {
        if (material.uniforms.viewRotation) setViewField(material.uniforms, camera, material.uniforms.resolution.value.y);
      }
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      return;
    }
    // The view has not changed: blend the AO already worked out (GTAOPass's own Default output).
    const target = this.renderToScreen ? null : writeBuffer;
    this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.copyMaterial.blending = THREE.NoBlending;
    this._renderPass(renderer, this.copyMaterial, target);
    this.blendMaterial.uniforms.intensity.value = this.blendIntensity;
    this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
    this._renderPass(renderer, this.blendMaterial, target);
  }
}

/** The AO pass for the room, with the theme's look (themes/interior.js light.ao). view 'ao' shows the AO alone. */
export function createAO(scene, camera, look, { view = false, bufferScale, samples } = {}) {
  const pass = new StillAOPass(scene, camera, look, { bufferScale, samples });
  if (view) pass.output = GTAOPass.OUTPUT.Denoise;
  return pass;
}
