// Shows every fabric picture as a plane on a curved wall. Drag to orbit, scroll to zoom.
//
// Loading: planes appear at once with the right shape, then a 512px preview
// texture fills each one, then the 2048px texture replaces it.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fabrics, createKTX2Loader } from './textures.js';

const PLANE_HEIGHT = 1; // world units; width follows each image's aspect ratio
const GAP = 0.12;
const ROW_GAP = 0.2;
const RADIUS = 6; // radius of the curved wall

let renderer, scene, camera, controls, loader, resizeObserver;
let cancelled = false;
let userMoved = false;
const wallSize = { width: 0, height: 0 };
const disposables = new Set();

export function init(canvas) {
  cancelled = false;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  controls = new OrbitControls(camera, canvas);
  controls.addEventListener('change', render);
  controls.addEventListener('start', () => (userMoved = true));

  loader = createKTX2Loader(renderer);

  const meshes = buildWall();

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  loadTextures(meshes);
}

export function destroy() {
  cancelled = true;
  resizeObserver?.disconnect();
  controls?.dispose();
  for (const d of disposables) d.dispose();
  disposables.clear();
  loader?.dispose();
  renderer?.dispose();
}

function render() {
  renderer.render(scene, camera);
}

function resize() {
  const canvas = renderer.domElement;
  const { clientWidth: w, clientHeight: h } = canvas;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (!userMoved) fitCamera();
  render();
}

/** Moves the camera back until the whole wall fits on screen. */
function fitCamera() {
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const distance = 1.3 * Math.max(wallSize.height / 2 / tan, wallSize.width / 2 / (tan * camera.aspect));
  camera.position.set(0, 0, distance);
  controls.target.set(0, 0, 0);
  controls.update();
}

/** One row per fabric group, each row bent around a circle so the wall wraps the viewer. */
function buildWall() {
  const geometry = new THREE.PlaneGeometry(1, 1);
  disposables.add(geometry);

  const groups = [...new Set(fabrics.map((f) => f.group))];
  const meshes = [];

  groups.forEach((group, row) => {
    const items = fabrics.filter((f) => f.group === group);
    const widths = items.map((f) => (PLANE_HEIGHT * f.width) / f.height);
    const rowLength = widths.reduce((a, b) => a + b, 0) + GAP * (items.length - 1);
    const y = ((groups.length - 1) / 2 - row) * (PLANE_HEIGHT + ROW_GAP);

    wallSize.width = Math.max(wallSize.width, rowLength);
    let x = -rowLength / 2;
    items.forEach((fabric, i) => {
      const angle = (x + widths[i] / 2) / RADIUS; // arc length → angle
      x += widths[i] + GAP;

      const material = new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true });
      disposables.add(material);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(widths[i], PLANE_HEIGHT, 1);
      mesh.position.set(Math.sin(angle) * RADIUS, y, RADIUS - Math.cos(angle) * RADIUS);
      mesh.rotation.y = -angle; // face the centre of the circle
      scene.add(mesh);
      meshes.push({ mesh, fabric });
    });
  });

  wallSize.height = groups.length * PLANE_HEIGHT + (groups.length - 1) * ROW_GAP;
  return meshes;
}

async function loadTextures(meshes) {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  const apply = (mesh, texture) => {
    if (cancelled) return texture.dispose();
    texture.anisotropy = anisotropy;
    const old = mesh.material.map;
    mesh.material.map = texture;
    mesh.material.color.set(0xffffff);
    mesh.material.needsUpdate = true;
    disposables.add(texture);
    if (old) {
      old.dispose();
      disposables.delete(old);
    }
    render();
  };

  const load = (url) => loader.loadAsync(url).catch((err) => console.error(url, err));

  // 1. All small previews in parallel: the wall fills in within a moment.
  const previews = meshes.map(async ({ mesh, fabric }) => {
    const tex = await load(fabric.previewUrl);
    if (tex && !mesh.material.map) apply(mesh, tex);
  });
  await Promise.all(previews);
  if (cancelled) return;

  // 2. Full-size textures, a few at a time so the previews are never starved.
  const queue = [...meshes];
  const worker = async () => {
    while (queue.length && !cancelled) {
      const { mesh, fabric } = queue.shift();
      const tex = await load(fabric.fullUrl);
      if (tex) apply(mesh, tex);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}
