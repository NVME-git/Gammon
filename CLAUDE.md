# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gammon is a multi-player backgammon SPA written in **vanilla JavaScript (ES6 modules)** with **HTML5 Canvas** for rendering. It supports 1–4 player variants: Unigammon, Bigammon (classic), Trigammon, and Quadgammon.

## Running Locally

No build step required. Serve the directory over HTTP (ES6 modules won't work via `file://`):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

No tests, no linter, no bundler.

## Architecture

Four core modules coordinated by `js/main.js`:

- **`js/game.js`** — `BackgammonGame` class. All game state, backgammon rules, move validation, bar/borne-off logic. Call `game.getState()` for a serializable snapshot.
- **`js/renderer.js`** — `BoardRenderer` class. Canvas drawing for all four board layouts (linear for 2-player, triangle for 3-player, cross for 4-player). Tracks hit-test areas for click-to-move.
- **`js/ui.js`** — `UIManager` class. DOM screens (setup/game/win), player setup forms, theme toggle, game log.
- **`js/main.js`** — Orchestrator. Wires UI events to game logic, drives the turn loop (roll → select checker → move → next turn → win check), passes `onCheckerHit` callback to trigger elimination animations.

Supporting modules:
- **`js/constants.js`** — Game mode definitions, player colors, theme color maps.
- **`js/pixelart.js`** — Pixel art avatar drawing and elimination animations.
- **`js/names.js`** — `generateFunnyName()` for auto-named players.

## Key Design Concepts

**Virtual position system**: All four board geometries map to a common 0–23 axis so `game.js` can apply unified move logic regardless of board shape.

**Board model**: 24 points + bar (hit checkers) + borne-off count. Each player moves in a fixed direction; hitting an opponent's lone checker sends it to the bar.

**Game modes**:
- Unigammon (1p) — tutorial, move 15 checkers left→right
- Bigammon (2p) — classic, players move in opposite directions
- Trigammon (3p) — triangular board, all move clockwise
- Quadgammon (4p) — cross-shaped board, 4-way race

**Security**: Always use `textContent` (not `innerHTML`) for any user-controlled strings (player names, etc.) to prevent XSS.
