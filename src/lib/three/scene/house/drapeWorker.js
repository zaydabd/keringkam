// Settles one fabric (drape.js) off the main thread and sends its grid back.
import { drape } from './drape.js';

self.onmessage = ({ data: place }) => {
  const result = drape(place);
  self.postMessage(result, [result.position.buffer]);
};
