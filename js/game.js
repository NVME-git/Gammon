import { TOTAL_CHECKERS, NUM_POINTS } from './constants.js';

/**
 * BackgammonGame – core game-state & rules engine.
 *
 * Internal board representation
 * ──────────────────────────────
 *   points[0..23]  { count: number, player: number (-1 = empty) }
 *   bar[p]         number of player p's checkers on the bar
 *   borneOff[p]    number of player p's checkers borne off
 *
 * Virtual-position system
 * ────────────────────────
 *   Every player's journey is mapped to a common virtual axis 0–23.
 *   Virtual 0 = first point of their journey.
 *   Virtual 23 = last point before bearing off.
 *   Virtual 24+ = borne off.
 *
 *   2-player
 *     P0: actual = virtual          (moves index 0 → 23, left→right)
 *     P1: actual = 23 − virtual     (moves index 23 → 0, right→left)
 *
 *   3-player (offset = 8)
 *     Pk: actual = (virtual + k*8) % 24   (all clockwise)
 *
 *   4-player (offset = 6)
 *     Pk: actual = (virtual + k*6) % 24   (all clockwise)
 */
export class BackgammonGame {
  constructor(mode, players, settings = {}) {
    this.mode        = mode;
    this.players     = players;
    this.settings    = settings;
    this.numPlayers  = players.length;
    this.numPoints   = (mode === 'trigammon') ? 36 : 24;

    this.points   = Array.from({ length: this.numPoints }, () => ({ count: 0, player: -1 }));
    this.bar      = new Array(this.numPlayers).fill(0);
    this.borneOff = new Array(this.numPlayers).fill(0);

    this.currentPlayer = 0;
    this.dice          = [];
    this.movesLeft     = [];   // dice pips remaining this turn
    this.phase         = 'rolling'; // 'rolling' | 'moving' | 'gameover'

    this.selectedPoint = null;
    this.validMoves    = [];

    this.moveLog  = [];
    this.turnCount = 0;
    this.winner   = -1;

    // callbacks set by main.js
    this.onCheckerHit = null;

    // Undo history
    this._history = [];

    this._setupBoard();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Board setup
  // ═══════════════════════════════════════════════════════════════════════════

  _setupBoard() {
    const N    = this.numPlayers;
    const mode = this.mode;

    if (mode === 'unigammon') {
      // Same distribution as bigammon P0: spread across the board
      this._set(0, 23, 2);  // 2 at pos 24
      this._set(0, 12, 5);  // 5 at pos 13
      this._set(0,  7, 3);  // 3 at pos 8
      this._set(0,  5, 5);  // 5 at pos 6
      return;
    }

    if (N === 2) {
      // Standard backgammon starting positions
      // P0 (moves left→right, virtual = actual)
      this._set(0, 23, 2);
      this._set(0, 12, 5);
      this._set(0,  7, 3);
      this._set(0,  5, 5);
      // P1 (moves right→left, virtual = 23 - actual)
      this._set(1,  0, 2);
      this._set(1, 11, 5);
      this._set(1, 16, 3);
      this._set(1, 18, 5);
      return;
    }

    if (mode === 'trigammon') {
      // 36-point T-board.  Each player uses the same virtual starting layout
      // (v=23→2, v=12→5, v=7→3, v=5→5) mapped to their physical positions.
      // P0 (Blue): virtual = physical (main board, left→right)
      this._set(0, 23, 2);  // v=23
      this._set(0, 12, 5);  // v=12
      this._set(0,  7, 3);  // v=7
      this._set(0,  5, 5);  // v=5
      // P1 (Red): v≤11 → 35-v (arm), v>11 → 23-v (main-left)
      this._set(1,  0, 2);  // v=23 → 23-23=0
      this._set(1, 11, 5);  // v=12 → 23-12=11
      this._set(1, 28, 3);  // v=7  → 35-7=28
      this._set(1, 30, 5);  // v=5  → 35-5=30
      // P2 (Green): v≤11 → 23-v (main-right), v>11 → v+12 (arm)
      this._set(2, 35, 2);  // v=23 → 23+12=35
      this._set(2, 24, 5);  // v=12 → 12+12=24
      this._set(2, 16, 3);  // v=7  → 23-7=16
      this._set(2, 18, 5);  // v=5  → 23-5=18
      return;
    }

    // 4-player quadgammon: bigammon-like spread across all 4 arms.
    // Virtual positions v=5,7,12,22 map to 16 distinct physical points
    // (no two players share a starting physical point) and distribute
    // each player's pieces across all four arms like classic backgammon.
    for (let p = 0; p < N; p++) {
      this._set(p, this.getActualPos(p,  5), 5);  // 5 at pos 6  (hub of own arm)
      this._set(p, this.getActualPos(p,  7), 3);  // 3 at pos 8  (adjacent arm)
      this._set(p, this.getActualPos(p, 12), 5);  // 5 at pos 13 (far arm tip)
      this._set(p, this.getActualPos(p, 22), 2);  // 2 at pos 23 (bear-off arm, near tip)
    }
  }

  _set(player, actual, count) {
    this.points[actual] = { count, player };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Virtual ↔ actual position mapping
  // ═══════════════════════════════════════════════════════════════════════════

  getActualPos(player, virtual) {
    if (this.mode === 'trigammon') {
      if (player === 0) return virtual;
      if (player === 1) return virtual <= 11 ? 35 - virtual : 23 - virtual;
      return virtual <= 11 ? 23 - virtual : virtual + 12;
    }
    if (this.numPlayers <= 2 && player === 0) return virtual;
    if (this.numPlayers === 2 && player === 1) return 23 - virtual;
    if (this.mode === 'quadgammon') {
      // S-path: each player travels arm1(tip→hub) → arm2(hub→tip) → arm3(tip→hub) → arm4(hub→tip)
      // Arms: arm0=down(0-5), arm1=left(6-11), arm2=up(12-17), arm3=right(18-23)
      // P0=South, P1=West, P2=North, P3=East
      const v = virtual;
      switch (player) {
        case 0: // arm0(in), arm1(out), arm3(in), arm2(out)
          if (v <= 5)  return 5 - v;
          if (v <= 11) return v;
          if (v <= 17) return 35 - v;
          return v - 6;
        case 1: // arm1(in), arm2(out), arm0(in), arm3(out)
          if (v <= 5)  return 11 - v;
          if (v <= 11) return v + 6;
          if (v <= 17) return 17 - v;
          return v;
        case 2: // arm2(in), arm3(out), arm1(in), arm0(out)
          if (v <= 5)  return 17 - v;
          if (v <= 11) return v + 12;
          if (v <= 17) return 23 - v;
          return v - 18;
        case 3: // arm3(in), arm0(out), arm2(in), arm1(out)
          if (v <= 5)  return 23 - v;
          if (v <= 11) return v - 6;
          if (v <= 17) return 29 - v;
          return v - 12;
      }
    }
    const offset = player * Math.floor(NUM_POINTS / this.numPlayers);
    return (virtual + offset) % 24;
  }

  getVirtualPos(player, actual) {
    if (this.mode === 'trigammon') {
      if (player === 0) return actual;
      if (player === 1) return actual >= 24 ? 35 - actual : 23 - actual;
      return actual >= 24 ? actual - 12 : 23 - actual;
    }
    if (this.numPlayers <= 2 && player === 0) return actual;
    if (this.numPlayers === 2 && player === 1) return 23 - actual;
    if (this.mode === 'quadgammon') {
      // Inverse of getActualPos for quadgammon
      switch (player) {
        case 0:
          if (actual <= 5)  return 5 - actual;        // arm0 section1 (inward)
          if (actual <= 11) return actual;             // arm1 section2 (outward)
          if (actual <= 17) return actual + 6;         // arm2 section4 (outward)
          return 35 - actual;                          // arm3 section3 (inward)
        case 1:
          if (actual <= 5)  return 17 - actual;        // arm0 section3 (inward)
          if (actual <= 11) return 11 - actual;        // arm1 section1 (inward)
          if (actual <= 17) return actual - 6;         // arm2 section2 (outward)
          return actual;                               // arm3 section4 (outward)
        case 2:
          if (actual <= 5)  return actual + 18;        // arm0 section4 (outward)
          if (actual <= 11) return 23 - actual;        // arm1 section3 (inward)
          if (actual <= 17) return 17 - actual;        // arm2 section1 (inward)
          return actual - 12;                          // arm3 section2 (outward)
        case 3:
          if (actual <= 5)  return actual + 6;         // arm0 section2 (outward)
          if (actual <= 11) return actual + 12;        // arm1 section4 (outward)
          if (actual <= 17) return 29 - actual;        // arm2 section3 (inward)
          return 23 - actual;                          // arm3 section1 (inward)
      }
    }
    const offset = player * Math.floor(NUM_POINTS / this.numPlayers);
    return (actual - offset + 24) % 24;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Dice
  // ═══════════════════════════════════════════════════════════════════════════

  rollDice() {
    if (this.phase !== 'rolling') return null;
    // Do NOT save history here — undo should only revert checker moves, not dice rolls.

    const d1 = Math.ceil(Math.random() * 6);
    const d2 = Math.ceil(Math.random() * 6);
    this.dice = [d1, d2];

    // Doubles → 4 moves
    this.movesLeft = (d1 === d2) ? [d1, d1, d1, d1] : [d1, d2];
    this.phase = 'moving';

    // Check for forced forfeit
    if (!this._hasAnyMoves()) {
      this._log(`${this.players[this.currentPlayer].name} rolled ${d1},${d2} — no moves available!`);
      this.nextTurn();
      return { dice: this.dice, forfeit: true };
    }

    return { dice: this.dice, forfeit: false };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Valid-move queries
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return an array of valid destination identifiers for a checker at fromPoint.
   * fromPoint: 0-23 (actual index) | 'bar'
   * Returns: array of numbers (0-23) and/or 'bearoff'
   */
  getValidMoves(fromPoint) {
    const p = this.currentPlayer;
    if (this.phase !== 'moving') return [];

    // If player has bar checkers they MUST enter first
    if (this.bar[p] > 0 && fromPoint !== 'bar') return [];

    if (fromPoint === 'bar') {
      return this._barEntryMoves(p);
    }

    const pt = this.points[fromPoint];
    if (!pt || pt.player !== p || pt.count === 0) return [];

    const vFrom = this.getVirtualPos(p, fromPoint);
    const unique = new Set(this.movesLeft);
    const result = [];

    for (const die of unique) {
      const vTo = vFrom + die;

      if (vTo > 24) {
        // Overshoot: can bear off only if it's the highest checker
        if (this.canBearOff(p) && this._isHighestChecker(p, vFrom)) {
          if (!result.includes('bearoff')) result.push('bearoff');
        }
      } else if (vTo === 24) {
        if (this.canBearOff(p) && !result.includes('bearoff')) result.push('bearoff');
      } else {
        const aTo = this.getActualPos(p, vTo);
        if (this._canLandOn(p, aTo) && !result.includes(aTo)) result.push(aTo);
      }
    }

    return result;
  }

  _barEntryMoves(player) {
    const unique = new Set(this.movesLeft);
    const result = [];
    for (const die of unique) {
      const vDest = die - 1;           // Enter at virtual position (die − 1)
      const aDest = this.getActualPos(player, vDest);
      if (this._canLandOn(player, aDest) && !result.includes(aDest)) {
        result.push(aDest);
      }
    }
    return result;
  }

  _canLandOn(player, actual) {
    const pt = this.points[actual];
    if (!pt || pt.count === 0)         return true;  // empty
    if (pt.player === player)          return true;  // own checker
    if (pt.count === 1)                return true;  // blot — can hit
    return false;                                     // 2+ enemy: blocked
  }

  canBearOff(player) {
    if (this.bar[player] > 0) return false;
    for (let a = 0; a < this.numPoints; a++) {
      const pt = this.points[a];
      if (pt.player === player && pt.count > 0) {
        if (this.getVirtualPos(player, a) < 18) return false;
      }
    }
    return true;
  }

  _isHighestChecker(player, vPos) {
    for (let a = 0; a < this.numPoints; a++) {
      const pt = this.points[a];
      if (pt.player === player && pt.count > 0) {
        if (this.getVirtualPos(player, a) > vPos) return false;
      }
    }
    return true;
  }

  mustEnterFromBar() {
    return this.bar[this.currentPlayer] > 0;
  }

  _hasAnyMoves() {
    const p = this.currentPlayer;
    if (this.bar[p] > 0) return this._barEntryMoves(p).length > 0;
    for (let i = 0; i < this.numPoints; i++) {
      if (this.points[i].player === p && this.points[i].count > 0) {
        if (this.getValidMoves(i).length > 0) return true;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Move execution
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute a move.
   * @param {number|'bar'} from  actual point index or 'bar'
   * @param {number|'bearoff'} to  actual point index or 'bearoff'
   */
  moveChecker(from, to) {
    this._saveHistory();
    const p = this.currentPlayer;

    if (from === 'bar') {
      this._enterFromBar(p, to);
    } else if (to === 'bearoff') {
      this._bearOff(p, from);
    } else {
      this._regularMove(p, from, to);
    }

    // Win condition
    if (this.borneOff[p] >= TOTAL_CHECKERS) {
      this.phase  = 'gameover';
      this.winner = p;
      this._log(`🏆 ${this.players[p].name} wins!`);
      return;
    }

    // Advance turn if no moves remain or no further moves possible
    if (this.movesLeft.length === 0 || !this._hasAnyMoves()) {
      this.nextTurn();
    }
  }

  _regularMove(player, from, to) {
    const vFrom = this.getVirtualPos(player, from);
    const vTo   = this.getVirtualPos(player, to);
    const die   = vTo - vFrom;

    this._handleHit(player, to);
    this._removeFrom(from, player);
    this._addTo(to, player);
    this._consumeDie(die);
    this._log(`${this.players[player].name} moves ${from + 1}→${to + 1}`);
  }

  _enterFromBar(player, to) {
    const vTo = this.getVirtualPos(player, to);
    const die = vTo + 1;   // virtual dest = die − 1, so die = vTo + 1

    this._handleHit(player, to);
    this.bar[player]--;
    this._addTo(to, player);
    this._consumeDie(die);
    this._log(`${this.players[player].name} enters from bar → point ${to + 1}`);
  }

  _bearOff(player, from) {
    const vFrom = this.getVirtualPos(player, from);
    // Find the smallest die that gets this checker off the board
    const sorted = [...this.movesLeft].sort((a, b) => a - b);
    let usedDie = null;
    for (const d of sorted) {
      if (vFrom + d >= 24) { usedDie = d; break; }
    }
    if (usedDie === null) return;

    this._removeFrom(from, player);
    this.borneOff[player]++;
    this._consumeDie(usedDie);
    this._log(`${this.players[player].name} bears off from point ${from + 1}`);
  }

  _handleHit(attacker, targetActual) {
    const pt = this.points[targetActual];
    if (!pt || pt.count !== 1 || pt.player === attacker) return;

    const hitPlayer = pt.player;
    this.bar[hitPlayer]++;
    this.points[targetActual] = { count: 0, player: -1 };
    this._log(`💥 ${this.players[attacker].name} hits ${this.players[hitPlayer].name}!`);

    if (this.onCheckerHit) this.onCheckerHit(attacker, hitPlayer);
  }

  _addTo(actual, player) {
    const pt = this.points[actual];
    if (pt.count === 0) {
      this.points[actual] = { count: 1, player };
    } else {
      this.points[actual].count++;
    }
  }

  _removeFrom(actual, player) {
    const pt = this.points[actual];
    if (pt.count > 0) {
      pt.count--;
      if (pt.count === 0) this.points[actual] = { count: 0, player: -1 };
    }
  }

  _consumeDie(value) {
    const idx = this.movesLeft.indexOf(value);
    if (idx !== -1) this.movesLeft.splice(idx, 1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Turn management
  // ═══════════════════════════════════════════════════════════════════════════

  nextTurn() {
    this.movesLeft     = [];
    this.selectedPoint = null;
    this.validMoves    = [];
    this.turnCount++;

    // Find the next active player (skip anyone who has already won)
    let next     = (this.currentPlayer + 1) % this.numPlayers;
    let attempts = 0;
    while (attempts < this.numPlayers) {
      if (this.borneOff[next] < TOTAL_CHECKERS) break;
      next = (next + 1) % this.numPlayers;
      attempts++;
    }

    if (attempts >= this.numPlayers) {
      this.phase = 'gameover';
      return;
    }

    this.currentPlayer = next;
    this.phase = 'rolling';
  }

  isGameOver() {
    return this.phase === 'gameover';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Scoring / stats
  // ═══════════════════════════════════════════════════════════════════════════

  getScore(player) {
    return this.borneOff[player];
  }

  getPipCount(player) {
    let pips = 0;
    for (let a = 0; a < this.numPoints; a++) {
      const pt = this.points[a];
      if (pt.player === player && pt.count > 0) {
        const v = this.getVirtualPos(player, a);
        pips += (24 - v) * pt.count;
      }
    }
    pips += this.bar[player] * 25;
    return pips;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  _log(msg) {
    this.moveLog.unshift({ msg, player: this.currentPlayer });
    if (this.moveLog.length > 60) this.moveLog.pop();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Undo
  // ═══════════════════════════════════════════════════════════════════════════

  _saveHistory() {
    this._history.push({
      points:        this.points.map(p => ({ ...p })),
      bar:           [...this.bar],
      borneOff:      [...this.borneOff],
      currentPlayer: this.currentPlayer,
      dice:          [...this.dice],
      movesLeft:     [...this.movesLeft],
      phase:         this.phase,
      moveLog:       this.moveLog.map(e => ({ ...e })),
      turnCount:     this.turnCount,
      winner:        this.winner,
    });
    if (this._history.length > 20) this._history.shift();
  }

  undoMove() {
    if (this._history.length === 0) return false;
    const s            = this._history.pop();
    this.points        = s.points;
    this.bar           = s.bar;
    this.borneOff      = s.borneOff;
    this.currentPlayer = s.currentPlayer;
    this.dice          = s.dice;
    this.movesLeft     = s.movesLeft;
    this.phase         = s.phase;
    this.selectedPoint = null;
    this.validMoves    = [];
    this.moveLog       = s.moveLog;
    this.turnCount     = s.turnCount;
    this.winner        = s.winner;
    return true;
  }

  canUndo() {
    return this._history.length > 0;
  }

  /** Full serialisable save (for localStorage). Includes mode + players. */
  exportSave() {
    return {
      mode:          this.mode,
      players:       this.players,
      points:        this.points.map(p => ({ ...p })),
      bar:           [...this.bar],
      borneOff:      [...this.borneOff],
      currentPlayer: this.currentPlayer,
      dice:          [...this.dice],
      movesLeft:     [...this.movesLeft],
      phase:         this.phase,
      moveLog:       this.moveLog.slice(),
      turnCount:     this.turnCount,
      winner:        this.winner,
    };
  }

  /** Restore all mutable state from an exportSave() snapshot. */
  importSave(save) {
    this.points        = save.points.map(p => ({ ...p }));
    this.bar           = [...save.bar];
    this.borneOff      = [...save.borneOff];
    this.currentPlayer = save.currentPlayer;
    this.dice          = [...save.dice];
    this.movesLeft     = [...save.movesLeft];
    this.phase         = save.phase;
    this.moveLog       = save.moveLog.slice();
    this.turnCount     = save.turnCount;
    this.winner        = save.winner;
    this.selectedPoint = null;
    this.validMoves    = [];
    this._history      = [];
  }

  /** Return a serialisable snapshot of the game state */
  getState() {
    return {
      points:        this.points.map(p => ({ ...p })),
      bar:           [...this.bar],
      borneOff:      [...this.borneOff],
      currentPlayer: this.currentPlayer,
      dice:          [...this.dice],
      movesLeft:     [...this.movesLeft],
      phase:         this.phase,
      selectedPoint: this.selectedPoint,
      validMoves:    [...this.validMoves],
      winner:        this.winner,
      moveLog:       this.moveLog.slice(0, 12),
      turnCount:     this.turnCount,
    };
  }
}
