import { Container, Graphics, Text, Sprite } from 'pixi.js';
import { getCheckerTexture } from '../textures.js';
import { drawFloatingDice, drawArmChevron, drawCheckerPips } from './shared.js';

/**
 * Build the cross-shaped quadgammon board (24 points, 6 per arm).
 *
 * Arms: arm0=down(0-5), arm1=left(6-11), arm2=up(12-17), arm3=right(18-23)
 * Players: P0=South(arm0 start), P1=West(arm1), P2=North(arm2), P3=East(arm3)
 *
 * Each player's S-path through all 4 arms:
 *   P0: arm0(tip→hub) → arm1(hub→tip) → arm3(tip→hub) → arm2(hub→tip) → off
 *   P1: arm1(tip→hub) → arm2(hub→tip) → arm0(tip→hub) → arm3(hub→tip) → off
 *   P2: arm2(tip→hub) → arm3(hub→tip) → arm1(tip→hub) → arm0(hub→tip) → off
 *   P3: arm3(tip→hub) → arm0(hub→tip) → arm2(tip→hub) → arm1(hub→tip) → off
 *
 * Bear-off arms: P0→arm2, P1→arm3, P2→arm0, P3→arm1
 * Each arm: startPlayer (section1, inward) ↔ homePlayer (section4, outward)
 */
export function buildCrossBoard(app, container, game, state, theme, hitRegions, showNumbers = true) {
  const W = app.screen.width;
  const H = app.screen.height;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Board centre (full screen, no HUD strip)
  const bCx = W / 2;
  const bCy = H / 2;

  // ── Arm directions (down, left, up, right) ───────────────────────────────
  const armAngles = [Math.PI / 2, Math.PI, -Math.PI / 2, 0];
  const armDirs   = armAngles.map(a => ({
    dx: Math.cos(a), dy: Math.sin(a),
    nx: -Math.sin(a), ny: Math.cos(a),
  }));

  // ── Sizing: full screen (no HUD strip) ───────────────────────────────────
  const armTipPad = 16;  // gap between arm tip and canvas edge
  const maxR = Math.min(W / 2 - armTipPad, H / 2 - armTipPad);
  const armW = maxR * 0.32;
  const hw   = armW / 2;
  const armStart = hw + 4;   // minimal gap — no hub, inner diamonds close to centre
  const armEnd   = maxR;
  const slotLen  = (armEnd - armStart) / 6;
  const CR       = Math.min(slotLen * 0.26, hw * 0.30, 14);
  const dHL      = Math.min(slotLen * 0.44, hw * 0.80);  // diamond half-length along arm
  const dHW      = hw * 0.78;                             // diamond half-width perpendicular

  // ── Spacing: board → number → chevron ────────────────────────────────────
  const labelFontSize = Math.max(11, Math.min(hw * 0.34, 16));
  const labelPad      = hw + 12;               // label centre, outside arm edge
  const chevEdgeDist  = labelPad + labelFontSize + 8;  // chevron centre

  // ── Path metadata ─────────────────────────────────────────────────────────
  // startPlayerOfArm[arm]: player whose section1 (start, TIP→HUB) is this arm
  // homePlayerOfArm[arm]: player whose section4 (home, HUB→TIP) is this arm
  const startPlayerOfArm = [0, 1, 2, 3];   // arm0→P0, arm1→P1, arm2→P2, arm3→P3
  const homePlayerOfArm  = [2, 3, 0, 1];   // arm0→P2, arm1→P3, arm2→P0, arm3→P1

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

    const dashes = new Graphics();
    const len = armEnd - armStart;
    for (let d = 0; d < len; d += 8) {
      const t0 = armStart + d, t1 = Math.min(t0 + 3, armEnd);
      dashes.moveTo(bCx + dx * t0, bCy + dy * t0);
      dashes.lineTo(bCx + dx * t1, bCy + dy * t1);
    }
    dashes.stroke({ width: 1, color: theme.boardBorder, alpha: 0.22 });
    container.addChild(dashes);
  }

  // ── Home board markers: TIP half = start player, HUB half = home player ──
  for (let arm = 0; arm < 4; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];
    const sP    = startPlayerOfArm[arm];
    const hP    = homePlayerOfArm[arm];
    const sCOL  = game.players[sP].color;
    const hCOL  = game.players[hP].color;
    const midT  = armStart + 3 * slotLen;  // midpoint of arm

    const homeGfx = new Graphics();
    // Tip half (start player, section1 start outer area)
    homeGfx.poly([
      bCx + dx * midT  + nx * hw, bCy + dy * midT  + ny * hw,
      bCx + dx * armEnd + nx * hw, bCy + dy * armEnd + ny * hw,
      bCx + dx * armEnd - nx * hw, bCy + dy * armEnd - ny * hw,
      bCx + dx * midT  - nx * hw, bCy + dy * midT  - ny * hw,
    ]);
    homeGfx.fill({ color: sCOL, alpha: 0.10 });

    // Hub half (home player, section4 = bear-off zone)
    homeGfx.poly([
      bCx + dx * armStart + nx * hw, bCy + dy * armStart + ny * hw,
      bCx + dx * midT     + nx * hw, bCy + dy * midT     + ny * hw,
      bCx + dx * midT     - nx * hw, bCy + dy * midT     - ny * hw,
      bCx + dx * armStart - nx * hw, bCy + dy * armStart - ny * hw,
    ]);
    homeGfx.fill({ color: hCOL, alpha: 0.10 });

    // Midpoint boundary line
    homeGfx.moveTo(bCx + dx * midT + nx * hw, bCy + dy * midT + ny * hw);
    homeGfx.lineTo(bCx + dx * midT - nx * hw, bCy + dy * midT - ny * hw);
    homeGfx.stroke({ width: 2, color: theme.boardBorder, alpha: 0.30 });

    container.addChild(homeGfx);
  }

  // ── Diamond points ────────────────────────────────────────────────────────
  const allPts  = [];
  const dColors = [theme.triangle1, theme.triangle2];

  for (let arm = 0; arm < 4; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];

    for (let i = 0; i < 6; i++) {
      const physIdx = arm * 6 + i;
      const tMid    = armStart + (i + 0.5) * slotLen;
      const axCx    = bCx + dx * tMid;
      const axCy    = bCy + dy * tMid;

      const diamond = new Graphics();
      diamond.poly([
        axCx + dx * dHL, axCy + dy * dHL,
        axCx + nx * dHW, axCy + ny * dHW,
        axCx - dx * dHL, axCy - dy * dHL,
        axCx - nx * dHW, axCy - ny * dHW,
      ]);
      diamond.fill(dColors[physIdx % 2]);
      container.addChild(diamond);

      allPts.push({ physIdx, axCx, axCy, arm });
      hitRegions.pointPolygons.push({
        poly: [
          axCx + dx * dHL, axCy + dy * dHL,
          axCx + nx * dHW, axCy + ny * dHW,
          axCx - dx * dHL, axCy - dy * dHL,
          axCx - nx * dHW, axCy - ny * dHW,
        ],
        idx: physIdx,
      });
    }
  }

  // ── Point labels — outside diamond on each player's chevron side ──────────
  // startPlayer (inward) on -nx side; homePlayer (outward) on +nx side.
  if (showNumbers) for (const pt of allPts) {
    const arm = pt.arm;
    const { nx, ny } = armDirs[arm];
    const sP = startPlayerOfArm[arm];
    const hP = homePlayerOfArm[arm];

    // startPlayer label on -nx side (same side as their inward chevrons)
    const sLabel = new Text({
      text: String(game.getVirtualPos(sP, pt.physIdx) + 1),
      style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: labelFontSize,
               fill: game.players[sP].color },
    });
    sLabel.anchor.set(0.5);
    sLabel.x = pt.axCx - nx * labelPad;
    sLabel.y = pt.axCy - ny * labelPad;
    sLabel.alpha = 0.95;
    container.addChild(sLabel);

    // homePlayer label on +nx side (same side as their outward chevrons)
    const hLabel = new Text({
      text: String(game.getVirtualPos(hP, pt.physIdx) + 1),
      style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: labelFontSize,
               fill: game.players[hP].color },
    });
    hLabel.anchor.set(0.5);
    hLabel.x = pt.axCx + nx * labelPad;
    hLabel.y = pt.axCy + ny * labelPad;
    hLabel.alpha = 0.95;
    container.addChild(hLabel);
  }

  // ── Checkers — stacked perpendicular to arm ───────────────────────────────
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
      checker.x = pt.axCx + nx * offset;
      checker.y = pt.axCy + ny * offset;
      container.addChild(checker);
    }
  }

  // ── Direction chevrons — each player on their right-hand side, full arm ──
  // startPlayer (inward) on -nx side; homePlayer (outward) on +nx side.
  const chevGfx = new Graphics();
  const chevH   = Math.min(hw * 0.62, 14);
  const chevW   = chevH * 0.65;
  const chevN   = Math.max(2, Math.floor((armEnd - armStart) / (slotLen * 2.5)));

  for (let arm = 0; arm < 4; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];
    const sCol = game.players[startPlayerOfArm[arm]].color;
    const hCol = game.players[homePlayerOfArm[arm]].color;

    for (let c = 0; c < chevN; c++) {
      const frac = (c + 0.5) / chevN;
      const t    = armStart + frac * (armEnd - armStart);
      const cx   = bCx + dx * t;
      const cy   = bCy + dy * t;
      // startPlayer (inward) on -nx side
      drawArmChevron(chevGfx, cx - nx * chevEdgeDist, cy - ny * chevEdgeDist,
                     chevW, chevH, -dx, -dy, sCol, 0.72);
      // homePlayer (outward) on +nx side
      drawArmChevron(chevGfx, cx + nx * chevEdgeDist, cy + ny * chevEdgeDist,
                     chevW, chevH, dx, dy, hCol, 0.72);
    }
  }
  container.addChild(chevGfx);

  // ── BAR / OFF checker piles at arm tips + hit regions ───────────────────
  // Each arm tip: BAR for startPlayer (-nx side), OFF for homePlayer (+nx side).
  const badgeLat  = hw + labelPad + labelFontSize * 0.5 + 10;
  const hitRadius = 28;

  for (let arm = 0; arm < 4; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];
    const sP   = startPlayerOfArm[arm];
    const hP   = homePlayerOfArm[arm];
    const tipX = bCx + dx * armEnd;
    const tipY = bCy + dy * armEnd;

    const barCx = tipX - nx * badgeLat;
    const barCy = tipY - ny * badgeLat;
    drawCheckerPips(container, barCx, barCy, 'BAR', state.bar[sP], game.players[sP].color, labelFontSize);
    hitRegions.barAreas.push({ x: barCx - hitRadius, y: barCy - hitRadius, w: hitRadius * 2, h: hitRadius * 2 });

    const offCx = tipX + nx * badgeLat;
    const offCy = tipY + ny * badgeLat;
    drawCheckerPips(container, offCx, offCy, 'OFF', state.borneOff[hP], game.players[hP].color, labelFontSize);
    hitRegions.bearAreas.push({ x: offCx - hitRadius, y: offCy - hitRadius, w: hitRadius * 2, h: hitRadius * 2 });
  }

  // ── Floating dice + Roll + Undo buttons (top-left corner) ───────────────
  drawFloatingDice(container, state, game, theme, isDark,
    { showButtons: true, showUndo: true, hitRegions });
}

