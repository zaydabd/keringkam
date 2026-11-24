// Branch studies for the far-bank trees, after reference photos of Kuching trees supplied by the
// user (not in the repo). Bare skeletons to pick from before any leaves are designed; the
// foliage here is only a placeholder. Preview: #/vegetation?plant=treeStudy&variant=kapokOld&bare
//
// Sourced shape facts:
//   - Kapok (Ceiba pentandra): straight erect trunk, plank buttresses up to 3(-8) m high, branches
//     horizontal in tiers, mostly whorls of 3 (4–5 in some sources), a pagoda-like crown.
//     https://nparks.gov.sg/gardens-parks-and-nature/heritage-trees/ht-2008-171
//     https://apps.worldagroforestry.org/treedb2/speciesprofile.php/docs/policydocument.pdf?Spid=501
//     Kuching's kapok on Padang Merdeka is a listed heritage tree:
//     https://www.lonelyplanet.com/malaysia/malaysian-borneo-sarawak/kuching/attractions/kapok-tree/a/poi-sig/1333763/356979
//   - Rain tree (Samanea saman): see rainTree.js.
//   - Trumpet tree (Tabebuia rosea): broadly conical, crown sparse and irregular when young,
//     denser and rounded when mature; pink and white forms planted in Malaysia.
//     https://nparks.gov.sg/activities/family-time-with-nature/recommended-activities/know-10-trees/9-trumpet-tree
//     https://www.frim.gov.my/quicklinks/pink-blossoms-of-tabebuia-pentaphylla/
// Every number below is a design choice (guess), set by eye against the user's photos.

import * as THREE from 'three';
import { createTree } from '../tree.js';

const barkOf = (light, dark, base = 0.4) => {
  const L = new THREE.Color(light);
  const D = new THREE.Color(dark);
  const out = new THREE.Color();
  return (v, u, t, level) => {
    const drift = 0.5 + 0.5 * Math.sin(v * 0.8 + level * 1.3) * Math.sin(v * 0.33 + 2.1);
    out.copy(D).lerp(L, 0.6 + 0.3 * drift);
    if (level === 0) out.lerp(D, base * Math.max(0, 1 - v / 2));
    return out;
  };
};

const FOLIAGE = { radius: 1.1, merge: 1.1, density: 1.0, card: 0.35, mask: { curve: 0.04 }, tones: ['#223b1f', '#4c7a33', '#a8c962'] };

export const TREE_STUDIES = {
  // Photo 1: the old kapok, huge pale trunk on wide plank buttresses, a few long horizontal tiers.
  kapokOld: {
    bark: barkOf('#c9c2b3', '#7c7466', 0.5),
    barkPattern: 'flakes',
    levels: [
      { length: [17, 18], radius: 0.95, tip: 0.22, sections: 18, radial: 16, gnarl: 0.015, up: 0.05, lean: 0.02, base: { flare: 0.9, height: 3.2, lobes: 6, lobe: 0.75 } },
      { count: 15, whorl: 3, emerge: [0.38, 0.97], angle: [1.4, 1.62], length: [0.5, 0.62], radius: 0.4, tip: 0.05, sections: 12, radial: 8, gnarl: 0.04, up: 0.025, shorten: 0.5, kink: 0.18, kinkRate: 0.25, flare: 0.5 },
      { count: 6, emerge: [0.2, 1], angle: [0.6, 1.0], length: [0.3, 0.45], radius: 0.5, tip: 0.015, sections: 5, radial: 4, gnarl: 0.12, up: 0.06, shorten: 0.3 },
      { count: 4, emerge: [0.3, 1], angle: [0.6, 1.0], length: [0.4, 0.6], radius: 0.6, tip: 0.005, sections: 3, radial: 3, gnarl: 0.2, up: 0.05, shorten: 0.3 },
    ],
    foliage: FOLIAGE,
  },
  // Photo 2/3: a taller kapok, tiers closer together, limbs turning up a little at their ends.
  kapokTall: {
    bark: barkOf('#c2bcae', '#6f685c', 0.5),
    barkPattern: 'flakes',
    levels: [
      { length: [19, 20], radius: 0.8, tip: 0.18, sections: 20, radial: 14, gnarl: 0.02, up: 0.05, lean: 0.03, base: { flare: 0.75, height: 2.6, lobes: 5, lobe: 0.6 } },
      { count: 18, whorl: 3, emerge: [0.45, 0.97], angle: [1.25, 1.45], length: [0.36, 0.48], radius: 0.38, tip: 0.04, sections: 10, radial: 7, gnarl: 0.05, up: 0.06, shorten: 0.45, kink: 0.22, kinkRate: 0.3, flare: 0.5, elbow: 0.15 },
      { count: 6, emerge: [0.2, 1], angle: [0.5, 0.9], length: [0.3, 0.45], radius: 0.5, tip: 0.015, sections: 5, radial: 4, gnarl: 0.12, up: 0.08, shorten: 0.3 },
      { count: 4, emerge: [0.3, 1], angle: [0.6, 1.0], length: [0.4, 0.6], radius: 0.6, tip: 0.005, sections: 3, radial: 3, gnarl: 0.2, up: 0.05, shorten: 0.3 },
    ],
    foliage: FOLIAGE,
  },
  // Photo 4: roadside rain trees, a leaning trunk forking into a few crooked leaders that arch out.
  rainRoadside: {
    bark: barkOf('#6e675d', '#38332d', 0.3),
    barkPattern: 'plates',
    levels: [
      { length: [3.6, 4.2], radius: 0.5, tip: 0.36, sections: 8, radial: 14, gnarl: 0.04, up: 0.02, lean: 0.25, base: { flare: 0.4, height: 1.0, lobes: 4, lobe: 0.2 }, dome: true },
      { count: 3, emerge: [0.75, 1], angle: [0.65, 0.95], length: [2.2, 2.6], radius: 0.72, tip: 0.07, sections: 12, radial: 10, gnarl: 0.05, up: -0.012, shorten: 0.1, kink: 0.35, kinkRate: 0.3, flare: 0.45 },
      { count: 7, emerge: [0.25, 1], angle: [0.7, 1.15], length: [0.4, 0.55], radius: 0.55, tip: 0.02, sections: 7, radial: 5, gnarl: 0.1, up: 0.0, shorten: 0.4, kink: 0.3, kinkRate: 0.3 },
      { count: 5, emerge: [0.25, 1], angle: [0.6, 1.0], length: [0.35, 0.55], radius: 0.6, tip: 0.006, sections: 4, radial: 3, gnarl: 0.25, up: 0.04, shorten: 0.3 },
    ],
    foliage: FOLIAGE,
  },
  // Photo 5: trumpet tree, a short trunk forking into upright leaders, a tall rounded crown.
  tabebuia: {
    bark: barkOf('#8a7f70', '#4e463c', 0.3),
    barkPattern: 'ridges',
    levels: [
      { length: [2.6, 3.0], radius: 0.24, tip: 0.17, sections: 6, radial: 12, gnarl: 0.04, up: 0.05, lean: 0.06, base: { flare: 0.35, height: 0.6, lobes: 0, lobe: 0 }, dome: true },
      { count: 4, emerge: [0.7, 1], angle: [0.3, 0.6], length: [2.4, 2.9], radius: 0.72, tip: 0.03, sections: 9, radial: 8, gnarl: 0.07, up: 0.05, shorten: 0.1, kink: 0.2, kinkRate: 0.3, flare: 0.45 },
      { count: 7, emerge: [0.2, 1], angle: [0.45, 0.85], length: [0.35, 0.5], radius: 0.55, tip: 0.012, sections: 6, radial: 4, gnarl: 0.12, up: 0.08, shorten: 0.45 },
      { count: 4, emerge: [0.3, 1], angle: [0.5, 0.9], length: [0.4, 0.6], radius: 0.6, tip: 0.004, sections: 3, radial: 3, gnarl: 0.2, up: 0.06, shorten: 0.3 },
    ],
    foliage: FOLIAGE,
  },
};

export const plant = {
  id: 'treeStudy',
  label: 'Tree study (branches)',
  create: ({ seed = 1, variant = 'kapokOld' } = {}) => {
    const species = TREE_STUDIES[variant] ?? TREE_STUDIES.kapokOld;
    const tree = createTree({ seed, kind: `study ${variant}`, species });
    tree.stats.lod = 'near';
    return tree;
  },
  target: [0, 7, 0],
  distance: 40,
  background: '#9fb6c8',
};
