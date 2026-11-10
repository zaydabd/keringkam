// The showcase styles. Each module exports create(canvas) → { next, prev, destroy }.
// They are loaded on demand so each page only downloads the code it uses.

export const styles = [
  {
    id: 'cloth',
    name: 'Hanging cloth',
    description: 'One piece at a time, moving gently like real fabric. Drag to turn it around.',
    load: () => import('./cloth.js'),
  },
  {
    id: 'carousel',
    name: 'Carousel',
    description: 'Every piece on a turning ring. Drag to spin, tap a piece to bring it forward.',
    load: () => import('./carousel.js'),
  },
  {
    id: 'museum',
    name: 'Museum',
    description: 'Framed pieces in a dark gallery corridor, lit one by one as you walk.',
    load: () => import('./museum.js'),
  },
  {
    id: 'journey',
    name: 'Journey',
    description: 'Scroll to fly forward through the pieces floating in space.',
    load: () => import('./journey.js'),
  },
  {
    id: 'loupe',
    name: 'Detail loupe',
    description: 'A magnifying glass for the embroidery. Scroll to change the zoom.',
    load: () => import('./loupe.js'),
  },
];
