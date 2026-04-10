import { THEME_COLORS } from './constants.js';
import { PixelArt } from './pixelart.js';

/**
 * BoardRenderer
 * Draws the game board on a <canvas> element for all four game modes.
 */
export class BoardRenderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.game   = game;

    // Hit-test regions filled during render
    this._pointAreas  = [];   // { x, y, w, h, idx }  (bounding boxes)
    this._barAreas    = [];   // { x, y, w, h }
    this._bearAreas   = [];   // { x, y, w, h }
    this._pointCenters = [];  // { cx, cy, idx }  (for tri/quad boards)

    // Mini-canvas cache for pixel-art avatars
    this._avatarCache = {};

    // Animation state
    this._animating   = false;
    this._animQueue   = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  resize() {
    const wrapper = this.canvas.parentElement;
    this.canvas.width  = wrapper.clientWidth  || 800;
    this.canvas.height = wrapper.clientHeight || 480;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._pointAreas   = [];
    this._barAreas     = [];
    this._bearAreas    = [];
    this._pointCenters = [];

    switch (this.game.mode) {
      case 'unigammon':
      case 'bigammon':   this._renderLinear();      break;
      case 'trigammon':  this._renderTriangle();    break;
      case 'quadgammon': this._renderCross();       break;
    }
  }

  /**
   * Hit-test a canvas click.
   * @returns { type: 'point'|'bar'|'bearoff', idx?: number } | null
   */
  hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top)  * scaleY;

    for (const a of this._pointAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        return { type: 'point', idx: a.idx };
      }
    }
    for (const a of this._barAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        return { type: 'bar' };
      }
    }
    for (const a of this._bearAreas) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        return { type: 'bearoff' };
      }
    }

    // Tri/quad: check by distance to point center
    for (const pc of this._pointCenters) {
      const dx = x - pc.cx, dy = y - pc.cy;
      if (Math.sqrt(dx * dx + dy * dy) <= pc.r) {
        return { type: 'point', idx: pc.idx };
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Theme helper
  // ═══════════════════════════════════════════════════════════════════════════

  _theme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark ? THEME_COLORS.dark : THEME_COLORS.light;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── LINEAR BOARD (Unigammon / Bigammon) ─────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  _renderLinear() {
    const ctx      = this.ctx;
    const W        = this.canvas.width;
    const H        = this.canvas.height;
    const theme    = this._theme();
    const game     = this.game;
    const state    = game.getState();

    // Layout constants
    const PAD      = 14;
    const BEAR_W   = 56;
    const BAR_W    = 44;
    const BOARD_H  = H - PAD * 2;
    const boardY   = PAD;

    // Available width for 24 point columns
    const AVAIL    = W - PAD * 2 - BEAR_W * 2 - BAR_W;
    const PW       = AVAIL / 24;        // point width
    const TH       = BOARD_H * 0.42;    // triangle height
    const CY       = boardY + BOARD_H / 2; // centre line

    // Bearing-off zone x positions
    const bearL_x  = PAD;
    const bearR_x  = W - PAD - BEAR_W;
    const leftEnd  = PAD + BEAR_W;
    const barX     = leftEnd + PW * 12;

    // ── Board background ─────────────────────────────────────────────────────
    ctx.fillStyle = theme.board;
    ctx.beginPath();
    ctx.roundRect(PAD, PAD, W - PAD * 2, BOARD_H, 12);
    ctx.fill();
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // ── Draw 24 triangles ────────────────────────────────────────────────────
    for (let i = 0; i < 24; i++) {
      const col     = i < 12 ? i : i + 1;   // skip bar column
      const px_     = leftEnd + col * PW;
      const even    = i % 2 === 0;

      // Colour scheme: alternating per quadrant
      const q       = Math.floor(i / 6);
      const colors  = [theme.triangle1, theme.triangle2];
      const triColor = colors[(q + (even ? 0 : 1)) % 2];

      ctx.fillStyle = triColor;
      ctx.beginPath();
      if (even) {
        // Upward triangle (base at bottom)
        ctx.moveTo(px_,         CY + TH);
        ctx.lineTo(px_ + PW,    CY + TH);
        ctx.lineTo(px_ + PW / 2, CY - TH);
      } else {
        // Downward triangle (base at top)
        ctx.moveTo(px_,         CY - TH);
        ctx.lineTo(px_ + PW,    CY - TH);
        ctx.lineTo(px_ + PW / 2, CY + TH);
      }
      ctx.closePath();
      ctx.fill();

      // Point number label
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font      = `bold ${Math.max(9, Math.floor(PW * 0.38))}px Arial`;
      ctx.textAlign = 'center';
      const labelY  = even ? CY + TH - 6 : CY - TH + 14;
      ctx.fillText(i + 1, px_ + PW / 2, labelY);

      // Register hit-test area
      const areaX = px_;
      const areaY = even ? CY - TH : CY - TH;
      this._pointAreas.push({ x: areaX, y: boardY, w: PW, h: BOARD_H, idx: i });
    }

    // ── Bar area ─────────────────────────────────────────────────────────────
    ctx.fillStyle = theme.barArea;
    ctx.fillRect(barX, boardY, BAR_W, BOARD_H);
    ctx.fillStyle = theme.subtext || '#888';
    ctx.font      = `bold 10px Arial`;
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(barX + BAR_W / 2, CY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('BAR', 0, 4);
    ctx.restore();

    this._barAreas.push({ x: barX, y: boardY, w: BAR_W, h: BOARD_H });

    // ── Bearing-off zones ────────────────────────────────────────────────────
    this._drawBearoffZoneLinear(bearR_x, boardY, BEAR_W, BOARD_H, 0, 'RIGHT', theme);
    this._drawBearoffZoneLinear(bearL_x, boardY, BEAR_W, BOARD_H, 1, 'LEFT',  theme);

    this._bearAreas.push({ x: bearR_x, y: boardY, w: BEAR_W, h: BOARD_H });
    this._bearAreas.push({ x: bearL_x, y: boardY, w: BEAR_W, h: BOARD_H });

    // ── Checkers on the board ─────────────────────────────────────────────────
    const CR = Math.min(PW / 2 - 2, 14);
    for (let i = 0; i < 24; i++) {
      const pt   = state.points[i];
      if (pt.count === 0) continue;

      const col  = i < 12 ? i : i + 1;
      const px_  = leftEnd + col * PW;
      const cx   = px_ + PW / 2;
      const even = i % 2 === 0;

      for (let s = 0; s < pt.count; s++) {
        const cy = even
          ? CY + TH - CR - s * (CR * 2 + 1)
          : CY - TH + CR + s * (CR * 2 + 1);
        this._drawChecker(cx, cy, CR, pt.player, s, pt.count, theme);
      }
    }

    // ── Bar checkers ──────────────────────────────────────────────────────────
    const barCX = barX + BAR_W / 2;
    for (let p = 0; p < game.numPlayers; p++) {
      const barCount = state.bar[p];
      if (barCount === 0) continue;
      const half   = game.numPlayers === 2 ? (p === 0 ? 1 : -1) : (p < 2 ? 1 : -1);
      for (let s = 0; s < barCount; s++) {
        const cy = CY + half * (CR + s * (CR * 2 + 2));
        this._drawChecker(barCX, cy, CR, p, s, barCount, theme);
      }
    }

    // ── Highlights ────────────────────────────────────────────────────────────
    this._drawLinearHighlights(state, leftEnd, PW, barX, BAR_W, CY, TH, BOARD_H, boardY, theme);
  }

  _drawBearoffZoneLinear(x, y, w, h, player, side, theme) {
    const ctx   = this.ctx;
    const state = this.game.getState();
    const count = state.borneOff[player];

    ctx.fillStyle = theme.barArea;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = theme.subtext || '#888';
    ctx.font      = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('OFF', x + w / 2, y + 12);

    if (count > 0 && player < this.game.numPlayers) {
      const color = this.game.players[player].color;
      const CR    = Math.min(w / 2 - 3, 12);
      for (let i = 0; i < count; i++) {
        const cy = y + 22 + i * (CR * 2 + 2) + CR;
        this._drawChecker(x + w / 2, cy, CR, player, i, count, this._theme());
      }
    }
  }

  _drawLinearHighlights(state, leftEnd, PW, barX, BAR_W, CY, TH, BOARD_H, boardY, theme) {
    const ctx = this.ctx;

    // Highlight selected point
    if (state.selectedPoint !== null) {
      const sel = state.selectedPoint;
      if (sel === 'bar') {
        ctx.fillStyle = theme.selected;
        ctx.fillRect(barX, boardY, BAR_W, BOARD_H);
      } else {
        const col = sel < 12 ? sel : sel + 1;
        const px_ = leftEnd + col * PW;
        ctx.fillStyle = theme.selected;
        ctx.fillRect(px_, boardY, PW, BOARD_H);
      }
    }

    // Highlight valid moves
    for (const vm of state.validMoves) {
      if (vm === 'bearoff') {
        // Both bearing-off zones
        ctx.fillStyle = theme.validMove;
        ctx.fillRect(barX + BAR_W, boardY, leftEnd + PW * 24 + BAR_W - (barX + BAR_W), BOARD_H / 8);
        continue;
      }
      const col = vm < 12 ? vm : vm + 1;
      const px_ = leftEnd + col * PW;
      ctx.fillStyle = theme.validMove;
      ctx.fillRect(px_, boardY, PW, BOARD_H);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── TRIANGULAR BOARD (Trigammon) ────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  _renderTriangle() {
    const ctx   = this.ctx;
    const W     = this.canvas.width;
    const H     = this.canvas.height;
    const theme = this._theme();
    const state = this.game.getState();

    const cx = W / 2;
    const cy = H / 2 + 10;
    const R  = Math.min(W, H) * 0.42;

    // Triangle vertices (equilateral, flat-bottom)
    const verts = [
      { x: cx,                          y: cy - R       },    // top
      { x: cx + R * Math.sin(Math.PI * 2 / 3),  y: cy - R * Math.cos(Math.PI * 2 / 3) },   // bottom-right
      { x: cx + R * Math.sin(Math.PI * 4 / 3),  y: cy - R * Math.cos(Math.PI * 4 / 3) },   // bottom-left
    ];

    // Board background
    ctx.fillStyle = theme.board;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    ctx.lineTo(verts[1].x, verts[1].y);
    ctx.lineTo(verts[2].x, verts[2].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Center bar circle
    ctx.fillStyle = theme.barArea;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.fillStyle = theme.subtext || '#888';
    ctx.font      = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BAR', cx, cy);
    ctx.textBaseline = 'alphabetic';
    this._barAreas.push({ x: cx - R * 0.18, y: cy - R * 0.18, w: R * 0.36, h: R * 0.36 });

    // Compute 24 point positions — 8 per side
    const MARGIN  = 0.12; // inset from vertex
    const SPACING = (1 - 2 * MARGIN) / 7;
    const pts     = [];   // indexed 0-23

    for (let side = 0; side < 3; side++) {
      const vA = verts[side];
      const vB = verts[(side + 1) % 3];
      for (let i = 0; i < 8; i++) {
        const t  = MARGIN + i * SPACING;
        const px = vA.x + (vB.x - vA.x) * t;
        const py = vA.y + (vB.y - vA.y) * t;
        pts.push({ cx: px, cy: py, idx: side * 8 + i });
      }
    }

    const PR = Math.min(W, H) * 0.038;   // point/checker radius

    // Draw each point
    const colors = [theme.triangle1, theme.triangle2];
    for (const pt of pts) {
      const q     = Math.floor(pt.idx / 4);
      const color = colors[q % 2];

      // Draw a small triangle pointing towards centre
      const angle = Math.atan2(cy - pt.cy, cx - pt.cx);
      const len   = PR * 2.6;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pt.cx + PR * Math.cos(angle - 1.3), pt.cy + PR * Math.sin(angle - 1.3));
      ctx.lineTo(pt.cx + PR * Math.cos(angle + 1.3), pt.cy + PR * Math.sin(angle + 1.3));
      ctx.lineTo(pt.cx + len * Math.cos(angle),       pt.cy + len * Math.sin(angle));
      ctx.closePath();
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font      = `bold ${Math.floor(PR * 0.85)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pt.idx + 1, pt.cx, pt.cy);
      ctx.textBaseline = 'alphabetic';

      this._pointCenters.push({ cx: pt.cx, cy: pt.cy, r: PR * 1.8, idx: pt.idx });
    }

    // Draw checkers
    for (const pt of pts) {
      const sp = state.points[pt.idx];
      if (sp.count === 0) continue;
      const angle = Math.atan2(cy - pt.cy, cx - pt.cx);
      for (let s = 0; s < sp.count; s++) {
        const dist  = PR * 1.8 + s * (PR * 2 + 2);
        const ccx   = pt.cx + dist * Math.cos(angle);
        const ccy   = pt.cy + dist * Math.sin(angle);
        this._drawChecker(ccx, ccy, PR, sp.player, s, sp.count, theme);
      }
    }

    // Bar checkers
    for (let p = 0; p < this.game.numPlayers; p++) {
      const count = state.bar[p];
      if (count === 0) continue;
      const angle = (p / this.game.numPlayers) * Math.PI * 2;
      for (let s = 0; s < count; s++) {
        const dist = R * 0.10 + s * (PR * 2 + 2);
        const bcx  = cx + dist * Math.cos(angle);
        const bcy  = cy + dist * Math.sin(angle);
        this._drawChecker(bcx, bcy, PR, p, s, count, theme);
      }
    }

    // Bearing-off labels at vertices
    for (let p = 0; p < this.game.numPlayers; p++) {
      const homeVertex = verts[p];
      const count      = state.borneOff[p];
      const color      = this.game.players[p].color;
      ctx.fillStyle    = color;
      ctx.font         = 'bold 12px Arial';
      ctx.textAlign    = 'center';
      ctx.fillText(`P${p + 1} off: ${count}`, homeVertex.x, homeVertex.y - 16);
    }

    // Highlights
    this._drawPolyHighlights(state, pts, PR, theme, cx, cy);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── CROSS BOARD (Quadgammon) ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  _renderCross() {
    const ctx   = this.ctx;
    const W     = this.canvas.width;
    const H     = this.canvas.height;
    const theme = this._theme();
    const state = this.game.getState();

    const cx      = W / 2;
    const cy      = H / 2;
    const armLen  = Math.min(W, H) * 0.38;
    const armW    = Math.min(W, H) * 0.18;

    // Draw cross shape
    ctx.fillStyle = theme.board;
    // Horizontal bar
    ctx.beginPath();
    ctx.roundRect(cx - armLen - armW / 2, cy - armW / 2, armLen * 2 + armW, armW, 8);
    ctx.fill();
    // Vertical bar
    ctx.beginPath();
    ctx.roundRect(cx - armW / 2, cy - armLen - armW / 2, armW, armLen * 2 + armW, 8);
    ctx.fill();
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect(cx - armLen - armW / 2, cy - armW / 2, armLen * 2 + armW, armW, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(cx - armW / 2, cy - armLen - armW / 2, armW, armLen * 2 + armW, 8);
    ctx.stroke();

    // Center bar circle
    const barR = armW * 0.32;
    ctx.fillStyle = theme.barArea;
    ctx.beginPath();
    ctx.arc(cx, cy, barR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.fillStyle    = theme.subtext || '#888';
    ctx.font         = 'bold 10px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BAR', cx, cy);
    ctx.textBaseline = 'alphabetic';
    this._barAreas.push({ x: cx - barR, y: cy - barR, w: barR * 2, h: barR * 2 });

    // Arm directions: bottom(0), right(1), top(2), left(3)
    // Each arm has 6 points going outward from center
    const PR = armW * 0.14;
    const armDefs = [
      { dx:  0, dy:  1 },   // bottom arm  → points 0-5
      { dx:  1, dy:  0 },   // right arm   → points 6-11
      { dx:  0, dy: -1 },   // top arm     → points 12-17
      { dx: -1, dy:  0 },   // left arm    → points 18-23
    ];

    const pts = [];   // { cx, cy, idx }
    const STEP = (armLen) / 6.5;

    for (let arm = 0; arm < 4; arm++) {
      const { dx, dy } = armDefs[arm];
      for (let i = 0; i < 6; i++) {
        const dist = barR + PR * 1.4 + i * STEP;
        pts.push({
          cx:  cx + dx * dist,
          cy:  cy + dy * dist,
          idx: arm * 6 + i,
        });
      }
    }

    const colors = [theme.triangle1, theme.triangle2];
    for (const pt of pts) {
      const arm   = Math.floor(pt.idx / 6);
      const color = colors[arm % 2];
      const { dx, dy } = armDefs[arm];
      const angle = Math.atan2(dy, dx);

      // Arrowhead triangle pointing outward along arm
      const len = PR * 2.2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pt.cx - PR * Math.sin(angle), pt.cy + PR * Math.cos(angle));
      ctx.lineTo(pt.cx + PR * Math.sin(angle), pt.cy - PR * Math.cos(angle));
      ctx.lineTo(pt.cx + len * Math.cos(angle), pt.cy + len * Math.sin(angle));
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle    = 'rgba(255,255,255,0.4)';
      ctx.font         = `bold ${Math.floor(PR * 0.85)}px Arial`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pt.idx + 1, pt.cx, pt.cy);
      ctx.textBaseline = 'alphabetic';

      this._pointCenters.push({ cx: pt.cx, cy: pt.cy, r: PR * 1.8, idx: pt.idx });
    }

    // Checkers
    for (const pt of pts) {
      const sp = state.points[pt.idx];
      if (sp.count === 0) continue;
      const arm   = Math.floor(pt.idx / 6);
      const { dx, dy } = armDefs[arm];
      const angle = Math.atan2(dy, dx);
      for (let s = 0; s < sp.count; s++) {
        const dist = PR * 2 + s * (PR * 2 + 2);
        const ccx  = pt.cx + dist * Math.cos(angle);
        const ccy  = pt.cy + dist * Math.sin(angle);
        this._drawChecker(ccx, ccy, PR, sp.player, s, sp.count, theme);
      }
    }

    // Bar checkers
    for (let p = 0; p < this.game.numPlayers; p++) {
      const count = state.bar[p];
      if (count === 0) continue;
      const angle = (p / 4) * Math.PI * 2;
      for (let s = 0; s < count; s++) {
        const dist = barR * 0.5 + s * (PR * 2 + 1);
        const bcx  = cx + dist * Math.cos(angle);
        const bcy  = cy + dist * Math.sin(angle);
        this._drawChecker(bcx, bcy, PR, p, s, count, theme);
      }
    }

    // Bearing-off labels at arm tips
    const tipDist = armLen + armW * 0.7;
    for (let p = 0; p < this.game.numPlayers; p++) {
      const { dx, dy } = armDefs[p];
      const tx   = cx + dx * tipDist;
      const ty   = cy + dy * tipDist;
      const col  = this.game.players[p].color;
      ctx.fillStyle = col;
      ctx.font      = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`P${p + 1} off: ${state.borneOff[p]}`, tx, ty);

      // Bear-off area registration
      this._bearAreas.push({ x: tx - 28, y: ty - 16, w: 56, h: 20 });
    }

    // Highlights
    this._drawPolyHighlights(state, pts, PR, theme, cx, cy);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Shared helpers ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  _drawPolyHighlights(state, pts, PR, theme, boardCX, boardCY) {
    const ctx = this.ctx;
    // Selected
    if (state.selectedPoint !== null && state.selectedPoint !== 'bar') {
      for (const pt of pts) {
        if (pt.idx === state.selectedPoint) {
          ctx.fillStyle = theme.selected;
          ctx.beginPath();
          ctx.arc(pt.cx, pt.cy, PR * 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Valid moves
    for (const vm of state.validMoves) {
      if (vm === 'bearoff') continue;
      for (const pt of pts) {
        if (pt.idx === vm) {
          ctx.fillStyle = theme.validMove;
          ctx.beginPath();
          ctx.arc(pt.cx, pt.cy, PR * 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /**
   * Draw a single checker circle.
   */
  _drawChecker(cx, cy, r, player, stackIdx, totalCount, theme) {
    const ctx   = this.ctx;
    const color = player >= 0 ? this.game.players[player].color : '#888';

    // Shadow
    ctx.shadowColor   = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Outer circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Inner ring highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth   = Math.max(1, r * 0.18);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    // Dark border
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = Math.max(1, r * 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Stack count label when > 1
    if (totalCount > 1 && stackIdx === totalCount - 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle    = '#fff';
      ctx.font         = `bold ${Math.max(7, Math.floor(r * 0.72))}px Arial`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(totalCount, cx, cy);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Avatar rendering
  // ═══════════════════════════════════════════════════════════════════════════

  getAvatarCanvas(playerIdx) {
    if (!this._avatarCache[playerIdx]) {
      const ac = document.createElement('canvas');
      ac.width  = 48;
      ac.height = 48;
      const color = this.game.players[playerIdx]?.color || '#888';
      PixelArt.drawCharacter(ac, color);
      this._avatarCache[playerIdx] = ac;
    }
    return this._avatarCache[playerIdx];
  }

  invalidateAvatarCache() {
    this._avatarCache = {};
  }
}
