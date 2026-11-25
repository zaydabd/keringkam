# Migration note (25 Nov 2026)

Work on keringkam paused here to move to a new project. All sessions committed, pushed and stopped. Nothing was merged into main; the code on main is at `4851210` (this note is the only later commit).

## Work on branches, not in main yet
| Branch | Head | What is in it | State |
|---|---|---|---|
| `stylised/scene` (same as `stylised/branches`) | `1b1f572` | Tree work: bark, trumpet tree (Leonardo's rule for branch thickness), taper. 13 commits. | Ready. No conflicts with main. |
| `assembly-stylized-main` | `ba0635c` | Assembly building: look D by default (worn, chamfered edges), `?asm=c\|d\|cd` to compare. Triangle limit removed (about 15,800 triangles). 2 commits on main. | Ready, build and check passed (session's report). |
| `stylised/rubber-plant` | `30cae29` | New `rubberPlant.js`. 3 commits, 34 behind main. | Merge later (user's choice). |
| `house-exterior` | `75a6b9e` | Step 1: house grounded (stilts, outside, ground). Step 2: garden `?garden=<layout>&grow=plants\|trim`, WIP. Step 3: outside camera angles, not started. | WIP. Open issues in `research/INTERIOR-NOTES.md` on that branch. |

Already fully in main: `stylised/aglaonema`, `bougainvillea`, `nipah`, `pedada`, `rain-tree`, `satin-pothos`, `schismatoglottis`.

## Old branches (kept, not deleted)
- `bridge-wip`, `window-view` (`183bf96`): an untested bridge rebuild, superseded by the bridge on main.
- `assembly-stylized` (`cdeed9d`): based on old `assembly-look`; replaced by `assembly-stylized-main`.
- `sketchfab-plants`, `opus-medium-new-skills`, `assembly-look`, `claude/threejs-skills`, `r2-*`, `wip/sarawak-malay-interior`: older work.

## To resume
1. For each ready branch: merge onto main locally, `npm run build`, `npm run check`, look at a screenshot, then push. A push to main redeploys GitHub Pages.
2. Do not run the Pages workflow on a branch: it replaces the live site.
3. Licences: do not commit reference images with an unknown licence (the repo is public). The two Sketchfab vine models (iGauravRajput) are CC Attribution; the POLYSCAN packs have no licence (style reference only).
