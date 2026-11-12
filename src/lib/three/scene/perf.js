// Performance run for #/interior (after .claude/skills/threejs-performance), switched on with
// ?perf (or ?perf=n to hold each shot n seconds; default 3). It runs the same path a visitor takes:
// the seat shot, the button's move to the window (setShot, 2.2 s), then the window shot, and
// records every frame:
//   intervalMs  time between frames (rAF timestamps): what the visitor sees on a real GPU; never
//               below one display refresh, so it shows dropped frames but not headroom. Under a
//               software renderer the GPU work queues up and this stops meaning anything.
//   cpuMs       time in the frame function (JS, culling, command submission); not the GPU's work
//   gpuMs       GPU time of the frame, from EXT_disjoint_timer_query_webgl2 where the browser
//               exposes it (null otherwise), split into the frame's passes (sections below)
//   calls, triangles  renderer.info over all passes of the frame (interior.js sets autoReset off),
//               also split into the passes
// Also: build and first-frame times, the cost of the shot switch itself (setShot meters the new
// view at once: a small render and a synchronous pixel readback), long frames, and memory counts.
// The result goes to window.__perf (scripts wait on .done), to the console, and to a panel on the
// page, so a run on a phone can be read without a console. research/tools/perf-run.cjs drives it.

const START_FRAMES = 10; // the first frames (shader builds, uploads, the shadow map) are reported apart
const MIN_FRAMES = 10; // a hold lasts at least this many frames, however slow they are
const TAIL_SECONDS = 60; // how long to wait at the end for late GPU timer results

export function createPerfRun(renderer, { hold = 3, go, moving, load }) {
  const gl = renderer.getContext();
  const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const info = renderer.info;
  const frames = [];
  const pending = []; // timer queries in flight: { q, rec, name }
  const result = { done: false };
  const sectionNames = [];
  let phase = 'start';
  let phaseStart = 0;
  let phaseFrames = 0;
  let lastNow = null;
  let tailStart = 0;
  let rec = null; // the frame being recorded
  let open = null; // the section being timed: { name, q, calls, triangles }
  let switchRec = null;
  let panel = null;

  function poll() {
    if (!timerExt) return;
    const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT); // a clock change spoils the results in flight
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (!disjoint && !gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!disjoint) p.rec.gpu[p.name] = gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
      else p.rec.lost = true;
      gl.deleteQuery(p.q);
      pending.splice(i, 1);
    }
  }

  /** Closes the open section (if any) and opens `name` (if given) on the record `into`. */
  function section(name, into = rec) {
    if (open) {
      if (open.q) {
        gl.endQuery(timerExt.TIME_ELAPSED_EXT);
        pending.push({ q: open.q, rec: open.rec, name: open.name });
      }
      open.rec.calls[open.name] = (open.rec.calls[open.name] ?? 0) + info.render.calls - open.calls;
      open.rec.triangles[open.name] = (open.rec.triangles[open.name] ?? 0) + info.render.triangles - open.triangles;
      open = null;
    }
    if (!name || !into) return;
    if (!sectionNames.includes(name)) sectionNames.push(name);
    let q = null;
    if (timerExt) {
      q = gl.createQuery();
      gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
    }
    open = { name, q, rec: into, calls: info.render.calls, triangles: info.render.triangles };
  }

  function enter(name, now) {
    phase = name;
    phaseStart = now;
    phaseFrames = 0;
  }

  function finish() {
    result.done = true;
    Object.assign(result, summarise());
    result.frames = frames;
    window.__perf = result;
    const { frames: _, ...brief } = result;
    console.info('perf', JSON.stringify(brief));
    showPanel(brief);
  }

  const gpuTotal = (r) => {
    const v = sectionNames.map((n) => r.gpu[n]).filter((x) => x != null);
    return timerExt && !r.lost && v.length === Object.keys(r.calls).length ? v.reduce((a, b) => a + b, 0) : null;
  };

  function summarise() {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const env = {
      gpu: gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      css: [gl.canvas.clientWidth, gl.canvas.clientHeight],
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      gpuTimer: !!timerExt,
      userAgent: navigator.userAgent,
    };
    for (const f of frames) f.gpuMs = gpuTotal(f);
    const phases = {};
    for (const name of ['start', 'seat', 'move', 'window']) {
      const set = frames.filter((f) => f.phase === name);
      if (!set.length) continue;
      const interval = set.map((f) => f.intervalMs).filter((v) => v != null);
      const gpu = set.map((f) => f.gpuMs).filter((v) => v != null);
      const seconds = interval.reduce((a, b) => a + b, 0) / 1000;
      const passes = {};
      for (const s of sectionNames) {
        if (s === 'switch') continue; // reported on its own
        const g = set.map((f) => f.gpu[s]).filter((v) => v != null);
        passes[s] = { gpuMs: g.length ? stats(g).median : null, calls: median(set.map((f) => f.calls[s] ?? 0)), triangles: median(set.map((f) => f.triangles[s] ?? 0)) };
      }
      phases[name] = {
        frames: set.length,
        seconds: round(seconds),
        fps: seconds ? round(interval.length / seconds) : null,
        intervalMs: stats(interval),
        cpuMs: stats(set.map((f) => f.cpuMs)),
        gpuMs: gpu.length ? stats(gpu) : null,
        over16: share(interval, 1000 / 60), // share of frames slower than 60 fps
        over33: share(interval, 1000 / 30), // share of frames slower than 30 fps
        calls: range(set.map((f) => f.callsTotal)),
        triangles: range(set.map((f) => f.trianglesTotal)),
        passes, // medians per pass
      };
    }
    // Long frames: more than twice the median of their own phase, and slower than 30 fps.
    const long = frames
      .filter((f) => f.phase !== 'start' && f.intervalMs != null && f.intervalMs > Math.max(2 * phases[f.phase].intervalMs.median, 1000 / 30))
      .map((f) => ({ i: f.i, phase: f.phase, intervalMs: round(f.intervalMs), cpuMs: round(f.cpuMs), gpuMs: round(f.gpuMs) }));
    const memory = {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? null,
      jsHeapMB: performance.memory ? round(performance.memory.usedJSHeapSize / 2 ** 20) : null,
    };
    const sw = switchRec ? { cpuMs: round(switchRec.cpuMs), gpuMs: round(switchRec.gpu.switch ?? null), calls: switchRec.calls.switch } : null;
    return { env, load, switch: sw, phases, long, memory };
  }

  function showPanel(r) {
    const f = (s) => (s ? `${s.median} / ${s.p95} / ${s.max}` : 'n/a');
    const n = (v) => v.toLocaleString('en');
    const phaseLines = Object.entries(r.phases).flatMap(([name, p]) => [
      `${name}: ${p.frames} frames, ${p.fps} fps, ${p.calls.map(n).join('-')} calls, ${p.triangles.map(n).join('-')} triangles`,
      `  frame ms ${f(p.intervalMs)}   cpu ms ${f(p.cpuMs)}   gpu ms ${f(p.gpuMs)}`,
      ...(name === 'start' ? [] : [`  passes (gpu ms, calls): ${Object.entries(p.passes).filter(([, x]) => x.calls).map(([s, x]) => `${s} ${x.gpuMs ?? '-'}, ${x.calls}`).join('; ')}`]),
    ]);
    const text = [
      `PERF RUN  ${r.env.css.join('x')} css px, ratio ${r.env.pixelRatio}, buffer ${r.env.drawingBuffer.join('x')}`,
      `gpu: ${r.env.gpu}${r.env.gpuTimer ? '' : ' (no GPU timer)'}`,
      `load: page to first frame ${r.load.firstFrameAtMs} ms; build ${r.load.buildMs} ms (outside ${r.load.outsideMs} ms); first frame ${r.load.firstFrameMs} ms`,
      `switch to window (meter render + readback): cpu ${r.switch?.cpuMs} ms, gpu ${r.switch?.gpuMs ?? 'n/a'} ms`,
      `(ms values: median / p95 / max)`,
      ...phaseLines,
      `long frames: ${r.long.length}${r.long.length ? ' (' + r.long.slice(0, 6).map((l) => `${l.phase} ${l.intervalMs}`).join(', ') + ')' : ''}`,
      `memory: geometries ${r.memory.geometries}, textures ${r.memory.textures}, programs ${r.memory.programs}, JS heap ${r.memory.jsHeapMB ?? 'n/a'} MB`,
    ].join('\n');
    panel = document.createElement('pre');
    panel.className = 'perf-panel';
    panel.textContent = text;
    Object.assign(panel.style, {
      position: 'fixed', left: '8px', top: '64px', right: '8px', margin: '0', padding: '8px 10px', zIndex: '50',
      font: '11px/1.35 ui-monospace, monospace', color: '#f6ead2', background: 'rgba(30, 18, 10, 0.82)',
      whiteSpace: 'pre-wrap', pointerEvents: 'none',
    });
    document.body.appendChild(panel);
  }

  return {
    result,
    /** Call at the start of the frame's work. */
    begin() {
      if (result.done || phase === 'tail') return;
      rec = { i: frames.length, phase, intervalMs: null, cpuMs: 0, gpu: {}, calls: {}, triangles: {} };
      section('update');
    },
    /** Marks the start of a pass inside the frame (closes the previous one). */
    section(name) {
      if (rec && open) section(name);
    },
    /** Wraps an object's render(), e.g. a composer pass, so its work is timed as `name`. */
    wrap(pass, name) {
      const render = pass.render.bind(pass);
      pass.render = (...a) => {
        if (rec && open) section(name);
        return render(...a);
      };
    },
    /** Call after the frame's last render, with the rAF timestamp and the frame's CPU time. */
    end(now, cpuMs) {
      if (result.done) return;
      poll();
      if (phase === 'tail') {
        if (!pending.length || (now - tailStart) / 1000 > TAIL_SECONDS) finish();
        return;
      }
      section(null);
      rec.intervalMs = lastNow == null ? null : now - lastNow;
      rec.cpuMs = cpuMs;
      rec.callsTotal = Object.values(rec.calls).reduce((a, b) => a + b, 0);
      rec.trianglesTotal = Object.values(rec.triangles).reduce((a, b) => a + b, 0);
      lastNow = now;
      frames.push(rec);
      const done = rec;
      rec = null;
      phaseFrames++;
      const held = (now - phaseStart) / 1000 >= hold && phaseFrames >= MIN_FRAMES;
      if (phase === 'start' && phaseFrames >= START_FRAMES) enter('seat', now);
      else if (phase === 'seat' && held) {
        // The button's action, timed on its own: setShot meters the new view at once.
        switchRec = { gpu: {}, calls: {}, triangles: {}, cpuMs: 0, of: done.i };
        const t = performance.now();
        section('switch', switchRec);
        go();
        section(null);
        switchRec.cpuMs = performance.now() - t;
        enter('move', now);
      } else if (phase === 'move' && !moving()) enter('window', now);
      else if (phase === 'window' && held) {
        enter('tail', now);
        tailStart = now;
      }
    },
    dispose() {
      if (open?.q) gl.endQuery(timerExt.TIME_ELAPSED_EXT);
      open = null;
      for (const { q } of pending) gl.deleteQuery(q);
      pending.length = 0;
      panel?.remove();
    },
  };
}

function round(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}
function stats(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { median: round(at(0.5)), p95: round(at(0.95)), max: round(s[s.length - 1]) };
}
function median(values) {
  return stats(values)?.median ?? null;
}
function share(values, limit) {
  return values.length ? round(values.filter((v) => v > limit).length / values.length) : null;
}
function range(values) {
  return [Math.min(...values), Math.max(...values)];
}
