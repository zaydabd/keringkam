// Far level of detail for the Kuching trees (plants/kuchingTree.js): the same skeleton as the near
// tree (tree.js growBranches), as trunk + main limbs only, and the crown as a few squashed
// low-poly blobs with the same cel tones. 2 draw calls (bark, crown).

import * as THREE from 'three';
import { clumpCentres, growBranches, shapeBranches, writeBranches } from './tree.js';
import { createMeshWriter } from './tube.js';
import { CEL_RAMP_GLSL, FOLIAGE_SUN, toneUniforms } from './cel-foliage.js';
import { createBarkMaterial } from './bark.js';
import { mulberry32, range } from './rng.js';

/** Cel material for the far crown blobs: per-vertex normal → the same 3-tone ramp, times AO, with flecks. */
function createBlobMaterial(tones) {
  return new THREE.ShaderMaterial({
    uniforms: toneUniforms(tones),
    vertexShader: /* glsl */ `
      attribute float ao;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vAo;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vAo = ao;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      ${CEL_RAMP_GLSL}
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vAo;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        // Leaf flecks: a value per ~0.4 m cell (about one near leaf card) nudges the shade, so the
        // ramp bands break up into flecks the way the near cards do. Cell size and amount: by eye.
        // Two grids at odd angles, averaged, so the cells read as irregular patches, not squares.
        const mat3 A = mat3(0.80, 0.36, -0.48, -0.48, 0.86, -0.16, 0.36, 0.36, 0.86);
        const mat3 B = mat3(0.36, -0.80, 0.48, 0.86, 0.48, 0.16, -0.36, 0.36, 0.86);
        float fleck = 0.6 * hash(floor(A * vWorld / 0.38)) + 0.4 * hash(floor(B * vWorld / 0.29) + 7.0) - 0.5;
        float shade = max(dot(normalize(vNormal), L), 0.0) * vAo + fleck * 0.38;
        gl_FragColor = vec4(celRamp(shade), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export function createFar(seed, species) {
  // The same growth as near (tree.js), so the limbs match; no extra flare rings.
  const all = growBranches(mulberry32(seed), species);
  const centres = clumpCentres(all, species);
  shapeBranches(all, species, { detail: 0 });
  const F = species.foliage;
  const stems = createMeshWriter();
  // Trunk and main limbs only, every other section, fewer sides.
  const branches = all
    .filter((b) => b.level <= 1)
    .map((b) => {
      const keep = b.points.map((_, i) => i).filter((i) => i % 2 === 0 || i === b.points.length - 1);
      return { ...b, points: keep.map((i) => b.points[i]), radii: keep.map((i) => b.radii[i]) };
    });
  const stemTris = writeBranches(stems, branches, species, { radial: (level) => (level === 0 ? 7 : 5) });

  // Greedy clusters of the clump centres; each cluster is one blob that covers its clumps.
  const R = F.radius * 1.3;
  const clusters = [];
  for (const c of centres) {
    const near = clusters.find((k) => k.seed.distanceTo(c) < R);
    if (near) near.members.push(c);
    else clusters.push({ seed: c, members: [c] });
  }
  const crown = new THREE.Box3().setFromPoints(centres).expandByScalar(F.radius);
  const crownCentre = crown.getCenter(new THREE.Vector3());
  const half = crown.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const rand = mulberry32(seed ^ 0x5a17);
  const ico = new THREE.IcosahedronGeometry(1, 1);
  const icoPos = ico.getAttribute('position');
  const positions = [];
  const normals = [];
  const aos = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const q = new THREE.Vector3();
  const cn = new THREE.Vector3();
  for (const k of clusters) {
    const c = new THREE.Vector3();
    k.members.forEach((m) => c.add(m));
    c.divideScalar(k.members.length);
    let spread = 0;
    for (const m of k.members) spread = Math.max(spread, m.distanceTo(c));
    const r = spread * 0.55 + F.radius * 0.95;
    const sx = r * range(rand, 0.95, 1.1);
    const sy = r * 0.95;
    const ph = range(rand, 0, Math.PI * 2);
    const sz = r * range(rand, 0.95, 1.1);
    cn.copy(c).sub(crownCentre).divide(half);
    const depth = Math.min(1, cn.length());
    const away = cn.lengthSq() > 1e-6 ? cn.clone().normalize().dot(FOLIAGE_SUN) * 0.5 + 0.5 : 0.5;
    // 0.78: the near cards are a little darker overall (tint, leaf-stroke tone, inner cards); by eye.
    const ao = (0.6 + 0.25 * depth + 0.15 * away) * 0.78;
    for (let i = 0; i < icoPos.count; i++) {
      n.fromBufferAttribute(icoPos, i);
      // Lumpy surface: a smooth function of direction (shared corners move together), phase per blob.
      const lump = 1 + 0.13 * Math.sin(n.x * 5.1 + ph) * Math.sin(n.y * 4.3 + ph * 1.7) * Math.sin(n.z * 4.7 + ph * 0.6);
      p.set(c.x + n.x * sx * lump, c.y + n.y * sy * lump, c.z + n.z * sz * lump);
      // Blob normal blended with the crown normal, as the near cards do.
      q.copy(p).sub(crownCentre).divide(half).normalize();
      n.set(n.x / sx, n.y / sy, n.z / sz).normalize().multiplyScalar(0.75).addScaledVector(q, 0.25).normalize();
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      aos.push(ao);
    }
  }
  ico.dispose();

  const group = new THREE.Group();
  group.name = 'tree (far)';
  const stemGeometry = stems.toGeometry();
  const stemMaterial = createBarkMaterial(species.barkPattern);
  const stemMesh = new THREE.Mesh(stemGeometry, stemMaterial);
  stemMesh.name = 'branches';
  group.add(stemMesh);
  const blobGeometry = new THREE.BufferGeometry();
  blobGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  blobGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  blobGeometry.setAttribute('ao', new THREE.Float32BufferAttribute(aos, 1));
  blobGeometry.computeBoundingSphere();
  const blobMaterial = createBlobMaterial(F.tones);
  const blobMesh = new THREE.Mesh(blobGeometry, blobMaterial);
  blobMesh.name = 'crown';
  group.add(blobMesh);

  const blobTris = positions.length / 9;
  const stats = {
    seed,
    kind: 'tree',
    lod: 'far',
    leaves: 0,
    blobs: clusters.length,
    triangles: { stems: stemTris, leaves: blobTris, total: stemTris + blobTris },
    bounds: new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)),
  };
  return {
    group,
    stats,
    dispose() {
      stemGeometry.dispose();
      stemMaterial.dispose();
      blobGeometry.dispose();
      blobMaterial.dispose();
    },
  };
}
