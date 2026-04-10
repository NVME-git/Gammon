import { PLAYER_COLORS, MODE_INFO, DEFAULT_COLORS, THEME_COLORS } from './constants.js';
import { generateFunnyName } from './names.js';
import { PixelArt } from './pixelart.js';

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
    this.$animToggle   = document.getElementById('anim-toggle');
    this.$soundToggle  = document.getElementById('sound-toggle');

    // Game screen controls
    this.$backBtn      = document.getElementById('back-btn');
    this.$rollBtn      = document.getElementById('roll-btn');
    this.$playerList   = document.getElementById('player-list');
    this.$turnIndicator= document.getElementById('turn-indicator');
    this.$diceContainer= document.getElementById('dice-container');
    this.$logEntries   = document.getElementById('log-entries');

    // Win screen
    this.$winTitle     = document.getElementById('win-title');
    this.$winSubtitle  = document.getElementById('win-subtitle');
    this.$finalScores  = document.getElementById('final-scores');
    this.$playAgainBtn = document.getElementById('play-again-btn');
    this.$mainMenuBtn  = document.getElementById('main-menu-btn');

    // Animation canvas
    this.$animCanvas   = document.getElementById('animation-canvas');

    this.selectedMode  = 'bigammon';
    this._settingsOpen = false;

    this._loadSettings();
    this._bindStaticEvents();
    this._renderModeCards();
    this._renderPlayerSetup();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Screen transitions
  // ═══════════════════════════════════════════════════════════════════════════

  showSetup() {
    this.$setup.classList.add('active');
    this.$game.classList.remove('active');
    this.$win.classList.add('hidden');
  }

  showGame() {
    this.$setup.classList.remove('active');
    this.$game.classList.add('active');
    this.$win.classList.add('hidden');
  }

  showWin(winnerName, winnerColor, scores, players) {
    this.$win.classList.remove('hidden');
    this.$winTitle.textContent    = `🏆 ${winnerName} Wins! 🏆`;
    this.$winSubtitle.textContent = 'Congratulations, champion!';

    this.$finalScores.innerHTML = '';
    players.forEach((pl, i) => {
      const div = document.createElement('div');
      div.className = 'score-row';
      div.innerHTML = `<span class="score-color" style="background:${pl.color}"></span>
                       <span class="score-name">${pl.name}</span>
                       <span class="score-val">${scores[i]} borne off</span>`;
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
    this.$playerSetup.innerHTML = '';

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
          clearTimeout(err._timer);
          err._timer = setTimeout(() => { err.textContent = ''; }, 2400);
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
    container.innerHTML = '';
    const c = document.createElement('canvas');
    c.width  = 40;
    c.height = 40;
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

  updatePlayerList(players, currentPlayer, borneOff, bar) {
    this.$playerList.innerHTML = '';
    players.forEach((pl, i) => {
      const div = document.createElement('div');
      div.className = `player-card ${i === currentPlayer ? 'active' : ''}`;

      const avatarC = document.createElement('canvas');
      avatarC.width  = 36;
      avatarC.height = 36;
      PixelArt.drawCharacter(avatarC, pl.color);

      div.innerHTML = `
        <div class="player-avatar-wrap" style="border-color:${pl.color}"></div>
        <div class="player-info">
          <div class="player-name">${pl.name}</div>
          <div class="player-stats">
            <span>✅ ${borneOff[i]}</span>
            <span>🔴 ${bar[i]}</span>
          </div>
        </div>
        ${i === currentPlayer ? '<div class="turn-arrow">▶</div>' : ''}
      `;
      div.querySelector('.player-avatar-wrap').appendChild(avatarC);
      this.$playerList.appendChild(div);
    });
  }

  updateTurnIndicator(playerName, color, phase) {
    const phaseLabel = phase === 'rolling' ? '🎲 Roll dice' : '♟ Choose move';
    this.$turnIndicator.innerHTML = `
      <div class="turn-dot" style="background:${color}"></div>
      <div>
        <div class="turn-name">${playerName}</div>
        <div class="turn-phase">${phaseLabel}</div>
      </div>
    `;
  }

  updateDice(dice, movesLeft) {
    this.$diceContainer.innerHTML = '';
    const faces = ['', '⚀','⚁','⚂','⚃','⚄','⚅'];
    const isDoubles = dice.length === 2 && dice[0] === dice[1];

    if (isDoubles) {
      const val       = dice[0];
      const remaining = movesLeft.filter(v => v === val).length;
      for (let i = 0; i < 4; i++) {
        const d = document.createElement('div');
        d.className   = 'die' + (i >= remaining ? ' used' : '');
        d.textContent = faces[val] || val;
        this.$diceContainer.appendChild(d);
      }
    } else {
      const ml = [...movesLeft];
      dice.forEach(v => {
        const d = document.createElement('div');
        d.className   = 'die';
        d.textContent = faces[v] || v;
        const idx = ml.indexOf(v);
        if (idx === -1) d.classList.add('used');
        else            ml.splice(idx, 1);
        this.$diceContainer.appendChild(d);
      });
    }
  }

  setRollButtonState(enabled, label = '🎲 Roll') {
    this.$rollBtn.disabled   = !enabled;
    this.$rollBtn.textContent = label;
  }

  updateMoveLog(entries) {
    this.$logEntries.innerHTML = '';
    entries.slice(0, 10).forEach(e => {
      const div = document.createElement('div');
      div.className   = 'log-entry';
      div.textContent = e.msg;
      this.$logEntries.appendChild(div);
    });
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
  // Elimination animation
  // ═══════════════════════════════════════════════════════════════════════════

  playEliminationAnimation(attackerColor, defenderColor, done) {
    if (!this.animationsEnabled) { done && done(); return; }

    this.$animOv.classList.remove('hidden');
    const W = window.innerWidth  * 0.7;
    const H = window.innerHeight * 0.5;
    this.$animCanvas.width  = Math.max(400, W);
    this.$animCanvas.height = Math.max(260, H);

    PixelArt.showEliminationAnimation(
      this.$animCanvas, attackerColor, defenderColor, () => {
        this.$animOv.classList.add('hidden');
        done && done();
      }
    );
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
