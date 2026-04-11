import { Graphics, Text, Sprite } from 'pixi.js';
import { getCheckerTexture } from '../textures.js';

/**
 * Shared HUD for arm-based boards (trigammon / quadgammon).
 * Roll button centred in a bottom strip. Dice are drawn on the board
 * via drawBoardDice() instead.
 */
export function drawPolyHUD(container, state, game, W, H, HUD_H, theme, isDark, hitRegions) {
  const hudY    = H - HUD_H;
  const canRoll = state.phase === 'rolling';

  // Background strip
  const bg = new Graphics();
  bg.rect(0, hudY, W, HUD_H);
  bg.fill(theme.panel || theme.board);
  container.addChild(bg);

  // Top divider line
  const topLine = new Graphics();
  topLine.moveTo(0, hudY);
  topLine.lineTo(W, hudY);
  topLine.stroke({ width: 1, color: theme.boardBorder, alpha: 0.5 });
  container.addChild(topLine);

  // ── Roll button (centred) ─────────────────────────────────────────────
  const btnH   = Math.min(HUD_H - 12, 40);
  const btnW   = Math.min(W * 0.4, 200);
  const btnX   = (W - btnW) / 2;
  const btnY   = hudY + (HUD_H - btnH) / 2;
  const radius = btnH / 2;

  if (canRoll) {
    hitRegions.rollArea.push({ x: btnX, y: btnY, w: btnW, h: btnH });
  }

  const btn = new Graphics();
  btn.roundRect(btnX, btnY, btnW, btnH, radius);
  btn.fill(canRoll ? '#e94560' : (isDark ? '#2a2a4a' : '#b8a99a'));
  btn.alpha = canRoll ? 1 : 0.35;
  container.addChild(btn);

  if (canRoll) {
    const hl = new Graphics();
    hl.roundRect(btnX + 2, btnY + 2, btnW - 4, btnH / 2 - 2, radius - 1);
    hl.fill({ color: 0xffffff, alpha: 0.12 });
    container.addChild(hl);
  }

  const label = new Text({
    text: canRoll ? '\ud83c\udfb2 Roll' : '\u2014 Moving \u2014',
    style: {
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fontSize: Math.min(btnH * 0.42, 17),
      fill: canRoll ? '#ffffff' : (isDark ? '#556' : '#8a7a6a'),
    },
  });
  label.anchor.set(0.5);
  label.x = btnX + btnW / 2;
  label.y = btnY + btnH / 2;
  label.alpha = canRoll ? 1 : 0.35;
  container.addChild(label);
}

/**
 * Draw dice on the board area near the hub centre (for tri/quad boards).
 * Bigger than the old HUD dice, positioned at (cx, cy).
 */
export function drawBoardDice(container, state, game, cx, cy, theme, isDark) {
  if (state.dice.length === 0) return;

  const playerColor = game.players[state.currentPlayer]?.color || 'gold';
  const dieSize = 44;   // larger fixed size for board-area dice
  const gap     = 8;

  const isDouble = state.dice.length === 2 && state.dice[0] === state.dice[1];
  const display  = isDouble
    ? [state.dice[0], state.dice[0], state.dice[0], state.dice[0]]
    : [...state.dice];
  const remaining = isDouble
    ? state.movesLeft.filter(v => v === state.dice[0]).length
    : 0;
  const mlTrack = [...state.movesLeft];
  const faces   = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];
  const totalW  = display.length * dieSize + (display.length - 1) * gap;
  const startX  = cx - totalW / 2;
  const startY  = cy - dieSize / 2;

  // Semi-transparent backdrop so dice are readable over the board
  const backdrop = new Graphics();
  const padX = 8, padY = 6;
  backdrop.roundRect(startX - padX, startY - padY, totalW + padX * 2, dieSize + padY * 2, 10);
  backdrop.fill({ color: theme.barArea, alpha: 0.7 });
  container.addChild(backdrop);

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

    const die = new Graphics();
    die.roundRect(0, 0, dieSize, dieSize, 8);
    die.fill(theme.barArea);
    die.roundRect(0, 0, dieSize, dieSize, 8);
    die.stroke({ color: used ? theme.boardBorder : playerColor, width: used ? 1 : 2.5 });
    die.x = x;
    die.y = startY;
    die.alpha = used ? 0.28 : 1;
    container.addChild(die);

    const face = faces[val] || String(val);
    const faceText = new Text({
      text: face,
      style: {
        fontFamily: 'Arial',
        fontSize: Math.floor(dieSize * 0.82),
        fill: isDark ? '#ffffff' : '#111111',
      },
    });
    faceText.anchor.set(0.5);
    faceText.x = x + dieSize / 2;
    faceText.y = startY + dieSize / 2;
    faceText.alpha = used ? 0.28 : 1;
    container.addChild(faceText);
  });
}

/**
 * Draw arm-based highlights (selected point + valid moves).
 */
export function drawArmHighlights(container, state, allPts, highlightR, theme, barZones, bearZones) {
  const p = state.currentPlayer;
  const gfx = new Graphics();

  if (state.selectedPoint !== null) {
    if (state.selectedPoint === 'bar') {
      const bz = barZones.find(z => z.player === p);
      if (bz) {
        gfx.circle(bz.tx, bz.ty, highlightR * 1.3);
        gfx.fill(theme.selected);
      }
    } else {
      const pt = allPts.find(q => q.physIdx === state.selectedPoint);
      if (pt) {
        gfx.circle(pt.pcx, pt.pcy, highlightR);
        gfx.fill(theme.selected);
      }
    }
  }

  for (const vm of state.validMoves) {
    if (vm === 'bearoff') {
      const bz = bearZones.find(z => z.player === p);
      if (bz) {
        gfx.circle(bz.tx, bz.ty, highlightR * 1.3);
        gfx.fill(theme.validMove);
      }
    } else {
      const pt = allPts.find(q => q.physIdx === vm);
      if (pt) {
        gfx.circle(pt.pcx, pt.pcy, highlightR);
        gfx.fill(theme.validMove);
      }
    }
  }

  container.addChild(gfx);
}

/**
 * Draw a small pill-shaped tip zone (BAR or OFF).
 */
export function drawTipZone(container, cx, cy, r, label, count, color) {
  const w = r * 3.2, h = r * 1.6;
  const x = cx - w / 2, y = cy - h / 2;

  const gfx = new Graphics();
  gfx.roundRect(x, y, w, h, h / 2);
  gfx.fill({ color, alpha: 0.16 });
  gfx.roundRect(x, y, w, h, h / 2);
  gfx.stroke({ color, width: 1.5, alpha: 0.6 });
  container.addChild(gfx);

  const text = new Text({
    text: `${label} \xd7${count}`,
    style: {
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fontSize: Math.max(7, r * 0.38),
      fill: color,
    },
  });
  text.anchor.set(0.5);
  text.x = cx;
  text.y = cy;
  container.addChild(text);
}

/**
 * Draw a directional chevron for arm-based boards.
 */
export function drawArmChevron(gfx, cx, cy, w, h, ddx, ddy, color, alpha) {
  const bx = -ddy, by = ddx;
  gfx.moveTo(cx - ddx * w / 2 + bx * h / 2, cy - ddy * w / 2 + by * h / 2);
  gfx.lineTo(cx + ddx * w / 2,               cy + ddy * w / 2);
  gfx.lineTo(cx - ddx * w / 2 - bx * h / 2, cy - ddy * w / 2 - by * h / 2);
  gfx.stroke({ width: Math.max(1.2, h * 0.14), color, alpha, cap: 'round', join: 'round' });
}
