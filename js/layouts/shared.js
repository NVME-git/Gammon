import { Graphics, Text, Sprite, Texture } from 'pixi.js';
import { getCheckerTexture } from '../textures.js';
import { PixelArt } from '../pixelart.js';

// ─── Avatar texture cache (keyed by `playerIdx_color`) ───────────────────────
const _avatarTextures = new Map();

function _getAvatarTexture(playerIdx, color) {
  const key = `${playerIdx}_${color}`;
  if (_avatarTextures.has(key)) return _avatarTextures.get(key);
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  PixelArt.drawCharacter(c, color);
  const tex = Texture.from(c);
  _avatarTextures.set(key, tex);
  return tex;
}

// ─── Shared panel width constant (used by tri + quad boards) ─────────────────
export const SIDE_PANEL_W = 148;

// ─── HUD strip at the bottom — roll button + optional undo ───────────────────
// opts.showUndo  — show undo button to the left of roll (arm boards)
export function drawPolyHUD(container, state, game, W, H, HUD_H, theme, isDark, hitRegions, opts = {}) {
  const { showUndo = false } = opts;
  const hudY    = H - HUD_H;
  const canRoll = state.phase === 'rolling';
  const hudCy   = hudY + HUD_H / 2;
  const canUndo = showUndo && game.canUndo();

  // Background + top border
  const bg = new Graphics();
  bg.rect(0, hudY, W, HUD_H);
  bg.fill(theme.panel || theme.board);
  container.addChild(bg);

  const topLine = new Graphics();
  topLine.moveTo(0, hudY);
  topLine.lineTo(W, hudY);
  topLine.stroke({ width: 1, color: theme.boardBorder, alpha: 0.5 });
  container.addChild(topLine);

  const btnH = Math.min(HUD_H - 12, 46);
  const r    = btnH / 2;

  if (showUndo) {
    // ── Undo + Roll side-by-side, centred as a group ──────────────────────
    const undoW  = Math.min(W * 0.22, 120);
    const rollW  = Math.min(W * 0.40, 220);
    const gap    = 10;
    const groupW = undoW + gap + rollW;
    const startX = Math.max(8, (W - groupW) / 2);
    const undoX  = startX;
    const rollX  = startX + undoW + gap;
    const btnY   = hudCy - btnH / 2;

    // Undo button
    const undoBtn = new Graphics();
    undoBtn.roundRect(undoX, btnY, undoW, btnH, r);
    undoBtn.fill({ color: canUndo ? 0x3366cc : (isDark ? 0x2a2a4a : 0xb8a99a), alpha: canUndo ? 1 : 0.35 });
    container.addChild(undoBtn);
    if (canUndo) {
      const undoHl = new Graphics();
      undoHl.roundRect(undoX + 2, btnY + 2, undoW - 4, btnH / 2 - 2, r - 1);
      undoHl.fill({ color: 0xffffff, alpha: 0.10 });
      container.addChild(undoHl);
    }
    const undoLabel = new Text({
      text: '\u21a9 Undo',
      style: { fontFamily: 'Arial', fontWeight: 'bold',
               fontSize: Math.min(btnH * 0.40, 17),
               fill: canUndo ? '#ffffff' : (isDark ? '#556677' : '#8a7a6a') },
    });
    undoLabel.anchor.set(0.5);
    undoLabel.x = undoX + undoW / 2;
    undoLabel.y = btnY + btnH / 2;
    undoLabel.alpha = canUndo ? 1 : 0.35;
    container.addChild(undoLabel);
    hitRegions.undoArea.push({ x: undoX, y: btnY, w: undoW, h: btnH });

    // Roll button
    _drawRollBtn(container, state, rollX, btnY, rollW, btnH, r, isDark, canRoll, hitRegions);

  } else {
    // ── Roll button centred (linear boards) ──────────────────────────────
    const btnW = Math.min(W * 0.42, 240);
    const btnX = (W - btnW) / 2;
    const btnY = hudCy - btnH / 2;
    _drawRollBtn(container, state, btnX, btnY, btnW, btnH, r, isDark, canRoll, hitRegions);
  }
}

function _drawRollBtn(container, state, bx, by, bw, bh, radius, isDark, canRoll, hitRegions) {
  if (canRoll) hitRegions.rollArea.push({ x: bx, y: by, w: bw, h: bh });

  const btn = new Graphics();
  btn.roundRect(bx, by, bw, bh, radius);
  btn.fill(canRoll ? '#e94560' : (isDark ? '#2a2a4a' : '#b8a99a'));
  btn.alpha = canRoll ? 1 : 0.35;
  container.addChild(btn);

  if (canRoll) {
    const hl = new Graphics();
    hl.roundRect(bx + 2, by + 2, bw - 4, bh / 2 - 2, radius - 1);
    hl.fill({ color: 0xffffff, alpha: 0.12 });
    container.addChild(hl);
  }

  const label = new Text({
    text: canRoll ? '\ud83c\udfb2  Roll Dice' : '\u2014 Moving \u2014',
    style: { fontFamily: 'Arial', fontWeight: 'bold',
             fontSize: Math.min(bh * 0.42, 20),
             fill: canRoll ? '#ffffff' : (isDark ? '#556' : '#8a7a6a') },
  });
  label.anchor.set(0.5);
  label.x = bx + bw / 2;
  label.y = by + bh / 2;
  label.alpha = canRoll ? 1 : 0.35;
  container.addChild(label);
}

// ─── Floating dice overlay — top-left corner ─────────────────────────────────
// opts.showButtons  — draw Roll + Undo buttons below the dice box
// opts.showUndo     — include Undo button (requires showButtons)
// opts.hitRegions   — hit-region object to push roll/undo areas into
// opts.dieSize      — die cell size in px (default 92; pass 72 for linear boards)
// Returns the pixel width of the cluster box (useful for callers that need to offset the board)
export function drawFloatingDice(container, state, game, theme, isDark, opts = {}) {
  const { showButtons = false, showUndo = false, hitRegions = null, dieSize = 92, myTurn = true, isOnline = false, pendingConfirm = false, pendingPlayer = null } = opts;
  const FPAD_X = 14;   // distance from left canvas edge
  const FPAD_Y = 62;   // distance from top — clears the floating ← Menu / ↻ buttons (38px + 10px gap)
  const PAD    =  8;   // internal padding
  const faces = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];

  // During pendingConfirm, keep showing the player who just finished their turn
  // (pendingPlayer) rather than switching to the next player prematurely.
  const cp          = (pendingConfirm && pendingPlayer !== null) ? pendingPlayer : state.currentPlayer;
  const playerColor = game.players[cp]?.color || 'gold';
  const pName       = game.players[cp]?.name  || '';

  const isDouble = state.dice.length === 2 && state.dice[0] === state.dice[1];
  const display  = isDouble
    ? [state.dice[0], state.dice[0], state.dice[0], state.dice[0]]
    : [...state.dice];
  const numDice  = display.length;

  // 2-column grid so doublets become 2×2 instead of 4×1
  const nameH     = 16;
  const stripeH   = 4;
  const avatarH   = 36;
  const avatarGap = 4;
  const COLS      = 2;
  const numRows   = numDice > 0 ? Math.ceil(numDice / COLS) : 0;
  const boxW      = COLS * dieSize + (COLS + 1) * PAD;
  const diceAreaH = numRows > 0 ? numRows * dieSize + (numRows - 1) * 6 : 0;
  const boxH      = stripeH + PAD + nameH + avatarGap + avatarH + (diceAreaH > 0 ? PAD + diceAreaH : 0) + PAD;

  // Background
  const bg = new Graphics();
  bg.roundRect(FPAD_X, FPAD_Y, boxW, boxH, 12);
  bg.fill({ color: theme.panel || theme.board, alpha: 0.92 });
  bg.roundRect(FPAD_X, FPAD_Y, boxW, boxH, 12);
  bg.stroke({ width: 1, color: theme.boardBorder, alpha: 0.55 });
  container.addChild(bg);

  // Player colour stripe
  const stripe = new Graphics();
  stripe.roundRect(FPAD_X, FPAD_Y, boxW, stripeH, [5, 5, 0, 0]);
  stripe.fill(playerColor);
  container.addChild(stripe);

  // Player name — show full name (truncate only if truly enormous)
  const nameText = new Text({
    text: pName.length > 22 ? pName.slice(0, 21) + '\u2026' : pName,
    style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: 12, fill: playerColor },
  });
  nameText.anchor.set(0.5, 0);
  nameText.x = FPAD_X + boxW / 2;
  nameText.y = FPAD_Y + stripeH + PAD / 2;
  container.addChild(nameText);

  // Player avatar below name
  const avTex    = _getAvatarTexture(cp, playerColor);
  const avSprite = new Sprite(avTex);
  avSprite.anchor.set(0.5, 0);
  avSprite.x = FPAD_X + boxW / 2;
  avSprite.y = FPAD_Y + stripeH + PAD + nameH + avatarGap;
  avSprite.width  = avatarH;
  avSprite.height = avatarH;
  container.addChild(avSprite);

  if (numDice > 0) {
    const remaining = isDouble ? state.movesLeft.filter(v => v === state.dice[0]).length : 0;
    const mlTrack   = [...state.movesLeft];
    const startY    = FPAD_Y + stripeH + PAD + nameH + avatarGap + avatarH + PAD;

    display.forEach((val, i) => {
      let used;
      if (isDouble) {
        used = i >= remaining;
      } else {
        const idx = mlTrack.indexOf(val);
        used = idx === -1;
        if (!used) mlTrack.splice(idx, 1);
      }

      const col  = i % COLS;
      const row  = Math.floor(i / COLS);
      const dieX = FPAD_X + PAD + col * (dieSize + PAD);
      const dieY = startY + row * (dieSize + 6);

      const die = new Graphics();
      die.roundRect(dieX, dieY, dieSize, dieSize, 10);
      die.fill(theme.barArea);
      die.roundRect(dieX, dieY, dieSize, dieSize, 10);
      die.stroke({ color: used ? theme.boardBorder : playerColor, width: used ? 1 : 3 });
      die.alpha = used ? 0.28 : 1;
      container.addChild(die);

      const faceText = new Text({
        text: faces[val] || String(val),
        style: {
          fontFamily: 'Arial',
          fontSize: Math.floor(dieSize * 0.84),
          fill: isDark ? '#ffffff' : '#111111',
        },
      });
      faceText.anchor.set(0.5);
      faceText.x = dieX + dieSize / 2;
      faceText.y = dieY + dieSize / 2;
      faceText.alpha = used ? 0.28 : 1;
      container.addChild(faceText);
    });
  }

  // ── Floating Roll / End-Turn + Undo buttons directly below the dice box ──────
  if (showButtons) {
    const canRoll = state.phase === 'rolling' && myTurn && !pendingConfirm;
    const canUndo = showUndo && game.canUndo() && (myTurn || pendingConfirm);
    const btnH    = 46;
    const btnR    = 10;
    const gap     = 8;

    const rollY = FPAD_Y + boxH + gap;

    if (pendingConfirm) {
      // ── "End Turn" confirmation button (green) ──────────────────────────────
      const confirmGfx = new Graphics();
      confirmGfx.roundRect(FPAD_X, rollY, boxW, btnH, btnR);
      confirmGfx.fill('#27ae60');
      container.addChild(confirmGfx);

      const confirmHl = new Graphics();
      confirmHl.roundRect(FPAD_X + 2, rollY + 2, boxW - 4, btnH / 2 - 2, btnR - 1);
      confirmHl.fill({ color: 0xffffff, alpha: 0.12 });
      container.addChild(confirmHl);

      const confirmLabel = new Text({
        text: '\u2713 End Turn',
        style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: Math.min(btnH * 0.42, 20), fill: '#ffffff' },
      });
      confirmLabel.anchor.set(0.5);
      confirmLabel.x = FPAD_X + boxW / 2;
      confirmLabel.y = rollY + btnH / 2;
      container.addChild(confirmLabel);

      if (hitRegions) hitRegions.confirmArea.push({ x: FPAD_X, y: rollY, w: boxW, h: btnH });
    } else {
      // ── Roll button ─────────────────────────────────────────────────────────
      const rollGfx = new Graphics();
      rollGfx.roundRect(FPAD_X, rollY, boxW, btnH, btnR);
      rollGfx.fill(canRoll ? '#e94560' : (isDark ? '#2a2a4a' : '#b8a99a'));
      rollGfx.alpha = canRoll ? 1 : 0.40;
      container.addChild(rollGfx);

      if (canRoll) {
        const rollHl = new Graphics();
        rollHl.roundRect(FPAD_X + 2, rollY + 2, boxW - 4, btnH / 2 - 2, btnR - 1);
        rollHl.fill({ color: 0xffffff, alpha: 0.12 });
        container.addChild(rollHl);
      }

      const rollLabel = new Text({
        text: canRoll ? '\ud83c\udfb2  Roll Dice' : '\u2014 Moving \u2014',
        style: { fontFamily: 'Arial', fontWeight: 'bold',
                 fontSize: Math.min(btnH * 0.42, 20),
                 fill: canRoll ? '#ffffff' : (isDark ? '#556' : '#8a7a6a') },
      });
      rollLabel.anchor.set(0.5);
      rollLabel.x = FPAD_X + boxW / 2;
      rollLabel.y = rollY + btnH / 2;
      rollLabel.alpha = canRoll ? 1 : 0.40;
      container.addChild(rollLabel);

      if (canRoll && hitRegions) hitRegions.rollArea.push({ x: FPAD_X, y: rollY, w: boxW, h: btnH });
    }

    // Undo button
    if (showUndo) {
      const undoY = rollY + btnH + gap;

      const undoGfx = new Graphics();
      undoGfx.roundRect(FPAD_X, undoY, boxW, btnH, btnR);
      undoGfx.fill(canUndo ? 0x3366cc : (isDark ? 0x2a2a4a : 0xb8a99a));
      undoGfx.alpha = canUndo ? 1 : 0.35;
      container.addChild(undoGfx);

      if (canUndo) {
        const undoHl = new Graphics();
        undoHl.roundRect(FPAD_X + 2, undoY + 2, boxW - 4, btnH / 2 - 2, btnR - 1);
        undoHl.fill({ color: 0xffffff, alpha: 0.10 });
        container.addChild(undoHl);
      }

      const undoLabel = new Text({
        text: '\u21a9 Undo',
        style: { fontFamily: 'Arial', fontWeight: 'bold',
                 fontSize: Math.min(btnH * 0.40, 17),
                 fill: canUndo ? '#ffffff' : (isDark ? '#556677' : '#8a7a6a') },
      });
      undoLabel.anchor.set(0.5);
      undoLabel.x = FPAD_X + boxW / 2;
      undoLabel.y = undoY + btnH / 2;
      undoLabel.alpha = canUndo ? 1 : 0.35;
      container.addChild(undoLabel);

      if (canUndo && hitRegions) hitRegions.undoArea.push({ x: FPAD_X, y: undoY, w: boxW, h: btnH });
    }
  }
}

// ─── Left panel: large dice + current-player indicator + undo button ─────────
export function drawDicePanel(container, state, game, panelW, boardH, theme, isDark, hitRegions = null) {
  const PAD = 10;
  const CX  = panelW / 2;

  // Panel background
  const bg = new Graphics();
  bg.rect(0, 0, panelW, boardH);
  bg.fill({ color: theme.panel || theme.board, alpha: 0.85 });
  container.addChild(bg);

  // Right border
  const border = new Graphics();
  border.moveTo(panelW, 0);
  border.lineTo(panelW, boardH);
  border.stroke({ width: 1, color: theme.boardBorder, alpha: 0.4 });
  container.addChild(border);

  const playerColor = game.players[state.currentPlayer]?.color || 'gold';
  const pName       = game.players[state.currentPlayer]?.name  || '';
  const isDark2     = isDark;

  // Current player colour stripe at top
  const stripe = new Graphics();
  stripe.roundRect(PAD, PAD, panelW - PAD * 2, 4, 2);
  stripe.fill(playerColor);
  container.addChild(stripe);

  // Player name label
  const nameText = new Text({
    text: pName.length > 8 ? pName.slice(0, 7) + '\u2026' : pName,
    style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: 11, fill: playerColor },
  });
  nameText.anchor.set(0.5, 0);
  nameText.x = CX;
  nameText.y = PAD + 8;
  container.addChild(nameText);

  // ── Undo button at the bottom of the dice panel (always rendered) ─────────
  const undoBtnH = 36;
  const undoBtnW = panelW - PAD * 2;
  const undoBtnY = boardH - PAD - undoBtnH;
  const canUndo  = game.canUndo();

  const undoBtn = new Graphics();
  undoBtn.roundRect(PAD, undoBtnY, undoBtnW, undoBtnH, undoBtnH / 2);
  undoBtn.fill({ color: canUndo ? 0x3366cc : (isDark2 ? 0x2a2a4a : 0xb8a99a), alpha: canUndo ? 1 : 0.35 });
  container.addChild(undoBtn);

  if (canUndo) {
    const undoHl = new Graphics();
    undoHl.roundRect(PAD + 2, undoBtnY + 2, undoBtnW - 4, undoBtnH / 2 - 2, undoBtnH / 2 - 1);
    undoHl.fill({ color: 0xffffff, alpha: 0.10 });
    container.addChild(undoHl);
  }

  const undoLabel = new Text({
    text: '\u21a9 Undo',
    style: {
      fontFamily: 'Arial', fontWeight: 'bold',
      fontSize: Math.min(undoBtnH * 0.42, 16),
      fill: canUndo ? '#ffffff' : (isDark2 ? '#556677' : '#8a7a6a'),
    },
  });
  undoLabel.anchor.set(0.5);
  undoLabel.x = PAD + undoBtnW / 2;
  undoLabel.y = undoBtnY + undoBtnH / 2;
  undoLabel.alpha = canUndo ? 1 : 0.35;
  container.addChild(undoLabel);

  if (hitRegions) hitRegions.undoArea.push({ x: PAD, y: undoBtnY, w: undoBtnW, h: undoBtnH });

  if (state.dice.length === 0) return;

  const isDouble  = state.dice.length === 2 && state.dice[0] === state.dice[1];
  const display   = isDouble
    ? [state.dice[0], state.dice[0], state.dice[0], state.dice[0]]
    : [...state.dice];
  const remaining = isDouble ? state.movesLeft.filter(v => v === state.dice[0]).length : 0;
  const mlTrack   = [...state.movesLeft];
  const faces     = ['', '\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];

  const dieSize = Math.min(panelW - PAD * 2, 90);
  const gap     = 8;
  const totalH  = display.length * dieSize + (display.length - 1) * gap;
  const availH  = undoBtnY - PAD - 10 - 30;  // between name label and undo button
  const startY  = PAD + 30 + (availH - totalH) / 2;
  const dieX    = CX - dieSize / 2;

  display.forEach((val, i) => {
    let used;
    if (isDouble) {
      used = i >= remaining;
    } else {
      const idx = mlTrack.indexOf(val);
      used = idx === -1;
      if (!used) mlTrack.splice(idx, 1);
    }

    const y = startY + i * (dieSize + gap);

    const die = new Graphics();
    die.roundRect(dieX, y, dieSize, dieSize, 10);
    die.fill(theme.barArea);
    die.roundRect(dieX, y, dieSize, dieSize, 10);
    die.stroke({ color: used ? theme.boardBorder : playerColor, width: used ? 1 : 3 });
    die.alpha = used ? 0.28 : 1;
    container.addChild(die);

    const face = faces[val] || String(val);
    const faceText = new Text({
      text: face,
      style: {
        fontFamily: 'Arial',
        fontSize: Math.floor(dieSize * 0.84),
        fill: isDark2 ? '#ffffff' : '#111111',
      },
    });
    faceText.anchor.set(0.5);
    faceText.x = dieX + dieSize / 2;
    faceText.y = y + dieSize / 2;
    faceText.alpha = used ? 0.28 : 1;
    container.addChild(faceText);
  });
}

// ─── Right panel: BAR + OFF zones for all players (stacked) ──────────────────
export function drawZonePanel(container, state, game, panelW, W, boardH, theme, hitRegions) {
  const PAD  = 8;
  const x0   = W - panelW;
  const N    = game.numPlayers;
  const rowH = boardH / N;
  const cp   = state.currentPlayer;

  // Panel background
  const bg = new Graphics();
  bg.rect(x0, 0, panelW, boardH);
  bg.fill({ color: theme.panel || theme.board, alpha: 0.85 });
  container.addChild(bg);

  // Left border
  const border = new Graphics();
  border.moveTo(x0, 0);
  border.lineTo(x0, boardH);
  border.stroke({ width: 1, color: theme.boardBorder, alpha: 0.4 });
  container.addChild(border);

  for (let p = 0; p < N; p++) {
    const pColor = game.players[p].color;
    const pName  = game.players[p].name;
    const barCt  = state.bar[p];
    const offCt  = state.borneOff[p];
    const py     = p * rowH;
    const CX     = x0 + panelW / 2;

    // Player name
    const short = pName.length > 7 ? pName.slice(0, 6) + '\u2026' : pName;
    const nameT = new Text({
      text: short,
      style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: 11, fill: pColor },
    });
    nameT.anchor.set(0.5, 0);
    nameT.x = CX;
    nameT.y = py + PAD;
    container.addChild(nameT);

    // Divider between players
    if (p > 0) {
      const div = new Graphics();
      div.moveTo(x0 + PAD, py);
      div.lineTo(W - PAD, py);
      div.stroke({ width: 1, color: theme.boardBorder, alpha: 0.3 });
      container.addChild(div);
    }

    const pillH = Math.min((rowH - 30) / 2 - 4, 38);
    const pillW = panelW - PAD * 2;
    const barY  = py + 22;
    const offY  = barY + pillH + 6;

    // Highlights for the current player's bar/off zones
    const barSelected = (p === cp) && (state.selectedPoint === 'bar');
    const offValid    = (p === cp) && state.validMoves.includes('bearoff');

    _zonePill(container, x0 + PAD, barY, pillW, pillH, 'BAR', barCt, pColor, theme,
              barSelected ? theme.selected : null);
    _zonePill(container, x0 + PAD, offY, pillW, pillH, 'OFF', offCt, pColor, theme,
              offValid    ? theme.validMove : null);

    // Hit areas (clicking any player's bar/off zone triggers the current-player's action)
    hitRegions.barAreas.push({ x: x0 + PAD, y: barY, w: pillW, h: pillH });
    hitRegions.bearAreas.push({ x: x0 + PAD, y: offY, w: pillW, h: pillH });
  }
}

function _zonePill(container, x, y, w, h, label, count, color, theme, highlightColor = null) {
  const gfx = new Graphics();

  // Optional highlight glow behind the pill
  if (highlightColor) {
    gfx.roundRect(x - 2, y - 2, w + 4, h + 4, h / 2 + 2);
    gfx.fill({ color: highlightColor, alpha: 0.55 });
  }

  gfx.roundRect(x, y, w, h, h / 2);
  gfx.fill({ color, alpha: highlightColor ? 0.28 : 0.14 });
  gfx.roundRect(x, y, w, h, h / 2);
  gfx.stroke({ color: highlightColor ?? color, width: highlightColor ? 2 : 1.5, alpha: 0.80 });
  container.addChild(gfx);

  const isActive = count > 0 || highlightColor !== null;
  const fontSize = Math.max(9, h * 0.34);
  const text = new Text({
    text: `${label}  \xd7${count}`,
    style: {
      fontFamily: 'Arial', fontWeight: 'bold',
      fontSize,
      fill: isActive ? color : theme.subtext,
    },
  });
  text.anchor.set(0.5);
  text.x = x + w / 2;
  text.y = y + h / 2;
  text.alpha = isActive ? 1 : 0.40;
  container.addChild(text);
}

// ─── Arm highlights ───────────────────────────────────────────────────────────
// barZones / bearZones: [{player, tx, ty}] — set tx/ty to null to suppress on-board highlight
// (used when zones live in the side panel instead of on the board).
export function drawArmHighlights(container, state, allPts, highlightR, theme, barZones, bearZones) {
  const p   = state.currentPlayer;
  const gfx = new Graphics();

  if (state.selectedPoint !== null) {
    if (state.selectedPoint === 'bar') {
      const bz = barZones.find(z => z.player === p);
      if (bz && bz.tx !== null) { gfx.circle(bz.tx, bz.ty, highlightR * 1.3); gfx.fill(theme.selected); }
    } else {
      const pt = allPts.find(q => q.physIdx === state.selectedPoint);
      if (pt) { gfx.circle(pt.pcx, pt.pcy, highlightR); gfx.fill(theme.selected); }
    }
  }

  for (const vm of state.validMoves) {
    if (vm === 'bearoff') {
      const bz = bearZones.find(z => z.player === p);
      if (bz && bz.tx !== null) { gfx.circle(bz.tx, bz.ty, highlightR * 1.3); gfx.fill(theme.validMove); }
    } else {
      const pt = allPts.find(q => q.physIdx === vm);
      if (pt) { gfx.circle(pt.pcx, pt.pcy, highlightR); gfx.fill(theme.validMove); }
    }
  }

  container.addChild(gfx);
}

// ─── Tip zone pill (trigammon only — still shown at arm tips for BAR) ─────────
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
    style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: Math.max(8, r * 0.45), fill: color },
  });
  text.anchor.set(0.5);
  text.x = cx;
  text.y = cy;
  container.addChild(text);
}

// ─── Checker-pip stack — replaces "BAR ×N" / "OFF ×N" text at arm tips ──────
// Draws the label then N filled checker circles stacked below it, centered at (cx,cy).
export function drawCheckerPips(container, cx, cy, label, count, color, fontSize, checkerRadius = 6) {
  const CR   = checkerRadius;      // checker radius
  const STEP = CR * 1.55;          // vertical distance between checker centres
  const COLS = count > 4 ? 2 : 1;  // 2-column layout for piles > 4
  const numRows = count > 0 ? Math.ceil(count / COLS) : 0;
  const stackH  = numRows > 0 ? (numRows - 1) * STEP + CR * 2 : 0;
  const fs      = Math.max(8, fontSize * 0.70);

  // ── Label ──
  const labelText = new Text({
    text: label,
    style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: fs, fill: color },
  });
  labelText.anchor.set(0.5, 1);
  // Place label above the checker stack, centred at cx
  const totalH  = fs + 3 + (count > 0 ? stackH : CR * 2);
  const topEdge = cy - totalH / 2;
  labelText.x = cx;
  labelText.y = topEdge + fs;
  container.addChild(labelText);

  if (count === 0) {
    // Ghost outline when empty
    const gfx = new Graphics();
    gfx.circle(cx, topEdge + fs + 3 + CR, CR);
    gfx.stroke({ color, width: 1.5, alpha: 0.30 });
    container.addChild(gfx);
    return;
  }

  // ── Checker circles ──
  const stackTopY = topEdge + fs + 3 + CR;
  const colSpan   = COLS === 2 ? (CR * 2 + 2) : 0;
  const startX    = cx - colSpan / 2;

  for (let i = 0; i < count; i++) {
    const col  = i % COLS;
    const row  = Math.floor(i / COLS);
    const px   = startX + col * (CR * 2 + 2);
    const py   = stackTopY + row * STEP;

    const gfx = new Graphics();
    gfx.circle(px, py, CR);
    gfx.fill(color);
    gfx.circle(px, py, CR);
    gfx.stroke({ color: 0x000000, width: 1, alpha: 0.22 });
    container.addChild(gfx);

    // Glossy highlight
    const hl = new Graphics();
    hl.circle(px - CR * 0.22, py - CR * 0.25, CR * 0.38);
    hl.fill({ color: 0xffffff, alpha: 0.40 });
    container.addChild(hl);
  }
}

// ─── Arm chevron ──────────────────────────────────────────────────────────────
export function drawArmChevron(gfx, cx, cy, w, h, ddx, ddy, color, alpha) {
  const bx = -ddy, by = ddx;
  gfx.moveTo(cx - ddx * w / 2 + bx * h / 2, cy - ddy * w / 2 + by * h / 2);
  gfx.lineTo(cx + ddx * w / 2,               cy + ddy * w / 2);
  gfx.lineTo(cx - ddx * w / 2 - bx * h / 2, cy - ddy * w / 2 - by * h / 2);
  gfx.stroke({ width: Math.max(2.5, h * 0.22), color, alpha, cap: 'round', join: 'round' });
}
