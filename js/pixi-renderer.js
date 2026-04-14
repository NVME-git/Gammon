import { Application, Container } from 'pixi.js';
import { THEME_COLORS } from './constants.js';
import { PixelArt } from './pixelart.js';
import { clearTextureCache } from './textures.js';
import { TweenManager } from './animation.js';
import { buildLinearBoard } from './layouts/linear.js';
import { buildTriangleBoard } from './layouts/triangle.js';
import { buildCrossBoard } from './layouts/cross.js';

/**
 * PixiJS-based BoardRenderer.
 *
 * Drop-in replacement for the Canvas 2D renderer with identical public API:
 *   constructor(canvas, game)
 *   resize()
 *   render()
 *   hitTest(clientX, clientY)
 *   flipped  (boolean property)
 *   getAvatarCanvas(playerIdx)
 *   invalidateAvatarCache()
 */
export class BoardRenderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game   = game;
    this.flipped = false;

    // Hit-test regions (populated during render)
    this._pointAreas   = [];
    this._barAreas     = [];
    this._bearAreas    = [];
    this._rollArea     = [];
    this._pointCenters = [];

    // Avatar cache
    this._avatarCache = {};

    // PixiJS state
    this._app   = null;
    this._ready = false;
    this._board = null;      // root container for board elements
    this._tweens = null;

    // Kick off async init
    this._initPixi();
  }

  async _initPixi() {
    const app = new Application();
    const theme = this._theme();

    await app.init({
      canvas:       this.canvas,
      antialias:    true,
      resolution:   window.devicePixelRatio || 1,
      autoDensity:  true,
      background:   theme.background,
      width:        this.canvas.parentElement.clientWidth,
      height:       this.canvas.parentElement.clientHeight,
    });

    this._app    = app;
    this._tweens = new TweenManager(app.ticker);
    this._board  = new Container();
    app.stage.addChild(this._board);

    this._ready = true;
    this.resize();
  }

  // ═════════════════════════════════════════════════════════════════���═════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  resize() {
    if (!this._ready) return;
    // PixiJS resizeTo handles canvas sizing, just re-render
    this._app.renderer.resize(
      this.canvas.parentElement.clientWidth,
      this.canvas.parentElement.clientHeight
    );
    clearTextureCache();  // textures depend on board dimensions
    this.render();
  }

  render() {
    if (!this._ready) return;

    // Update background color for theme
    const theme = this._theme();
    this._app.renderer.background.color = theme.background;

    // Clear existing board — destroy children to avoid GPU memory leaks
    while (this._board.children.length > 0) {
      this._board.children[0].destroy({ children: true });
    }

    // Reset hit regions
    this._pointAreas   = [];
    this._barAreas     = [];
    this._bearAreas    = [];
    this._rollArea     = [];
    this._pointCenters = [];

    const hitRegions = {
      pointAreas:   this._pointAreas,
      barAreas:     this._barAreas,
      bearAreas:    this._bearAreas,
      rollArea:     this._rollArea,
      pointCenters: this._pointCenters,
    };

    const state = this.game.getState();

    switch (this.game.mode) {
      case 'unigammon':
      case 'bigammon':
        buildLinearBoard(this._app, this._board, this.game, state, theme, this.flipped, hitRegions);
        break;
      case 'trigammon':
        buildTriangleBoard(this._app, this._board, this.game, state, theme, hitRegions);
        break;
      case 'quadgammon':
        buildCrossBoard(this._app, this._board, this.game, state, theme, hitRegions);
        break;
    }
  }

  hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    // With autoDensity, layouts use CSS-pixel coordinates (app.screen),
    // so convert client coords to CSS-relative (not device-pixel) space.
    const x = (clientX - rect.left) * (this._app.screen.width  / rect.width);
    const y = (clientY - rect.top)  * (this._app.screen.height / rect.height);

    for (const a of this._rollArea) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
        return { type: 'roll' };
    }
    // Check bar/bearoff before points — point areas span the full board height
    // and would otherwise swallow clicks intended for the zone boxes.
    for (const a of this._barAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
        return { type: 'bar' };
    }
    for (const a of this._bearAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
        return { type: 'bearoff' };
    }
    for (const a of this._pointAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
        return { type: 'point', idx: a.idx };
    }
    for (const pc of this._pointCenters) {
      const dx = x - pc.cx, dy = y - pc.cy;
      if (Math.sqrt(dx * dx + dy * dy) <= pc.r)
        return { type: 'point', idx: pc.idx };
    }

    return null;
  }

  getAvatarCanvas(playerIdx) {
    if (this._avatarCache[playerIdx]) return this._avatarCache[playerIdx];
    const c = document.createElement('canvas');
    c.width  = 48;
    c.height = 48;
    const color = this.game.players[playerIdx]?.color || '#888';
    PixelArt.drawCharacter(c, color);
    this._avatarCache[playerIdx] = c;
    return c;
  }

  invalidateAvatarCache() {
    this._avatarCache = {};
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Theme helper
  // ═══════════════════════════════════════════════════════════════════════════

  _theme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark ? THEME_COLORS.dark : THEME_COLORS.light;
  }

}
