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

    this.points   = Array.from({ length: NUM_POINTS }, () => ({ count: 0, player: -1 }));
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

    this._setupBoard();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Board setup
  // ═══════════════════════════════════════════════════════════════════════════

  _setupBoard() {
    const N    = this.numPlayers;
    const mode = this.mode;

    if (mode === 'unigammon') {
      // All 15 checkers at the left end; single player pushes them right
      this._set(0, 0, 5);
      this._set(0, 1, 5);
      this._set(0, 2, 3);
      this._set(0, 3, 2);
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

    // 3-player (offset=8) and 4-player (offset=6)
    const offset = Math.floor(NUM_POINTS / N);
    for (let p = 0; p < N; p++) {
      const o = p * offset;
      this._set(p, (o + 0) % 24, 5);
      this._set(p, (o + 1) % 24, 5);
      this._set(p, (o + 2) % 24, 3);
      this._set(p, (o + offset - 1) % 24, 2);
    }
  }

  _set(player, actual, count) {
    this.points[actual] = { count, player };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Virtual ↔ actual position mapping
  // ═══════════════════════════════════════════════════════════════════════════

  getActualPos(player, virtual) {
    if (this.numPlayers <= 2 && player === 0) return virtual;
    if (this.numPlayers === 2 && player === 1) return 23 - virtual;
    const offset = player * Math.floor(NUM_POINTS / this.numPlayers);
    return (virtual + offset) % 24;
  }

  getVirtualPos(player, actual) {
    if (this.numPlayers <= 2 && player === 0) return actual;
    if (this.numPlayers === 2 && player === 1) return 23 - actual;
    const offset = player * Math.floor(NUM_POINTS / this.numPlayers);
    return (actual - offset + 24) % 24;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Dice
  // ═══════════════════════════════════════════════════════════════════════════

  rollDice() {
    if (this.phase !== 'rolling') return null;

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
    for (let a = 0; a < 24; a++) {
      const pt = this.points[a];
      if (pt.player === player && pt.count > 0) {
        if (this.getVirtualPos(player, a) < 18) return false;
      }
    }
    return true;
  }

  _isHighestChecker(player, vPos) {
    for (let a = 0; a < 24; a++) {
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
    for (let i = 0; i < 24; i++) {
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
    for (let a = 0; a < 24; a++) {
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
