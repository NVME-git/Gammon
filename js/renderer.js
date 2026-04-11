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
    this._rollArea    = [];   // { x, y, w, h }
    this._pointCenters = [];  // { cx, cy, idx }  (for tri/quad boards)

    // Mini-canvas cache for pixel-art avatars
    this._avatarCache = {};

    // Animation state
    this._animating   = false;
    this._animQueue   = [];

    // Board flip (set externally by main.js)
    this.flipped = false;
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
    this._rollArea     = [];
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

    for (const a of this._rollArea) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
        return { type: 'roll' };
      }
    }
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
    const ctx   = this.ctx;
    const W     = this.canvas.width;
    const H     = this.canvas.height;
    const theme = this._theme();
    const game  = this.game;
    const state = game.getState();
    const is2P  = game.numPlayers === 2;

    const PAD     = 14;
    const ZONE_W  = 56;   // width of each BAR or OFF side zone
    const BOARD_H = H - PAD * 2;
    const boardY  = PAD;
    const CY      = boardY + BOARD_H / 2;
    const TH      = BOARD_H * 0.30;   // diamond half-height (leaves room for dice above)

    // ── Zone layout ─────────────────────────────────────────────────────────
    // 2-player : [P1-OFF][P0-BAR] | 24 pts | [P1-BAR][P0-OFF]
    // 1-player : [P0-BAR]         | 24 pts | [P0-OFF]
    const numSide    = is2P ? 2 : 1;
    const boardStartX = PAD + ZONE_W * numSide;
    const AVAIL      = W - PAD * 2 - ZONE_W * numSide * 2;
    const PW         = AVAIL / 24;
    const boardEndX  = boardStartX + PW * 24;

    // Flip-aware point column x position
    const pp = i => boardStartX + (this.flipped ? (23 - i) : i) * PW;

    // Zone content definitions (player + type, no position yet)
    const leftData  = is2P
      ? [{ player: 1, type: 'off' }, { player: 0, type: 'bar' }]
      : [{ player: 0, type: 'bar' }];
    const rightData = is2P
      ? [{ player: 1, type: 'bar' }, { player: 0, type: 'off' }]
      : [{ player: 0, type: 'off' }];

    // When flipped, swap left/right content so BAR/OFF stay with the correct edge
    const leftContent  = this.flipped ? rightData : leftData;
    const rightContent = this.flipped ? leftData  : rightData;

    const leftZones  = leftContent.map( (d, k) => ({ ...d, x: PAD          + k * ZONE_W }));
    const rightZones = rightContent.map((d, k) => ({ ...d, x: boardEndX    + k * ZONE_W }));
    const allZones   = [...leftZones, ...rightZones];

    // ── Board background ─────────────────────────────────────────────────────
    ctx.fillStyle = theme.board;
    ctx.beginPath();
    ctx.roundRect(PAD, PAD, W - PAD * 2, BOARD_H, 12);
    ctx.fill();
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // ── Dashed centre axis line ──────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(boardStartX, CY);
    ctx.lineTo(boardEndX,   CY);
    ctx.stroke();
    ctx.restore();

    // ── 24 diamond point shapes (full, symmetric, all centred on CY) ─────────
    const dColors    = [theme.triangle1, theme.triangle2];
    const labelColor = 'rgba(255,255,255,0.88)';
    for (let i = 0; i < 24; i++) {
      const px  = pp(i);
      const pcx = px + PW / 2;
      const col = dColors[i % 2];

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(pcx,     CY - TH);  // top tip
      ctx.lineTo(px + PW, CY);       // right (widest — on the axis)
      ctx.lineTo(pcx,     CY + TH);  // bottom tip
      ctx.lineTo(px,      CY);       // left (widest — on the axis)
      ctx.closePath();
      ctx.fill();

      // Point numbers — top tip: forward order; bottom tip: reversed order
      ctx.fillStyle    = labelColor;
      ctx.font         = `bold ${Math.max(8, Math.floor(PW * 0.34))}px Arial`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(i + 1,  pcx, CY - TH + 13);   // top
      ctx.fillText(24 - i, pcx, CY + TH - 4);     // bottom (reversed)

      this._pointAreas.push({ x: px, y: boardY, w: PW, h: BOARD_H, idx: i });
    }

    // ── Checkers (stack centred on the horizontal axis) ───────────────────────
    const CR = Math.min(PW / 2 - 2, 14);
    for (let i = 0; i < 24; i++) {
      const pt = state.points[i];
      if (pt.count === 0) continue;

      const px  = pp(i);
      const pcx = px + PW / 2;

      for (let s = 0; s < pt.count; s++) {
        // Centre the entire stack around CY
        const offset = (s - (pt.count - 1) / 2) * (CR * 2 + 1);
        this._drawChecker(pcx, CY + offset, CR, pt.player, s, pt.count, theme);
      }
    }

    // ── Side zones: BAR and OFF, colour-coded per player ─────────────────────
    const ZCR = Math.min(ZONE_W / 2 - 4, 12);
    for (const zone of allZones) {
      if (zone.player >= game.numPlayers) continue;

      const pColor = game.players[zone.player].color;
      const count  = zone.type === 'bar'
        ? state.bar[zone.player]
        : state.borneOff[zone.player];

      // Player-coloured tinted background
      ctx.fillStyle = pColor + '28';
      ctx.fillRect(zone.x, boardY, ZONE_W, BOARD_H);

      // Player-coloured border
      ctx.save();
      ctx.strokeStyle = pColor;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.45;
      ctx.strokeRect(zone.x + 1, boardY + 1, ZONE_W - 2, BOARD_H - 2);
      ctx.restore();

      // Labels
      ctx.fillStyle    = pColor;
      ctx.font         = 'bold 9px Arial';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`P${zone.player + 1}`, zone.x + ZONE_W / 2, boardY + 5);
      ctx.fillText(zone.type === 'bar' ? 'BAR' : 'OFF', zone.x + ZONE_W / 2, boardY + 16);
      ctx.textBaseline = 'alphabetic';

      // Count badge
      if (count > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font      = 'bold 10px Arial';
        ctx.fillText(`×${count}`, zone.x + ZONE_W / 2, boardY + 31);
      }

      // Checker stack inside zone
      for (let i = 0; i < count; i++) {
        const zy = boardY + 38 + i * (ZCR * 2 + 2) + ZCR;
        if (zy + ZCR > boardY + BOARD_H - 6) break;
        this._drawChecker(zone.x + ZONE_W / 2, zy, ZCR, zone.player, i, count, theme);
      }

      // Register hit areas
      if (zone.type === 'bar') {
        this._barAreas.push({ x: zone.x, y: boardY, w: ZONE_W, h: BOARD_H });
      } else {
        this._bearAreas.push({ x: zone.x, y: boardY, w: ZONE_W, h: BOARD_H });
      }
    }

    // ── Chevrons showing each player's movement direction ────────────────────
    this._drawChevrons(game, boardStartX, boardEndX, boardY, CY, TH, BOARD_H);

    // ── Highlights (drawn last, transparent overlay over everything) ──────────
    this._drawLinearHighlights(state, boardStartX, PW, allZones, ZONE_W, BOARD_H, boardY, theme, this.flipped);

    // ── Dice drawn in the top free area ──────────────────────────────────────
    this._drawDiceOnCanvas(state, boardStartX, boardEndX, boardY, CY, TH);

    // ── Roll button drawn in the bottom free area ─────────────────────────────
    this._drawRollButton(state, boardStartX, boardEndX, CY, TH, boardY, BOARD_H);
  }

  _drawChevrons(game, boardStartX, boardEndX, boardY, CY, TH, BOARD_H) {
    if (game.numPlayers < 2) return;

    const ctx = this.ctx;

    // Which player moves visually rightward / leftward depends on flip state.
    // Unflipped: P0 → right, P1 ← left
    // Flipped  : P1 → right, P0 ← left
    const rightPlayer = this.flipped ? 1 : 0;
    const leftPlayer  = this.flipped ? 0 : 1;

    const rightColor = game.players[rightPlayer]?.color || '#888';
    const leftColor  = game.players[leftPlayer]?.color  || '#888';

    const topStripCY    = boardY + ((CY - TH) - boardY) / 2;       // centre of top strip
    const bottomStripCY = (CY + TH) + (boardY + BOARD_H - (CY + TH)) / 2; // centre of bottom strip

    const chevH   = Math.min((CY - TH - boardY) * 0.45, 20);
    const chevW   = chevH * 0.7;
    const spacing = Math.max(36, (boardEndX - boardStartX) / 18);
    const boardW  = boardEndX - boardStartX;
    const count   = Math.floor(boardW / spacing);
    const offset  = (boardW - (count - 1) * spacing) / 2;

    for (let i = 0; i < count; i++) {
      const x = boardStartX + offset + i * spacing;
      // Top strip: leftward (leftPlayer's color)
      this._drawOneChevron(ctx, x, topStripCY, chevW, chevH, false, leftColor, 0.22);
      // Bottom strip: rightward (rightPlayer's color)
      this._drawOneChevron(ctx, x, bottomStripCY, chevW, chevH, true, rightColor, 0.22);
    }
  }

  _drawOneChevron(ctx, cx, cy, w, h, pointRight, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth   = Math.max(1.5, h * 0.13);
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    if (pointRight) {
      ctx.moveTo(cx - w / 2, cy - h / 2);
      ctx.lineTo(cx + w / 2, cy);
      ctx.lineTo(cx - w / 2, cy + h / 2);
    } else {
      ctx.moveTo(cx + w / 2, cy - h / 2);
      ctx.lineTo(cx - w / 2, cy);
      ctx.lineTo(cx + w / 2, cy + h / 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawRollButton(state, boardStartX, boardEndX, CY, TH, boardY, BOARD_H) {
    const ctx     = this.ctx;
    const theme   = this._theme();
    const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';
    const canRoll = state.phase === 'rolling';

    const stripH  = (boardY + BOARD_H) - (CY + TH);
    const btnH    = Math.min(stripH - 10, 54);
    const btnW    = Math.min((boardEndX - boardStartX) * 0.38, 220);
    const btnX    = (boardStartX + boardEndX) / 2 - btnW / 2;
    const btnY    = (CY + TH) + (stripH - btnH) / 2;
    const radius  = btnH / 2;

    // Register hit area only when clickable
    this._rollArea = [];
    if (canRoll) {
      this._rollArea.push({ x: btnX, y: btnY, w: btnW, h: btnH });
    }

    // Button body
    ctx.globalAlpha = canRoll ? 1 : 0.35;
    const accent    = '#e94560';
    ctx.fillStyle   = canRoll ? accent : (isDark ? '#2a2a4a' : '#b8a99a');
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, radius);
    ctx.fill();

    // Subtle inner highlight
    if (canRoll) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(btnX + 2, btnY + 2, btnW - 4, btnH / 2 - 2, [radius - 1, radius - 1, 0, 0]);
      ctx.fill();
    }

    // Label
    const fontSize = Math.min(btnH * 0.42, 22);
    ctx.fillStyle    = canRoll ? '#ffffff' : (isDark ? '#556' : '#8a7a6a');
    ctx.font         = `bold ${fontSize}px Arial`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(canRoll ? '🎲  Roll Dice' : '— Moving —', btnX + btnW / 2, btnY + btnH / 2);
    ctx.textBaseline = 'alphabetic';

    ctx.globalAlpha = 1;
  }

  _drawDiceOnCanvas(state, boardStartX, boardEndX, boardY, CY, TH) {
    if (state.dice.length === 0) return;

    const ctx    = this.ctx;
    const theme  = this._theme();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const topAreaH = (CY - TH) - boardY - 10;
    if (topAreaH < 22) return;

    const dieSize = topAreaH - 6;   // fill the full available height
    const gap     = Math.max(6, dieSize * 0.15);

    const isDouble = state.dice.length === 2 && state.dice[0] === state.dice[1];
    const display  = isDouble
      ? [state.dice[0], state.dice[0], state.dice[0], state.dice[0]]
      : [...state.dice];

    const remaining = isDouble
      ? state.movesLeft.filter(v => v === state.dice[0]).length
      : 0;

    const mlTrack = [...state.movesLeft];
    const faces   = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

    const totalW = display.length * dieSize + (display.length - 1) * gap;
    const startX = (boardStartX + boardEndX) / 2 - totalW / 2;
    const startY = boardY + 6 + (topAreaH - dieSize) / 2;

    display.forEach((val, i) => {
      let used;
      if (isDouble) {
        used = i >= remaining;
      } else {
        const idx = mlTrack.indexOf(val);
        used = idx === -1;
        if (!used) mlTrack.splice(idx, 1);
      }

      const x = startX + i * (dieSize + gap);
      const y = startY;

      ctx.globalAlpha = used ? 0.28 : 1;

      // Die body
      ctx.fillStyle = theme.barArea;
      ctx.beginPath();
      ctx.roundRect(x, y, dieSize, dieSize, 9);
      ctx.fill();

      // Border — bright yellow for active, muted for used
      ctx.strokeStyle = used ? theme.boardBorder : 'rgba(255,215,50,0.95)';
      ctx.lineWidth   = used ? 1 : 2.5;
      ctx.beginPath();
      ctx.roundRect(x, y, dieSize, dieSize, 9);
      ctx.stroke();

      // Die face emoji — use bounding-box metrics for true visual centering
      ctx.fillStyle    = isDark ? '#ffffff' : '#1a1a1a';
      ctx.font         = `${Math.floor(dieSize * 0.82)}px Arial`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      const face    = faces[val] || String(val);
      const metrics = ctx.measureText(face);
      const ey      = y + dieSize / 2
                        + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      ctx.fillText(face, x + dieSize / 2, ey);

      ctx.globalAlpha = 1;
    });
  }

  _drawLinearHighlights(state, boardStartX, PW, zones, ZONE_W, BOARD_H, boardY, theme, flipped) {
    const ctx = this.ctx;
    const p   = state.currentPlayer;
    const pp  = i => boardStartX + (flipped ? (23 - i) : i) * PW;

    if (state.selectedPoint !== null) {
      ctx.fillStyle = theme.selected;
      if (state.selectedPoint === 'bar') {
        const barZone = zones.find(z => z.type === 'bar' && z.player === p);
        if (barZone) ctx.fillRect(barZone.x, boardY, ZONE_W, BOARD_H);
      } else {
        ctx.fillRect(pp(state.selectedPoint), boardY, PW, BOARD_H);
      }
    }

    for (const vm of state.validMoves) {
      ctx.fillStyle = theme.validMove;
      if (vm === 'bearoff') {
        const offZone = zones.find(z => z.type === 'off' && z.player === p);
        if (offZone) ctx.fillRect(offZone.x, boardY, ZONE_W, BOARD_H);
      } else {
        ctx.fillRect(pp(vm), boardY, PW, BOARD_H);
      }
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

    // Bearing-off labels at vertices (and register hit areas)
    for (let p = 0; p < this.game.numPlayers; p++) {
      const homeVertex = verts[p];
      const count      = state.borneOff[p];
      const color      = this.game.players[p].color;
      ctx.fillStyle    = color;
      ctx.font         = 'bold 12px Arial';
      ctx.textAlign    = 'center';
      ctx.fillText(`P${p + 1} off: ${count}`, homeVertex.x, homeVertex.y - 16);

      // Register bear-off click area near vertex
      this._bearAreas.push({ x: homeVertex.x - 36, y: homeVertex.y - 30, w: 72, h: 28 });
    }

    // Highlights
    this._drawPolyHighlights(state, pts, PR, theme, cx, cy, verts);
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
    const bearTips = [];
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
      bearTips.push({ tx, ty });
    }

    // Highlights
    this._drawPolyHighlights(state, pts, PR, theme, cx, cy, null, bearTips, armDefs, armW);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Shared helpers ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  _drawPolyHighlights(state, pts, PR, theme, boardCX, boardCY, triVerts = null, quadTips = null) {
    const ctx = this.ctx;
    const p   = state.currentPlayer;

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
      if (vm === 'bearoff') {
        // Highlight the current player's bear-off zone
        if (triVerts) {
          const v = triVerts[p];
          ctx.fillStyle = theme.validMove;
          ctx.beginPath();
          ctx.arc(v.x, v.y, PR * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (quadTips) {
          const tip = quadTips[p];
          if (tip) {
            ctx.fillStyle = theme.validMove;
            ctx.beginPath();
            ctx.arc(tip.tx, tip.ty, PR * 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        continue;
      }
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
