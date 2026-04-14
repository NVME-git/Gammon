# Gammon

**The Ultimate Multi-Player Backgammon Experience** — 1-to-4 player backgammon in the browser, rendered with PixiJS (WebGL).

## Game Modes

| Mode | Players | Board Shape | Description |
|---|---|---|---|
| **Unigammon** | 1 | Linear strip | Tutorial — bear all 15 pieces off the right end |
| **Bigammon** | 2 | Linear strip | Classic backgammon on a 24-point linear board |
| **Trigammon** | 3 | Y-shaped | Three-player battle on a triangular board, move clockwise |
| **Quadgammon** | 4 | Cross / plus | Four-way mayhem on a cross-shaped board, last one standing wins |

## Screenshots

### Setup Screen
![Setup Screen](docs/screenshots/setup.png)

### Unigammon — 1 Player Tutorial
![Unigammon](docs/screenshots/unigammon.png)

### Bigammon — 2 Player Classic
![Bigammon](docs/screenshots/bigammon.png)

### Trigammon — 3 Player Triangle
![Trigammon](docs/screenshots/trigammon.png)

### Quadgammon — 4 Player Cross
![Quadgammon](docs/screenshots/quadgammon.png)

## Running Locally

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Start the development server (http://localhost:8000)
npm run dev

# Build for production (output in dist/)
npm run build

# Preview the production build locally
npm run preview
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## How to Play

1. **Choose a game mode** from the setup screen.
2. **Name your players** (or use the auto-generated funny names) and pick colors.
3. Click **New Game** to start.
4. On your turn, click **Roll** to roll the dice, then click a checker to select it and click a valid destination point.
5. Bear all your checkers off the board to win.

### Controls

| Control | Action |
|---|---|
| Click checker | Select it |
| Click highlighted point | Move selected checker there |
| **Roll** button | Roll dice at the start of your turn |
| **↩** (Undo) | Undo the last move within a turn |
| **↻** (Flip) | Flip the board view (Bigammon only) |
| **🌙 / ☀️** | Toggle dark / light theme |
| **⚙️** | Open settings (elimination animations, sound) |
| **← Menu** | Return to the setup screen |

## Architecture

```
js/
├── main.js          — Orchestrator: wires UI events to game logic, drives the turn loop
├── game.js          — BackgammonGame class: all rules, move validation, bar/borne-off logic
├── pixi-renderer.js — BoardRenderer: PixiJS v8 WebGL renderer, hit-testing, theme switching
├── ui.js            — UIManager: DOM screens (setup / game / win), player forms
├── constants.js     — Game mode definitions, player colors, theme palettes
├── textures.js      — Procedural texture generation (wood grain, glossy checkers)
├── animation.js     — TweenManager hooked into PixiJS ticker
├── pixelart.js      — Pixel-art avatar drawing and elimination animations
├── names.js         — generateFunnyName() for auto-named players
└── layouts/
    ├── linear.js    — Bigammon / Unigammon: 24-point horizontal strip with BAR / OFF zones
    ├── triangle.js  — Trigammon: Y-shaped board, 36 diamond points across 3 arms
    ├── cross.js     — Quadgammon: cross-shaped board, 4 arms, central BAR hub
    └── shared.js    — Shared helpers: dice HUD strip, arm highlights, chevrons
```

## Tech Stack

- **[PixiJS v8](https://pixijs.com/)** — WebGL 2D rendering
- **[Vite](https://vitejs.dev/)** — Dev server and production bundler
- Vanilla JS (ES modules), no framework
