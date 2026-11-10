// Helpers for the HTML/SVG layer drawn on top of the canvas (labels, construction lines).

const SVG = 'http://www.w3.org/2000/svg';

/** Creates an element with a class and optional text, appended to parent. */
export function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/**
 * Full-screen SVG for line work. Every shape uses pathLength="1" so it can be drawn in
 * by animating stroke-dashoffset from 1 to 0 (see draw()).
 */
export function createSvg(parent) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'kk-svg');
  parent.appendChild(svg);

  const make = (tag, attrs) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.setAttribute('pathLength', '1');
    svg.appendChild(node);
    return node;
  };

  return {
    svg,
    line: (x1, y1, x2, y2, cls = '') => make('line', { x1, y1, x2, y2, class: cls }),
    circle: (cx, cy, r, cls = '') => make('circle', { cx, cy, r, class: cls }),
    path: (d, cls = '') => make('path', { d, class: cls }),
    rect: (x, y, w, h, cls = '') => make('rect', { x, y, width: w, height: h, class: cls }),
    clear: () => svg.replaceChildren(),
    remove: () => svg.remove(),
  };
}

/** Animates line work in: each shape draws itself, staggered. */
export function draw(nodes, { duration = 700, stagger = 60, delay = 0 } = {}) {
  nodes.forEach((node, k) => {
    node.style.strokeDasharray = '1';
    node.style.strokeDashoffset = '1';
    node.getBoundingClientRect(); // commit the start state before transitioning
    node.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.2,.7,.2,1) ${delay + k * stagger}ms`;
    node.style.strokeDashoffset = '0';
  });
}

/** Splits text into letter spans that rise in one after another (see .kk-rise in app.css). */
export function riseText(node, text, { delay = 0, stagger = 35 } = {}) {
  node.replaceChildren();
  [...text].forEach((ch, k) => {
    const span = el('span', 'kk-rise', node, ch === ' ' ? ' ' : ch);
    span.style.animationDelay = `${delay + k * stagger}ms`;
  });
}

/**
 * Shrinks a single-line text node until it fits maxWidth() pixels, and re-checks whenever the
 * node changes size (e.g. when the web font finishes loading). onFit runs after each check.
 * Returns a ResizeObserver; disconnect it when the node is removed.
 */
export function fitWidth(node, maxWidth, onFit) {
  const check = () => {
    const w = node.offsetWidth;
    if (w > maxWidth()) node.style.fontSize = `${(parseFloat(getComputedStyle(node).fontSize) * maxWidth()) / w}px`;
    onFit?.();
  };
  const observer = new ResizeObserver(check);
  observer.observe(node);
  return observer;
}
