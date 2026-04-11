import { Graphics } from 'pixi.js';

// ─── Texture cache ──────────────────────────────────────────────────────────
const _cache = new Map();

export function clearTextureCache() {
  for (const tex of _cache.values()) tex.destroy(true);
  _cache.clear();
}

// ─── Checker texture ────────────────────────────────────────────────────────
export function getCheckerTexture(renderer, color, radius) {
  const key = `checker:${color}:${radius}`;
  if (_cache.has(key)) return _cache.get(key);

  const r = radius;
  const pad = 4;
  const size = (r + pad) * 2;

  const g = new Graphics();

  // Shadow
  g.circle(size / 2 + 1, size / 2 + 1, r + 1);
  g.fill({ color: 0x000000, alpha: 0.35 });

  // Main disc
  g.circle(size / 2, size / 2, r);
  g.fill(color);

  // Inner highlight ring
  g.circle(size / 2, size / 2, r * 0.72);
  g.stroke({ color: 0xffffff, alpha: 0.45, width: Math.max(1, r * 0.18) });

  // Dark outer border
  g.circle(size / 2, size / 2, r);
  g.stroke({ color: 0x000000, alpha: 0.55, width: Math.max(1, r * 0.14) });

  const tex = renderer.generateTexture(g);
  g.destroy();
  _cache.set(key, tex);
  return tex;
}

// ─── Wood grain board texture ───────────────────────────────────────────────
export function getWoodTexture(renderer, w, h, baseColor, isDark) {
  const key = `wood:${w}:${h}:${baseColor}`;
  if (_cache.has(key)) return _cache.get(key);

  const g = new Graphics();

  // Base fill
  g.roundRect(0, 0, w, h, 12);
  g.fill(baseColor);

  // Grain lines — thin horizontal stripes with varying opacity
  const grainColor = isDark ? 0xffffff : 0x000000;
  for (let y = 4; y < h - 4; y += 2 + Math.round(pseudoRand(y) * 4)) {
    const alpha = 0.015 + pseudoRand(y * 7) * 0.04;
    const thickness = 0.5 + pseudoRand(y * 13) * 1;
    g.rect(6, y, w - 12, thickness);
    g.fill({ color: grainColor, alpha });
  }

  // Subtle border
  g.roundRect(0, 0, w, h, 12);
  g.stroke({ color: isDark ? 0x3a3a5a : 0x907060, width: 2, alpha: 0.6 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  _cache.set(key, tex);
  return tex;
}

// ─── Die face texture ───────────────────────────────────────────────────────
export function getDieTexture(renderer, size, value, borderColor, used, isDark) {
  const key = `die:${size}:${value}:${borderColor}:${used}:${isDark}`;
  if (_cache.has(key)) return _cache.get(key);

  const g = new Graphics();
  const r = 7;

  // Background
  g.roundRect(0, 0, size, size, r);
  g.fill(isDark ? 0x0d1117 : 0xb8a99a);

  // Border
  g.roundRect(0, 0, size, size, r);
  g.stroke({ color: borderColor, width: used ? 1 : 2.5, alpha: used ? 0.5 : 1 });

  const tex = renderer.generateTexture(g);
  g.destroy();
  _cache.set(key, tex);
  return tex;
}

// ─── Deterministic pseudo-random (seeded by input) ──────────────────────────
function pseudoRand(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
