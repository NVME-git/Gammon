import { Container, Graphics, Text, Sprite } from 'pixi.js';
import { getCheckerTexture } from '../textures.js';
import { drawPolyHUD, drawBoardDice, drawArmHighlights, drawTipZone, drawArmChevron } from './shared.js';

/**
 * Build the Y-shaped trigammon board (36 physical points).
 *
 * Three arms radiate from a central hub at 120-degree intervals.
 * Arm A is visually reversed so all players bear off at arm tips.
 */
export function buildTriangleBoard(app, container, game, state, theme, hitRegions) {
  const W = app.screen.width;
  const H = app.screen.height;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const HUD_H  = Math.min(64, H * 0.14);
  const boardH = H - HUD_H;
  const bCx    = W / 2;
  const bCy    = boardH * 0.50;

  // ── Arm directions (120 degrees apart, Y-shape) ──────────────────────────
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
  const dHW      = hw * 0.92;
  const dHL      = slotLen * 0.46;

  // ── Player-colour pairs per arm ──────────────────────────────────────────
  const armColors = [
    [game.players[0].color, game.players[1].color],
    [game.players[0].color, game.players[2].color],
    [game.players[1].color, game.players[2].color],
  ];

  const slotOf = (physIdx) => {
    const arm = Math.floor(physIdx / 12);
    const loc = physIdx % 12;
    return arm === 0 ? (11 - loc) : loc;
  };

  // ── Arm strip backgrounds ────────────────────────────────────────────────
  for (let arm = 0; arm < 3; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];
    const strip = new Graphics();

    strip.poly([
      bCx + dx * armStart + nx * hw, bCy + dy * armStart + ny * hw,
      bCx + dx * armEnd   + nx * hw, bCy + dy * armEnd   + ny * hw,
      bCx + dx * armEnd   - nx * hw, bCy + dy * armEnd   - ny * hw,
      bCx + dx * armStart - nx * hw, bCy + dy * armStart - ny * hw,
    ]);
    strip.fill(theme.board);
    strip.poly([
      bCx + dx * armStart + nx * hw, bCy + dy * armStart + ny * hw,
      bCx + dx * armEnd   + nx * hw, bCy + dy * armEnd   + ny * hw,
      bCx + dx * armEnd   - nx * hw, bCy + dy * armEnd   - ny * hw,
      bCx + dx * armStart - nx * hw, bCy + dy * armStart - ny * hw,
    ]);
    strip.stroke({ width: 1.5, color: theme.boardBorder });
    container.addChild(strip);

    // Dashed centre line
    const dashes = new Graphics();
    const len = armEnd - armStart;
    for (let d = 0; d < len; d += 8) {
      const t0 = armStart + d;
      const t1 = Math.min(armStart + d + 3, armEnd);
      dashes.moveTo(bCx + dx * t0, bCy + dy * t0);
      dashes.lineTo(bCx + dx * t1, bCy + dy * t1);
    }
    dashes.stroke({ width: 1, color: theme.boardBorder, alpha: 0.22 });
    container.addChild(dashes);
  }

  // ── Central hub ──────────────────────────────────────────────────────────
  const hub = new Graphics();
  hub.circle(bCx, bCy, hubR);
  hub.fill(theme.barArea);
  hub.circle(bCx, bCy, hubR);
  hub.stroke({ width: 2, color: theme.boardBorder });
  container.addChild(hub);

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

      const diamond = new Graphics();
      diamond.poly([
        pcx + dx * dHL,  pcy + dy * dHL,
        pcx + nx * dHW,  pcy + ny * dHW,
        pcx - dx * dHL,  pcy - dy * dHL,
        pcx - nx * dHW,  pcy - ny * dHW,
      ]);
      diamond.fill((i % 2 === 0) ? c1 : c2);
      container.addChild(diamond);

      allPts.push({ physIdx, pcx, pcy, arm });
      hitRegions.pointCenters.push({
        cx: pcx, cy: pcy,
        r: Math.max(dHW, dHL) * 1.1,
        idx: physIdx,
      });
    }
  }

  // ── Point labels ─────────────────────────────────────────────────────────
  const labelStyle = {
    fontFamily: 'Arial',
    fontWeight: 'bold',
    fontSize: Math.max(6, CR * 0.55),
    fill: 0xffffff,
  };

  for (const pt of allPts) {
    const label = new Text({ text: String(pt.physIdx + 1), style: labelStyle });
    label.anchor.set(0.5);
    label.x = pt.pcx;
    label.y = pt.pcy;
    label.alpha = 0.45;
    container.addChild(label);
  }

  // ── Checkers (stacked perpendicular to arm) ──────────────────────────────
  for (const pt of allPts) {
    const sp = state.points[pt.physIdx];
    if (sp.count === 0) continue;
    const { nx, ny } = armDirs[pt.arm];
    const color = game.players[sp.player]?.color || '#888';
    const tex   = getCheckerTexture(app.renderer, color, CR);

    for (let s = 0; s < sp.count; s++) {
      const offset = (s - (sp.count - 1) / 2) * (CR * 2 + 1);
      const checker = new Sprite(tex);
      checker.anchor.set(0.5);
      checker.x = pt.pcx + nx * offset;
      checker.y = pt.pcy + ny * offset;
      container.addChild(checker);
    }
  }

  // ── Direction chevrons ───────────────────────────────────────────────────
  const armFlow = [
    { outP: 1, inP: 0 },
    { outP: 0, inP: 2 },
    { outP: 2, inP: 1 },
  ];

  const chevH = Math.min(hw * 0.55, 10);
  const chevW = chevH * 0.65;
  const chevN = Math.max(3, Math.floor((armEnd - armStart) / (slotLen * 3)));

  const chevGfx = new Graphics();
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

      drawArmChevron(chevGfx, cx + nx * edgeDist, cy + ny * edgeDist,
                     chevW, chevH, dx, dy, outCol, 0.30);
      drawArmChevron(chevGfx, cx - nx * edgeDist, cy - ny * edgeDist,
                     chevW, chevH, -dx, -dy, inCol, 0.30);
    }
  }
  container.addChild(chevGfx);

  // ── Zone boxes (BAR + OFF at each arm tip) ───────────────────────────────
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

    // BAR zone
    const barTx = bCx + dx * tipDist + nx * (zoneR * 2);
    const barTy = bCy + dy * tipDist + ny * (zoneR * 2);
    const barCt = state.bar[td.barP];
    drawTipZone(container, barTx, barTy, zoneR, 'BAR', barCt, game.players[td.barP].color);
    const bw = zoneR * 3.2, bh = zoneR * 1.6;
    hitRegions.barAreas.push({ x: barTx - bw / 2, y: barTy - bh / 2, w: bw, h: bh });
    barZones.push({ player: td.barP, tx: barTx, ty: barTy });

    // Bar checkers
    if (barCt > 0) {
      const color = game.players[td.barP].color;
      const tex   = getCheckerTexture(app.renderer, color, CR * 0.55);
      for (let s = 0; s < barCt; s++) {
        const sp = new Sprite(tex);
        sp.anchor.set(0.5);
        sp.x = barTx + dx * (zoneR * 1.4 + s * CR * 1.6);
        sp.y = barTy + dy * (zoneR * 1.4 + s * CR * 1.6);
        container.addChild(sp);
      }
    }

    // OFF zone
    const offTx = bCx + dx * tipDist - nx * (zoneR * 2);
    const offTy = bCy + dy * tipDist - ny * (zoneR * 2);
    const offCt = state.borneOff[td.offP];
    drawTipZone(container, offTx, offTy, zoneR, 'OFF', offCt, game.players[td.offP].color);
    hitRegions.bearAreas.push({ x: offTx - bw / 2, y: offTy - bh / 2, w: bw, h: bh });
    bearZones.push({ player: td.offP, tx: offTx, ty: offTy });
  }

  // ── Highlights ───────────────────────────────────────────────────────────
  const hlR = Math.max(dHW, dHL) * 1.1;
  drawArmHighlights(container, state, allPts, hlR, theme, barZones, bearZones);

  // ── Dice on the board (centred at hub) ─────────────────────────────────
  drawBoardDice(container, state, game, bCx, bCy, theme, isDark);

  // ── HUD (roll button only) ─────────────────────────────────────────────
  drawPolyHUD(container, state, game, W, H, HUD_H, theme, isDark, hitRegions);
}
