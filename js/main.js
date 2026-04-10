import { UIManager }      from './ui.js';
import { BackgammonGame } from './game.js';
import { BoardRenderer }  from './renderer.js';
import { MODE_INFO }      from './constants.js';

// ─── State ───────────────────────────────────────────────────────────────────
let ui       = null;
let game     = null;
let renderer = null;
let canvas   = null;

// ─── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ui     = new UIManager();
  canvas = document.getElementById('game-canvas');

  // Buttons wired from setup screen
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('back-btn') .addEventListener('click', goToMenu);
  document.getElementById('roll-btn') .addEventListener('click', handleRoll);
  document.getElementById('play-again-btn').addEventListener('click', playAgain);
  document.getElementById('main-menu-btn') .addEventListener('click', goToMenu);

  canvas.addEventListener('click', handleCanvasClick);
  window.addEventListener('resize', handleResize);

  // Re-render board on theme change
  ui.onThemeChange = () => { if (renderer) renderer.render(); };
});

// ─── Game start ───────────────────────────────────────────────────────────────
function startGame() {
  const mode    = ui.selectedMode;
  const players = ui.getPlayerData();

  game     = new BackgammonGame(mode, players, {});
  renderer = new BoardRenderer(canvas, game);

  // Wire hit callback
  game.onCheckerHit = (attacker, defender) => {
    ui.playEliminationAnimation(
      players[attacker].color,
      players[defender].color,
      () => renderer.render()
    );
  };

  ui.showGame();
  handleResize();
  refreshUI();
}

function playAgain() {
  startGame();
}

function goToMenu() {
  game     = null;
  renderer = null;
  ui.showSetup();
}

// ─── Resize ───────────────────────────────────────────────────────────────────
function handleResize() {
  if (!renderer) return;
  renderer.resize();
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
    setTimeout(refreshUI, 800);
  }

  // Unigammon tutorial hints
  if (game.mode === 'unigammon') showTutorialHint();
}

// ─── Canvas click ─────────────────────────────────────────────────────────────
function handleCanvasClick(e) {
  if (!game || !renderer) return;
  if (game.phase === 'gameover') return;
  if (game.phase === 'rolling')  return;   // must roll first

  const hit = renderer.hitTest(e.clientX, e.clientY);
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
  renderer.render();

  ui.updatePlayerList(
    game.players, state.currentPlayer, state.borneOff, state.bar
  );

  ui.updateTurnIndicator(
    game.players[state.currentPlayer].name,
    game.players[state.currentPlayer].color,
    state.phase
  );

  if (state.dice.length > 0) {
    ui.updateDice(state.dice, state.movesLeft);
  }

  ui.setRollButtonState(state.phase === 'rolling', '🎲 Roll');

  ui.updateMoveLog(state.moveLog);

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
