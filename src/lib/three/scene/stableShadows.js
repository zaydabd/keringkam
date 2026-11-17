import * as THREE from 'three';

// Soft shadows that stay on the world when the view turns.
// three.js (r187) blurs PCF shadows with 5 taps on a Vogel disk, turned per pixel by
// interleaved gradient noise of gl_FragCoord: a dither fixed to the screen. Every shadow edge
// (the window light on the floor, the furniture's shadows) shimmered as the room moved under it.
// Here the turn comes from the shadow-map texel instead, which is fixed in the world, so a point
// on the floor keeps its dither as the camera turns. Patched once, before any material compiles.
const FROM = 'interleavedGradientNoise( gl_FragCoord.xy )';
const TO = 'interleavedGradientNoise( floor( shadowCoord.xy * shadowMapSize ) )';

const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
if (chunk.includes(FROM)) THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replaceAll(FROM, TO);
else if (!chunk.includes(TO)) console.warn('stableShadows: the shadow chunk has changed (three.js update?); shadow edges stay screen-dithered');
