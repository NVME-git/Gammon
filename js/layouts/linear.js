import { Container, Graphics, Text } from 'pixi.js';
import { getCheckerTexture, getWoodTexture } from '../textures.js';
import { Sprite } from 'pixi.js';

/**
 * Build the linear board layout (Unigammon / Bigammon).
 *
 * 24 diamond points in a horizontal strip with BAR/OFF zones
 * in the top and bottom strips.
 */
export function buildLinearBoard(app, container, game, state, theme, flipped, hitRegions) {
  const W = app.screen.width;
  const H = app.screen.height;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const is2P = game.numPlayers === 2;

  const PAD     = 14;
  const BOARD_H = H - PAD * 2;
  const boardY  = PAD;
  const CY      = boardY + BOARD_H / 2;
  const TH      = BOARD_H * 0.30;

  const boardStartX = PAD;
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

  // ── Board background (wood texture) ────────────────────────────────────
  const bgSprite = new Sprite(getWoodTexture(app.renderer, W - PAD * 2, BOARD_H, theme.board, isDark));
  bgSprite.x = PAD;
  bgSprite.y = PAD;
  container.addChild(bgSprite);

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

    hitRegions.pointAreas.push({ x: px, y: boardY, w: PW, h: BOARD_H, idx: i });
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

  for (let i = 0; i < 24; i++) {
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

  // ── BAR / OFF zone boxes ───────────────────────────────────────────────
  for (const zone of allZones) {
    if (zone.player >= game.numPlayers) continue;
    const pColor = game.players[zone.player].color;
    const pName  = game.players[zone.player].name;
    const count  = zone.type === 'bar'
      ? state.bar[zone.player]
      : state.borneOff[zone.player];
    _drawZoneBox(container, zone, count, pName, pColor, theme);
    if (zone.type === 'bar') {
      hitRegions.barAreas.push({ x: zone.x, y: zone.y, w: zone.w, h: zone.h });
    } else {
      hitRegions.bearAreas.push({ x: zone.x, y: zone.y, w: zone.w, h: zone.h });
    }
  }

  // ── Dice in top strip ──────────────────────────────────────────────────
  _drawDice(container, state, game, boardStartX, boardEndX, boardY, CY, TH, ZW, theme, isDark);

  // ── Roll button in bottom strip ────────────────────────────────────────
  _drawRollButton(container, state, boardStartX, boardEndX, CY, TH, boardY, BOARD_H, ZW, isDark, hitRegions);
}

// ═════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═════════════════════════════════════════════════════════════════════════════

function _drawHighlights(gfx, state, boardStartX, PW, zones, theme, flipped, canvasH) {
  const p  = state.currentPlayer;
  const pp = i => boardStartX + (flipped ? (23 - i) : i) * PW;

  if (state.selectedPoint !== null) {
    if (state.selectedPoint === 'bar') {
      const z = zones.find(z => z.type === 'bar' && z.player === p);
      if (z) { gfx.rect(z.x, z.y, z.w, z.h); gfx.fill(theme.selected); }
    } else {
      gfx.rect(pp(state.selectedPoint), 0, PW, canvasH);
      gfx.fill(theme.selected);
    }
  }

  for (const vm of state.validMoves) {
    if (vm === 'bearoff') {
      const z = zones.find(z => z.type === 'off' && z.player === p);
      if (z) { gfx.rect(z.x, z.y, z.w, z.h); gfx.fill(theme.validMove); }
    } else {
      gfx.rect(pp(vm), 0, PW, canvasH);
      gfx.fill(theme.validMove);
    }
  }
}

function _drawZoneBox(container, zone, count, playerName, playerColor, theme) {
  const { x, y, w, h, type } = zone;
  const cx = x + w / 2;

  const gfx = new Graphics();

  // Tinted background
  gfx.roundRect(x, y, w, h, 6);
  gfx.fill({ color: playerColor, alpha: 0.16 });

  // Coloured border
  gfx.roundRect(x, y, w, h, 6);
  gfx.stroke({ color: playerColor, width: 1.5, alpha: 0.55 });

  container.addChild(gfx);

  // Text
  const labelSize  = Math.max(9, Math.floor(h * 0.22));
  const countSize  = Math.max(8, Math.floor(h * 0.17));
  const textGroupH = labelSize + (count > 0 ? countSize + 3 : 0);
  const textStartY = y + (h - textGroupH) / 2;

  const typeLabel = new Text({
    text: type === 'bar' ? 'BAR' : 'OFF',
    style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: labelSize, fill: playerColor },
  });
  typeLabel.anchor.set(0.5, 0);
  typeLabel.x = cx;
  typeLabel.y = textStartY;
  container.addChild(typeLabel);

  if (count > 0) {
    const countLabel = new Text({
      text: `\xd7${count}`,
      style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: countSize, fill: playerColor },
    });
    countLabel.anchor.set(0.5, 0);
    countLabel.x = cx;
    countLabel.y = textStartY + labelSize + 3;
    container.addChild(countLabel);
  }

  // Small checker dots
  const dotAreaTop = textStartY + textGroupH + 4;
  const dotAreaH   = y + h - dotAreaTop - 2;
  const dotR = Math.min(5, dotAreaH / 2, w / 8);
  if (dotR >= 3 && count > 0) {
    const maxDots      = Math.floor(w / (dotR * 2 + 3));
    const displayCount = Math.min(count, maxDots);
    const dotsW = displayCount * (dotR * 2 + 3) - 3;
    const dotX0 = cx - dotsW / 2 + dotR;
    const dotY  = dotAreaTop + dotR;
    const dots  = new Graphics();
    for (let i = 0; i < displayCount; i++) {
      dots.circle(dotX0 + i * (dotR * 2 + 3), dotY, dotR);
      dots.fill(playerColor);
    }
    container.addChild(dots);
  }
}

function _drawChevrons(container, game, boardStartX, boardEndX, boardY, CY, TH, BOARD_H, flipped) {
  const rightPlayer = flipped ? 1 : 0;
  const leftPlayer  = flipped ? 0 : 1;
  const rightColor  = game.players[rightPlayer]?.color || '#888';
  const leftColor   = game.players[leftPlayer]?.color  || '#888';

  const topStripCY    = boardY + ((CY - TH) - boardY) / 2;
  const bottomStripCY = (CY + TH) + (boardY + BOARD_H - (CY + TH)) / 2;

  const chevH   = Math.min((CY - TH - boardY) * 0.45, 20);
  const chevW   = chevH * 0.7;
  const spacing = Math.max(36, (boardEndX - boardStartX) / 18);
  const boardW  = boardEndX - boardStartX;
  const count   = Math.floor(boardW / spacing);
  const offset  = (boardW - (count - 1) * spacing) / 2;

  const gfx = new Graphics();

  for (let i = 0; i < count; i++) {
    const x = boardStartX + offset + i * spacing;

    // Top: leftward
    _chevron(gfx, x, topStripCY, chevW, chevH, false, leftColor, 0.22);
    // Bottom: rightward
    _chevron(gfx, x, bottomStripCY, chevW, chevH, true, rightColor, 0.22);
  }

  container.addChild(gfx);
}

function _chevron(gfx, cx, cy, w, h, pointRight, color, alpha) {
  const lw = Math.max(1.5, h * 0.13);

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

function _drawDice(container, state, game, boardStartX, boardEndX, boardY, CY, TH, ZW, theme, isDark) {
  if (state.dice.length === 0) return;

  const playerColor = game.players[state.currentPlayer]?.color || 'gold';
  const topAreaH    = (CY - TH) - boardY - 0;
  if (topAreaH < 22) return;

  const dieSize = topAreaH;
  const gap     = Math.max(2, dieSize * 0.04);

  const isDouble = state.dice.length === 2 && state.dice[0] === state.dice[1];
  const display  = isDouble
    ? [state.dice[0], state.dice[0], state.dice[0], state.dice[0]]
    : [...state.dice];

  const remaining = isDouble
    ? state.movesLeft.filter(v => v === state.dice[0]).length
    : 0;

  const mlTrack = [...state.movesLeft];
  const faces   = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];

  const totalW = display.length * dieSize + (display.length - 1) * gap;
  const startX = (boardStartX + boardEndX) / 2 - totalW / 2;
  const startY = boardY;

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

    // Die body
    const die = new Graphics();
    die.roundRect(0, 0, dieSize, dieSize, 5);
    die.fill(theme.barArea);
    die.roundRect(0, 0, dieSize, dieSize, 5);
    die.stroke({ color: used ? theme.boardBorder : playerColor, width: used ? 1 : 2 });
    die.x = x;
    die.y = y;
    die.alpha = used ? 0.28 : 1;
    container.addChild(die);

    // Die face
    const face = faces[val] || String(val);
    const faceText = new Text({
      text: face,
      style: {
        fontFamily: 'Arial',
        fontSize: Math.floor(dieSize * 0.95),
        fill: isDark ? '#ffffff' : '#1a1a1a',
      },
    });
    faceText.anchor.set(0.5);
    faceText.x = x + dieSize / 2;
    faceText.y = y + dieSize / 2;
    faceText.alpha = used ? 0.28 : 1;
    container.addChild(faceText);
  });
}

function _drawRollButton(container, state, boardStartX, boardEndX, CY, TH, boardY, BOARD_H, ZW, isDark, hitRegions) {
  const canRoll = state.phase === 'rolling';

  const stripH     = (boardY + BOARD_H) - (CY + TH);
  const btnH       = Math.min(stripH - 10, 54);
  const innerLeft  = boardStartX + ZW + 8;
  const innerRight = boardEndX - ZW - 8;
  const btnW       = Math.min(innerRight - innerLeft, 220);
  const btnX       = (innerLeft + innerRight) / 2 - btnW / 2;
  const btnY       = (CY + TH) + (stripH - btnH) / 2;
  const radius     = btnH / 2;

  if (canRoll) {
    hitRegions.rollArea.push({ x: btnX, y: btnY, w: btnW, h: btnH });
  }

  const btn = new Graphics();
  const accent = '#e94560';

  // Button body
  btn.roundRect(btnX, btnY, btnW, btnH, radius);
  btn.fill(canRoll ? accent : (isDark ? '#2a2a4a' : '#b8a99a'));
  btn.alpha = canRoll ? 1 : 0.35;

  // Subtle highlight on active button
  if (canRoll) {
    const hl = new Graphics();
    hl.roundRect(btnX + 2, btnY + 2, btnW - 4, btnH / 2 - 2, radius - 1);
    hl.fill({ color: 0xffffff, alpha: 0.12 });
    container.addChild(btn);
    container.addChild(hl);
  } else {
    container.addChild(btn);
  }

  // Label
  const fontSize = Math.min(btnH * 0.42, 22);
  const label = new Text({
    text: canRoll ? '\ud83c\udfb2  Roll Dice' : '\u2014 Moving \u2014',
    style: {
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fontSize,
      fill: canRoll ? '#ffffff' : (isDark ? '#556' : '#8a7a6a'),
    },
  });
  label.anchor.set(0.5);
  label.x = btnX + btnW / 2;
  label.y = btnY + btnH / 2;
  label.alpha = canRoll ? 1 : 0.35;
  container.addChild(label);
}
