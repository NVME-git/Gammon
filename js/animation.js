/**
 * Lightweight tween manager that hooks into a PixiJS Ticker.
 */
export class TweenManager {
  constructor(ticker) {
    this._tweens = [];
    this._ticker = ticker;
    ticker.add(this._update, this);
  }

  /**
   * Tween numeric properties on `target` to `props` over `duration` seconds.
   * Returns a Promise that resolves when the tween completes.
   */
  tween(target, props, duration, ease = easeOutCubic) {
    return new Promise(resolve => {
      const start = {};
      for (const key in props) start[key] = target[key];
      this._tweens.push({ target, start, end: props, duration, elapsed: 0, ease, resolve });
    });
  }

  /** Cancel all running tweens, snapping to end values. */
  flush() {
    for (const tw of this._tweens) {
      for (const key in tw.end) tw.target[key] = tw.end[key];
      tw.resolve();
    }
    this._tweens.length = 0;
  }

  get active() { return this._tweens.length > 0; }

  _update(ticker) {
    const dt = ticker.deltaMS / 1000;
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const tw = this._tweens[i];
      tw.elapsed += dt;
      const t = Math.min(tw.elapsed / tw.duration, 1);
      const e = tw.ease(t);
      for (const key in tw.end) {
        tw.target[key] = tw.start[key] + (tw.end[key] - tw.start[key]) * e;
      }
      if (t >= 1) {
        this._tweens.splice(i, 1);
        tw.resolve();
      }
    }
  }
}

// ─── Easing functions ───────────────────────────────────────────────────────

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function linear(t) {
  return t;
}
