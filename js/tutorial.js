/**
 * tutorial.js — Game tutorial content and dismiss-state helpers.
 *
 * getTutorialPages(mode, playerIndex)
 *   Returns an array of { heading, body, emoji } page objects for the given
 *   game mode.  playerIndex (0-based) is used to highlight the viewing
 *   player's own pathway.  Defaults to 0 (Player 1 perspective).
 *
 * isTutorialDismissed(mode)   — true if the player chose "don't show again"
 * dismissTutorial(mode)       — persist the dismiss choice
 * resetTutorialDismiss(mode)  — clear the dismiss choice (re-enable auto-show)
 */

const DISMISS_PREFIX = 'gammon_tutorial_seen_';

export function isTutorialDismissed(mode) {
  return localStorage.getItem(DISMISS_PREFIX + mode) === '1';
}

export function dismissTutorial(mode) {
  localStorage.setItem(DISMISS_PREFIX + mode, '1');
}

export function resetTutorialDismiss(mode) {
  localStorage.removeItem(DISMISS_PREFIX + mode);
}

// ─── Tutorial page content ────────────────────────────────────────────────────

/**
 * Returns the ordered array of tutorial pages for the given mode.
 * playerIndex is used to personalise the "Your Path" page.
 * playerNames (optional string array) adds colour to the path descriptions.
 */
export function getTutorialPages(mode, playerIndex = 0, playerNames = null) {
  switch (mode) {
    case 'unigammon':    return _unigammonPages();
    case 'bigammon':     return _bigammonPages(playerIndex, playerNames);
    case 'trigammon':    return _trigammonPages(playerIndex, playerNames);
    case 'quadgammon':   return _quadgammonPages(playerIndex, playerNames);
    case 'battlegammon': return _battlegammonPages(playerIndex, playerNames);
    default:             return [];
  }
}

// ─── Unigammon (1 player) ─────────────────────────────────────────────────────

function _unigammonPages() {
  return [
    {
      emoji: '🎲',
      heading: 'Welcome to Unigammon!',
      body:
        'Unigammon is a solo practice mode — perfect for learning the ropes of backgammon before playing against others.\n\n' +
        'Your goal is simple: move all 15 of your checkers off the right side of the board.',
    },
    {
      emoji: '🗺️',
      heading: 'Starting Positions',
      body:
        'Your 15 checkers begin spread across the board:\n\n' +
        '• 2 checkers at Point 24 (far right)\n' +
        '• 5 checkers at Point 13 (middle)\n' +
        '• 3 checkers at Point 8 (middle-left)\n' +
        '• 5 checkers at Point 6 (near left)\n\n' +
        'Points are numbered 1–24 from left to right.',
    },
    {
      emoji: '➡️',
      heading: 'Your Path',
      body:
        'Move ALL checkers from LEFT to RIGHT.\n\n' +
        '1. Roll the dice — your checker moves that many points to the right.\n' +
        '2. Get all checkers into your Home Board (Points 19–24, the right six points).\n' +
        '3. Once all 15 are home, click a checker and then the BEAR-OFF zone on the far right to remove it from the board.\n\n' +
        'Bear off all 15 checkers to win! 🏁',
    },
    {
      emoji: '🎮',
      heading: 'Controls',
      body:
        '• Click 🎲 Roll (or the dice area) to roll.\n' +
        '• Click a checker to select it — valid moves highlight in green.\n' +
        '• Click a highlighted point to move.\n' +
        '• If a checker lands on the BAR, click the BAR zone to re-enter from Point 1.\n' +
        '• Click ↩ Undo at any time to take back a move within your turn.\n\n' +
        'Tip: The board number toggle (⚙️ Settings) helps you track point numbers.',
    },
  ];
}

// ─── Bigammon (2 players) ─────────────────────────────────────────────────────

function _bigammonPages(playerIndex, playerNames) {
  const names = _names(playerNames, 2);
  const you   = names[playerIndex];
  const opp   = names[1 - playerIndex];

  const paths = [
    {
      label:   names[0] + (playerIndex === 0 ? ' (You)' : ''),
      start:   '2@Point 24 · 5@Point 13 · 3@Point 8 · 5@Point 6',
      dir:     '➡️ LEFT to RIGHT',
      home:    'Points 19–24 (right six)',
      bearoff: 'Right edge',
      battles: names[1],
    },
    {
      label:   names[1] + (playerIndex === 1 ? ' (You)' : ''),
      start:   '2@Point 1 · 5@Point 12 · 3@Point 17 · 5@Point 19',
      dir:     '⬅️ RIGHT to LEFT',
      home:    'Points 1–6 (left six)',
      bearoff: 'Left edge',
      battles: names[0],
    },
  ];

  return [
    {
      emoji: '⚔️',
      heading: 'Bigammon — Classic 2-Player',
      body:
        'Bigammon is the standard two-player backgammon experience on a 24-point linear board.\n\n' +
        `${you} vs ${opp} — race to be the first to bear all 15 checkers off the board!\n\n` +
        'Both players share the same board and move in opposite directions.',
    },
    {
      emoji: '🎯',
      heading: 'The Goal',
      body:
        '1. Move all 15 of your checkers into your Home Board (the closest six points to your bear-off edge).\n' +
        '2. Once all checkers are home, start bearing them off one by one.\n' +
        '3. First player to bear off all 15 checkers wins!\n\n' +
        'Along the way you can hit lone opponent checkers and send them to the Bar, forcing them to re-enter from scratch.',
    },
    {
      emoji: '🗺️',
      heading: 'Player Pathways',
      body: _formatPaths2(paths, playerIndex),
    },
    {
      emoji: '⚡',
      heading: 'The Bar & Hitting',
      body:
        'A single checker on a point is called a "blot".\n\n' +
        '• Land on an opponent\'s blot → their checker is HIT and placed on the Bar.\n' +
        '• A player with checkers on the Bar MUST re-enter them first before moving any other checker.\n' +
        '• Re-enter via the BAR zone — you must roll a number that lands on a free point in the opponent\'s home board.\n' +
        '• You cannot be hit when you have 2 or more checkers on a point.',
    },
    {
      emoji: '🏁',
      heading: 'Bearing Off',
      body:
        'Once ALL your checkers are in your Home Board:\n\n' +
        '• Click a checker, then click the BEAR-OFF zone at your edge.\n' +
        '• Roll a number ≥ the checker\'s point from the edge to bear it off.\n' +
        '• If no exact move exists, you may bear off the highest checker instead.\n\n' +
        'If any checker gets sent to the Bar while bearing off, you must re-enter it and bring it home again before continuing.',
    },
  ];
}

// ─── Trigammon (3 players) ────────────────────────────────────────────────────

function _trigammonPages(playerIndex, playerNames) {
  const names = _names(playerNames, 3);

  // Arm names: arm0=bottom-right, arm1=top, arm2=bottom-left
  const armName = ['bottom-right arm', 'top arm', 'bottom-left arm'];

  // Each player: starts on two arms, bears off from one arm tip
  const paths = [
    {
      label:   names[0] + (playerIndex === 0 ? ' (You)' : ''),
      start:   'Bottom-right arm + top arm',
      dir:     'Move pieces up into the top arm',
      home:    'Top arm — points near the tip',
      bearoff: 'Top arm tip (↑)',
      battles: `${names[1]} (bottom-right arm), ${names[2]} (top arm)`,
    },
    {
      label:   names[1] + (playerIndex === 1 ? ' (You)' : ''),
      start:   'Bottom-right arm + bottom-left arm',
      dir:     'Move pieces toward the bottom-right arm tip',
      home:    'Bottom-right arm — points near the tip',
      bearoff: 'Bottom-right arm tip (↘)',
      battles: `${names[0]} (bottom-right arm), ${names[2]} (bottom-left arm)`,
    },
    {
      label:   names[2] + (playerIndex === 2 ? ' (You)' : ''),
      start:   'Top arm + bottom-left arm',
      dir:     'Move pieces down into the bottom-left arm',
      home:    'Bottom-left arm — points near the tip',
      bearoff: 'Bottom-left arm tip (↙)',
      battles: `${names[0]} (top arm), ${names[1]} (bottom-left arm)`,
    },
  ];

  return [
    {
      emoji: '🔺',
      heading: 'Trigammon — 3-Player',
      body:
        'Trigammon is played on a Y-shaped board with three arms radiating from a central hub.\n\n' +
        'The board has 36 points (12 per arm). Each player starts on a different arm and races to bear their checkers off the board.\n\n' +
        'All three players move in the same direction — counter-clockwise around the hub.',
    },
    {
      emoji: '🎯',
      heading: 'The Y-Shaped Board',
      body:
        'Three arms meet at the centre:\n\n' +
        '• Top arm (↑) — 12 points\n' +
        '• Bottom-right arm (↘) — 12 points\n' +
        '• Bottom-left arm (↙) — 12 points\n\n' +
        'Each arm tip has a Bear-Off zone and a Bar zone for that arm\'s owner.\n' +
        'Players\' pieces overlap on shared arm sections — that\'s where battles happen!',
    },
    {
      emoji: '🗺️',
      heading: 'Player Pathways',
      body: _formatPaths3(paths, playerIndex),
    },
    {
      emoji: '⚡',
      heading: 'Hitting & the Bar',
      body:
        'The same hitting rules as classic backgammon apply:\n\n' +
        '• Land on a lone opponent checker (blot) → it goes to the Bar.\n' +
        '• A player with checkers on the Bar must re-enter through the hub area before moving.\n' +
        '• Two or more checkers on a point are safe from hits.\n\n' +
        'Because three players share each arm section, you can be hit by TWO different opponents simultaneously — keep your blots covered!',
    },
    {
      emoji: '🏁',
      heading: 'Bearing Off & Winning',
      body:
        'Once all your checkers are in your Home stretch (the six points nearest your arm tip):\n\n' +
        '• Click a checker, then click your Bear-Off zone.\n' +
        '• The first player to remove all 15 checkers wins!\n' +
        '• The remaining two players continue for 2nd and 3rd place.',
    },
  ];
}

// ─── Quadgammon (4 players, diamond race) ────────────────────────────────────

function _quadgammonPages(playerIndex, playerNames) {
  const names = _names(playerNames, 4);

  // Diamond arms: left, right, top, bottom
  // P0=horizontal-left→right, P1=horizontal-right→left, P2=vertical-top→bottom, P3=vertical-bottom→top
  const paths = [
    {
      label:   names[0] + (playerIndex === 0 ? ' (You)' : ''),
      start:   'Left arm + diagonal sections',
      dir:     '➡️ Left arm → diagonals → Right arm',
      home:    'Right arm (last 6 points)',
      bearoff: 'Right arm tip',
      battles: `${names[2]} & ${names[3]} (diagonals), ${names[1]} (full board)`,
    },
    {
      label:   names[1] + (playerIndex === 1 ? ' (You)' : ''),
      start:   'Right arm + diagonal sections',
      dir:     '⬅️ Right arm → diagonals → Left arm',
      home:    'Left arm (last 6 points)',
      bearoff: 'Left arm tip',
      battles: `${names[2]} & ${names[3]} (diagonals), ${names[0]} (full board)`,
    },
    {
      label:   names[2] + (playerIndex === 2 ? ' (You)' : ''),
      start:   'Top arm + diagonal sections',
      dir:     '⬇️ Top arm → diagonals → Bottom arm',
      home:    'Bottom arm (last 6 points)',
      bearoff: 'Bottom arm tip',
      battles: `${names[0]} & ${names[1]} (diagonals), ${names[3]} (full board)`,
    },
    {
      label:   names[3] + (playerIndex === 3 ? ' (You)' : ''),
      start:   'Bottom arm + diagonal sections',
      dir:     '⬆️ Bottom arm → diagonals → Top arm',
      home:    'Top arm (last 6 points)',
      bearoff: 'Top arm tip',
      battles: `${names[0]} & ${names[1]} (diagonals), ${names[2]} (full board)`,
    },
  ];

  return [
    {
      emoji: '♦',
      heading: 'Quadgammon — Diamond Race',
      body:
        'Quadgammon is played on a diamond-shaped board with 48 points arranged across four arms and four diagonal sections.\n\n' +
        'Four players race to bear all their checkers off the board. The player who finishes LAST loses — everyone else places 1st, 2nd and 3rd!',
    },
    {
      emoji: '🎯',
      heading: 'The Diamond Board',
      body:
        'The board has four arms (left, right, top, bottom) connected by four diagonal bridges:\n\n' +
        '• Left arm ↔ Right arm — horizontal axis\n' +
        '• Top arm ↔ Bottom arm — vertical axis\n' +
        '• LL-diagonal, LR-diagonal, UL-diagonal, UR-diagonal — the bridges\n\n' +
        'Each player\'s journey covers 24 of the 48 points, crossing two diagonal bridges before reaching their bear-off arm.',
    },
    {
      emoji: '🗺️',
      heading: 'Player Pathways',
      body: _formatPaths4(paths, playerIndex),
    },
    {
      emoji: '⏱️',
      heading: 'Resign Timer & Rules',
      body:
        'Quadgammon has a resign timer (configurable in ⚙️ Settings).\n\n' +
        '• If a player\'s timer runs out, they automatically resign and are removed from the race.\n' +
        '• Resigned players finish in last place (or last among resignees).\n\n' +
        'Hitting rules are the same as classic backgammon — blots can be hit and sent to the Bar.',
    },
    {
      emoji: '🏁',
      heading: 'Ranking & Winning',
      body:
        'Finish order determines the ranking:\n\n' +
        '🥇 1st — first to bear off all 15 checkers\n' +
        '🥈 2nd — second to finish\n' +
        '🥉 3rd — third to finish\n' +
        '💀 Last — final player remaining\n\n' +
        'Strategy tip: Getting off the board quickly wins, but don\'t leave too many blots — getting sent to the Bar wastes precious turns!',
    },
  ];
}

// ─── Battlegammon (4 players, last standing) ─────────────────────────────────

function _battlegammonPages(playerIndex, playerNames) {
  const names = _names(playerNames, 4);

  // Arms: South(0), West(1), North(2), East(3)
  // P0=South, P1=West, P2=North, P3=East
  const armLabel = ['South ↓', 'West ←', 'North ↑', 'East →'];
  const startArm = ['South arm', 'West arm', 'North arm', 'East arm'];

  // Each player traverses: own arm → 2nd arm → 3rd arm → 4th arm → bear off
  const journeys = [
    'South → West → East → North',
    'West → North → South → East',
    'North → East → West → South',
    'East → South → North → West',
  ];

  const paths = names.map((name, i) => ({
    label:   name + (i === playerIndex ? ' (You)' : ''),
    start:   startArm[i],
    dir:     journeys[i],
    home:    `Last arm — 6 points before bear-off`,
    bearoff: journeys[i].split(' → ').slice(-1)[0] + ' arm tip',
    battles: 'All three opponents — paths cross on every arm!',
  }));

  return [
    {
      emoji: '✚',
      heading: 'Battlegammon — Last Standing',
      body:
        'Battlegammon is four-player mayhem on a cross-shaped board.\n\n' +
        '⚠️ The goal is SURVIVAL — the last player with checkers on the board wins!\n\n' +
        'Hit your opponents\' lone checkers repeatedly to eliminate them. Once all of a player\'s checkers are trapped on the Bar and they cannot re-enter, they are eliminated.',
    },
    {
      emoji: '✚',
      heading: 'The Cross-Shaped Board',
      body:
        'The board has four arms arranged in a plus (+) shape, each with 6 triangle points:\n\n' +
        '• North arm (↑) — 6 points\n' +
        '• South arm (↓) — 6 points\n' +
        '• East arm (→) — 6 points\n' +
        '• West arm (←) — 6 points\n\n' +
        'All four players share every arm — battles happen everywhere! Each player enters their own arm and spirals through all four.',
    },
    {
      emoji: '🗺️',
      heading: 'Player Pathways',
      body: _formatPaths4(paths, playerIndex),
    },
    {
      emoji: '⚡',
      heading: 'Elimination Rules',
      body:
        'Battlegammon uses aggressive hitting to eliminate opponents:\n\n' +
        '• Hit a lone opponent checker → it goes to the Bar.\n' +
        '• An eliminated player has ALL their checkers stuck on the Bar and cannot roll a number to re-enter any open point.\n' +
        '• On their turn, if there is no valid re-entry move, the player is eliminated!\n\n' +
        'You can hit multiple opponents in a single turn by landing on different blots.',
    },
    {
      emoji: '🏆',
      heading: 'How to Win',
      body:
        'Last player standing wins!\n\n' +
        '• Eliminate all three opponents before they eliminate you.\n' +
        '• You can also win by bearing off all your checkers — if you bear off all 15, you are out of reach!\n\n' +
        'Strategy: Spread your checkers across all arms to block key points, and keep stacks of two or more to avoid being hit.\n\n' +
        'Watch out — with four players all attacking, your blots won\'t last long! 🔥',
    },
  ];
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function _names(supplied, count) {
  const defaults = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  if (!supplied) return defaults.slice(0, count);
  const out = [];
  for (let i = 0; i < count; i++) out.push(supplied[i] || defaults[i]);
  return out;
}

/**
 * Shared path formatter.
 * fields — array of { key, label } pairs to include (in order) from each path object.
 */
function _formatPaths(paths, playerIndex, fields) {
  return paths.map((p, i) => {
    const marker = i === playerIndex ? '★ ' : '  ';
    const lines  = [`${marker}${p.label}`];
    for (const { key, label } of fields) {
      if (p[key] != null) lines.push(`  ${label}: ${p[key]}`);
    }
    return lines.join('\n');
  }).join('\n\n');
}

const PATH_FIELDS_FULL = [
  { key: 'start',   label: 'Start'     },
  { key: 'dir',     label: 'Direction' },
  { key: 'home',    label: 'Home Board'},
  { key: 'bearoff', label: 'Bear-Off'  },
  { key: 'battles', label: 'Battles'   },
];

const PATH_FIELDS_JOURNEY = [
  { key: 'start',   label: 'Start'  },
  { key: 'dir',     label: 'Journey'},
  { key: 'bearoff', label: 'Bear-Off'},
  { key: 'battles', label: 'Battles' },
];

function _formatPaths2(paths, playerIndex) { return _formatPaths(paths, playerIndex, PATH_FIELDS_FULL); }
function _formatPaths3(paths, playerIndex) { return _formatPaths(paths, playerIndex, PATH_FIELDS_FULL); }
function _formatPaths4(paths, playerIndex) { return _formatPaths(paths, playerIndex, PATH_FIELDS_JOURNEY); }
