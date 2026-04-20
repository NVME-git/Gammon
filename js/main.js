import { UIManager }      from './ui.js';
import { BackgammonGame } from './game.js';
import { BoardRenderer }  from './pixi-renderer.js';
import { MODE_INFO }      from './constants.js';
import { network }        from './p2p-engine.js';
import QRCode             from 'qrcode';

// ─── State ───────────────────────────────────────────────────────────────────
let ui              = null;
let game            = null;
let renderer        = null;
let canvas          = null;
let autoFlip        = false;
let hasRolledOnce   = false;  // suppress the "click Roll" tutorial hint after first roll
let _pendingConfirm = false;  // waiting for player to click "End Turn" before broadcasting

// Resign timer (diamond/quadgammon only)
let _resignTimerStart    = 0;    // Date.now() when current turn started; 0 = not running
let _resignTimeoutMs     = 30000;
let _resignCheckInterval = null;

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

  // 1-second tick to drive resign countdown
  _resignCheckInterval = setInterval(_resignTick, 1000);
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
  $p2p.qrWrap       = document.getElementById('p2p-qr-wrap');
  $p2p.qrImg        = document.getElementById('p2p-qr-img');
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
      _renderShareQr(shareLink);
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
    // Persist seat for reconnection (2-hour TTL)
    try {
      localStorage.setItem('gammon_seat', JSON.stringify({
        roomId: network.roomId, playerIndex, timestamp: Date.now(),
      }));
    } catch {}
    if (save) {
      _startGameFromSave(save, playerIndex);
    }
  };

  network.onStateReceived = (save) => {
    // A state sync arrived (roll, move, etc.).
    if (!game) return;
    _pendingConfirm = false;
    game.importSave(save);
    refreshUI();
    if (game.isGameOver()) showWinScreen();
  };

  // Let the engine request the current save for late-joining guests.
  network.getSave = () => (game ? game.exportSave() : null);

  // Play elimination animation when received from the host.
  network.onHitReceived = (attacker, defender) => {
    if (!game) return;
    ui.playEliminationAnimation(
      game.players[attacker].color,
      game.players[defender].color,
      () => renderer && renderer.render()
    );
  };

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

async function _renderShareQr(shareLink) {
  if (!$p2p.qrWrap || !$p2p.qrImg) return;
  try {
    const dataUrl = await QRCode.toDataURL(shareLink, {
      margin: 1,
      width: 220,
      errorCorrectionLevel: 'M',
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });
    $p2p.qrImg.src = dataUrl;
    $p2p.qrWrap.classList.remove('hidden');
  } catch (err) {
    console.warn('[P2P] Failed to generate room QR code', err);
    $p2p.qrImg.removeAttribute('src');
    $p2p.qrWrap.classList.add('hidden');
  }
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

  _resignTimeoutMs = save.settings?.resignTimeoutMs ?? _resignTimeoutMs;
  game = new BackgammonGame(mode, players, save.settings || {});
  game.importSave(save);
  hasRolledOnce   = true;  // suppress unigammon hint for guests
  _lastTurnPlayer = -1;

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
    if (network.isOnline && network.isHost) {
      network.broadcastHit(attacker, defender);
    }
  };
}

function _applyUndoBtnVisibility(_mode) {
  // Undo is now handled entirely via canvas hit-testing for all board types.
  // The DOM undo-btn is hidden in HTML; nothing to do here.
}

// ─── Resign (diamond only) ────────────────────────────────────────────────────
function _resignTick() {
  if (!game || game.mode !== 'quadgammon' || game.phase === 'gameover') return;
  if (_resignTimeoutMs <= 0 || _resignTimerStart === 0) {
    if (renderer) { renderer.resignSecondsLeft = null; }
    return;
  }
  const elapsed = Date.now() - _resignTimerStart;
  const secsLeft = Math.max(0, Math.ceil((_resignTimeoutMs - elapsed) / 1000));
  if (renderer) renderer.resignSecondsLeft = secsLeft;

  if (elapsed >= _resignTimeoutMs) {
    const cp = game.currentPlayer;
    // Only the active player (or host on their behalf) fires the resign
    if (!network.isOnline || cp === network.localPlayerIndex || network.isHost) {
      handleResign(cp);
    }
    return;
  }
  if (renderer) renderer.render();
}

function _startResignTimer() {
  _resignTimerStart = Date.now();
}

function _resetResignTimer() {
  if (_resignTimerStart > 0) _resignTimerStart = Date.now();
}

function _stopResignTimer() {
  _resignTimerStart = 0;
  if (renderer) renderer.resignSecondsLeft = null;
}

function handleResign(playerIndex) {
  if (!game || game.mode !== 'quadgammon') return;
  if (!game.isActivePlayer(playerIndex)) return;

  game.resignPlayer(playerIndex);
  _stopResignTimer();

  if (game.isGameOver()) {
    renderer.render();
    refreshUI();
    _broadcastState();
    showWinScreen();
    return;
  }

  // If turn advanced to a new player, start a fresh timer
  _startResignTimer();
  renderer.render();
  refreshUI();
  _broadcastState();
}

function startGame() {
  const mode    = ui.selectedMode;
  const players = ui.getPlayerData();

  _resignTimeoutMs = (ui.resignTimeoutSec || 0) * 1000;

  game = new BackgammonGame(mode, players, { resignTimeoutMs: _resignTimeoutMs });
  localStorage.removeItem(SAVE_KEY);
  hasRolledOnce   = false;
  _lastTurnPlayer = -1;
  _stopResignTimer();

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

  _resignTimeoutMs = save.settings?.resignTimeoutMs ?? _resignTimeoutMs;
  game = new BackgammonGame(save.mode, save.players, save.settings || {});
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
  game            = null;
  renderer        = null;
  _lastTurnPlayer = -1;
  _stopResignTimer();
  const indicator = document.getElementById('player-indicator');
  if (indicator) indicator.classList.add('hidden');
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

// ─── Confirm turn (online: broadcast queued state after last move) ────────────
function _confirmTurn() {
  if (!_pendingConfirm) return;
  _pendingConfirm = false;
  _broadcastState();
  refreshUI();
  if (game && game.isGameOver()) showWinScreen();
}

// ─── Undo ─────────────────────────────────────────────────────────────────────
function handleUndo() {
  if (!game) return;
  const wasPending = _pendingConfirm;
  _pendingConfirm = false;
  if (!game.undoMove()) return;
  refreshUI();
  if (!wasPending) _broadcastState();
  // wasPending: undid the last move of the turn — no broadcast yet, turn continues
}

// ─── Roll dice ────────────────────────────────────────────────────────────────
function handleRoll() {
  if (!game || game.phase !== 'rolling') return;

  // Online: only the current player may roll.
  if (network.isOnline && game.currentPlayer !== network.localPlayerIndex) return;

  const result = game.rollDice();
  if (!result) return;
  _resetResignTimer();

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
  // Exception: _pendingConfirm means the turn just ended locally and the player
  // still needs to click "End Turn" (or undo) before state is broadcast.
  if (network.isOnline && game.currentPlayer !== network.localPlayerIndex && !_pendingConfirm) return;

  const hit = renderer.hitTest(e.clientX, e.clientY);
  if (hit?.type === 'confirm') {
    _confirmTurn();
    return;
  }
  if (hit?.type === 'roll') {
    handleRoll();
    return;
  }
  if (hit?.type === 'undo') {
    handleUndo();
    return;
  }
  if (hit?.type === 'resign') {
    handleResign(game.currentPlayer);
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
      _resetResignTimer();

      if (game.isGameOver()) {
        renderer.render();
        refreshUI();
        _broadcastState();
        showWinScreen();
        return;
      }

      // Online: after the last move of a turn, wait for player to confirm
      // before broadcasting — so they still have a chance to undo.
      if (network.isOnline && game.phase === 'rolling') {
        _pendingConfirm = true;
        renderer.render();
        refreshUI();
        return;
      }

      renderer.render();
      refreshUI();
      _broadcastState();
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

// ─── Player indicator ─────────────────────────────────────────────────────────
function _updatePlayerIndicator() {
  const el = document.getElementById('player-indicator');
  if (!el) return;
  if (!network.isOnline || !game) {
    el.classList.add('hidden');
    return;
  }
  const idx = network.localPlayerIndex;
  const player = game.players[idx];
  if (!player) { el.classList.add('hidden'); return; }
  el.innerHTML = '';
  const dot = document.createElement('span');
  dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${player.color};flex-shrink:0`;
  const label = document.createElement('span');
  label.textContent = `You: Player ${idx + 1}`;
  el.appendChild(dot);
  el.appendChild(label);
  el.classList.remove('hidden');
}

// ─── Resign timer helpers ─────────────────────────────────────────────────────
let _lastTurnPlayer = -1;

// ─── Refresh all UI ───────────────────────────────────────────────────────────
function refreshUI() {
  if (!game) return;

  // Start resign timer when a new player's turn begins (rolling phase)
  if (game.mode === 'quadgammon' && _resignTimeoutMs > 0) {
    const cp = game.currentPlayer;
    if (game.phase === 'rolling' && cp !== _lastTurnPlayer) {
      _lastTurnPlayer = cp;
      _startResignTimer();
    } else if (game.phase === 'gameover') {
      _stopResignTimer();
    }
  }

  const state = game.getState();
  applyFlip();

  if (renderer) {
    renderer.myTurn         = !network.isOnline || game.currentPlayer === network.localPlayerIndex;
    renderer.isOnline       = network.isOnline;
    renderer.pendingConfirm = _pendingConfirm;
    renderer.pendingPlayer  = _pendingConfirm ? network.localPlayerIndex : null;
  }
  renderer.render();

  ui.updateTurnIndicator(
    game.players[state.currentPlayer].name,
    game.players[state.currentPlayer].color,
    state.phase
  );

  ui.setRollButtonState(state.phase === 'rolling', '🎲 Roll');
  ui.setUndoButtonState(game.canUndo());

  if (game.mode === 'unigammon') showTutorialHint();

  _updateGameStatus();
  _updatePlayerIndicator();

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
  _stopResignTimer();

  // Diamond: winner = first to finish; show finish order in scores
  const winnerIdx = state.winner >= 0 ? state.winner : 0;
  ui.showWin(
    game.players[winnerIdx].name,
    game.players[winnerIdx].color,
    state.borneOff,
    game.players,
    state.finishOrder
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
