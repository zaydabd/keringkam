// The themes the scene can be shown in, and the one in use. ?theme=<name> picks it when the page
// loads (switching reloads the page: the painted textures and materials are made once, at load).
// Every module imports its theme from here, never from a theme file, so all of them follow the
// pick. To add a theme: make its interior and outside files (copies of interior.js and outside.js
// to start from), and list it in THEMES.

import { INTERIOR_THEME as ORIGINAL_INTERIOR } from './interior.js';
import { INTERIOR_THEME as DETAILED_INTERIOR } from './interiorDetailed.js';
import { OUTSIDE_THEME as ORIGINAL_OUTSIDE } from './outside.js';
import { CLAY } from './clay.js';
import { sceneOptions } from '../../../utils/urlOptions.js';

/**
 * Each theme: its name in the picker, the room's look, the view outside's look, and `clay` (null,
 * or the clay render's settings: the look switched off, see clay.js).
 */
export const THEMES = {
  original: { label: 'Original', interior: ORIGINAL_INTERIOR, outside: ORIGINAL_OUTSIDE, clay: null },
  detailed: { label: 'Watercolour detail', interior: DETAILED_INTERIOR, outside: ORIGINAL_OUTSIDE, clay: null },
  clay: { label: 'Clay (blank)', interior: ORIGINAL_INTERIOR, outside: ORIGINAL_OUTSIDE, clay: CLAY },
};

export const DEFAULT_THEME = 'original';

const ALIASES = { off: 'clay' }; // ?theme=off, the earlier "Theme off" links

/** The theme a URL's query string asks for: a name in THEMES (or an alias), else the default. */
export function themeFromSearch(search) {
  const asked = new URLSearchParams(search).get('theme');
  const name = ALIASES[asked] ?? asked;
  return Object.hasOwn(THEMES, name) ? name : DEFAULT_THEME;
}

// Picked once, when the page loads (no window under Node: tools that import the scene modules
// get the default).
export const THEME_NAME = themeFromSearch(sceneOptions().toString());

const active = THEMES[THEME_NAME];
export const INTERIOR_THEME = active.interior;
export const OUTSIDE_THEME = active.outside;
export const CLAY_LOOK = active.clay;
