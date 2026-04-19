import { Graphics, Text, Container } from 'pixi.js';
import { getCheckerTexture } from '../textures.js';
import { drawFloatingDice, drawCheckerPips } from './shared.js';

// ─── Physical tile grid coordinates (0-indexed col, row on a 25×25 grid) ─────
// 48 tiles in 8 sections of 6. Center of grid = (12, 12).
const TILE_GRID = [
  // 0-5:  Left arm — row 12, cols 0→5
  [0,12],[1,12],[2,12],[3,12],[4,12],[5,12],
  // 6-11: Lower-left diagonal — cols 6→11, rows 13→18
  [6,13],[7,14],[8,15],[9,16],[10,17],[11,18],
  // 12-17: Lower-right diagonal — cols 13→18, rows 18→13
  [13,18],[14,17],[15,16],[16,15],[17,14],[18,13],
  // 18-23: Right arm — row 12, cols 19→24
  [19,12],[20,12],[21,12],[22,12],[23,12],[24,12],
  // 24-29: Upper-right diagonal — cols 18→13, rows 11→6
  [18,11],[17,10],[16,9],[15,8],[14,7],[13,6],
  // 30-35: Upper-left diagonal — cols 11→6, rows 6→11
  [11,6],[10,7],[9,8],[8,9],[7,10],[6,11],
  // 36-41: Top arm — col 12, rows 5→0
  [12,5],[12,4],[12,3],[12,2],[12,1],[12,0],
  // 42-47: Bottom arm — col 12, rows 19→24
  [12,19],[12,20],[12,21],[12,22],[12,23],[12,24],
];

// Which section (0-7) each tile belongs to, for coloring
const TILE_SECTION = TILE_GRID.map((_, i) => Math.floor(i / 6));

// Section colors — alternating shades for the 8 sections
const SECTION_ALPHA = [0.18, 0.10, 0.18, 0.10, 0.18, 0.10, 0.18, 0.10];

// Player paths: which tiles each player traverses in order (tile indices, v=0→23)
function playerTileAt(game, player, virtualPos) {
  return game.getActualPos(player, virtualPos);
}

// ─── Entry zones: where bar checkers re-enter ─────────────────────────────────
// P0 enters via left arm (tiles 0-5), P1 via right arm (18-23),
// P2 via top arm (36-41), P3 via bottom arm (42-47)
const ENTRY_TILE = [0, 23, 36, 47];

// ─── Exit zones: where players bear off ──────────────────────────────────────
// P0 exits from right arm, P1 from left arm, P2 from bottom arm, P3 from top arm
const EXIT_TILE = [23, 0, 47, 36];

export function buildDiamondBoard(app, container, game, state, theme, hitRegions, myTurn, isOnline, pendingConfirm, pendingPlayer, resignSecondsLeft) {
  const W = app.screen.width;
  const H = app.screen.height;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Full-width board (no side panel — BAR/OFF displayed at arm tips)
  const PAD = 12;
  // Reserve horizontal margin for arm-tip badges
  const BADGE_MARGIN = 80;
  const cellSize = Math.min((W - PAD * 2 - BADGE_MARGIN * 2) / 25, (H - PAD * 2 - BADGE_MARGIN * 2) / 25);

  // Board origin: centre the 25×25 grid
  const gridPxW = 25 * cellSize;
  const gridPxH = 25 * cellSize;
  const ox = (W - gridPxW) / 2;
  const oy = (H - gridPxH) / 2;

  // ── Background ──────────────────────────────────────────────────────────────
  const bg = new Graphics();
  bg.rect(0, 0, W, H);
  bg.fill(theme.background);
  container.addChild(bg);

  // ── Draw board tiles ────────────────────────────────────────────────────────
  const tileR = cellSize * 0.44;
  const tileContainer = new Container();
  container.addChild(tileContainer);

  // Precompute pixel centres
  const tileCx = TILE_GRID.map(([c, r]) => ox + c * cellSize + cellSize / 2);
  const tileCy = TILE_GRID.map(([c, r]) => oy + r * cellSize + cellSize / 2);

  // Draw faint connectors between consecutive tiles in each section
  const connGfx = new Graphics();
  for (let s = 0; s < 8; s++) {
    const start = s * 6;
    for (let i = start; i < start + 5; i++) {
      connGfx.moveTo(tileCx[i], tileCy[i]);
      connGfx.lineTo(tileCx[i + 1], tileCy[i + 1]);
      connGfx.stroke({ width: cellSize * 0.18, color: theme.boardBorder, alpha: 0.25, cap: 'round' });
    }
  }
  // Regular junctions — faint neutral lines
  for (const [a, b] of [[5,6],[5,35],[11,42],[12,42],[17,18],[18,24],[29,36],[30,36]]) {
    connGfx.moveTo(tileCx[a], tileCy[a]);
    connGfx.lineTo(tileCx[b], tileCy[b]);
    connGfx.stroke({ width: cellSize * 0.12, color: theme.boardBorder, alpha: 0.18, cap: 'round' });
  }
  // Shortcuts — coloured by the player who uses them
  const shortcuts = [
    [11, 12, 0],  // P0: LL-diag → LR-diag (skips south arm)
    [29, 30, 1],  // P1: UR-diag → UL-diag (skips north arm)
    [17, 24, 2],  // P2: UR-diag → LR-diag (skips east arm)
    [ 6, 35, 3],  // P3: LL-diag → UL-diag (skips west arm)
  ];
  for (const [a, b, p] of shortcuts) {
    const col = game.players[p].color;
    connGfx.moveTo(tileCx[a], tileCy[a]);
    connGfx.lineTo(tileCx[b], tileCy[b]);
    connGfx.stroke({ width: cellSize * 0.18, color: col, alpha: 0.55, cap: 'round' });
  }
  tileContainer.addChild(connGfx);

  // Draw section backgrounds and tile outlines
  for (let i = 0; i < 48; i++) {
    const cx = tileCx[i], cy = tileCy[i];
    const sec = TILE_SECTION[i];

    const tile = new Graphics();
    tile.circle(cx, cy, tileR);
    tile.fill({ color: theme.board, alpha: 0.9 });
    tile.circle(cx, cy, tileR);
    tile.stroke({ width: 1, color: theme.boardBorder, alpha: 0.4 + SECTION_ALPHA[sec] });
    tileContainer.addChild(tile);

    // Register as hit region (circle centre for distance hit-test)
    hitRegions.pointCenters.push({ cx, cy, r: tileR, idx: i });

    // Register circle for pulse outlines + bobbing chevron (centred in tile)
    hitRegions.pointPolygons.push({ circle: { cx, cy, r: tileR * 1.2 }, idx: i, chevY: cy });
  }

  // ── Directional arrows for each player ──────────────────────────────────────
  _drawPlayerArrows(tileContainer, game, state, theme, tileCx, tileCy, cellSize, isDark);


  // ── Checkers ─────────────────────────────────────────────────────────────────
  const checkerContainer = new Container();
  container.addChild(checkerContainer);

  for (let i = 0; i < 48; i++) {
    const pt = state.points[i];
    if (!pt || pt.count === 0) continue;
    _drawCheckerStack(checkerContainer, app, game, pt, tileCx[i], tileCy[i], tileR, i, state);
  }

  // ── BAR / OFF badges at arm tips ────────────────────────────────────────────
  _drawArmBadges(container, game, state, theme, tileCx, tileCy, cellSize, hitRegions);

  // ── Resigned / finished player overlays ─────────────────────────────────────
  _drawStatusOverlays(container, game, state, theme, isDark, ox, oy, gridPxW, gridPxH);

  // ── Floating dice + buttons ──────────────────────────────────────────────────
  const resignTimeoutSec = game.settings?.resignTimeoutMs ? game.settings.resignTimeoutMs / 1000 : 0;
  drawFloatingDice(container, state, game, theme, isDark, {
    showButtons:      true,
    showUndo:         !isOnline,
    hitRegions,
    dieSize:          72,
    myTurn,
    isOnline,
    pendingConfirm,
    pendingPlayer,
    showResign:       myTurn && !state.resigned?.[state.currentPlayer],
    resignSecondsLeft,
    resignTimeoutSec,
  });
}

// ─── Draw small direction chevrons along each player's path ───────────────────
// Chevrons are offset perpendicularly OFF the tiles so they don't overlap the board circles.
// Different players naturally offset in opposite directions when traversing the same section.
function _drawPlayerArrows(container, game, state, theme, tileCx, tileCy, cellSize, isDark) {
  // Draw at every other virtual step for density without clutter
  const PERP_DIST = cellSize * 0.62;  // distance off-tile (tile radius is cellSize*0.44)
  const HS        = cellSize * 0.17;  // chevron half-size

  for (let p = 0; p < game.numPlayers; p++) {
    const color = game.players[p].color;
    if (state.resigned?.[p] || state.borneOff[p] >= 15) continue;

    const arrowGfx = new Graphics();

    for (let v = 0; v <= 22; v += 2) {
      const aFrom = game.getActualPos(p, v);
      const aTo   = game.getActualPos(p, v + 1);
      if (aFrom < 0 || aFrom >= 48 || aTo < 0 || aTo >= 48) continue;

      const dx  = tileCx[aTo] - tileCx[aFrom];
      const dy  = tileCy[aTo] - tileCy[aFrom];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      const nx = dx / len, ny = dy / len;
      // Perpendicular (always same rotational sense — arrow sits to the left of travel direction)
      const px = -ny, py = nx;

      // Place chevron midway between the two tile centres, offset perpendicularly
      const mx = (tileCx[aFrom] + tileCx[aTo]) / 2 + px * PERP_DIST;
      const my = (tileCy[aFrom] + tileCy[aTo]) / 2 + py * PERP_DIST;

      arrowGfx.moveTo(mx - nx * HS - ny * HS, my - ny * HS + nx * HS);
      arrowGfx.lineTo(mx + nx * HS,            my + ny * HS);
      arrowGfx.lineTo(mx - nx * HS + ny * HS,  my - ny * HS - nx * HS);
      arrowGfx.stroke({ width: 2, color, alpha: 0.55, cap: 'round', join: 'round' });
    }
    container.addChild(arrowGfx);
  }
}

// ─── Draw checkers spread around a tile ──────────────────────────────────────
// For n>1 pieces, distribute in a ring so they don't stack on top of each other.
function _drawCheckerStack(container, app, game, pt, cx, cy, tileR, tileIdx, state) {
  const color    = game.players[pt.player]?.color || '#888';
  const maxShow  = 5;
  const n        = Math.min(pt.count, maxShow);
  const r        = tileR * (n === 1 ? 0.58 : 0.48);
  const spread   = n === 1 ? 0 : tileR * 0.46;

  for (let k = 0; k < n; k++) {
    // Evenly distributed angles in a ring; single piece at centre
    const angle = n === 1 ? 0 : (k / n) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * spread;
    const py = cy + Math.sin(angle) * spread;

    const gfx = new Graphics();
    gfx.circle(px, py, r);
    if (state.selectedPoint === tileIdx && k === n - 1) {
      gfx.fill({ color, alpha: 0.5 });
    } else {
      gfx.fill(color);
    }
    gfx.circle(px, py, r);
    gfx.stroke({ color: 0x000000, width: 1, alpha: 0.3 });
    container.addChild(gfx);

    const hl = new Graphics();
    hl.circle(px - r * 0.22, py - r * 0.25, r * 0.3);
    hl.fill({ color: 0xffffff, alpha: 0.36 });
    container.addChild(hl);
  }

  if (pt.count > maxShow) {
    const lbl = new Text({
      text: `×${pt.count}`,
      style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: Math.max(9, r * 1.1), fill: '#ffffff' },
    });
    lbl.anchor.set(0.5);
    lbl.x = cx + r * 0.6;
    lbl.y = cy + r * 0.6;
    container.addChild(lbl);
  }
}

// ─── Draw BAR / BEAR-OFF zones near arm tips ──────────────────────────────────
// ─── BAR / OFF pip badges at each arm tip, like trigammon ────────────────────
// Two badges per arm tip — perpendicular to the arm direction.
// Left  arm tip (tile  0): P0 BAR above,  P1 OFF below
// Right arm tip (tile 23): P1 BAR above,  P0 OFF below
// Top   arm tip (tile 41): P2 BAR left,   P3 OFF right
// Bottom arm tip (tile 47): P3 BAR left,  P2 OFF right
function _drawArmBadges(container, game, state, theme, tileCx, tileCy, cellSize, hitRegions) {
  const cp   = state.currentPlayer;
  const SIDE = cellSize * 1.6;   // perpendicular offset from arm tip
  const CR   = Math.max(4, cellSize * 0.15);
  const FS   = Math.max(9, cellSize * 0.32);
  const HR   = cellSize * 0.9;   // hit-region half-size

  const badges = [
    { p: 0, type: 'bar',     cx: tileCx[0],  cy: tileCy[0]  - SIDE },
    { p: 1, type: 'bearoff', cx: tileCx[0],  cy: tileCy[0]  + SIDE },
    { p: 1, type: 'bar',     cx: tileCx[23], cy: tileCy[23] - SIDE },
    { p: 0, type: 'bearoff', cx: tileCx[23], cy: tileCy[23] + SIDE },
    { p: 2, type: 'bar',     cx: tileCx[41] - SIDE, cy: tileCy[41] },
    { p: 3, type: 'bearoff', cx: tileCx[41] + SIDE, cy: tileCy[41] },
    { p: 3, type: 'bar',     cx: tileCx[47] - SIDE, cy: tileCy[47] },
    { p: 2, type: 'bearoff', cx: tileCx[47] + SIDE, cy: tileCy[47] },
  ];

  for (const b of badges) {
    const color   = game.players[b.p].color;
    const count   = b.type === 'bar' ? state.bar[b.p] : state.borneOff[b.p];
    const isSel   = (b.p === cp) && b.type === 'bar'     && state.selectedPoint === 'bar';
    const isValid = (b.p === cp) && b.type === 'bearoff' && state.validMoves.includes('bearoff');

    if (isSel || isValid) {
      const hl = new Graphics();
      hl.circle(b.cx, b.cy, HR * 1.1);
      hl.fill({ color: isSel ? theme.selected : theme.validMove, alpha: 0.35 });
      container.addChild(hl);
    }

    drawCheckerPips(container, b.cx, b.cy, b.type === 'bar' ? 'BAR' : 'OFF', count, color, FS, CR);

    const hr = { x: b.cx - HR, y: b.cy - HR, w: HR * 2, h: HR * 2 };
    if (b.type === 'bar') hitRegions.barAreas.push(hr);
    else                  hitRegions.bearAreas.push(hr);
  }
}

// ─── Resigned / finished player status overlays ───────────────────────────────
function _drawStatusOverlays(container, game, state, theme, isDark, ox, oy, gridW, gridH) {
  for (let p = 0; p < game.numPlayers; p++) {
    const resigned   = state.resigned?.[p];
    const finished   = state.borneOff[p] >= 15;
    if (!resigned && !finished) continue;

    const finishPos = state.finishOrder?.indexOf(p);
    const label = resigned ? `${game.players[p].name}: Resigned`
                           : `${game.players[p].name}: Finished #${finishPos + 1}`;
    const color = game.players[p].color;

    const lbl = new Text({
      text: label,
      style: { fontFamily: 'Arial', fontWeight: 'bold', fontSize: 11, fill: color, alpha: 0.75 },
    });
    lbl.anchor.set(0.5, 0);
    lbl.x = ox + gridW / 2;
    lbl.y = oy + gridH + 4 + p * 16;
    lbl.alpha = 0.75;
    container.addChild(lbl);
  }
}

