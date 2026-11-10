// The showcase styles. Each module exports create(canvas, { root, back, front }) → { next, prev, destroy }.
// group 'studies' are the current styles; 'earlier' are the first experiments.
// They are loaded on demand so each page only downloads the code it uses.

export const styles = [
  {
    id: 'specimen',
    group: 'studies',
    name: 'Specimen',
    description: 'A specimen plate: construction lines draw around each piece and two tracking boxes feed zoomed insets of its most detailed areas.',
    after: 'LILIUM grid, tracking boxes, pixel blocks',
    load: () => import('./specimen.js'),
  },
  {
    id: 'anatomy',
    group: 'studies',
    name: 'Anatomy',
    description: 'The five most detailed areas lift out of each piece into a labelled strip; the collection name sets with the piece as one letter.',
    after: 'LILIUM anatomy strip, kinetic type',
    load: () => import('./anatomy.js'),
  },
  {
    id: 'dither',
    group: 'studies',
    name: 'Dither',
    description: 'Each piece floats on a dithered field. Slide from day to golden hour to night, tap for ripples, hold for true colour.',
    after: 'Sinking into dither',
    load: () => import('./dither.js'),
  },
  {
    id: 'grow',
    group: 'studies',
    name: 'Grow',
    description: 'Each piece grows outward from its densest motifs along a stitched edge. Pick a palette and a motion.',
    after: 'type-garden, smear frames, loops',
    load: () => import('./grow.js'),
  },
  {
    id: 'trace',
    group: 'studies',
    name: 'Trace',
    description: 'A glowing line trace of every edge on a dark grid. A scan line and a lens reveal the true fabric underneath.',
    after: 'LILIUM geometric trace, x-ray',
    load: () => import('./trace.js'),
  },
  {
    id: 'cloth',
    group: 'earlier',
    name: 'Hanging cloth',
    description: 'One piece at a time, moving gently like real fabric. Drag to turn it around.',
    load: () => import('./cloth.js'),
  },
  {
    id: 'carousel',
    group: 'earlier',
    name: 'Carousel',
    description: 'Every piece on a turning ring. Drag to spin, tap a piece to bring it forward.',
    load: () => import('./carousel.js'),
  },
  {
    id: 'museum',
    group: 'earlier',
    name: 'Museum',
    description: 'Framed pieces in a dark gallery corridor, lit one by one as you walk.',
    load: () => import('./museum.js'),
  },
  {
    id: 'journey',
    group: 'earlier',
    name: 'Journey',
    description: 'Scroll to fly forward through the pieces floating in space.',
    load: () => import('./journey.js'),
  },
  {
    id: 'loupe',
    group: 'earlier',
    name: 'Detail loupe',
    description: 'A magnifying glass for the embroidery. Scroll to change the zoom.',
    load: () => import('./loupe.js'),
  },
];
