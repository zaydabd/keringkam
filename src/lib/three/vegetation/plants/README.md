# One file per plant

Each `<id>.js` here exports `plant`:

```js
export const plant = {
  id: 'pedada',
  label: 'Pedada (mangrove)',
  create: ({ seed, lod }) => ({ group, stats, dispose }), // lod is 'near' or 'far'
  switchAt: 60, // metres; used by makeLOD for lod=auto
  target: [0, 6, 0],
  distance: 40,
  background: '#1d2a33',
};
```

`stats` needs `leaves`, `triangles.total` and `bounds` (as `tree.js` returns).
`preview.js` loads every file here, so adding a plant never edits a shared file.
Preview: `#/vegetation?plant=<id>&lod=near|far|auto`.
