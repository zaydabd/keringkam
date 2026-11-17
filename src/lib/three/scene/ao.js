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

class StillAOPass extends GTAOPass {
  constructor(scene, camera, look) {
    super(scene, camera, 1, 1);
    const { intensity, radius, distanceExponent, thickness, scale } = look;
    this.updateGtaoMaterial({ radius, distanceExponent, thickness, scale, samples: 24 });
    this.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 10, rings: 3, samples: 24 });
    this.blendIntensity = intensity;
    this.seen = { view: new THREE.Matrix4(), projection: new THREE.Matrix4(), fresh: false };
  }

  setSize(width, height) {
    super.setSize(width, height);
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
export function createAO(scene, camera, look, { view = false } = {}) {
  const pass = new StillAOPass(scene, camera, look);
  if (view) pass.output = GTAOPass.OUTPUT.Denoise;
  return pass;
}
