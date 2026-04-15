import { UIManager }      from './ui.js';
import { BackgammonGame } from './game.js';
import { BoardRenderer }  from './pixi-renderer.js';
import { MODE_INFO }      from './constants.js';
import { network }        from './p2p-engine.js';

// ─── State ───────────────────────────────────────────────────────────────────
let ui            = null;
let game          = null;
let renderer      = null;
let canvas        = null;
let autoFlip      = false;
let hasRolledOnce = false;  // suppress the "click Roll" tutorial hint after first roll

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

  // Re-render board on theme / numbers-toggle change
  ui.onThemeChange  = () => { if (renderer) renderer.render(); };
  ui.onNumbersChange = () => { if (renderer) { renderer.showNumbers = ui.showNumbers; renderer.render(); } };

  _initP2PUI();

  // Show continue button if a saved game exists
  ui.showSetup(!!localStorage.getItem(SAVE_KEY));
});

// ─── Game start ───────────────────────────────────────────────────────────────
const SAVE_KEY = 'gammon_saved_game';

// ─── P2P networking ───────────────────────────────────────────────────────────

/** DOM refs for P2P lobby controls (populated in _initP2PUI). */
const $p2p = {};

function _initP2PUI() {
  $p2p.createBtn    = document.getElementById('p2p-create-btn');
  $p2p.hostArea     = document.getElementById('p2p-host-area');
  $p2p.roomArea     = document.getElementById('p2p-room-area');
  $p2p.linkInput    = document.getElementById('p2p-link-input');
  $p2p.copyBtn      = document.getElementById('p2p-copy-btn');
  $p2p.peerCount    = document.getElementById('p2p-peer-count');
  $p2p.waitScreen   = document.getElementById('p2p-waiting-screen');
  $p2p.waitTitle    = document.getElementById('p2p-waiting-title');
  $p2p.waitMsg      = document.getElementById('p2p-waiting-msg');
  $p2p.gameStatus   = document.getElementById('p2p-game-status');

  // "Create Room" button — host path
  $p2p.createBtn.addEventListener('click', () => {
    $p2p.createBtn.disabled    = true;
    $p2p.createBtn.textContent = '⏳ Creating room…';

    network.startHosting((shareLink) => {
      $p2p.linkInput.value = shareLink;
      $p2p.hostArea.classList.add('hidden');
      $p2p.roomArea.classList.remove('hidden');
      _updatePeerCount(0);
    });
  });

  // Copy link to clipboard
  $p2p.copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText($p2p.linkInput.value).catch(() => {
      $p2p.linkInput.select();
    });
    const prev = $p2p.copyBtn.textContent;
    $p2p.copyBtn.textContent = '✅ Copied!';
    setTimeout(() => { $p2p.copyBtn.textContent = prev; }, 2000);
  });

  // ── NetworkManager callbacks ───────────────────────────────────────────────

  network.onConnectionChange = (count) => {
    if (network.isHost) _updatePeerCount(count);
  };

  network.onWaiting = () => {
    // Guest is connected but host hasn't started yet.
    _showGuestWaiting('Waiting for host…', 'The host hasn\'t started the game yet. Please wait.');
  };

  network.onAssigned = (playerIndex, save) => {
    // Guest received their seat assignment + initial game state from the host.
    _hideGuestWaiting();
    if (save) {
      _startGameFromSave(save, playerIndex);
    }
  };

  network.onStateReceived = (save) => {
    // A state sync arrived (roll, move, etc.).
    if (!game) return;
    game.importSave(save);
    refreshUI();
    if (game.isGameOver()) showWinScreen();
  };

  // Let the engine request the current save for late-joining guests.
  network.getSave = () => (game ? game.exportSave() : null);

  // If the URL has ?room=, we're a guest — connect immediately.
  network.init();

  if (!network.isHost && network.isOnline) {
    // Guest: show connecting overlay right away.
    _showGuestWaiting('Connecting…', 'Connecting to room, please wait.');
  }
}

function _updatePeerCount(count) {
  const word = count === 1 ? 'player' : 'players';
  $p2p.peerCount.textContent = count === 0
    ? 'Waiting for players to join…'
    : `✅ ${count} ${word} connected`;
  $p2p.peerCount.classList.toggle('connected', count > 0);
}

function _showGuestWaiting(title, msg) {
  $p2p.waitTitle.textContent = title;
  $p2p.waitMsg.textContent   = msg;
  $p2p.waitScreen.classList.remove('hidden');
}

function _hideGuestWaiting() {
  $p2p.waitScreen.classList.add('hidden');
}

function _updateGameStatus() {
  if (!$p2p.gameStatus) return;
  if (!network.isOnline) {
    $p2p.gameStatus.classList.add('hidden');
    return;
  }
  $p2p.gameStatus.classList.remove('hidden');

  const isMyTurn = game && game.currentPlayer === network.localPlayerIndex;
  if (isMyTurn) {
    $p2p.gameStatus.textContent = '🟢 Your turn';
    $p2p.gameStatus.className   = 'p2p-game-status';
  } else {
    $p2p.gameStatus.textContent = '⏳ Opponent\'s turn';
    $p2p.gameStatus.className   = 'p2p-game-status not-your-turn';
  }
}

/**
 * Start a game for a guest (or late-join reconnect) by importing a host save.
 * @param {object} save      exportSave() snapshot from the host
 * @param {number} playerIndex  This client's player index
 */
function _startGameFromSave(save, playerIndex) {
  network.localPlayerIndex = playerIndex;

  const players = save.players;
  const mode    = save.mode;

  game = new BackgammonGame(mode, players, {});
  game.importSave(save);
  hasRolledOnce = true;  // suppress unigammon hint for guests

  ui.showGame();
  _applyUndoBtnVisibility(mode);

  renderer = new BoardRenderer(canvas, game);
  renderer.flipped   = false;
  renderer.showNumbers = ui.showNumbers;
  _wireGame(players);

  handleResize();
  refreshUI();

  if (game.isGameOver()) showWinScreen();
}

/**
 * Broadcast the current game state to all connected peers.
 * Called after every roll or checker move by the local player.
 */
function _broadcastState() {
  if (network.isOnline && game) {
    network.handleMove(game.exportSave());
  }
}

function _wireGame(players) {
  game.onCheckerHit = (attacker, defender) => {
    ui.playEliminationAnimation(
      players[attacker].color,
      players[defender].color,
      () => renderer.render()
    );
  };
}

function _applyUndoBtnVisibility(_mode) {
  // Undo is now handled entirely via canvas hit-testing for all board types.
  // The DOM undo-btn is hidden in HTML; nothing to do here.
}

function startGame() {
  const mode    = ui.selectedMode;
  const players = ui.getPlayerData();

  game = new BackgammonGame(mode, players, {});
  localStorage.removeItem(SAVE_KEY);
  hasRolledOnce = false;

  // Show the game screen first so the canvas parent has valid dimensions
  // before PixiJS reads them during BoardRenderer initialisation.
  ui.showGame();
  _applyUndoBtnVisibility(mode);

  renderer = new BoardRenderer(canvas, game);
  renderer.flipped = false;
  renderer.showNumbers = ui.showNumbers;
  _wireGame(players);

  handleResize();
  refreshUI();

  // Online: assign each connected guest a seat and send the initial state.
  if (network.isOnline && network.isHost) {
    network.connections.forEach((conn) => {
      let idx = network._assignedIndices.get(conn);
      if (idx === undefined) {
        idx = network._nextPlayerIndex++;
        network._assignedIndices.set(conn, idx);
      }
      network.assignGuest(conn, idx, game.exportSave());
    });
  }
}

function continueGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  const save = JSON.parse(raw);

  game = new BackgammonGame(save.mode, save.players, {});
  game.importSave(save);

  // Show the game screen first so the canvas parent has valid dimensions
  // before PixiJS reads them during BoardRenderer initialisation.
  ui.showGame();
  _applyUndoBtnVisibility(save.mode);

  renderer = new BoardRenderer(canvas, game);
  renderer.flipped = false;
  renderer.showNumbers = ui.showNumbers;
  _wireGame(save.players);

  handleResize();
  refreshUI();
}

function playAgain() {
  localStorage.removeItem(SAVE_KEY);
  startGame();
}

function goToMenu() {
  if (network.isOnline) network.disconnect();
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
  if (network.isOnline) return;  // undo disabled in online games to prevent desync
  game.undoMove();
  refreshUI();
}

// ─── Roll dice ────────────────────────────────────────────────────────────────
function handleRoll() {
  if (!game || game.phase !== 'rolling') return;

  // Online: only the current player may roll.
  if (network.isOnline && game.currentPlayer !== network.localPlayerIndex) return;

  const result = game.rollDice();
  if (!result) return;

  // Auto-highlight bar if player must enter from it
  if (!result.forfeit && game.phase === 'moving' && game.mustEnterFromBar()) {
    game.selectedPoint = 'bar';
    game.validMoves    = game.getValidMoves('bar');
  }

  hasRolledOnce = true;
  refreshUI();

  if (result.forfeit) {
    ui.setRollButtonState(false, 'No moves!');
    setTimeout(refreshUI, FORFEIT_MESSAGE_DELAY_MS);
  }

  // Unigammon tutorial hints
  if (game.mode === 'unigammon') showTutorialHint();

  _broadcastState();
}

// ─── Canvas click ─────────────────────────────────────────────────────────────
function handleCanvasClick(e) {
  if (!game || !renderer) return;
  if (game.phase === 'gameover') return;

  // Online: lock the board when it is not this client's turn.
  if (network.isOnline && game.currentPlayer !== network.localPlayerIndex) return;

  const hit = renderer.hitTest(e.clientX, e.clientY);
  if (hit?.type === 'roll') {
    handleRoll();
    return;
  }
  if (hit?.type === 'undo') {
    handleUndo();
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
      _broadcastState();

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

  ui.updateTurnIndicator(
    game.players[state.currentPlayer].name,
    game.players[state.currentPlayer].color,
    state.phase
  );

  ui.setRollButtonState(state.phase === 'rolling', '🎲 Roll');
  // Undo is disabled in online games to prevent desync.
  ui.setUndoButtonState(!network.isOnline && game.canUndo());

  if (game.mode === 'unigammon') showTutorialHint();

  _updateGameStatus();

  // Auto-save after every action; clear save once game is over.
  // Don't auto-save in online games (state is owned by the host).
  if (!network.isOnline) {
    if (state.phase === 'gameover') {
      localStorage.removeItem(SAVE_KEY);
    } else {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game.exportSave()));
    }
  }
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
    // Only show the roll instruction until the player has done it once
    if (hasRolledOnce) { ui.hideTutorialHint(); return; }
    ui.showTutorialHint('🎲 Click "Roll" to roll the dice, then move your checkers in the direction shown!');
  } else if (state.bar[0] > 0) {
    ui.showTutorialHint('🔴 You have a checker on the bar! Click the BAR area to re-enter it.');
  } else if (game.canBearOff(0)) {
    ui.showTutorialHint('🏁 All checkers are home! Click a checker then click the bear-off zone (far right) to remove it.');
  } else {
    ui.showTutorialHint('♟ Click a checker to see valid moves (green), then click the destination!');
  }
}
