import { Container, Graphics, Text, Sprite } from 'pixi.js';
import { getCheckerTexture } from '../textures.js';
import { drawFloatingDice, drawCheckerPips } from './shared.js';

/**
 * Build the linear board layout (Unigammon / Bigammon).
 *
 * 24 diamond points in a horizontal strip with BAR/OFF zones
 * in the top and bottom strips.
 */
export function buildLinearBoard(app, container, game, state, theme, flipped, hitRegions, showNumbers = true) {
  const W = app.screen.width;
  const H = app.screen.height;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const is2P = game.numPlayers === 2;

  const PAD     = 14;
  const BOARD_H = H - PAD * 2;
  const boardY  = PAD;
  const CY      = boardY + BOARD_H / 2;
  const TH      = BOARD_H * 0.30;

  // Float cluster uses dieSize=72 → boxW = 2*72 + 3*8 = 168. Shift board right to clear it.
  const FLOAT_DIE   = 72;
  const FLOAT_BOX_W = 2 * FLOAT_DIE + 3 * 8; // = 168
  const boardStartX = PAD + FLOAT_BOX_W + 12;  // = 194 — leaves 12px gap after cluster
  const boardEndX   = W - PAD;
  const PW          = (boardEndX - boardStartX) / 24;

  const pp = i => boardStartX + (flipped ? (23 - i) : i) * PW;

  // ── Strip heights ──────────────────────────────────────────────────────
  const topStripH    = CY - TH - boardY;
  const bottomStripH = boardY + BOARD_H - (CY + TH);

  const numFontH = Math.max(8, Math.floor(PW * 0.34));
  const numGap   = numFontH + 7;
  const ZW       = Math.min(80, topStripH * 1.05, bottomStripH * 1.05);

  const topPlayer    = flipped ? 0 : 1;
  const bottomPlayer = flipped ? 1 : 0;

  const topZoneH = topStripH - numGap;
  const botZoneY = CY + TH + numGap;
  const botZoneH = bottomStripH - numGap;

  const allZones = is2P ? [
    { player: topPlayer,    type: 'off', x: boardStartX,    y: boardY,  w: ZW, h: topZoneH },
    { player: topPlayer,    type: 'bar', x: boardEndX - ZW, y: boardY,  w: ZW, h: topZoneH },
    { player: bottomPlayer, type: 'bar', x: boardStartX,    y: botZoneY, w: ZW, h: botZoneH },
    { player: bottomPlayer, type: 'off', x: boardEndX - ZW, y: botZoneY, w: ZW, h: botZoneH },
  ] : [
    { player: 0, type: 'bar', x: boardStartX,    y: botZoneY, w: ZW, h: botZoneH },
    { player: 0, type: 'off', x: boardEndX - ZW, y: botZoneY, w: ZW, h: botZoneH },
  ];

  // ── Board background ───────────────────────────────────────────────────
  const bg = new Graphics();
  bg.rect(PAD, PAD, W - PAD * 2, BOARD_H);
  bg.fill(theme.board);
  container.addChild(bg);

  // ── Home board markers ─────────────────────────────────────────────────
  // Marks the 6 inner points where each player can begin bearing off.
  _drawHomeBoardMarkers(container, game, boardStartX, boardEndX, boardY, BOARD_H, PW, CY, TH, flipped, is2P, bottomPlayer, topPlayer);

  // ── Dashed centre axis ─────────────────────────────────────────────────
  const axis = new Graphics();
  const dashLen = 3, gapLen = 6;
  for (let x = boardStartX; x < boardEndX; x += dashLen + gapLen) {
    axis.moveTo(x, CY);
    axis.lineTo(Math.min(x + dashLen, boardEndX), CY);
  }
  axis.stroke({ width: 1, color: theme.boardBorder, alpha: 0.4 });
  container.addChild(axis);

  // ── Highlights (drawn behind diamonds/checkers) ────────────────────────
  const hlGfx = new Graphics();
  _drawHighlights(hlGfx, state, boardStartX, PW, allZones, theme, flipped, H);
  container.addChild(hlGfx);

  // ── 24 diamond points ──────────────────────────────────────────────────
  const dColors = [theme.triangle1, theme.triangle2];
  const diamonds = new Graphics();

  for (let i = 0; i < 24; i++) {
    const px  = pp(i);
    const pcx = px + PW / 2;

    diamonds.poly([pcx, CY - TH, px + PW, CY, pcx, CY + TH, px, CY]);
    diamonds.fill(dColors[i % 2]);

    // Diamond polygon hit area (exact diamond shape, not full column)
    hitRegions.pointPolygons.push({
      poly: [pcx, CY - TH, px + PW, CY, pcx, CY + TH, px, CY],
      idx: i,
    });
  }
  container.addChild(diamonds);

  // ── Point labels ───────────────────────────────────────────────────────
  const labelStyle = {
    fontFamily: 'Arial',
    fontWeight: 'bold',
    fontSize: Math.max(8, Math.floor(PW * 0.34)),
    fill: 0xffffff,
    alpha: 0.88,
  };

  if (showNumbers) for (let i = 0; i < 24; i++) {
    const pcx = pp(i) + PW / 2;

    const topLabel = new Text({ text: String(i + 1), style: labelStyle });
    topLabel.anchor.set(0.5, 1);
    topLabel.x = pcx;
    topLabel.y = CY - TH - 4;
    topLabel.alpha = 0.88;
    container.addChild(topLabel);

    const botLabel = new Text({ text: String(24 - i), style: labelStyle });
    botLabel.anchor.set(0.5, 0);
    botLabel.x = pcx;
    botLabel.y = CY + TH + 4;
    botLabel.alpha = 0.88;
    container.addChild(botLabel);
  }

  // ── Checkers ───────────────────────────────────────────────────────────
  const CR = Math.min(PW / 2 - 2, 14);

  for (let i = 0; i < 24; i++) {
    const pt = state.points[i];
    if (pt.count === 0) continue;
    const pcx   = pp(i) + PW / 2;
    const color = game.players[pt.player]?.color || '#888';
    const tex   = getCheckerTexture(app.renderer, color, CR);

    for (let s = 0; s < pt.count; s++) {
      const offset = (s - (pt.count - 1) / 2) * (CR * 2 + 1);
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      sp.x = pcx;
      sp.y = CY + offset;
      container.addChild(sp);
    }

    // Stack count badge on top checker
    if (pt.count > 1) {
      const badgeY = CY + ((pt.count - 1) - (pt.count - 1) / 2) * (CR * 2 + 1);
      const badge = new Text({
        text: String(pt.count),
        style: {
          fontFamily: 'Arial',
          fontWeight: 'bold',
          fontSize: Math.max(7, CR * 0.65),
          fill: 0xffffff,
        },
      });
      badge.anchor.set(0.5);
      badge.x = pcx;
      badge.y = badgeY;
      container.addChild(badge);
    }
  }

  // ── Movement chevrons ──────────────────────────────────────────────────
  if (game.numPlayers >= 2) {
    _drawChevrons(container, game, boardStartX, boardEndX, boardY, CY, TH, BOARD_H, flipped);
  }

  // ── BAR / OFF zones — checker pip display ─────────────────────────────
  for (const zone of allZones) {
    if (zone.player >= game.numPlayers) continue;
    const pColor = game.players[zone.player].color;
    const count  = zone.type === 'bar'
      ? state.bar[zone.player]
      : state.borneOff[zone.player];
    const label = zone.type === 'bar' ? 'BAR' : 'OFF';
    const zCx = zone.x + zone.w / 2;
    const zCy = zone.y + zone.h / 2;

    // Tinted zone background
    const zoneBg = new Graphics();
    zoneBg.roundRect(zone.x, zone.y, zone.w, zone.h, 6);
    zoneBg.fill({ color: pColor, alpha: 0.12 });
    zoneBg.roundRect(zone.x, zone.y, zone.w, zone.h, 6);
    zoneBg.stroke({ color: pColor, width: 1.5, alpha: 0.45 });
    container.addChild(zoneBg);

    drawCheckerPips(container, zCx, zCy, label, count, pColor, numFontH);

    if (zone.type === 'bar') {
      hitRegions.barAreas.push({ x: zone.x, y: zone.y, w: zone.w, h: zone.h });
    } else {
      hitRegions.bearAreas.push({ x: zone.x, y: zone.y, w: zone.w, h: zone.h });
    }
  }

  // ── Floating dice + Roll + Undo (smaller dice to fit beside board) ───
  drawFloatingDice(container, state, game, theme, isDark,
    { showButtons: true, showUndo: true, hitRegions, dieSize: FLOAT_DIE });
}

// ═════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═════════════════════════════════════════════════════════════════════════════

function _drawHomeBoardMarkers(container, game, boardStartX, boardEndX, boardY, BOARD_H, PW, CY, TH, flipped, is2P, bottomPlayer, topPlayer) {
  const gfx = new Graphics();
  const homeW = 6 * PW;

  if (is2P) {
    // P0/bottomPlayer home is the 6 points nearest their OFF zone
    const p0HomeX = flipped ? boardStartX : boardEndX - homeW;
    const p1HomeX = flipped ? boardEndX - homeW : boardStartX;
    const p0Color = game.players[bottomPlayer].color;
    const p1Color = game.players[topPlayer].color;

    // Bottom strip (P0 home)
    gfx.rect(p0HomeX, CY + TH, homeW, boardY + BOARD_H - (CY + TH));
    gfx.fill({ color: p0Color, alpha: 0.12 });
    // Inner boundary line
    const p0BoundX = flipped ? p0HomeX + homeW : p0HomeX;
    gfx.moveTo(p0BoundX, CY + TH);
    gfx.lineTo(p0BoundX, boardY + BOARD_H);
    gfx.stroke({ width: 2, color: p0Color, alpha: 0.50 });

    // Top strip (P1 home)
    gfx.rect(p1HomeX, boardY, homeW, CY - TH - boardY);
    gfx.fill({ color: p1Color, alpha: 0.12 });
    const p1BoundX = flipped ? p1HomeX : p1HomeX + homeW;
    gfx.moveTo(p1BoundX, boardY);
    gfx.lineTo(p1BoundX, CY - TH);
    gfx.stroke({ width: 2, color: p1Color, alpha: 0.50 });

    // Also shade the diamond zone for the 6 home columns at very low alpha
    gfx.rect(p0HomeX, CY - TH, homeW, TH * 2);
    gfx.fill({ color: p0Color, alpha: 0.06 });
    gfx.rect(p1HomeX, CY - TH, homeW, TH * 2);
    gfx.fill({ color: p1Color, alpha: 0.06 });
  } else {
    // 1P: just P0's home on the right
    const p0HomeX = boardEndX - homeW;
    const p0Color = game.players[0].color;
    gfx.rect(p0HomeX, CY + TH, homeW, boardY + BOARD_H - (CY + TH));
    gfx.fill({ color: p0Color, alpha: 0.12 });
    gfx.moveTo(p0HomeX, CY + TH);
    gfx.lineTo(p0HomeX, boardY + BOARD_H);
    gfx.stroke({ width: 2, color: p0Color, alpha: 0.50 });
  }

  container.addChild(gfx);
}

function _drawHighlights(gfx, state, boardStartX, PW, zones, theme, flipped, canvasH) {
  // Diamond point highlights are handled by the pulse layer in pixi-renderer.js.
  // Only highlight the BAR / OFF zones here (those aren't pointPolygons).
  const p = state.currentPlayer;

  if (state.selectedPoint === 'bar') {
    const z = zones.find(z => z.type === 'bar' && z.player === p);
    if (z) { gfx.rect(z.x, z.y, z.w, z.h); gfx.fill(theme.selected); }
  }

  for (const vm of state.validMoves) {
    if (vm === 'bearoff') {
      const z = zones.find(z => z.type === 'off' && z.player === p);
      if (z) { gfx.rect(z.x, z.y, z.w, z.h); gfx.fill(theme.validMove); }
    }
  }
}


function _drawChevrons(container, game, boardStartX, boardEndX, boardY, CY, TH, BOARD_H, flipped) {
  const rightPlayer = flipped ? 1 : 0;
  const leftPlayer  = flipped ? 0 : 1;
  const rightColor  = game.players[rightPlayer]?.color || '#888';
  const leftColor   = game.players[leftPlayer]?.color  || '#888';

  const topStripCY    = boardY + ((CY - TH) - boardY) / 2;
  const bottomStripCY = (CY + TH) + (boardY + BOARD_H - (CY + TH)) / 2;

  // Larger, bolder chevrons
  const chevH   = Math.min((CY - TH - boardY) * 0.60, 28);
  const chevW   = chevH * 0.7;
  const spacing = Math.max(36, (boardEndX - boardStartX) / 16);
  const boardW  = boardEndX - boardStartX;
  const count   = Math.floor(boardW / spacing);
  const offset  = (boardW - (count - 1) * spacing) / 2;

  const gfx = new Graphics();

  for (let i = 0; i < count; i++) {
    const x = boardStartX + offset + i * spacing;

    // Top strip: leftward (toward left player's home)
    _chevron(gfx, x, topStripCY, chevW, chevH, false, leftColor, 0.60);
    // Bottom strip: rightward (toward right player's home)
    _chevron(gfx, x, bottomStripCY, chevW, chevH, true, rightColor, 0.60);
  }

  container.addChild(gfx);
}

function _chevron(gfx, cx, cy, w, h, pointRight, color, alpha) {
  const lw = Math.max(2, h * 0.18);

  if (pointRight) {
    gfx.moveTo(cx - w / 2, cy - h / 2);
    gfx.lineTo(cx + w / 2, cy);
    gfx.lineTo(cx - w / 2, cy + h / 2);
  } else {
    gfx.moveTo(cx + w / 2, cy - h / 2);
    gfx.lineTo(cx - w / 2, cy);
    gfx.lineTo(cx + w / 2, cy + h / 2);
  }
  gfx.stroke({ width: lw, color, alpha, cap: 'round', join: 'round' });
}

