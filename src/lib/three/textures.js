import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import manifest from '../../assets/textures/fabrics-ktx2/manifest.json';

// Hashed URLs for every generated .ktx2 file (made by `npm run textures`).
const urls = import.meta.glob('../../assets/textures/fabrics-ktx2/**/*.ktx2', {
  query: '?url',
  import: 'default',
  eager: true,
});

const urlFor = (group, name, suffix) =>
  urls[`../../assets/textures/fabrics-ktx2/${group}/${name}${suffix}.ktx2`];

/** Every fabric picture with its pixel size and the URLs of its preview and full texture. */
export const fabrics = manifest.map((item) => ({
  ...item,
  previewUrl: urlFor(item.group, item.name, '.preview'),
  fullUrl: urlFor(item.group, item.name, ''),
}));

/** Creates a KTX2 loader. The Basis transcoder is copied to <base>/basis/ by scripts/copy-basis.mjs. */
export function createKTX2Loader(renderer) {
  return new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(renderer);
}
