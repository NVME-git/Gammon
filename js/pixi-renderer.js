import { Application, Container, Graphics, Text } from 'pixi.js';
import { THEME_COLORS } from './constants.js';
import { PixelArt } from './pixelart.js';
import { clearTextureCache } from './textures.js';
import { TweenManager } from './animation.js';
import { buildLinearBoard } from './layouts/linear.js';
import { buildTriangleBoard } from './layouts/triangle.js';
import { buildCrossBoard } from './layouts/cross.js';
import { buildDiamondBoard } from './layouts/diamond.js';

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
    this.canvas   = canvas;
    this.game     = game;
    this.flipped  = false;
    this.myTurn         = true;
    this.isOnline       = false;
    this.pendingConfirm = false;
    this.pendingPlayer  = null;   // local player shown during pendingConfirm
    this.previewDice    = null;   // short pre-roll visual dice animation

    // Hit-test regions (populated during render)
    this._pointAreas    = [];
    this._barAreas      = [];
    this._bearAreas     = [];
    this._rollArea      = [];
    this._undoArea      = [];
    this._confirmArea   = [];
    this._resignArea    = [];
    this._pointCenters  = [];
    this._pointPolygons = [];  // [{poly:[x0,y0,x1,y1,...], idx}]

    // Resign timer seconds remaining (set by main.js, drawn in HUD)
    this.resignSecondsLeft = null;

    // Avatar cache
    this._avatarCache = {};

    // PixiJS state
    this._app          = null;
    this._ready        = false;
    this._board        = null;   // root container for board elements
    this._pulseLayer   = null;   // overlay for pulsing point outlines
    this._pulseGfxList = [];     // outline Graphics objects driven by ticker
    this._pulseChevs   = [];     // bobbing ▼ chevron Text objects driven by ticker
    this._pulsePhase   = 0;
    this._tweens       = null;

    // Settings
    this.showNumbers = true;

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

    // Pulse layer sits above board so outlines appear on top
    this._pulseLayer = new Container();
    app.stage.addChild(this._pulseLayer);

    // Drive pulsing alpha via ticker
    app.ticker.add(() => this._tickPulse());

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
    this._pointAreas    = [];
    this._barAreas      = [];
    this._bearAreas     = [];
    this._rollArea      = [];
    this._undoArea      = [];
    this._confirmArea   = [];
    this._resignArea    = [];
    this._pointCenters  = [];
    this._pointPolygons = [];

    const hitRegions = {
      pointAreas:    this._pointAreas,
      barAreas:      this._barAreas,
      bearAreas:     this._bearAreas,
      rollArea:      this._rollArea,
      undoArea:      this._undoArea,
      confirmArea:   this._confirmArea,
      resignArea:    this._resignArea,
      pointCenters:  this._pointCenters,
      pointPolygons: this._pointPolygons,
    };

    let state = this.game.getState();
    if (Array.isArray(this.previewDice) && this.previewDice.length > 0) {
      state = {
        ...state,
        dice: [...this.previewDice],
        movesLeft: [...this.previewDice],
      };
    }

    const sn = this.showNumbers;
    const mt = this.myTurn;
    const io = this.isOnline;
    const pc = this.pendingConfirm;
    const pp = this.pendingPlayer;
    switch (this.game.mode) {
      case 'unigammon':
      case 'bigammon':
        buildLinearBoard(this._app, this._board, this.game, state, theme, this.flipped, hitRegions, sn, mt, io, pc, pp);
        break;
      case 'trigammon':
        buildTriangleBoard(this._app, this._board, this.game, state, theme, hitRegions, sn, mt, io, pc, pp);
        break;
      case 'battlegammon':
        buildCrossBoard(this._app, this._board, this.game, state, theme, hitRegions, false, mt, io, pc, pp);
        break;
      case 'quadgammon':
        buildDiamondBoard(this._app, this._board, this.game, state, theme, hitRegions, mt, io, pc, pp, this.resignSecondsLeft);
        break;
    }

    // Rebuild pulsing point-outline highlights (all modes)
    this._rebuildPulseHighlights(state, theme);
  }

  _clearPulseLayer() {
    while (this._pulseLayer.children.length > 0) {
      this._pulseLayer.children[0].destroy();
    }
    this._pulseGfxList = [];
    this._pulseChevs   = [];
  }

  _rebuildPulseHighlights(state, theme) {
    this._clearPulseLayer();

    const isDark      = document.documentElement.getAttribute('data-theme') === 'dark';
    const outlineCol  = isDark ? '#ffffff' : '#000000';

    const toHL = [];
    if (state.selectedPoint !== null && state.selectedPoint !== 'bar') {
      const pp = this._pointPolygons.find(p => p.idx === state.selectedPoint);
      if (pp) toHL.push({ ...pp, isSelected: true });
    }
    for (const vm of state.validMoves) {
      if (vm !== 'bearoff') {
        const pp = this._pointPolygons.find(p => p.idx === vm);
        if (pp) toHL.push({ ...pp, isSelected: false });
      }
    }

    for (const { poly, circle, isSelected, chevY } of toHL) {
      // Centre for chevron placement
      let cx, cy;
      if (circle) {
        cx = circle.cx; cy = circle.cy;
      } else {
        cx = 0; cy = 0;
        const n = poly.length / 2;
        for (let i = 0; i < poly.length; i += 2) { cx += poly[i]; cy += poly[i + 1]; }
        cx /= n; cy /= n;
      }

      // Outline — circle or closed polygon
      const gfx = new Graphics();
      if (circle) {
        gfx.circle(circle.cx, circle.cy, circle.r);
        gfx.stroke({ width: 5, color: outlineCol, alpha: 1 });
      } else {
        gfx.moveTo(poly[0], poly[1]);
        for (let i = 2; i < poly.length; i += 2) gfx.lineTo(poly[i], poly[i + 1]);
        gfx.closePath();
        gfx.stroke({ width: 5, color: outlineCol, alpha: 1, join: 'round', cap: 'round' });
      }
      this._pulseLayer.addChild(gfx);
      this._pulseGfxList.push(gfx);

      // Bobbing ▼ chevron only on valid-move targets
      if (!isSelected) {
        const baseY  = chevY !== undefined ? chevY : cy - 10;
        const anchorY = chevY !== undefined ? 0.5 : 1;
        const chev = new Text({
          text: '▼',
          style: { fontSize: 13, fill: outlineCol, fontWeight: 'bold' },
        });
        chev.anchor.set(0.5, anchorY);
        chev.x = cx;
        chev.y = baseY;
        this._pulseLayer.addChild(chev);
        this._pulseChevs.push({ gfx: chev, baseY, offset: Math.random() * Math.PI * 2 });
      }
    }
  }

  _tickPulse() {
    if (!this._ready || this._pulseGfxList.length === 0) return;
    this._pulsePhase += 0.095;

    // Sharp heartbeat: biased toward bright, quick stab
    const raw = (Math.sin(this._pulsePhase) + 1) / 2;   // 0→1
    const a   = 0.55 + 0.45 * Math.pow(raw, 0.35);       // range ≈ 0.55→1.00

    for (const gfx of this._pulseGfxList) gfx.alpha = a;

    // Chevrons bounce downward (toward the diamond) then spring back
    for (const e of this._pulseChevs) {
      e.gfx.y      = e.baseY + Math.abs(Math.sin(this._pulsePhase * 1.6 + e.offset)) * 6;
      e.gfx.alpha  = 0.65 + 0.35 * raw;
    }
  }

  hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    // With autoDensity, layouts use CSS-pixel coordinates (app.screen),
    // so convert client coords to CSS-relative (not device-pixel) space.
    const x = (clientX - rect.left) * (this._app.screen.width  / rect.width);
    const y = (clientY - rect.top)  * (this._app.screen.height / rect.height);

    for (const a of this._confirmArea) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
        return { type: 'confirm' };
    }
    for (const a of this._resignArea) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
        return { type: 'resign' };
    }
    for (const a of this._rollArea) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
        return { type: 'roll' };
    }
    for (const a of this._undoArea) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
        return { type: 'undo' };
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
    for (const pp of this._pointPolygons) {
      if (pp.poly && _pointInPoly(x, y, pp.poly))
        return { type: 'point', idx: pp.idx };
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

// ─── Point-in-polygon (ray casting) ──────────────────────────────────────────
function _pointInPoly(px, py, poly) {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2], yi = poly[i * 2 + 1];
    const xj = poly[j * 2], yj = poly[j * 2 + 1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
