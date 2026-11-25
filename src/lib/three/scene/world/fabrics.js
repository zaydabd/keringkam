// Which fabric photo a fabric name means (the list in textures.js): used by the house's fabrics
// and the stage's fabric views.

import { fabrics } from '../../textures.js';

/** The index of the fabric photo named `name` in textures.js, or -1. */
export const fabricIndex = (name) => fabrics.findIndex((f) => f.name === name);
