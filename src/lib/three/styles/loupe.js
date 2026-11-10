// Style: one keringkam at a time, filling the screen and tilting gently towards the pointer.
// A magnifying lens follows the pointer (or finger while pressed) to show the embroidery
// up close from the full-size texture. Scroll to change the magnification.

import * as THREE from 'three';
import {
  wrap, fitSize, fitDistance,
  createStage, createTextureStore, setMap,
} from '../common.js';

const FADE_MS = 400;

const lensShader = {
  uniforms: {
    map: { value: null },
    center: { value: new THREE.Vector2(0.5, 0.5) },
    span: { value: new THREE.Vector2(0.1, 0.1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D map;
    uniform vec2 center;
    uniform vec2 span;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r = length(d) * 2.0;
      vec2 uv = center + d * span;
      vec4 c = texture2D(map, uv);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) c = vec4(0.0);
      vec3 colour = mix(vec3(0.0056), c.rgb, c.a);    // background is #111 in linear space
      colour = mix(colour, vec3(1.0), smoothstep(0.93, 0.95, r) * 0.85); // rim
      gl_FragColor = vec4(colour, 1.0 - smoothstep(0.985, 1.0, r));
      #include <colorspace_fragment>
    }`,
};

export function create(canvas) {
  const stage = createStage(canvas, { fov: 40, onResize: () => fit() });
  const { scene, camera, renderer } = stage;
  const store = createTextureStore(renderer);

  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, alphaTest: 0.02 });
  const fabric = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  scene.add(fabric);

  // Lens overlay, drawn in screen pixels on top of the scene.
  const overlay = new THREE.Scene();
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const lensMaterial = new THREE.ShaderMaterial({
    ...lensShader,
    uniforms: THREE.UniformsUtils.clone(lensShader.uniforms),
    transparent: true,
    depthTest: false,
  });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(1, 64), lensMaterial);
  lens.visible = false;
  overlay.add(lens);
  stage.afterRender = () => {
    if (!lens.visible || !lensMaterial.uniforms.map.value) return;
    renderer.autoClear = false;
    renderer.render(overlay, ortho);
    renderer.autoClear = true;
  };

  let index = 0;
  let zoom = 3;
  let distance = 2;
  let fadeStart = 0;
  let size = { w: 1, h: 1 };
  let lensRadius = 120;

  function show(i) {
    index = i;
    size = fitSize(i);
    fabric.scale.set(size.w, size.h, 1);
    material.map = null;
    material.opacity = 0;
    lensMaterial.uniforms.map.value = null;
    fadeStart = Infinity;
    store.progressive(i, (t) => {
      if (index !== i) return;
      setMap(material, t);
      lensMaterial.uniforms.map.value = t;
      if (fadeStart === Infinity) fadeStart = performance.now();
    });
    fit();
    for (const d of [1, -1]) store.get(wrap(i + d), 'preview').then(() => store.get(wrap(i + d), 'full'));
    store.keep((n) => n === i || n === wrap(i + 1) || n === wrap(i - 1));
  }

  function fit() {
    distance = fitDistance(camera, size.w, size.h, 1.08);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    const w = stage.width;
    const h = stage.height;
    ortho.left = -w / 2;
    ortho.right = w / 2;
    ortho.top = h / 2;
    ortho.bottom = -h / 2;
    ortho.updateProjectionMatrix();
    lensRadius = THREE.MathUtils.clamp(Math.min(w, h) * 0.18, 70, 160);
    lens.scale.setScalar(lensRadius);
  }

  // ---- input ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tilt = new THREE.Vector2();
  let pressed = false;

  function updateLens(e) {
    const touch = e.pointerType !== 'mouse';
    ndc.set((e.clientX / stage.width) * 2 - 1, -(e.clientY / stage.height) * 2 + 1);
    tilt.copy(ndc);
    if (touch && !pressed) return (lens.visible = false);

    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(fabric)[0];
    lens.visible = !!hit;
    canvas.style.cursor = hit ? 'none' : '';
    if (!hit) return;

    // Lift the lens above a finger so it is not hidden under it.
    const lift = touch ? lensRadius * 1.2 : 0;
    lens.position.set(e.clientX - stage.width / 2, stage.height / 2 - e.clientY + lift, 0);
    lensMaterial.uniforms.center.value.copy(hit.uv);

    // Lens diameter in UV units: on-screen fabric size in pixels, divided by the zoom.
    const pixelsPerUnit = stage.height / (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const diameter = lensRadius * 2;
    lensMaterial.uniforms.span.value.set(
      diameter / (zoom * size.w * pixelsPerUnit),
      diameter / (zoom * size.h * pixelsPerUnit),
    );
  }

  const onMove = (e) => updateLens(e);
  const onDown = (e) => {
    pressed = true;
    canvas.setPointerCapture(e.pointerId);
    updateLens(e);
  };
  const onUp = (e) => {
    pressed = false;
    if (e.pointerType !== 'mouse') lens.visible = false;
  };
  const onLeave = () => {
    lens.visible = false;
    tilt.set(0, 0);
  };
  let lastEvent = null;
  const onWheel = (e) => {
    e.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 1.5, 8);
    lastEvent && updateLens(lastEvent);
  };
  const remember = (e) => (lastEvent = e);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointermove', remember);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ---- every frame ----
  stage.start(() => {
    material.opacity = Math.min(1, Math.max(0, (performance.now() - fadeStart) / FADE_MS));
    // Tilt a little towards the pointer for a sense of depth.
    fabric.rotation.y += (tilt.x * 0.12 - fabric.rotation.y) * 0.08;
    fabric.rotation.x += (-tilt.y * 0.08 - fabric.rotation.x) * 0.08;
  });

  show(0);

  return {
    next: () => show(wrap(index + 1)),
    prev: () => show(wrap(index - 1)),
    destroy() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointermove', remember);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.style.cursor = '';
      lens.geometry.dispose();
      lensMaterial.dispose();
      store.dispose();
      stage.dispose();
    },
  };
}
