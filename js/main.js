import { UIManager }      from './ui.js';
import { BackgammonGame } from './game.js';
import { BoardRenderer }  from './renderer.js';
import { MODE_INFO }      from './constants.js';

// ─── State ───────────────────────────────────────────────────────────────────
let ui       = null;
let game     = null;
let renderer = null;
let canvas   = null;
let autoFlip = false;

// Named delay constant for the "no moves" forfeit message
const FORFEIT_MESSAGE_DELAY_MS = 800;

// ─── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ui     = new UIManager();
  canvas = document.getElementById('game-canvas');

  document.getElementById('start-btn')    .addEventListener('click', startGame);
  document.getElementById('continue-btn') .addEventListener('click', continueGame);
  document.getElementById('back-btn')     .addEventListener('click', goToMenu);
  document.getElementById('undo-btn')     .addEventListener('click', handleUndo);
  document.getElementById('flip-btn')     .addEventListener('click', handleFlipToggle);
  document.getElementById('play-again-btn').addEventListener('click', playAgain);
  document.getElementById('main-menu-btn') .addEventListener('click', goToMenu);

  canvas.addEventListener('click', handleCanvasClick);
  window.addEventListener('resize', handleResize);

  // Re-render board on theme change
  ui.onThemeChange = () => { if (renderer) renderer.render(); };

  // Show continue button if a saved game exists
  ui.showSetup(!!localStorage.getItem(SAVE_KEY));
});

// ─── Game start ───────────────────────────────────────────────────────────────
const SAVE_KEY = 'gammon_saved_game';

function _wireGame(players) {
  game.onCheckerHit = (attacker, defender) => {
    ui.playEliminationAnimation(
      players[attacker].color,
      players[defender].color,
      () => renderer.render()
    );
  };
}

function startGame() {
  const mode    = ui.selectedMode;
  const players = ui.getPlayerData();

  game     = new BackgammonGame(mode, players, {});
  renderer = new BoardRenderer(canvas, game);
  renderer.flipped = false;
  _wireGame(players);
  localStorage.removeItem(SAVE_KEY);

  ui.showGame();
  handleResize();
  refreshUI();
}

function continueGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  const save = JSON.parse(raw);

  game     = new BackgammonGame(save.mode, save.players, {});
  game.importSave(save);
  renderer = new BoardRenderer(canvas, game);
  renderer.flipped = false;
  _wireGame(save.players);

  ui.showGame();
  handleResize();
  refreshUI();
}

function playAgain() {
  localStorage.removeItem(SAVE_KEY);
  startGame();
}

function goToMenu() {
  // Save in-progress game (skip if already over)
  if (game && game.phase !== 'gameover') {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.exportSave()));
  } else {
    localStorage.removeItem(SAVE_KEY);
  }
  game     = null;
  renderer = null;
  ui.showSetup(!!localStorage.getItem(SAVE_KEY));
}

// ─── Resize ───────────────────────────────────────────────────────────────────
function handleResize() {
  if (!renderer) return;
  renderer.resize();
  refreshUI();
}

// ─── Flip toggle ──────────────────────────────────────────────────────────────
function handleFlipToggle() {
  autoFlip = !autoFlip;
  document.getElementById('flip-btn').classList.toggle('active', autoFlip);
  applyFlip();
  if (renderer) renderer.render();
}

function applyFlip() {
  if (!renderer || !game) return;
  // In auto-flip mode, P0 = normal, P1 = flipped (for 2-player).
  // For other modes, flip on odd-numbered players.
  renderer.flipped = autoFlip && (game.currentPlayer % 2 === 1);
}

// ─── Undo ─────────────────────────────────────────────────────────────────────
function handleUndo() {
  if (!game) return;
  game.undoMove();
  refreshUI();
}

// ─── Roll dice ────────────────────────────────────────────────────────────────
function handleRoll() {
  if (!game || game.phase !== 'rolling') return;

  const result = game.rollDice();
  if (!result) return;

  // Auto-highlight bar if player must enter from it
  if (!result.forfeit && game.phase === 'moving' && game.mustEnterFromBar()) {
    game.selectedPoint = 'bar';
    game.validMoves    = game.getValidMoves('bar');
  }

  refreshUI();

  if (result.forfeit) {
    ui.setRollButtonState(false, 'No moves!');
    setTimeout(refreshUI, FORFEIT_MESSAGE_DELAY_MS);
  }

  // Unigammon tutorial hints
  if (game.mode === 'unigammon') showTutorialHint();
}

// ─── Canvas click ─────────────────────────────────────────────────────────────
function handleCanvasClick(e) {
  if (!game || !renderer) return;
  if (game.phase === 'gameover') return;

  const hit = renderer.hitTest(e.clientX, e.clientY);
  if (hit?.type === 'roll') {
    handleRoll();
    return;
  }

  if (game.phase === 'rolling') return;  // roll button already handled above

  if (!hit) {
    // Click on empty space — deselect
    game.selectedPoint = null;
    game.validMoves    = [];
    renderer.render();
    return;
  }

  const state = game.getState();

  // ── If a checker is already selected ──────────────────────────────────────
  if (game.selectedPoint !== null) {
    const dest = hit.type === 'bearoff' ? 'bearoff'
               : hit.type === 'bar'     ? null
               : hit.idx;

    if (dest !== null && state.validMoves.includes(dest)) {
      // Execute the move
      game.moveChecker(game.selectedPoint, dest);
      game.selectedPoint = null;
      game.validMoves    = [];
      renderer.render();
      refreshUI();

      if (game.isGameOver()) showWinScreen();
      return;
    }

    // Clicked elsewhere — deselect, then possibly re-select
    game.selectedPoint = null;
    game.validMoves    = [];
  }

  // ── Attempt to select a new checker ───────────────────────────────────────
  const p = game.currentPlayer;

  if (hit.type === 'bar') {
    if (state.bar[p] > 0) {
      const moves = game.getValidMoves('bar');
      game.selectedPoint = 'bar';
      game.validMoves    = moves;
    }
  } else if (hit.type === 'point') {
    const pt = state.points[hit.idx];
    if (pt.player === p && pt.count > 0) {
      const moves = game.getValidMoves(hit.idx);
      if (moves.length > 0) {
        game.selectedPoint = hit.idx;
        game.validMoves    = moves;
      }
    }
  }

  renderer.render();
  refreshUI();
}

// ─── Refresh all UI ───────────────────────────────────────────────────────────
function refreshUI() {
  if (!game) return;

  const state = game.getState();
  applyFlip();
  renderer.render();

  ui.updatePlayerList(game.players, state.currentPlayer);

  ui.updateTurnIndicator(
    game.players[state.currentPlayer].name,
    game.players[state.currentPlayer].color,
    state.phase
  );

  ui.setRollButtonState(state.phase === 'rolling', '🎲 Roll');
  ui.setUndoButtonState(game.canUndo());

  if (game.mode === 'unigammon') showTutorialHint();
}

// ─── Win screen ───────────────────────────────────────────────────────────────
function showWinScreen() {
  const state = game.getState();
  ui.showWin(
    game.players[state.winner].name,
    game.players[state.winner].color,
    state.borneOff,
    game.players
  );
}

// ─── Unigammon tutorial hints ─────────────────────────────────────────────────
function showTutorialHint() {
  if (!game || game.mode !== 'unigammon') return;

  const state = game.getState();
  if (state.phase === 'rolling') {
    ui.showTutorialHint('🎲 Click "Roll" to roll the dice, then move your checkers to the right!');
  } else if (state.bar[0] > 0) {
    ui.showTutorialHint('🔴 You have a checker on the bar! Click the BAR area to re-enter it.');
  } else if (game.canBearOff(0)) {
    ui.showTutorialHint('🏁 All checkers are home! Click a checker then click the bear-off zone (far right) to remove it.');
  } else {
    ui.showTutorialHint('♟ Click a checker to see valid moves (green), then click the destination!');
  }
}
