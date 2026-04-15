import { Container, Graphics, Text, Sprite } from 'pixi.js';
import { getCheckerTexture } from '../textures.js';
import { drawFloatingDice, drawArmChevron, drawCheckerPips } from './shared.js';

/**
 * Build the Y-shaped trigammon board (36 physical points).
 *
 * Three arms radiate from a central hub at 120-degree intervals.
 * One arm points straight up (-π/2); two arms point down-left and down-right.
 * Arm A (arm0) is visually reversed so all players bear off at arm tips.
 *
 * BAR / OFF zones live in the right side panel (always visible).
 * Dice live in the left side panel (large).
 */
export function buildTriangleBoard(app, container, game, state, theme, hitRegions, showNumbers = true) {
  const W = app.screen.width;
  const H = app.screen.height;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const bCx    = W / 2;

  // ── Arm directions: down-right(π/6), up(-π/2), down-left(5π/6) ───────────
  const armAngles = [Math.PI / 6, -Math.PI / 2, Math.PI * 5 / 6];
  const armDirs   = armAngles.map(a => ({
    dx: Math.cos(a), dy: Math.sin(a),
    nx: -Math.sin(a), ny: Math.cos(a),
  }));

  // ── Sizing: full screen (no HUD strip) ───────────────────────────────────
  // Side arms reach maxR*(0.866+0.12)=maxR*0.986 horizontally, plus ~13% extra
  // for the BAR/OFF badges that extend laterally beyond the arm tips.
  const tipPad   = 20;
  const sideMaxR = (W / 2 - tipPad) / 1.13;
  // Vertical: lower arm tips at bCy + maxR*0.5; badges add ~0.208*maxR+30 below.
  // Derived constraint: maxR * 1.71 + 62 ≤ H − topPad − tipPad
  const topPad   = 40;
  const vertMaxR = (H - topPad - tipPad - 62) / 1.71;
  const maxR     = Math.min(sideMaxR, vertMaxR);
  const bCy      = maxR + topPad;

  const armW     = maxR * 0.24;
  const hw       = armW / 2;
  const armStart = Math.max(hw * 1.15, 6);   // minimal gap — no hub circle
  const armEnd   = maxR;
  const slotLen  = (armEnd - armStart) / 12;
  const CR       = Math.min(slotLen * 0.42, hw * 0.38, 14);
  const dHW      = hw * 0.92;
  const dHL      = slotLen * 0.46;

  // ── Spacing: board → number → chevron ────────────────────────────────────
  const labelFontSize = Math.max(11, Math.min(hw * 0.34, 16));
  const labelPad      = hw + 12;               // label centre, outside arm edge
  const chevEdgeDist  = labelPad + labelFontSize + 8;  // chevron centre

  // ── Player-colour pairs per arm ──────────────────────────────────────────
  const armColors = [
    [game.players[0].color, game.players[1].color],
    [game.players[0].color, game.players[2].color],
    [game.players[1].color, game.players[2].color],
  ];

  // offP per arm: arm0→P1, arm1→P0, arm2→P2  (bearoff player at each arm tip)
  const offPlayerPerArm = [1, 0, 2];

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
      const t0 = armStart + d, t1 = Math.min(t0 + 3, armEnd);
      dashes.moveTo(bCx + dx * t0, bCy + dy * t0);
      dashes.lineTo(bCx + dx * t1, bCy + dy * t1);
    }
    dashes.stroke({ width: 1, color: theme.boardBorder, alpha: 0.22 });
    container.addChild(dashes);
  }

  // ── Home board markers (outer 6 slots of each arm) ────────────────────────
  for (let arm = 0; arm < 3; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];
    const pColor  = game.players[offPlayerPerArm[arm]].color;
    const homeT0  = armStart + 6 * slotLen;
    const homeGfx = new Graphics();

    homeGfx.poly([
      bCx + dx * homeT0 + nx * hw, bCy + dy * homeT0 + ny * hw,
      bCx + dx * armEnd + nx * hw, bCy + dy * armEnd + ny * hw,
      bCx + dx * armEnd - nx * hw, bCy + dy * armEnd - ny * hw,
      bCx + dx * homeT0 - nx * hw, bCy + dy * homeT0 - ny * hw,
    ]);
    homeGfx.fill({ color: pColor, alpha: 0.10 });

    homeGfx.moveTo(bCx + dx * homeT0 + nx * hw, bCy + dy * homeT0 + ny * hw);
    homeGfx.lineTo(bCx + dx * homeT0 - nx * hw, bCy + dy * homeT0 - ny * hw);
    homeGfx.stroke({ width: 2, color: pColor, alpha: 0.50 });

    container.addChild(homeGfx);
  }

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
        pcx + dx * dHL, pcy + dy * dHL,
        pcx + nx * dHW, pcy + ny * dHW,
        pcx - dx * dHL, pcy - dy * dHL,
        pcx - nx * dHW, pcy - ny * dHW,
      ]);
      diamond.fill((i % 2 === 0) ? c1 : c2);
      container.addChild(diamond);

      allPts.push({ physIdx, pcx, pcy, arm });
      hitRegions.pointPolygons.push({
        poly: [
          pcx + dx * dHL, pcy + dy * dHL,
          pcx + nx * dHW, pcy + ny * dHW,
          pcx - dx * dHL, pcy - dy * dHL,
          pcx - nx * dHW, pcy - ny * dHW,
        ],
        idx: physIdx,
      });
    }
  }

  // ── Point labels — outside diamond on each player's chevron side ─────────
  // inP label on -nx side (same side as inP's chevrons); outP on +nx side.
  const armFlowForLabels = [
    { outP: 1, inP: 0 },
    { outP: 0, inP: 2 },
    { outP: 2, inP: 1 },
  ];

  if (showNumbers) for (const pt of allPts) {
    const arm = Math.floor(pt.physIdx / 12);
    const { nx, ny } = armDirs[arm];
    const { inP, outP } = armFlowForLabels[arm];

    // inP label on -nx side (right-hand side of inP's inward travel)
    const inLabel = new Text({
      text: String(game.getVirtualPos(inP, pt.physIdx) + 1),
      style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: labelFontSize,
               fill: game.players[inP].color },
    });
    inLabel.anchor.set(0.5);
    inLabel.x = pt.pcx - nx * labelPad;
    inLabel.y = pt.pcy - ny * labelPad;
    inLabel.alpha = 0.95;
    container.addChild(inLabel);

    // outP label on +nx side (right-hand side of outP's outward travel)
    const outLabel = new Text({
      text: String(game.getVirtualPos(outP, pt.physIdx) + 1),
      style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: labelFontSize,
               fill: game.players[outP].color },
    });
    outLabel.anchor.set(0.5);
    outLabel.x = pt.pcx + nx * labelPad;
    outLabel.y = pt.pcy + ny * labelPad;
    outLabel.alpha = 0.95;
    container.addChild(outLabel);
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

  // ── Direction chevrons — each player on their right-hand side, full arm ──
  // inP moves inward (-dx,-dy), placed on -nx side of arm.
  // outP moves outward (+dx,+dy), placed on +nx side of arm.
  const armFlow = [
    { outP: 1, inP: 0 },   // arm0: P1 outward, P0 inward
    { outP: 0, inP: 2 },   // arm1: P0 outward, P2 inward
    { outP: 2, inP: 1 },   // arm2: P2 outward, P1 inward
  ];
  const chevH  = Math.min(hw * 0.72, 16);
  const chevW  = chevH * 0.65;
  const chevN  = Math.max(3, Math.floor((armEnd - armStart) / (slotLen * 2.5)));

  const chevGfx = new Graphics();
  for (let arm = 0; arm < 3; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];
    const { outP, inP } = armFlow[arm];
    const outCol   = game.players[outP].color;
    const inCol    = game.players[inP].color;

    for (let c = 0; c < chevN; c++) {
      const frac = (c + 0.5) / chevN;
      const t    = armStart + frac * (armEnd - armStart);
      const cx   = bCx + dx * t, cy = bCy + dy * t;

      // inP on -nx side (right-hand side of their inward travel)
      drawArmChevron(chevGfx, cx - nx * chevEdgeDist, cy - ny * chevEdgeDist,
                     chevW, chevH, -dx, -dy, inCol, 0.72);
      // outP on +nx side (right-hand side of their outward travel)
      drawArmChevron(chevGfx, cx + nx * chevEdgeDist, cy + ny * chevEdgeDist,
                     chevW, chevH, dx, dy, outCol, 0.72);
    }
  }
  container.addChild(chevGfx);

  // ── BAR / OFF checker piles at arm tips + hit regions ─────────────────
  const badgeLat  = hw + labelPad + labelFontSize * 0.5 + 10;
  const hitRadius = 28;  // click radius around the pip stack centre

  for (let arm = 0; arm < 3; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];
    const { inP, outP } = armFlow[arm];
    const tipX = bCx + dx * armEnd;
    const tipY = bCy + dy * armEnd;

    const barCx = tipX - nx * badgeLat;
    const barCy = tipY - ny * badgeLat;
    drawCheckerPips(container, barCx, barCy, 'BAR', state.bar[inP], game.players[inP].color, labelFontSize);
    hitRegions.barAreas.push({ x: barCx - hitRadius, y: barCy - hitRadius, w: hitRadius * 2, h: hitRadius * 2 });

    const offCx = tipX + nx * badgeLat;
    const offCy = tipY + ny * badgeLat;
    drawCheckerPips(container, offCx, offCy, 'OFF', state.borneOff[outP], game.players[outP].color, labelFontSize);
    hitRegions.bearAreas.push({ x: offCx - hitRadius, y: offCy - hitRadius, w: hitRadius * 2, h: hitRadius * 2 });
  }

  // ── Floating dice + Roll + Undo buttons (top-left corner) ───────────────
  drawFloatingDice(container, state, game, theme, isDark,
    { showButtons: true, showUndo: true, hitRegions });
}
