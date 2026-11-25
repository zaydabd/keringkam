// The frame rate for the settings panel's counter (interior.js onFrameRate): frames and the mean
// time between them, from the frames' own timestamps, about twice a second (every frame when they
// are slower). A hidden tab draws no frames: the count starts again when the page is shown, so
// that gap is not counted, while a slow frame, however long, is.

/** Returns { count(now), dispose() }; count does nothing without `onFrameRate`. */
export function createFrameCounter(onFrameRate) {
  const rate = { from: null, frames: 0 };
  function count(now) {
    if (!onFrameRate) return;
    if (rate.from === null) Object.assign(rate, { from: now, frames: 0 });
    else rate.frames++;
    const span = now - rate.from;
    if (span < 500 || !rate.frames) return;
    const fps = (rate.frames * 1000) / span;
    onFrameRate({ fps: fps < 10 ? +fps.toFixed(1) : Math.round(fps), ms: +(span / rate.frames).toFixed(1) });
    Object.assign(rate, { from: now, frames: 0 });
  }
  const onVisibility = () => (rate.from = null);
  document.addEventListener('visibilitychange', onVisibility);
  return { count, dispose: () => document.removeEventListener('visibilitychange', onVisibility) };
}
