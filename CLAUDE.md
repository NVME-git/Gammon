# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gammon is a multi-player backgammon SPA using **PixiJS v8** (WebGL) for rendering and **Vite** as the build tool. It supports 1-4 player variants: Unigammon, Bigammon (classic), Trigammon, and Quadgammon.

## Running Locally

```bash
npm install
npm run dev        # Vite dev server on http://localhost:8000
npm run build      # Production build to dist/
```

## Architecture

Core modules coordinated by `js/main.js`:

- **`js/game.js`** — `BackgammonGame` class. All game state, backgammon rules, move validation, bar/borne-off logic. Call `game.getState()` for a serializable snapshot. Pure logic, no rendering dependency.
- **`js/pixi-renderer.js`** — `BoardRenderer` class. PixiJS-based renderer with identical public API to the old Canvas 2D renderer. Delegates to layout modules. Manages PixiJS Application lifecycle, hit-testing, and theme switching.
- **`js/ui.js`** — `UIManager` class. DOM screens (setup/game/win), player setup forms, theme toggle.
- **`js/main.js`** — Orchestrator. Wires UI events to game logic, drives the turn loop (roll -> select checker -> move -> next turn -> win check).

Layout modules (`js/layouts/`):
- **`linear.js`** — Bigammon/Unigammon: 24 diamond points in a horizontal strip with BAR/OFF zones in top/bottom strips.
- **`triangle.js`** — Trigammon: Y-shaped board, 3 arms at 120 degrees, 36 diamond points. Arm A reversed so all players bear off at arm tips.
- **`cross.js`** — Quadgammon: cross-shaped board, 4 arms at 90 degrees, 24 triangle points. Central hub BAR.
- **`shared.js`** — Shared helpers: `drawPolyHUD` (dice + roll button strip), `drawArmHighlights`, `drawTipZone`, `drawArmChevron`.

Supporting modules:
- **`js/textures.js`** — Procedural texture generation (wood grain, glossy checkers). Cache keyed by color+size, cleared on resize.
- **`js/animation.js`** — `TweenManager` class hooked into PixiJS ticker. Ease functions for future checker-slide animations.
- **`js/constants.js`** — Game mode definitions, player colors, `THEME_COLORS` (dark/light palettes).
- **`js/pixelart.js`** — Pixel art avatar drawing and elimination animations.
- **`js/names.js`** — `generateFunnyName()` for auto-named players.
- **`js/renderer.js`** — Legacy Canvas 2D renderer (kept for reference, not imported).

## Key Design Concepts

**Virtual position system**: All four board geometries map to a common 0-23 axis so `game.js` can apply unified move logic regardless of board shape.

**Board model**: 24 points (or 36 for trigammon) + bar (hit checkers) + borne-off count. Each player moves in a fixed direction; hitting an opponent's lone checker sends it to the bar.

**Renderer public API** (consumed by main.js):
- `constructor(canvas, game)` — async PixiJS init, guarded render
- `resize()` / `render()` — layout and paint
- `hitTest(clientX, clientY)` — returns `{ type: 'point'|'bar'|'bearoff'|'roll', idx? }` or null
- `flipped` — boolean for board flip (bigammon only)

**Hit-testing**: Manual AABB checks (`_pointAreas`, `_barAreas`, `_bearAreas`, `_rollArea`) for linear boards. Distance-based checks (`_pointCenters`) for arm-based boards. All coordinates in CSS-pixel space (matching `app.screen`).

**Texture system**: Procedural via PixiJS `Graphics` + `renderer.generateTexture()`. No external image assets. Cache cleared on resize/theme change.

**Security**: Always use `textContent` (not `innerHTML`) for any user-controlled strings (player names, etc.) to prevent XSS.
