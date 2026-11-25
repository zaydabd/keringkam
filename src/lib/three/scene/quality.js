// Graphics settings: every number that trades picture for speed, in one place, and the presets the
// settings panel offers (components/Interior.svelte). createScene takes the settings at load
// and setQuality changes them while the page runs; only the texture detail needs a reload (the
// painted textures are made at load). The debug query switches (?dpr, ?maxpx, ?aores, ?aosamples,
// ?aa, ?paint, ?fabrics) still win over these. Measured costs: research/INTERIOR-NOTES.md, pass p1.

import { sceneOptions } from '../../utils/urlOptions.js';

/**
 * The resolution: the most pixels a frame draws, whatever the screen, like a game's render
 * resolution. A screen with fewer pixels is drawn at its own resolution; one with more (a 2x
 * laptop, a 1440p or 4K monitor) is drawn at about this many and stretched to fill it. Native draws
 * every device pixel (up to MAX_PIXEL_RATIO).
 */
export const RESOLUTIONS = {
  '720p': { label: '720p', pixels: 1280 * 720 },
  '1080p': { label: '1080p', pixels: 1920 * 1080 },
  '1440p': { label: '1440p', pixels: 2560 * 1440 },
  native: { label: 'Native', pixels: 0 },
};

/** Device pixels a CSS pixel, at most (3x phones) and at least (the smallest budget on a big screen). */
export const MAX_PIXEL_RATIO = 3;
export const MIN_PIXEL_RATIO = 0.5;

/**
 * Stepping the resolution down while frames come slowly (scene/index.js paceResolution): measured on
 * frames where the view moved, `frames` of them with a median over `slowMs` step to the next ratio
 * in `steps`; an interval over `hiddenMs` is a hidden tab, not a pace.
 */
export const PACE = { steps: [2], frames: 60, slowMs: 24, hiddenMs: 1000 };

/**
 * Ambient occlusion (ao.js): the AO buffer's size against the drawing buffer, at most one AO pixel
 * a CSS pixel. The AO is worked out again only on frames where the view moves; `moving` is the
 * size on those frames where it differs: auto works it out at half a side while the view moves
 * and at full size on the first frame it holds still, so the still picture is full's.
 */
export const AO = { scale: { off: 0, half: 0.5, full: 1, auto: 1 }, moving: { auto: 0.5 }, samples: 24, denoiseRadius: 10 };

/** Shadow map sizes per light (texels a side). At high, the sky's map is about 2.3 mm a texel over the furniture. */
export const SHADOWS = {
  low: { sun: 1024, sky: 1024, side: 512 },
  high: { sun: 2048, sky: 2048, side: 1024 },
};

/**
 * Texture detail: the room's painted textures at twice their size on a drawing buffer of
 * `paintDetailFrom` device pixels a CSS pixel or more, and the fabrics' 2048 px photos after their
 * 512 px previews (`fabrics: 'full'`).
 */
export const TEXTURES = {
  low: { paintDetailFrom: Infinity, anisotropy: 4, fabrics: 'preview' },
  high: { paintDetailFrom: 1.5, anisotropy: 4, fabrics: 'full' },
};

/**
 * Outlines (the ink pass, toon.js): factors on the theme's ink (themes/interior.js ink). Full is
 * the drawing as designed. Light draws no lines on the view outside and the creases (lines where a
 * surface turns) at half strength: those two made most of the lines' movement as the view turns
 * (window -32%, near floor -16%, measured, research/INTERIOR-NOTES.md pass o1); the silhouettes,
 * plank seams, the hand's wobble and pressure stay (taking those away did not make the lines
 * steadier). Off draws no lines and skips the edge buffer, a second draw of the room; the paper
 * grain and the cool shadows stay.
 */
export const OUTLINES = {
  off: null,
  light: { farInk: 0, creases: 0.5, seams: 1, wobble: 1, pressure: 1 },
  full: { farInk: 1, creases: 1, seams: 1, wobble: 1, pressure: 1 },
};

/** The settings the panel shows, in order, with their choices. */
export const OPTIONS = {
  resolution: { label: 'Resolution', values: Object.fromEntries(Object.entries(RESOLUTIONS).map(([k, v]) => [k, v.label])) },
  ao: { label: 'Ambient occlusion', values: { off: 'Off', half: 'Half', auto: 'Auto', full: 'Full' } },
  shadows: { label: 'Shadows', values: { low: 'Low', high: 'High' } },
  outlines: { label: 'Outlines', values: { off: 'Off', light: 'Light', full: 'Full' } },
  aa: { label: 'Anti-aliasing', values: { off: 'Off', auto: 'Auto', on: 'SMAA' } },
  textures: { label: 'Texture detail', values: { low: 'Low', high: 'High' }, reload: true },
};

/**
 * The presets. High is the picture as designed, at up to 1080p, with the lighter outlines and the
 * AO at auto (full when the view holds still, half while it moves). Low has
 * no outlines (the edge buffer is skipped). anti-aliasing auto: SMAA below 2
 * device pixels a CSS pixel, off at 2 or more (the lines are 2 pixels wide there, and SMAA took 8%
 * of the sharpness at 2x, measured).
 */
export const PRESETS = {
  low: { label: 'Low', resolution: '720p', ao: 'off', shadows: 'low', outlines: 'off', aa: 'auto', textures: 'low' },
  medium: { label: 'Medium', resolution: '1080p', ao: 'half', shadows: 'high', outlines: 'light', aa: 'auto', textures: 'high' },
  high: { label: 'High', resolution: '1080p', ao: 'auto', shadows: 'high', outlines: 'light', aa: 'auto', textures: 'high' },
};
export const DEFAULT_PRESET = 'high';

const KEYS = Object.keys(OPTIONS);
const STORE = 'keringkam.graphics';

/** The preset these settings match, or 'custom'. */
export function presetOf(settings) {
  return Object.keys(PRESETS).find((p) => KEYS.every((k) => PRESETS[p][k] === settings[k])) ?? 'custom';
}

/** The settings of a preset (a copy without its label). */
export function presetSettings(name) {
  const p = PRESETS[name] ?? PRESETS[DEFAULT_PRESET];
  return Object.fromEntries(KEYS.map((k) => [k, p[k]]));
}

/**
 * Fills in and checks settings: unknown keys are dropped. A missing or bad value comes from the
 * preset the other settings match (so settings saved before a setting was added keep their
 * preset), else from the default preset.
 */
export function normalise(settings = {}) {
  const given = KEYS.filter((k) => settings[k] in OPTIONS[k].values);
  const order = [DEFAULT_PRESET, ...Object.keys(PRESETS).filter((p) => p !== DEFAULT_PRESET)];
  const base = presetSettings(order.find((p) => given.every((k) => PRESETS[p][k] === settings[k])) ?? DEFAULT_PRESET);
  for (const k of given) base[k] = settings[k];
  return base;
}

/**
 * The saved settings (this browser only), or the default preset. Storage can be blocked: then the
 * default. ?quality=low|medium|high picks a preset for this page load without saving it (captures).
 */
export function loadQuality() {
  const asked = sceneOptions().get('quality');
  if (asked in PRESETS) return presetSettings(asked);
  try {
    return normalise(JSON.parse(localStorage.getItem(STORE) ?? '{}'));
  } catch {
    return normalise();
  }
}

export function saveQuality(settings) {
  try {
    localStorage.setItem(STORE, JSON.stringify(normalise(settings)));
  } catch {
    // storage blocked (a private window): the settings last until the page closes
  }
}

/** The settings panel's "Show FPS" switch: kept apart from the presets, in this browser. Off unless saved on. */
const SHOW_FPS = 'keringkam.showFps';
export function loadShowFps() {
  try {
    return localStorage.getItem(SHOW_FPS) === '1';
  } catch {
    return false;
  }
}

export function saveShowFps(on) {
  try {
    localStorage.setItem(SHOW_FPS, on ? '1' : '0');
  } catch {
    // storage blocked: the switch lasts until the page closes
  }
}

/** The "Walk" button (WASD and the arrow keys move the camera): off unless saved on, in this browser. */
const WALK = 'keringkam.walk';
export function loadWalk() {
  try {
    return localStorage.getItem(WALK) === '1';
  } catch {
    return false;
  }
}

export function saveWalk(on) {
  try {
    localStorage.setItem(WALK, on ? '1' : '0');
  } catch {
    // storage blocked: the button lasts until the page closes
  }
}
