import { Container, Graphics, Text, Sprite } from 'pixi.js';
import { getCheckerTexture } from '../textures.js';
import { drawPolyHUD, drawBoardDice, drawArmHighlights } from './shared.js';

/**
 * Build the cross-shaped quadgammon board (24 points, 6 per arm).
 *
 * Four arms at 90-degree intervals. Central hub = BAR.
 * Bear-off at each arm tip for the appropriate player.
 */
export function buildCrossBoard(app, container, game, state, theme, hitRegions) {
  const W = app.screen.width;
  const H = app.screen.height;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const HUD_H  = Math.min(64, H * 0.14);
  const boardH = H - HUD_H;
  const bCx    = W / 2;
  const bCy    = boardH * 0.50;

  // ── Arm directions (clockwise: down, left, up, right) ────────────────────
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

  // ── Central hub (BAR) ────────────────────────────────────────────────────
  const hub = new Graphics();
  hub.circle(bCx, bCy, hubR);
  hub.fill(theme.barArea);
  hub.circle(bCx, bCy, hubR);
  hub.stroke({ width: 2, color: theme.boardBorder });
  container.addChild(hub);

  const barLabel = new Text({
    text: 'BAR',
    style: {
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fontSize: Math.max(9, hubR * 0.34),
      fill: theme.subtext,
    },
  });
  barLabel.anchor.set(0.5);
  barLabel.x = bCx;
  barLabel.y = bCy;
  container.addChild(barLabel);

  hitRegions.barAreas.push({ x: bCx - hubR, y: bCy - hubR, w: hubR * 2, h: hubR * 2 });

  // ── Triangular points ────────────────────────────────────────────────────
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

      const tri = new Graphics();
      tri.poly([bx1, by1, bx2, by2, tipX, tipY]);
      tri.fill(dColors[physIdx % 2]);
      container.addChild(tri);

      const pcx    = (bx1 + bx2 + tipX) / 3;
      const pcy    = (by1 + by2 + tipY) / 3;
      const baseCx = (bx1 + bx2) / 2;
      const baseCy = (by1 + by2) / 2;

      allPts.push({ physIdx, pcx, pcy, baseCx, baseCy, tipX, tipY });
      hitRegions.pointCenters.push({ cx: pcx, cy: pcy, r: slotLen * 0.50, idx: physIdx });
    }
  }

  // ── Point labels ─────────────────────────────────────────────────────────
  const labelStyle = {
    fontFamily: 'Arial',
    fontWeight: 'bold',
    fontSize: Math.max(6, CR * 0.65),
    fill: 0xffffff,
  };
  for (const pt of allPts) {
    const label = new Text({ text: String(pt.physIdx + 1), style: labelStyle });
    label.anchor.set(0.5);
    label.x = pt.pcx;
    label.y = pt.pcy;
    label.alpha = 0.35;
    container.addChild(label);
  }

  // ── Checkers ─────────────────────────────────────────────────────────────
  for (const pt of allPts) {
    const sp = state.points[pt.physIdx];
    if (sp.count === 0) continue;
    const ddx = pt.tipX - pt.baseCx;
    const ddy = pt.tipY - pt.baseCy;
    const len = Math.sqrt(ddx * ddx + ddy * ddy);
    if (len < 1) continue;
    const ux = ddx / len, uy = ddy / len;
    const color = game.players[sp.player]?.color || '#888';
    const tex   = getCheckerTexture(app.renderer, color, CR);

    for (let s = 0; s < sp.count; s++) {
      const d = CR * 1.1 + s * (CR * 2 + 1);
      const checker = new Sprite(tex);
      checker.anchor.set(0.5);
      checker.x = pt.baseCx + ux * d;
      checker.y = pt.baseCy + uy * d;
      container.addChild(checker);
    }
  }

  // ── Bar checkers ─────────────────────────────────────────────────────────
  for (let p = 0; p < game.numPlayers; p++) {
    if (state.bar[p] === 0) continue;
    const angle = p * Math.PI / 2 - Math.PI / 4;
    const color = game.players[p].color;
    const tex   = getCheckerTexture(app.renderer, color, CR * 0.65);

    for (let s = 0; s < state.bar[p]; s++) {
      const r = hubR * 0.3 + s * CR * 1.8;
      const checker = new Sprite(tex);
      checker.anchor.set(0.5);
      checker.x = bCx + r * Math.cos(angle);
      checker.y = bCy + r * Math.sin(angle);
      container.addChild(checker);
    }
  }

  // ── Bear-off zones ───────────────────────────────────────────────────────
  const bearArmMap = [3, 0, 1, 2];
  const offR       = Math.min(26, maxR * 0.11);
  const bearZones  = [];

  for (let p = 0; p < 4; p++) {
    const bArm = bearArmMap[p];
    const { dx, dy } = armDirs[bArm];
    const d = armEnd + offR * 2.2;
    bearZones.push({ player: p, tx: bCx + dx * d, ty: bCy + dy * d });
  }

  _drawBearOffPills(container, bearZones, offR, game, state, hitRegions);

  // ── Highlights ───────────────────────────────────────────────────────────
  const barZones = [];
  for (let p = 0; p < 4; p++) {
    barZones.push({ player: p, tx: bCx, ty: bCy });
  }
  drawArmHighlights(container, state, allPts, slotLen * 0.50, theme, barZones, bearZones);

  // ── Dice on the board (centred at hub) ─────────────────────────────────
  drawBoardDice(container, state, game, bCx, bCy, theme, isDark);

  // ── HUD (roll button only) ─────────────────────────────────────────────
  drawPolyHUD(container, state, game, W, H, HUD_H, theme, isDark, hitRegions);
}

// ═════════════════════════════════════════════════════════════════════════════
// Internal
// ═════════════════════════════════════════════════════════════════════════════

function _drawBearOffPills(container, bearZones, offR, game, state, hitRegions) {
  for (const bz of bearZones) {
    const pl    = game.players[bz.player];
    const count = state.borneOff[bz.player];
    const bzW   = offR * 3.4;
    const bzH   = offR * 1.7;
    const zx    = bz.tx - bzW / 2;
    const zy    = bz.ty - bzH / 2;

    const gfx = new Graphics();
    gfx.roundRect(zx, zy, bzW, bzH, bzH / 2);
    gfx.fill({ color: pl.color, alpha: 0.16 });
    gfx.roundRect(zx, zy, bzW, bzH, bzH / 2);
    gfx.stroke({ color: pl.color, width: 1.5, alpha: 0.6 });
    container.addChild(gfx);

    const short = pl.name.length > 6 ? pl.name.slice(0, 5) + '\u2026' : pl.name;
    const label = new Text({
      text: `${short} OFF \xd7${count}`,
      style: {
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fontSize: Math.max(8, offR * 0.40),
        fill: pl.color,
      },
    });
    label.anchor.set(0.5);
    label.x = bz.tx;
    label.y = bz.ty;
    container.addChild(label);

    hitRegions.bearAreas.push({ x: zx, y: zy, w: bzW, h: bzH });
  }
}
