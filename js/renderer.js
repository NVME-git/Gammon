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
    const BOARD_H = H - PAD * 2;
    const boardY  = PAD;
    const CY      = boardY + BOARD_H / 2;
    const TH      = BOARD_H * 0.30;

    // Board spans full canvas width — no side columns
    const boardStartX = PAD;
    const boardEndX   = W - PAD;
    const PW          = (boardEndX - boardStartX) / 24;

    // Flip-aware point column x position
    const pp = i => boardStartX + (this.flipped ? (23 - i) : i) * PW;

    // ── Strip heights ────────────────────────────────────────────────────────
    const topStripH    = CY - TH - boardY;
    const bottomStripH = boardY + BOARD_H - (CY + TH);

    // ── Horizontal zone layout ───────────────────────────────────────────────
    // Zones live in the top / bottom strips, at the left and right ends.
    //   Top strip    = player who moves LEFTWARD  (unflipped: P1; flipped: P0)
    //   Bottom strip = player who moves RIGHTWARD (unflipped: P0; flipped: P1)
    //
    //   Top strip  :  [OFF at left]  ·· dice ··  [BAR at right]
    //   Bottom strip: [BAR at left]  ·· roll ··  [OFF at right]
    //
    // Entry (BAR) is on the side the player enters from; exit (OFF) on the
    // side they move toward — consistent regardless of flip state.
    // Number labels sit just outside the diamond tips; leave room for them
    const numFontH = Math.max(8, Math.floor(PW * 0.34));
    const numGap   = numFontH + 7;   // font height + breathing room

    const ZW = Math.min(80, topStripH * 1.05, bottomStripH * 1.05);

    const topPlayer    = this.flipped ? 0 : 1;   // left-moving
    const bottomPlayer = this.flipped ? 1 : 0;   // right-moving

    // Zones are inset from the diamond tips by numGap so they never overlap the numbers
    const topZoneH    = topStripH    - numGap;
    const botZoneY    = CY + TH      + numGap;
    const botZoneH    = bottomStripH - numGap;

    const allZones = is2P ? [
      // top strip  (anchored at boardY, stops before the number row)
      { player: topPlayer,    type: 'off', x: boardStartX,    y: boardY,  w: ZW, h: topZoneH },
      { player: topPlayer,    type: 'bar', x: boardEndX - ZW, y: boardY,  w: ZW, h: topZoneH },
      // bottom strip (starts after the number row)
      { player: bottomPlayer, type: 'bar', x: boardStartX,    y: botZoneY, w: ZW, h: botZoneH },
      { player: bottomPlayer, type: 'off', x: boardEndX - ZW, y: botZoneY, w: ZW, h: botZoneH },
    ] : [
      { player: 0, type: 'bar', x: boardStartX,    y: botZoneY, w: ZW, h: botZoneH },
      { player: 0, type: 'off', x: boardEndX - ZW, y: botZoneY, w: ZW, h: botZoneH },
    ];

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
      ctx.moveTo(pcx,     CY - TH);
      ctx.lineTo(px + PW, CY);
      ctx.lineTo(pcx,     CY + TH);
      ctx.lineTo(px,      CY);
      ctx.closePath();
      ctx.fill();

      // Point numbers — placed just outside the diamond tips, into the strip
      ctx.fillStyle    = labelColor;
      ctx.font         = `bold ${Math.max(8, Math.floor(PW * 0.34))}px Arial`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(i + 1,  pcx, CY - TH - 4);   // above top tip
      ctx.textBaseline = 'top';
      ctx.fillText(24 - i, pcx, CY + TH + 4);   // below bottom tip

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
        const offset = (s - (pt.count - 1) / 2) * (CR * 2 + 1);
        this._drawChecker(pcx, CY + offset, CR, pt.player, s, pt.count, theme);
      }
    }

    // ── Chevrons showing each player's movement direction ────────────────────
    this._drawChevrons(game, boardStartX, boardEndX, boardY, CY, TH, BOARD_H);

    // ── BAR / OFF zone boxes in the strips ───────────────────────────────────
    for (const zone of allZones) {
      if (zone.player >= game.numPlayers) continue;
      const pColor = game.players[zone.player].color;
      const pName  = game.players[zone.player].name;
      const count  = zone.type === 'bar'
        ? state.bar[zone.player]
        : state.borneOff[zone.player];
      this._drawZoneBox(ctx, zone, count, pName, pColor, theme);
      if (zone.type === 'bar') {
        this._barAreas.push({ x: zone.x, y: zone.y, w: zone.w, h: zone.h });
      } else {
        this._bearAreas.push({ x: zone.x, y: zone.y, w: zone.w, h: zone.h });
      }
    }

    // ── Highlights ────────────────────────────────────────────────────────────
    this._drawLinearHighlights(state, boardStartX, PW, allZones, theme, this.flipped);

    // ── Dice in the top strip (centred between zones) ────────────────────────
    this._drawDiceOnCanvas(state, boardStartX, boardEndX, boardY, CY, TH, ZW);

    // ── Roll button in the bottom strip ──────────────────────────────────────
    this._drawRollButton(state, boardStartX, boardEndX, CY, TH, boardY, BOARD_H, ZW);
  }

  // Draw a BAR or OFF zone box inside a strip
  _drawZoneBox(ctx, zone, count, playerName, playerColor, theme) {
    const { x, y, w, h, type } = zone;
    const cx = x + w / 2;

    // Tinted background
    ctx.fillStyle = playerColor + '28';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();

    // Coloured border
    ctx.save();
    ctx.strokeStyle = playerColor;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.stroke();
    ctx.restore();

    // Text — type label + optional count, centred vertically in the box
    const labelSize   = Math.max(9,  Math.floor(h * 0.22));
    const countSize   = Math.max(8,  Math.floor(h * 0.17));
    const textGroupH  = labelSize + (count > 0 ? countSize + 3 : 0);
    const textStartY  = y + (h - textGroupH) / 2;

    ctx.fillStyle    = playerColor;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    ctx.font = `bold ${labelSize}px Arial`;
    ctx.fillText(type === 'bar' ? 'BAR' : 'OFF', cx, textStartY);

    if (count > 0) {
      ctx.font = `bold ${countSize}px Arial`;
      ctx.fillText(`×${count}`, cx, textStartY + labelSize + 3);
    }

    // Small checker dots (only if there's space below the text group)
    const dotAreaTop = textStartY + textGroupH + 4;
    const dotAreaH   = y + h - dotAreaTop - 2;
    const dotR = Math.min(5, dotAreaH / 2, w / 8);
    if (dotR >= 3 && count > 0) {
      const maxDots      = Math.floor(w / (dotR * 2 + 3));
      const displayCount = Math.min(count, maxDots);
      const dotsW = displayCount * (dotR * 2 + 3) - 3;
      const dotX0 = cx - dotsW / 2 + dotR;
      const dotY  = dotAreaTop + dotR;
      for (let i = 0; i < displayCount; i++) {
        ctx.beginPath();
        ctx.arc(dotX0 + i * (dotR * 2 + 3), dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = playerColor;
        ctx.fill();
      }
    }
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

  _drawRollButton(state, boardStartX, boardEndX, CY, TH, boardY, BOARD_H, ZW = 0) {
    const ctx     = this.ctx;
    const theme   = this._theme();
    const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';
    const canRoll = state.phase === 'rolling';

    const stripH  = (boardY + BOARD_H) - (CY + TH);
    const btnH    = Math.min(stripH - 10, 54);
    // Keep button between the two zone boxes
    const innerLeft  = boardStartX + ZW + 8;
    const innerRight = boardEndX   - ZW - 8;
    const btnW    = Math.min(innerRight - innerLeft, 220);
    const btnX    = (innerLeft + innerRight) / 2 - btnW / 2;
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

  _drawDiceOnCanvas(state, boardStartX, boardEndX, boardY, CY, TH, ZW = 0) {
    if (state.dice.length === 0) return;

    const ctx    = this.ctx;
    const theme  = this._theme();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const playerColor = this.game.players[state.currentPlayer]?.color || 'gold';

    const topAreaH = (CY - TH) - boardY - 5;
    if (topAreaH < 22) return;

    const dieSize = topAreaH - 2;
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
      ctx.strokeStyle = used ? theme.boardBorder : playerColor;
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

  _drawLinearHighlights(state, boardStartX, PW, zones, theme, flipped) {
    const ctx = this.ctx;
    const p   = state.currentPlayer;
    const pp  = i => boardStartX + (flipped ? (23 - i) : i) * PW;

    if (state.selectedPoint !== null) {
      ctx.fillStyle = theme.selected;
      if (state.selectedPoint === 'bar') {
        const z = zones.find(z => z.type === 'bar' && z.player === p);
        if (z) ctx.fillRect(z.x, z.y, z.w, z.h);
      } else {
        ctx.fillRect(pp(state.selectedPoint), 0, PW, this.canvas.height);
      }
    }

    for (const vm of state.validMoves) {
      ctx.fillStyle = theme.validMove;
      if (vm === 'bearoff') {
        const z = zones.find(z => z.type === 'off' && z.player === p);
        if (z) ctx.fillRect(z.x, z.y, z.w, z.h);
      } else {
        ctx.fillRect(pp(vm), 0, PW, this.canvas.height);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Y-SHAPED BOARD (Trigammon) ──────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Y-shaped board for Trigammon (36 physical points).
   *
   * Three arms radiate from a central hub at 120° intervals:
   *   Arm A (phy 0–11):  down-right — P0 (Blue) & P1 (Red)
   *   Arm B (phy 12–23): upward     — P0 (Blue) & P2 (Green)
   *   Arm C (phy 24–35): down-left  — P1 (Red)  & P2 (Green)
   *
   * 12 diamond points per arm, centred on the arm axis (like bigammon).
   * Arm A is visually reversed so phy 0 is at the tip — this ensures
   * every player bears off at an arm tip:
   *   P0 → Arm B tip,  P1 → Arm A tip,  P2 → Arm C tip.
   *
   * BAR zones are placed near each player's start (at an arm tip).
   * OFF zones at the tip where each player bears off.
   */
  _renderTriangle() {
    const ctx   = this.ctx;
    const W     = this.canvas.width;
    const H     = this.canvas.height;
    const theme = this._theme();
    const game  = this.game;
    const state = game.getState();

    const HUD_H  = Math.min(64, H * 0.14);
    const boardH = H - HUD_H;
    const bCx    = W / 2;
    const bCy    = boardH * 0.50;

    // ── Arm directions (120° apart, Y-shape) ────────────────────────────────
    const armAngles = [Math.PI / 6, -Math.PI / 2, Math.PI * 5 / 6];
    const armDirs   = armAngles.map(a => ({
      dx: Math.cos(a), dy: Math.sin(a),
      nx: -Math.sin(a), ny: Math.cos(a),
    }));

    // ── Sizing ───────────────────────────────────────────────────────────────
    const maxR     = Math.min(W * 0.34, boardH * 0.36);
    const armW     = maxR * 0.22;
    const hw       = armW / 2;
    const hubR     = Math.max(armW * 0.6, 16);
    const armStart = hubR + 2;
    const armEnd   = maxR;
    const slotLen  = (armEnd - armStart) / 12;
    const CR       = Math.min(slotLen * 0.42, hw * 0.38, 10);
    const dHW      = hw * 0.92;          // diamond half-width across arm
    const dHL      = slotLen * 0.46;     // diamond half-length along arm

    // ── Player-colour pairs per arm ──────────────────────────────────────────
    const armColors = [
      [game.players[0].color, game.players[1].color],   // Arm A
      [game.players[0].color, game.players[2].color],   // Arm B
      [game.players[1].color, game.players[2].color],   // Arm C
    ];

    // Slot mapping: slot 0 = hub end, slot 11 = tip.
    // Arm A is reversed so phy 0 lands at the tip.
    const slotOf = (physIdx) => {
      const arm = Math.floor(physIdx / 12);
      const loc = physIdx % 12;
      return arm === 0 ? (11 - loc) : loc;
    };

    // ── Arm strip backgrounds ────────────────────────────────────────────────
    for (let arm = 0; arm < 3; arm++) {
      const { dx, dy, nx, ny } = armDirs[arm];

      ctx.fillStyle = theme.board;
      ctx.beginPath();
      ctx.moveTo(bCx + dx * armStart + nx * hw, bCy + dy * armStart + ny * hw);
      ctx.lineTo(bCx + dx * armEnd   + nx * hw, bCy + dy * armEnd   + ny * hw);
      ctx.lineTo(bCx + dx * armEnd   - nx * hw, bCy + dy * armEnd   - ny * hw);
      ctx.lineTo(bCx + dx * armStart - nx * hw, bCy + dy * armStart - ny * hw);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = theme.boardBorder;
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Dashed centre line
      ctx.save();
      ctx.strokeStyle = theme.boardBorder;
      ctx.globalAlpha = 0.22;
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bCx + dx * armStart, bCy + dy * armStart);
      ctx.lineTo(bCx + dx * armEnd,   bCy + dy * armEnd);
      ctx.stroke();
      ctx.restore();
    }

    // ── Central hub (visual junction) ────────────────────────────────────────
    ctx.fillStyle = theme.barArea;
    ctx.beginPath();
    ctx.arc(bCx, bCy, hubR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // ── Diamond points ───────────────────────────────────────────────────────
    const allPts = [];

    for (let arm = 0; arm < 3; arm++) {
      const { dx, dy, nx, ny } = armDirs[arm];
      const [c1, c2] = armColors[arm];

      for (let i = 0; i < 12; i++) {
        const physIdx = arm * 12 + i;
        const slot    = slotOf(physIdx);
        const t       = armStart + (slot + 0.5) * slotLen;

        const pcx = bCx + dx * t;
        const pcy = bCy + dy * t;

        // Diamond vertices (4-point rhombus centred on arm axis)
        ctx.fillStyle = (i % 2 === 0) ? c1 : c2;
        ctx.beginPath();
        ctx.moveTo(pcx + dx * dHL,  pcy + dy * dHL);   // forward tip
        ctx.lineTo(pcx + nx * dHW,  pcy + ny * dHW);   // left tip
        ctx.lineTo(pcx - dx * dHL,  pcy - dy * dHL);   // backward tip
        ctx.lineTo(pcx - nx * dHW,  pcy - ny * dHW);   // right tip
        ctx.closePath();
        ctx.fill();

        allPts.push({ physIdx, pcx, pcy, arm });
        this._pointCenters.push({
          cx: pcx, cy: pcy,
          r: Math.max(dHW, dHL) * 1.1,
          idx: physIdx,
        });
      }
    }

    // ── Point labels ─────────────────────────────────────────────────────────
    ctx.font         = `bold ${Math.max(6, CR * 0.55)}px Arial`;
    ctx.fillStyle    = 'rgba(255,255,255,0.45)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    for (const pt of allPts) ctx.fillText(pt.physIdx + 1, pt.pcx, pt.pcy);
    ctx.textBaseline = 'alphabetic';

    // ── Checkers (stacked perpendicular to arm, across the diamond width) ────
    for (const pt of allPts) {
      const sp = state.points[pt.physIdx];
      if (sp.count === 0) continue;
      const { nx, ny } = armDirs[pt.arm];
      for (let s = 0; s < sp.count; s++) {
        const offset = (s - (sp.count - 1) / 2) * (CR * 2 + 1);
        this._drawChecker(pt.pcx + nx * offset, pt.pcy + ny * offset,
                          CR, sp.player, s, sp.count, theme);
      }
    }

    // ── Direction chevrons along arm edges ───────────────────────────────────
    // Each arm: one player goes outward (hub→tip), the other inward (tip→hub).
    //   Arm A: P1 outward, P0 inward
    //   Arm B: P0 outward, P2 inward
    //   Arm C: P2 outward, P1 inward
    const armFlow = [
      { outP: 1, inP: 0 },
      { outP: 0, inP: 2 },
      { outP: 2, inP: 1 },
    ];

    const chevH = Math.min(hw * 0.55, 10);
    const chevW = chevH * 0.65;
    const chevN = Math.max(3, Math.floor((armEnd - armStart) / (slotLen * 3)));

    for (let arm = 0; arm < 3; arm++) {
      const { dx, dy, nx, ny } = armDirs[arm];
      const { outP, inP } = armFlow[arm];
      const outCol = game.players[outP].color;
      const inCol  = game.players[inP].color;

      for (let c = 0; c < chevN; c++) {
        const frac = (c + 0.5) / chevN;
        const t  = armStart + frac * (armEnd - armStart);
        const cx = bCx + dx * t;
        const cy = bCy + dy * t;
        const edgeDist = hw + chevH * 0.9;

        // Left edge: outward direction (same as arm direction)
        this._drawArmChevron(ctx, cx + nx * edgeDist, cy + ny * edgeDist,
                             chevW, chevH, dx, dy, outCol, 0.30);
        // Right edge: inward direction (opposite arm direction)
        this._drawArmChevron(ctx, cx - nx * edgeDist, cy - ny * edgeDist,
                             chevW, chevH, -dx, -dy, inCol, 0.30);
      }
    }

    // ── Zone boxes (BAR + OFF at each arm tip) ───────────────────────────────
    // At each arm tip: one player's BAR and another's OFF.
    //   Arm A tip: P0 BAR (start), P1 OFF (bear-off)
    //   Arm B tip: P2 BAR (start), P0 OFF (bear-off)
    //   Arm C tip: P1 BAR (start), P2 OFF (bear-off)
    const tipDefs = [
      { arm: 0, barP: 0, offP: 1 },
      { arm: 1, barP: 2, offP: 0 },
      { arm: 2, barP: 1, offP: 2 },
    ];

    const zoneR     = Math.min(22, maxR * 0.09);
    const bearZones = [];
    const barZones  = [];

    for (const td of tipDefs) {
      const { dx, dy, nx, ny } = armDirs[td.arm];
      const tipDist = armEnd + zoneR * 0.6;

      // BAR zone (positive-normal side of tip)
      const barTx = bCx + dx * tipDist + nx * (zoneR * 2);
      const barTy = bCy + dy * tipDist + ny * (zoneR * 2);
      const barPl = game.players[td.barP];
      const barCt = state.bar[td.barP];
      this._drawTipZone(ctx, barTx, barTy, zoneR, 'BAR', barCt, barPl.color);
      const bw = zoneR * 3.2, bh = zoneR * 1.6;
      this._barAreas.push({ x: barTx - bw / 2, y: barTy - bh / 2, w: bw, h: bh });
      barZones.push({ player: td.barP, tx: barTx, ty: barTy });

      // Bar checkers drawn next to the BAR pill
      if (barCt > 0) {
        for (let s = 0; s < barCt; s++) {
          this._drawChecker(
            barTx + dx * (zoneR * 1.4 + s * CR * 1.6),
            barTy + dy * (zoneR * 1.4 + s * CR * 1.6),
            CR * 0.55, td.barP, s, barCt, theme);
        }
      }

      // OFF zone (negative-normal side of tip)
      const offTx = bCx + dx * tipDist - nx * (zoneR * 2);
      const offTy = bCy + dy * tipDist - ny * (zoneR * 2);
      const offPl = game.players[td.offP];
      const offCt = state.borneOff[td.offP];
      this._drawTipZone(ctx, offTx, offTy, zoneR, 'OFF', offCt, offPl.color);
      this._bearAreas.push({ x: offTx - bw / 2, y: offTy - bh / 2, w: bw, h: bh });
      bearZones.push({ player: td.offP, tx: offTx, ty: offTy });
    }

    // ── Highlights ───────────────────────────────────────────────────────────
    const hlR = Math.max(dHW, dHL) * 1.1;
    this._drawArmHighlights(state, allPts, hlR, theme, barZones, bearZones);

    // ── HUD ──────────────────────────────────────────────────────────────────
    this._drawPolyHUD(state, W, H, HUD_H);
  }

  /** Draw a chevron pointing in direction (ddx, ddy). */
  _drawArmChevron(ctx, cx, cy, w, h, ddx, ddy, color, alpha) {
    // Rotate chevron to match direction
    const bx = -ddy, by = ddx;  // perpendicular
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth   = Math.max(1.2, h * 0.14);
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - ddx * w / 2 + bx * h / 2, cy - ddy * w / 2 + by * h / 2);
    ctx.lineTo(cx + ddx * w / 2,               cy + ddy * w / 2);
    ctx.lineTo(cx - ddx * w / 2 - bx * h / 2, cy - ddy * w / 2 - by * h / 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Draw a small pill-shaped zone label (BAR or OFF). */
  _drawTipZone(ctx, cx, cy, r, label, count, color) {
    const w = r * 3.2, h = r * 1.6;
    const x = cx - w / 2, y = cy - h / 2;

    ctx.fillStyle = color + '28';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle    = color;
    ctx.font         = `bold ${Math.max(7, r * 0.38)}px Arial`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label} \xd7${count}`, cx, cy);
    ctx.textBaseline = 'alphabetic';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── CROSS BOARD (Quadgammon) ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Cross-shaped board for Quadgammon (24 points, 6 per arm).
   *
   * Four arms at 90° intervals (clockwise order):
   *   Arm 0 (phy 0–5):   downward
   *   Arm 1 (phy 6–11):  leftward
   *   Arm 2 (phy 12–17): upward
   *   Arm 3 (phy 18–23): rightward
   *
   * Each player starts at one arm and circles clockwise through all four.
   * Triangles alternate sides within each arm (zigzag path).
   * Central hub = BAR.  Bear-off at each arm tip for the appropriate player.
   */
  _renderCross() {
    const ctx   = this.ctx;
    const W     = this.canvas.width;
    const H     = this.canvas.height;
    const theme = this._theme();
    const game  = this.game;
    const state = game.getState();

    const HUD_H  = Math.min(64, H * 0.14);
    const boardH = H - HUD_H;
    const bCx    = W / 2;
    const bCy    = boardH * 0.50;

    // ── Arm directions (clockwise: down → left → up → right) ────────────────
    const armAngles = [Math.PI / 2, Math.PI, -Math.PI / 2, 0];
    const armDirs   = armAngles.map(a => ({
      dx: Math.cos(a), dy: Math.sin(a),
      nx: -Math.sin(a), ny: Math.cos(a),
    }));

    // ── Sizing ───────────────────────────────────────────────────────────────
    const maxR     = Math.min(W * 0.34, boardH * 0.37);
    const armW     = maxR * 0.32;
    const hw       = armW / 2;
    const hubR     = Math.max(armW * 0.55, 18);
    const armStart = hubR + 4;
    const armEnd   = maxR;
    const slotLen  = (armEnd - armStart) / 6;
    const triH     = hw * 0.82;
    const CR       = Math.min(slotLen * 0.26, hw * 0.30, 10);

    // ── Arm strip backgrounds ────────────────────────────────────────────────
    for (let arm = 0; arm < 4; arm++) {
      const { dx, dy, nx, ny } = armDirs[arm];

      ctx.fillStyle = theme.board;
      ctx.beginPath();
      ctx.moveTo(bCx + dx * armStart + nx * hw, bCy + dy * armStart + ny * hw);
      ctx.lineTo(bCx + dx * armEnd   + nx * hw, bCy + dy * armEnd   + ny * hw);
      ctx.lineTo(bCx + dx * armEnd   - nx * hw, bCy + dy * armEnd   - ny * hw);
      ctx.lineTo(bCx + dx * armStart - nx * hw, bCy + dy * armStart - ny * hw);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = theme.boardBorder;
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Dashed centre line
      ctx.save();
      ctx.strokeStyle = theme.boardBorder;
      ctx.globalAlpha = 0.22;
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bCx + dx * armStart, bCy + dy * armStart);
      ctx.lineTo(bCx + dx * armEnd,   bCy + dy * armEnd);
      ctx.stroke();
      ctx.restore();
    }

    // ── Central hub (BAR) ────────────────────────────────────────────────────
    ctx.fillStyle = theme.barArea;
    ctx.beginPath();
    ctx.arc(bCx, bCy, hubR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.fillStyle    = theme.subtext;
    ctx.font         = `bold ${Math.max(9, hubR * 0.34)}px Arial`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BAR', bCx, bCy);
    ctx.textBaseline = 'alphabetic';
    this._barAreas.push({ x: bCx - hubR, y: bCy - hubR, w: hubR * 2, h: hubR * 2 });

    // ── Triangular points ────────────────────────────────────────────────────
    // 6 points per arm, each at its own slot, alternating sides.
    const allPts  = [];
    const dColors = [theme.triangle1, theme.triangle2];

    for (let arm = 0; arm < 4; arm++) {
      const { dx, dy, nx, ny } = armDirs[arm];

      for (let i = 0; i < 6; i++) {
        const physIdx = arm * 6 + i;
        const slot    = i;
        const side    = (i % 2 === 0) ? 1 : -1;

        const t1   = armStart + slot * slotLen;
        const t2   = armStart + (slot + 1) * slotLen;
        const tMid = (t1 + t2) / 2;

        const bx1  = bCx + dx * t1   + nx * side * hw;
        const by1  = bCy + dy * t1   + ny * side * hw;
        const bx2  = bCx + dx * t2   + nx * side * hw;
        const by2  = bCy + dy * t2   + ny * side * hw;
        const tipX = bCx + dx * tMid - nx * side * triH;
        const tipY = bCy + dy * tMid - ny * side * triH;

        ctx.fillStyle = dColors[physIdx % 2];
        ctx.beginPath();
        ctx.moveTo(bx1, by1);
        ctx.lineTo(bx2, by2);
        ctx.lineTo(tipX, tipY);
        ctx.closePath();
        ctx.fill();

        const pcx    = (bx1 + bx2 + tipX) / 3;
        const pcy    = (by1 + by2 + tipY) / 3;
        const baseCx = (bx1 + bx2) / 2;
        const baseCy = (by1 + by2) / 2;

        allPts.push({ physIdx, pcx, pcy, baseCx, baseCy, tipX, tipY });
        this._pointCenters.push({ cx: pcx, cy: pcy, r: slotLen * 0.50, idx: physIdx });
      }
    }

    // ── Point labels ─────────────────────────────────────────────────────────
    ctx.font         = `bold ${Math.max(6, CR * 0.65)}px Arial`;
    ctx.fillStyle    = 'rgba(255,255,255,0.35)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    for (const pt of allPts) ctx.fillText(pt.physIdx + 1, pt.pcx, pt.pcy);
    ctx.textBaseline = 'alphabetic';

    // ── Checkers ─────────────────────────────────────────────────────────────
    for (const pt of allPts) {
      const sp = state.points[pt.physIdx];
      if (sp.count === 0) continue;
      const ddx = pt.tipX - pt.baseCx;
      const ddy = pt.tipY - pt.baseCy;
      const len = Math.sqrt(ddx * ddx + ddy * ddy);
      if (len < 1) continue;
      const ux = ddx / len, uy = ddy / len;
      for (let s = 0; s < sp.count; s++) {
        const d = CR * 1.1 + s * (CR * 2 + 1);
        this._drawChecker(pt.baseCx + ux * d, pt.baseCy + uy * d,
                          CR, sp.player, s, sp.count, theme);
      }
    }

    // ── Bar checkers ─────────────────────────────────────────────────────────
    for (let p = 0; p < game.numPlayers; p++) {
      if (state.bar[p] === 0) continue;
      const angle = p * Math.PI / 2 - Math.PI / 4;
      for (let s = 0; s < state.bar[p]; s++) {
        const r = hubR * 0.3 + s * CR * 1.8;
        this._drawChecker(bCx + r * Math.cos(angle), bCy + r * Math.sin(angle),
                          CR * 0.65, p, s, state.bar[p], theme);
      }
    }

    // ── Bear-off zones ───────────────────────────────────────────────────────
    // P0 → arm 3 tip (right), P1 → arm 0 tip (down),
    // P2 → arm 1 tip (left),  P3 → arm 2 tip (up)
    const bearArmMap = [3, 0, 1, 2];
    const offR       = Math.min(26, maxR * 0.11);
    const bearZones  = [];

    for (let p = 0; p < 4; p++) {
      const bArm = bearArmMap[p];
      const { dx, dy } = armDirs[bArm];
      const d = armEnd + offR * 2.2;
      bearZones.push({ player: p, tx: bCx + dx * d, ty: bCy + dy * d });
    }

    this._drawBearOffPills(bearZones, offR, game, state, theme);

    // ── Highlights ───────────────────────────────────────────────────────────
    // Build barZones — cross board has one shared hub bar for all players
    const barZones = [];
    for (let p = 0; p < 4; p++) {
      barZones.push({ player: p, tx: bCx, ty: bCy });
    }
    this._drawArmHighlights(state, allPts, slotLen * 0.50, theme, barZones, bearZones);

    // ── HUD ──────────────────────────────────────────────────────────────────
    this._drawPolyHUD(state, W, H, HUD_H);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Shared helpers ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Dice + roll button strip drawn at the bottom of tri/quad boards.
   * Also registers _rollArea so canvas clicks reach handleRoll().
   */
  _drawPolyHUD(state, W, H, HUD_H) {
    const ctx     = this.ctx;
    const theme   = this._theme();
    const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';
    const hudY    = H - HUD_H;
    const midX    = W / 2;
    const canRoll = state.phase === 'rolling';

    // Background strip
    ctx.fillStyle = theme.panel || theme.board;
    ctx.fillRect(0, hudY, W, HUD_H);
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, hudY);
    ctx.lineTo(W, hudY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Divider between dice and button
    ctx.strokeStyle = theme.boardBorder;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(midX, hudY + 6);
    ctx.lineTo(midX, hudY + HUD_H - 6);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Dice (left half) ──────────────────────────────────────────────────
    const playerColor = this.game.players[state.currentPlayer]?.color || 'gold';
    if (state.dice.length > 0) {
      const dieSize = Math.min(HUD_H - 12, 44);
      const gap     = Math.max(5, dieSize * 0.15);

      const isDouble  = state.dice.length === 2 && state.dice[0] === state.dice[1];
      const display   = isDouble
        ? [state.dice[0], state.dice[0], state.dice[0], state.dice[0]]
        : [...state.dice];
      const remaining = isDouble
        ? state.movesLeft.filter(v => v === state.dice[0]).length
        : 0;
      const mlTrack   = [...state.movesLeft];
      const faces     = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      const totalW    = display.length * dieSize + (display.length - 1) * gap;
      const startX    = midX / 2 - totalW / 2;
      const startY    = hudY + (HUD_H - dieSize) / 2;

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

        ctx.globalAlpha = used ? 0.28 : 1;
        ctx.fillStyle   = theme.barArea;
        ctx.beginPath();
        ctx.roundRect(x, startY, dieSize, dieSize, 7);
        ctx.fill();

        ctx.strokeStyle = used ? theme.boardBorder : playerColor;
        ctx.lineWidth   = used ? 1 : 2.5;
        ctx.beginPath();
        ctx.roundRect(x, startY, dieSize, dieSize, 7);
        ctx.stroke();

        ctx.fillStyle    = isDark ? '#fff' : '#111';
        ctx.font         = `${Math.floor(dieSize * 0.82)}px Arial`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        const face    = faces[val] || String(val);
        const metrics = ctx.measureText(face);
        const ey = startY + dieSize / 2
                   + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
        ctx.fillText(face, x + dieSize / 2, ey);
        ctx.globalAlpha = 1;
      });
    }

    // ── Roll button (right half) ─────────────────────────────────────────
    const btnH   = Math.min(HUD_H - 12, 40);
    const btnW   = Math.min(midX * 0.75, 170);
    const btnX   = midX + (midX - btnW) / 2;
    const btnY   = hudY + (HUD_H - btnH) / 2;
    const radius = btnH / 2;

    this._rollArea = [];
    if (canRoll) {
      this._rollArea.push({ x: btnX, y: btnY, w: btnW, h: btnH });
    }

    ctx.globalAlpha = canRoll ? 1 : 0.35;
    ctx.fillStyle   = canRoll ? '#e94560' : (isDark ? '#2a2a4a' : '#b8a99a');
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, radius);
    ctx.fill();

    if (canRoll) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(btnX + 2, btnY + 2, btnW - 4, btnH / 2 - 2, [radius - 1, radius - 1, 0, 0]);
      ctx.fill();
    }

    ctx.fillStyle    = canRoll ? '#fff' : (isDark ? '#556' : '#8a7a6a');
    ctx.font         = `bold ${Math.min(btnH * 0.42, 17)}px Arial`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(canRoll ? '🎲 Roll' : '— Moving —', btnX + btnW / 2, btnY + btnH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha  = 1;
  }

  /**
   * Draw bear-off pill labels at arm tips (shared by tri/quad renderers).
   */
  _drawBearOffPills(bearZones, offR, game, state, theme) {
    const ctx = this.ctx;
    for (const bz of bearZones) {
      const pl    = game.players[bz.player];
      const count = state.borneOff[bz.player];
      const bzW   = offR * 3.4;
      const bzH   = offR * 1.7;
      const zx    = bz.tx - bzW / 2;
      const zy    = bz.ty - bzH / 2;

      ctx.fillStyle = pl.color + '28';
      ctx.beginPath();
      ctx.roundRect(zx, zy, bzW, bzH, bzH / 2);
      ctx.fill();

      ctx.strokeStyle = pl.color;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.roundRect(zx, zy, bzW, bzH, bzH / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const short = pl.name.length > 6 ? pl.name.slice(0, 5) + '\u2026' : pl.name;
      ctx.fillStyle    = pl.color;
      ctx.font         = `bold ${Math.max(8, offR * 0.40)}px Arial`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${short} OFF \xd7${count}`, bz.tx, bz.ty);
      ctx.textBaseline = 'alphabetic';

      this._bearAreas.push({ x: zx, y: zy, w: bzW, h: bzH });
    }
  }

  /**
   * Highlight selected point + valid-move destinations for arm-based boards.
   */
  _drawArmHighlights(state, allPts, highlightR, theme, barZones, bearZones) {
    const ctx = this.ctx;
    const p   = state.currentPlayer;

    // Selected point
    if (state.selectedPoint !== null) {
      ctx.fillStyle = theme.selected;
      if (state.selectedPoint === 'bar') {
        const bz = barZones.find(z => z.player === p);
        if (bz) {
          ctx.beginPath();
          ctx.arc(bz.tx, bz.ty, highlightR * 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const pt = allPts.find(q => q.physIdx === state.selectedPoint);
        if (pt) {
          ctx.beginPath();
          ctx.arc(pt.pcx, pt.pcy, highlightR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Valid move destinations
    for (const vm of state.validMoves) {
      ctx.fillStyle = theme.validMove;
      if (vm === 'bearoff') {
        const bz = bearZones.find(z => z.player === p);
        if (bz) {
          ctx.beginPath();
          ctx.arc(bz.tx, bz.ty, highlightR * 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const pt = allPts.find(q => q.physIdx === vm);
        if (pt) {
          ctx.beginPath();
          ctx.arc(pt.pcx, pt.pcy, highlightR, 0, Math.PI * 2);
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
