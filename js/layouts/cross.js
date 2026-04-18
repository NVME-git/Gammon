import { Graphics, Text, Sprite } from 'pixi.js';
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
export function buildCrossBoard(app, container, game, state, theme, hitRegions, showNumbers = true, myTurn = true, isOnline = false, pendingConfirm = false, pendingPlayer = null) {
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

  // ── Cross-board jump arrows — drawn FIRST so arm strips render over them ──
  _drawCrossboardArrows(container, game, bCx, bCy, maxR, armEnd, armDirs);

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
  const allPts = [];

  for (let arm = 0; arm < 4; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];
    const sCol = game.players[startPlayerOfArm[arm]].color;
    const hCol = game.players[homePlayerOfArm[arm]].color;

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
      diamond.fill(physIdx % 2 === 0 ? sCol : hCol);
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
  const chevN   = 8;

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

  // ── BAR / OFF checker piles near arm tips + hit regions ─────────────────
  // Each arm tip: BAR for startPlayer (-nx side), OFF for homePlayer (+nx side).
  // Badges are inset 30px along the arm so pip stacks stay within the canvas.
  const badgeLat   = hw + labelPad + labelFontSize * 0.5 + 10;
  const badgeInset = 30;  // px inward from arm tip — prevents overflow on canvas edges
  const hitRadius  = 28;

  for (let arm = 0; arm < 4; arm++) {
    const { dx, dy, nx, ny } = armDirs[arm];
    const sP   = startPlayerOfArm[arm];
    const hP   = homePlayerOfArm[arm];
    const tipX = bCx + dx * (armEnd - badgeInset);
    const tipY = bCy + dy * (armEnd - badgeInset);

    const barCx = tipX - nx * badgeLat;
    const barCy = tipY - ny * badgeLat;
    drawCheckerPips(container, barCx, barCy, 'BAR', state.bar[sP], game.players[sP].color, labelFontSize, CR);
    hitRegions.barAreas.push({ x: barCx - hitRadius, y: barCy - hitRadius, w: hitRadius * 2, h: hitRadius * 2 });

    const offCx = tipX + nx * badgeLat;
    const offCy = tipY + ny * badgeLat;
    drawCheckerPips(container, offCx, offCy, 'OFF', state.borneOff[hP], game.players[hP].color, labelFontSize, CR);
    hitRegions.bearAreas.push({ x: offCx - hitRadius, y: offCy - hitRadius, w: hitRadius * 2, h: hitRadius * 2 });
  }

  // ── Center hub turn arrows (drawn last so they sit on top of hub area) ───
  _drawCenterTurnArrows(container, game, bCx, bCy, armStart, armDirs);

  // ── Floating dice + Roll + Undo buttons (top-left corner) ───────────────
  drawFloatingDice(container, state, game, theme, isDark,
    { showButtons: true, showUndo: true, hitRegions, myTurn, isOnline, pendingConfirm, pendingPlayer });
}

// ─── Center hub turn arrows ───────────────────────────────────────────────────
// 8 true quarter-circle arcs (2 per corner), all centred at the board centre.
// r1 = outer arcs (each player's FIRST hub turn).
// r2 = inner arcs (each player's SECOND hub turn, in a different corner).
// Endpoints sit exactly on the arm axes — radius alone separates the two arcs
// in each corner, so there is no perpendicular stagger.
//
// Angles use the canvas y-down frame:  0=E  π/2=S  π=W  3π/2=N
//
//   SW corner:  P0 S→W (outer, CW)  /  P2 W→S (inner, CCW)
//   NW corner:  P1 W→N (outer, CW)  /  P3 N→W (inner, CCW)
//   NE corner:  P2 N→E (outer, CW)  /  P0 E→N (inner, CCW)
//   SE corner:  P3 E→S (outer, CW)  /  P1 S→E (inner, CCW)
function _drawCenterTurnArrows(container, game, bCx, bCy, armStart) {
  const PI  = Math.PI;
  const r1  = armStart * 0.75;  // outer radius (first turns)
  const r2  = armStart * 0.46;  // inner radius (second turns)
  const ahSize = 8;
  const chevW  = 6, chevH = 7;

  // sa/ea = canvas start/end angle.
  // ccw   = anticlockwise flag for PixiJS arc().
  // exitAngle = direction of travel leaving the arc (outward along exit arm).
  const turns = [
    // SW corner
    { p:0, sa:PI/2,    ea:PI,      ccw:false, exitAngle:PI,     r:r1 },
    { p:2, sa:PI,      ea:PI/2,    ccw:true,  exitAngle:PI/2,   r:r2, inner:true },
    // NW corner
    { p:1, sa:PI,      ea:3*PI/2,  ccw:false, exitAngle:-PI/2,  r:r1 },
    { p:3, sa:3*PI/2,  ea:PI,      ccw:true,  exitAngle:PI,     r:r2, inner:true },
    // NE corner
    { p:2, sa:3*PI/2,  ea:2*PI,    ccw:false, exitAngle:0,      r:r1 },
    { p:0, sa:2*PI,    ea:3*PI/2,  ccw:true,  exitAngle:-PI/2,  r:r2, inner:true },
    // SE corner
    { p:3, sa:0,       ea:PI/2,    ccw:false, exitAngle:PI/2,   r:r1 },
    { p:1, sa:PI/2,    ea:0,       ccw:true,  exitAngle:0,      r:r2, inner:true },
  ];

  for (const { p, sa, ea, ccw, exitAngle, r, inner } of turns) {
    if (p >= game.numPlayers) continue;
    const color = game.players[p].color;

    const sx = bCx + r * Math.cos(sa);
    const sy = bCy + r * Math.sin(sa);
    const ex = bCx + r * Math.cos(ea);
    const ey = bCy + r * Math.sin(ea);

    const gfx = new Graphics();
    gfx.moveTo(sx, sy);
    if (inner) {
      // Concave: quadratic bezier with CP at hub center curves through interior
      gfx.quadraticCurveTo(bCx, bCy, ex, ey);
    } else {
      gfx.arc(bCx, bCy, r, sa, ea, ccw);
    }
    gfx.stroke({ color, width: 2.5, alpha: 0.80 });
    container.addChild(gfx);

    // Arrowhead — points in exit arm's outward direction
    const arr = new Graphics();
    arr.poly([
      ex, ey,
      ex - ahSize * Math.cos(exitAngle - 0.42), ey - ahSize * Math.sin(exitAngle - 0.42),
      ex - ahSize * Math.cos(exitAngle + 0.42), ey - ahSize * Math.sin(exitAngle + 0.42),
    ]);
    arr.fill({ color, alpha: 0.80 });
    container.addChild(arr);

    // Chevrons at t=0.33 and t=0.67
    const chevGfx = new Graphics();
    if (inner) {
      // Quadratic bezier tangent: B'(t) = 2(1-t)*(CP-P0) + 2t*(P1-CP)
      for (const t of [0.33, 0.67]) {
        const mt  = 1 - t;
        const px  = mt*mt*sx + 2*t*mt*bCx + t*t*ex;
        const py  = mt*mt*sy + 2*t*mt*bCy + t*t*ey;
        const dtx = 2*mt*(bCx - sx) + 2*t*(ex - bCx);
        const dty = 2*mt*(bCy - sy) + 2*t*(ey - bCy);
        const dlen = Math.sqrt(dtx*dtx + dty*dty);
        drawArmChevron(chevGfx, px, py, chevW, chevH, dtx/dlen, dty/dlen, color, 0.75);
      }
    } else {
      const delta = ea - sa;
      for (const t of [0.33, 0.67]) {
        const θ  = sa + t * delta;
        const px = bCx + r * Math.cos(θ);
        const py = bCy + r * Math.sin(θ);
        const tx = ccw ?  Math.sin(θ) : -Math.sin(θ);
        const ty = ccw ? -Math.cos(θ) :  Math.cos(θ);
        drawArmChevron(chevGfx, px, py, chevW, chevH, tx, ty, color, 0.75);
      }
    }
    container.addChild(chevGfx);
  }
}

// ─── Cross-board (tip-to-tip) arrows — rendered BEFORE arm strips ────────────
// Cubic bezier curves routed through the diagonal corner spaces between arms.
// Drawn first so the arm strips visually cover any overlap, leaving only the
// corner portions visible — giving the impression of arrows going around the board.
function _drawCrossboardArrows(container, game, bCx, bCy, maxR, armEnd, armDirs) {
  const cr = maxR * 0.64;  // corner control-point radius (in diagonal spaces)

  const crossTrans = [
    // P0: arm1(W) → arm3(E) — routes through top-left and top-right corners
    { p: 0, fa: 1, ta: 3,
      cp1x: bCx - cr, cp1y: bCy - cr,
      cp2x: bCx + cr, cp2y: bCy - cr },
    // P1: arm2(N) → arm0(S) — routes through top-right and bottom-right corners
    { p: 1, fa: 2, ta: 0,
      cp1x: bCx + cr, cp1y: bCy - cr,
      cp2x: bCx + cr, cp2y: bCy + cr },
    // P2: arm3(E) → arm1(W) — routes through bottom-right and bottom-left corners
    { p: 2, fa: 3, ta: 1,
      cp1x: bCx + cr, cp1y: bCy + cr,
      cp2x: bCx - cr, cp2y: bCy + cr },
    // P3: arm0(S) → arm2(N) — routes through bottom-left and top-left corners
    { p: 3, fa: 0, ta: 2,
      cp1x: bCx - cr, cp1y: bCy + cr,
      cp2x: bCx - cr, cp2y: bCy - cr },
  ];

  const STEPS  = 20;
  const ahSize = 9;

  for (const { p, fa, ta, cp1x, cp1y, cp2x, cp2y } of crossTrans) {
    if (p >= game.numPlayers) continue;
    const color = game.players[p].color;
    const sx = bCx + armDirs[fa].dx * armEnd;
    const sy = bCy + armDirs[fa].dy * armEnd;
    const ex = bCx + armDirs[ta].dx * armEnd;
    const ey = bCy + armDirs[ta].dy * armEnd;

    const gfx = new Graphics();
    gfx.moveTo(sx, sy);
    for (let k = 1; k <= STEPS; k++) {
      const t = k / STEPS, mt = 1 - t;
      gfx.lineTo(
        mt*mt*mt*sx + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*ex,
        mt*mt*mt*sy + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*ey,
      );
    }
    gfx.stroke({ color, width: 2.5, alpha: 0.65 });
    container.addChild(gfx);

    // Arrowhead — tangent at end = direction from cp2 to end
    const angle = Math.atan2(ey - cp2y, ex - cp2x);
    const arr   = new Graphics();
    arr.poly([
      ex, ey,
      ex - ahSize * Math.cos(angle - 0.42), ey - ahSize * Math.sin(angle - 0.42),
      ex - ahSize * Math.cos(angle + 0.42), ey - ahSize * Math.sin(angle + 0.42),
    ]);
    arr.fill({ color, alpha: 0.65 });
    container.addChild(arr);

    // Chevrons at 8 points along the arc
    const chevGfx = new Graphics();
    for (const t of [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80]) {
      const mt  = 1 - t;
      const bx  = mt*mt*mt*sx + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*ex;
      const by  = mt*mt*mt*sy + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*ey;
      const dtx = 3*mt*mt*(cp1x-sx) + 6*mt*t*(cp2x-cp1x) + 3*t*t*(ex-cp2x);
      const dty = 3*mt*mt*(cp1y-sy) + 6*mt*t*(cp2y-cp1y) + 3*t*t*(ey-cp2y);
      const len = Math.hypot(dtx, dty);
      if (len > 0) drawArmChevron(chevGfx, bx, by, 7, 8, dtx/len, dty/len, color, 0.68);
    }
    container.addChild(chevGfx);
  }
}

