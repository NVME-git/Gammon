import { PLAYER_COLORS, MODE_INFO, DEFAULT_COLORS, THEME_COLORS } from './constants.js';
import { generateFunnyName } from './names.js';
import { PixelArt } from './pixelart.js';
import { getTutorialPages, isTutorialDismissed, dismissTutorial, resetTutorialDismiss } from './tutorial.js';

export class UIManager {
  constructor() {
    // Screen elements
    this.$setup  = document.getElementById('setup-screen');
    this.$game   = document.getElementById('game-screen');
    this.$win    = document.getElementById('win-screen');
    this.$animOv = document.getElementById('animation-overlay');

    // Setup controls
    this.$modeCards    = document.querySelectorAll('.mode-card');
    this.$playerSetup  = document.getElementById('player-setup');
    this.$startBtn     = document.getElementById('start-btn');
    this.$themeToggle  = document.getElementById('theme-toggle');
    this.$settingsBtn  = document.getElementById('settings-btn');
    this.$settingsPanel= document.getElementById('settings-panel');
    this.$animToggle          = document.getElementById('anim-toggle');
    this.$soundToggle         = document.getElementById('sound-toggle');
    this.$numbersToggle       = document.getElementById('numbers-toggle');
    this.$resignTimeoutSelect = document.getElementById('resign-timeout-select');

    // Game screen controls
    this.$backBtn      = document.getElementById('back-btn');
    this.$rollBtn      = document.getElementById('roll-btn');
    this.$undoBtn      = document.getElementById('undo-btn');
    this.$playerList   = document.getElementById('player-list');
    this.$turnIndicator= document.getElementById('turn-indicator');

    // Win screen
    this.$winTitle     = document.getElementById('win-title');
    this.$winSubtitle  = document.getElementById('win-subtitle');
    this.$finalScores  = document.getElementById('final-scores');
    this.$playAgainBtn = document.getElementById('play-again-btn');
    this.$mainMenuBtn  = document.getElementById('main-menu-btn');

    // Animation canvas
    this.$animCanvas   = document.getElementById('animation-canvas');

    // Tutorial modal elements
    this.$tutorialOverlay   = document.getElementById('tutorial-overlay');
    this.$tutorialEmoji     = document.getElementById('tutorial-emoji');
    this.$tutorialHeading   = document.getElementById('tutorial-heading');
    this.$tutorialBody      = document.getElementById('tutorial-body');
    this.$tutorialDots      = document.getElementById('tutorial-dots');
    this.$tutorialPrevBtn   = document.getElementById('tutorial-prev-btn');
    this.$tutorialNextBtn   = document.getElementById('tutorial-next-btn');
    this.$tutorialCloseBtn  = document.getElementById('tutorial-close-btn');
    this.$tutorialDismissChk= document.getElementById('tutorial-dismiss-check');

    // Tutorial state
    this._tutorialMode      = null;
    this._tutorialPages     = [];
    this._tutorialPageIndex = 0;

    this.selectedMode  = 'bigammon';
    this._settingsOpen = false;

    // Keyed by player index — stores timeout IDs for color-error messages
    this._colorErrTimers = new Map();

    this._loadSettings();
    this._bindStaticEvents();
    this._bindTutorialEvents();
    this._renderModeCards();
    this._renderPlayerSetup();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Screen transitions
  // ═══════════════════════════════════════════════════════════════════════════

  showSetup(hasSave = false) {
    this.$setup.classList.add('active');
    this.$game.classList.remove('active');
    this.$win.classList.add('hidden');
    // Show/hide continue button
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) continueBtn.classList.toggle('hidden', !hasSave);
  }

  showGame() {
    this.$setup.classList.remove('active');
    this.$game.classList.add('active');
    this.$win.classList.add('hidden');
  }

  showWin(winnerName, winnerColor, scores, players, finishOrder = null) {
    this.$win.classList.remove('hidden');
    this.$winTitle.textContent    = `🏆 ${winnerName} Wins! 🏆`;
    this.$winSubtitle.textContent = 'Congratulations, champion!';

    this.$finalScores.replaceChildren();
    // If finishOrder provided (diamond), show players ranked by finish position
    const orderedIdxs = finishOrder?.length ? finishOrder : players.map((_, i) => i);

    orderedIdxs.forEach((i, rank) => {
      const pl  = players[i];
      const div = document.createElement('div');
      div.className = 'score-row';

      const colorDot = document.createElement('span');
      colorDot.className = 'score-color';
      colorDot.style.background = pl.color;

      const nameSpan = document.createElement('span');
      nameSpan.className   = 'score-name';
      nameSpan.textContent = pl.name;          // textContent — safe

      const valSpan = document.createElement('span');
      valSpan.className = 'score-val';
      if (finishOrder?.length) {
        const medals = ['🥇', '🥈', '🥉', '4th'];
        valSpan.textContent = medals[rank] || `${rank + 1}th`;
      } else {
        valSpan.textContent = `${scores[i]} borne off`;
      }

      div.appendChild(colorDot);
      div.appendChild(nameSpan);
      div.appendChild(valSpan);
      this.$finalScores.appendChild(div);
    });

    // Animate trophy
    const trophy = this.$win.querySelector('.win-animation');
    if (trophy) {
      trophy.style.animation = 'none';
      void trophy.offsetWidth;
      trophy.style.animation = '';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Player setup form
  // ═══════════════════════════════════════════════════════════════════════════

  _renderPlayerSetup() {
    const n = MODE_INFO[this.selectedMode].players;
    this.$playerSetup.replaceChildren();

    for (let i = 0; i < n; i++) {
      const color = DEFAULT_COLORS[i] || PLAYER_COLORS[i].value;
      const row   = document.createElement('div');
      row.className   = 'player-row';
      row.dataset.idx = i;

      // Build inner structure without inserting any user-controlled strings
      // into innerHTML to avoid XSS.
      row.innerHTML = `
        <div class="player-avatar-small" id="avatar-prev-${i}"></div>
        <div class="player-fields">
          <input type="text"
                 class="player-name-input"
                 id="player-name-${i}"
                 placeholder="Player ${i + 1} name">
          <button class="btn btn-ghost funny-name-btn" data-idx="${i}" title="Generate funny name">🎲</button>
        </div>
        <div class="color-picker" id="color-picker-${i}">
          ${PLAYER_COLORS.map(c =>
            `<div class="color-swatch ${c.value === color ? 'selected' : ''}"
                  style="background:${c.value}"
                  data-color="${c.value}"
                  data-player="${i}"
                  title="${c.name}"></div>`
          ).join('')}
        </div>
        <div class="player-color-error" id="color-error-${i}"></div>
      `;
      this.$playerSetup.appendChild(row);

      // Set saved name via DOM property (safe — no HTML parsing)
      const nameInput = document.getElementById(`player-name-${i}`);
      if (nameInput) nameInput.value = this._savedName(i);

      // Draw avatar preview
      this._updateAvatarPreview(i, color);
    }

    this._bindPlayerEvents();
  }

  _savedName(idx) {
    const saved = JSON.parse(localStorage.getItem('gammon_players') || '[]');
    return saved[idx]?.name || `Player ${idx + 1}`;
  }

  _bindPlayerEvents() {
    // Color swatches
    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', e => {
        const pidx  = parseInt(sw.dataset.player, 10);
        const color = sw.dataset.color;
        this._selectColor(pidx, color);
      });
    });

    // Funny name buttons
    document.querySelectorAll('.funny-name-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx  = parseInt(btn.dataset.idx, 10);
        const input = document.getElementById(`player-name-${idx}`);
        input.value = generateFunnyName();
      });
    });
  }

  _selectColor(playerIdx, color) {
    const n = MODE_INFO[this.selectedMode].players;

    // Check for conflict
    for (let i = 0; i < n; i++) {
      if (i === playerIdx) continue;
      const other = document.querySelector(`#color-picker-${i} .color-swatch.selected`);
      if (other && other.dataset.color === color) {
        const err = document.getElementById(`color-error-${playerIdx}`);
        if (err) {
          err.textContent = '⚠ Another player already uses that color!';
          clearTimeout(this._colorErrTimers.get(playerIdx));
          this._colorErrTimers.set(playerIdx, setTimeout(() => {
            err.textContent = '';
            this._colorErrTimers.delete(playerIdx);
          }, 2400));
        }
        return;
      }
    }

    // Clear previous selection for this player
    document.querySelectorAll(`#color-picker-${playerIdx} .color-swatch`).forEach(s => {
      s.classList.remove('selected');
    });
    const sw = document.querySelector(
      `#color-picker-${playerIdx} .color-swatch[data-color="${color}"]`
    );
    if (sw) sw.classList.add('selected');

    this._updateAvatarPreview(playerIdx, color);
  }

  _updateAvatarPreview(playerIdx, color) {
    const container = document.getElementById(`avatar-prev-${playerIdx}`);
    if (!container) return;
    container.replaceChildren();
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement('canvas');
    c.width        = 40 * dpr;
    c.height       = 40 * dpr;
    c.style.width  = '40px';
    c.style.height = '40px';
    PixelArt.drawCharacter(c, color);
    container.appendChild(c);
  }

  getPlayerData() {
    const n       = MODE_INFO[this.selectedMode].players;
    const players = [];
    for (let i = 0; i < n; i++) {
      const nameInput = document.getElementById(`player-name-${i}`);
      const colorSw   = document.querySelector(`#color-picker-${i} .color-swatch.selected`);
      players.push({
        name:  nameInput?.value.trim() || `Player ${i + 1}`,
        color: colorSw?.dataset.color  || DEFAULT_COLORS[i] || '#e74c3c',
      });
    }
    // Persist names
    localStorage.setItem('gammon_players', JSON.stringify(players));
    return players;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Game UI updates
  // ═══════════════════════════════════════════════════════════════════════════

  updatePlayerList(players, currentPlayer) {
    if (!this.$playerList) return;
    this.$playerList.replaceChildren();
    players.forEach((pl, i) => {
      const div = document.createElement('div');
      div.className = `player-card ${i === currentPlayer ? 'active' : ''}`;
      div.style.borderColor = i === currentPlayer ? pl.color : 'transparent';

      const dot = document.createElement('div');
      dot.className        = 'player-dot';
      dot.style.background = pl.color;

      const nameSpan = document.createElement('span');
      nameSpan.className   = 'player-name';
      nameSpan.textContent = pl.name;   // textContent — safe

      div.appendChild(dot);
      div.appendChild(nameSpan);
      this.$playerList.appendChild(div);
    });
  }

  updateTurnIndicator(playerName, color, phase) {
    if (!this.$turnIndicator) return;
    this.$turnIndicator.replaceChildren();

    const dot = document.createElement('div');
    dot.className        = 'turn-dot';
    dot.style.background = color;

    const label = document.createElement('span');
    label.className   = 'turn-name';
    label.textContent = `${playerName}: ${phase === 'rolling' ? '🎲 Roll' : '♟ Move'}`;

    this.$turnIndicator.appendChild(dot);
    this.$turnIndicator.appendChild(label);
  }

  setRollButtonState(enabled, label = '🎲 Roll') {
    if (!this.$rollBtn) return;
    this.$rollBtn.disabled    = !enabled;
    this.$rollBtn.textContent = label;
  }

  setUndoButtonState(enabled) {
    if (!this.$undoBtn) return;
    this.$undoBtn.disabled = !enabled;
  }

  // Tutorial overlay for Unigammon
  showTutorialHint(text) {
    let hint = document.getElementById('tutorial-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'tutorial-hint';
      hint.className = 'tutorial-hint';
      document.getElementById('game-screen').appendChild(hint);
    }
    hint.textContent = text;
    hint.classList.remove('hidden');
  }

  hideTutorialHint() {
    const hint = document.getElementById('tutorial-hint');
    if (hint) hint.classList.add('hidden');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Tutorial modal
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Open the tutorial modal for the given mode.
   * playerIndex — the viewing player's 0-based index (personalises pathways page).
   * playerNames — optional string array for player name substitution.
   * force       — if true, opens even when the "don't show again" flag is set.
   */
  showTutorial(mode, playerIndex = 0, playerNames = null, force = false) {
    if (!force && isTutorialDismissed(mode)) return;
    if (!this.$tutorialOverlay) return;

    this._tutorialMode      = mode;
    this._tutorialPages     = getTutorialPages(mode, playerIndex, playerNames);
    this._tutorialPageIndex = 0;

    // Reflect existing dismiss state in the checkbox
    if (this.$tutorialDismissChk) {
      this.$tutorialDismissChk.checked = isTutorialDismissed(mode);
    }

    this._renderTutorialPage();
    this.$tutorialOverlay.classList.remove('hidden');
  }

  hideTutorial() {
    if (!this.$tutorialOverlay) return;
    this.$tutorialOverlay.classList.add('hidden');
  }

  _renderTutorialPage() {
    const pages = this._tutorialPages;
    const idx   = this._tutorialPageIndex;
    if (!pages.length) return;

    const page = pages[idx];

    if (this.$tutorialEmoji)   this.$tutorialEmoji.textContent   = page.emoji || '🎲';
    if (this.$tutorialHeading) this.$tutorialHeading.textContent  = page.heading;
    if (this.$tutorialBody)    this.$tutorialBody.textContent     = page.body;   // textContent — XSS-safe

    // Scroll body back to top on page change
    if (this.$tutorialBody) this.$tutorialBody.scrollTop = 0;

    // Rebuild dots
    if (this.$tutorialDots) {
      this.$tutorialDots.replaceChildren();
      pages.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className   = 'tutorial-dot' + (i === idx ? ' active' : '');
        dot.setAttribute('aria-label', `Go to page ${i + 1}`);
        dot.addEventListener('click', () => {
          this._tutorialPageIndex = i;
          this._renderTutorialPage();
        });
        this.$tutorialDots.appendChild(dot);
      });
    }

    // Update nav buttons
    if (this.$tutorialPrevBtn) this.$tutorialPrevBtn.disabled = idx === 0;
    if (this.$tutorialNextBtn) {
      const isLast = idx === pages.length - 1;
      this.$tutorialNextBtn.textContent = isLast ? '✓ Done' : 'Next →';
    }
  }

  _bindTutorialEvents() {
    if (!this.$tutorialOverlay) return;

    this.$tutorialCloseBtn?.addEventListener('click', () => this.hideTutorial());

    this.$tutorialPrevBtn?.addEventListener('click', () => {
      if (this._tutorialPageIndex > 0) {
        this._tutorialPageIndex--;
        this._renderTutorialPage();
      }
    });

    this.$tutorialNextBtn?.addEventListener('click', () => {
      if (this._tutorialPageIndex < this._tutorialPages.length - 1) {
        this._tutorialPageIndex++;
        this._renderTutorialPage();
      } else {
        this.hideTutorial();
      }
    });

    this.$tutorialDismissChk?.addEventListener('change', e => {
      if (this._tutorialMode) {
        if (e.target.checked) {
          dismissTutorial(this._tutorialMode);
        } else {
          resetTutorialDismiss(this._tutorialMode);
        }
      }
    });

    // Close on backdrop click (click outside card)
    this.$tutorialOverlay.addEventListener('click', e => {
      if (e.target === this.$tutorialOverlay) this.hideTutorial();
    });

    // Keyboard: Escape to close, arrow keys for navigation
    document.addEventListener('keydown', e => {
      if (this.$tutorialOverlay?.classList.contains('hidden')) return;
      if (e.key === 'Escape') { this.hideTutorial(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (this._tutorialPageIndex < this._tutorialPages.length - 1) {
          this._tutorialPageIndex++;
          this._renderTutorialPage();
        }
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (this._tutorialPageIndex > 0) {
          this._tutorialPageIndex--;
          this._renderTutorialPage();
        }
      }
    });

    // Mode-card help buttons
    document.querySelectorAll('.mode-help-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation(); // prevent mode-card selection
        const mode = btn.dataset.mode;
        if (mode) this.showTutorial(mode, 0, null, true);
      });
    });

    // Settings panel "How to Play" button
    const howToPlayBtn = document.getElementById('how-to-play-btn');
    howToPlayBtn?.addEventListener('click', () => {
      // Close the settings panel first
      this._settingsOpen = false;
      this.$settingsPanel.classList.add('hidden');
      // onHowToPlay callback lets main.js provide game context (current player)
      this.onHowToPlay?.();
    });
  }

  playEliminationAnimation(attackerColor, defenderColor, done) {
    if (!this.animationsEnabled) { done && done(); return; }

    this.$animOv.classList.remove('hidden');
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(400, window.innerWidth  * 0.7);
    const H = Math.max(260, window.innerHeight * 0.5);
    this.$animCanvas.width        = W * dpr;
    this.$animCanvas.height       = H * dpr;
    this.$animCanvas.style.width  = `${W}px`;
    this.$animCanvas.style.height = `${H}px`;

    const finish = () => {
      this.$animOv.removeEventListener('click', onSkip);
      this.$animOv.classList.add('hidden');
      done && done();
    };

    const cancel = PixelArt.showEliminationAnimation(
      this.$animCanvas, attackerColor, defenderColor, finish
    );

    // Tap/click anywhere on the overlay to skip immediately
    const onSkip = () => { if (cancel) cancel(); };
    this.$animOv.addEventListener('click', onSkip, { once: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Settings / theme
  // ═══════════════════════════════════════════════════════════════════════════

  _loadSettings() {
    const dark = localStorage.getItem('gammon_theme') !== 'light';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    this.$themeToggle.textContent = dark ? '🌙' : '☀️';

    this.animationsEnabled = localStorage.getItem('gammon_anim') !== 'off';
    if (this.$animToggle) this.$animToggle.checked = this.animationsEnabled;

    this.soundEnabled = localStorage.getItem('gammon_sound') === 'on';
    if (this.$soundToggle) this.$soundToggle.checked = this.soundEnabled;

    this.showNumbers = localStorage.getItem('gammon_numbers') !== 'off';
    if (this.$numbersToggle) this.$numbersToggle.checked = this.showNumbers;

    const savedTimeout = localStorage.getItem('gammon_resign_timeout');
    this.resignTimeoutSec = savedTimeout !== null ? parseInt(savedTimeout, 10) : 30;
    if (this.$resignTimeoutSelect) this.$resignTimeoutSelect.value = String(this.resignTimeoutSec);
  }

  _toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next   = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    this.$themeToggle.textContent = next === 'dark' ? '🌙' : '☀️';
    localStorage.setItem('gammon_theme', next);
    // Notify any registered listener so the board re-renders
    this.onThemeChange?.();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════════════

  _bindStaticEvents() {
    this.$themeToggle.addEventListener('click', () => this._toggleTheme());

    this.$settingsBtn.addEventListener('click', () => {
      this._settingsOpen = !this._settingsOpen;
      this.$settingsPanel.classList.toggle('hidden', !this._settingsOpen);
    });

    this.$animToggle?.addEventListener('change', e => {
      this.animationsEnabled = e.target.checked;
      localStorage.setItem('gammon_anim', e.target.checked ? 'on' : 'off');
    });

    this.$soundToggle?.addEventListener('change', e => {
      this.soundEnabled = e.target.checked;
      localStorage.setItem('gammon_sound', e.target.checked ? 'on' : 'off');
    });

    this.$numbersToggle?.addEventListener('change', e => {
      this.showNumbers = e.target.checked;
      localStorage.setItem('gammon_numbers', e.target.checked ? 'on' : 'off');
      this.onNumbersChange?.();
    });

    this.$resignTimeoutSelect?.addEventListener('change', e => {
      this.resignTimeoutSec = parseInt(e.target.value, 10);
      localStorage.setItem('gammon_resign_timeout', e.target.value);
    });

    this.$modeCards.forEach(card => {
      card.addEventListener('click', () => {
        this.$modeCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedMode = card.dataset.mode;
        this._renderPlayerSetup();
      });
    });

    // Click outside settings panel closes it
    document.addEventListener('click', e => {
      if (this._settingsOpen &&
          !this.$settingsPanel.contains(e.target) &&
          e.target !== this.$settingsBtn) {
        this._settingsOpen = false;
        this.$settingsPanel.classList.add('hidden');
      }
    });
  }

  _renderModeCards() {
    this.$modeCards.forEach(card => {
      const mode = card.dataset.mode;
      card.classList.toggle('selected', mode === this.selectedMode);
    });
  }
}
