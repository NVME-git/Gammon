export const PLAYER_COLORS = [
  { name: 'Red',    value: '#e74c3c' },
  { name: 'Blue',   value: '#3498db' },
  { name: 'Green',  value: '#2ecc71' },
  { name: 'Yellow', value: '#f1c40f' },
  { name: 'Purple', value: '#9b59b6' },
  { name: 'Orange', value: '#e67e22' },
  { name: 'Pink',   value: '#e91e63' },
  { name: 'Cyan',   value: '#00bcd4' },
  { name: 'White',  value: '#ffffff' },
  { name: 'Teal',   value: '#1abc9c' },
];

export const GAME_MODES = {
  UNIGAMMON:   'unigammon',
  BIGAMMON:    'bigammon',
  TRIGAMMON:   'trigammon',
  QUADGAMMON:  'quadgammon',
  BATTLEGAMMON:'battlegammon',
};

export const MODE_INFO = {
  unigammon:    { name: 'Unigammon',    players: 1, icon: '👤', description: '1 Player Tutorial'      },
  bigammon:     { name: 'Bigammon',     players: 2, icon: '⚔️',  description: '2 Player Classic'       },
  trigammon:    { name: 'Trigammon',    players: 3, icon: '🔺', description: '3 Player Triangle'      },
  quadgammon:   { name: 'Quadgammon',   players: 4, icon: '♦',  description: '4 Player Diamond Race'  },
  battlegammon: { name: 'Battlegammon', players: 4, icon: '✚',  description: '4 Player Last Standing' },
};

export const TOTAL_CHECKERS = 15;
export const NUM_POINTS = 24;

export const THEME_COLORS = {
  dark: {
    background:  '#0f0f1a',
    board:       '#1a1a2e',
    panel:       '#16213e',
    accent:      '#e94560',
    text:        '#e0e0e0',
    subtext:     '#8899aa',
    triangle1:   '#8b2252',
    triangle2:   '#1a5276',
    barArea:     '#0d1117',
    boardBorder: '#2a2a4a',
    highlight:   'rgba(255, 220, 50, 0.55)',
    validMove:   'rgba(46, 204, 113, 0.55)',
    selected:    'rgba(231, 76, 60, 0.75)',
  },
  light: {
    background:  '#f5f0e8',
    board:       '#d4c5a9',
    panel:       '#fff8e7',
    accent:      '#8b4513',
    text:        '#2c1810',
    subtext:     '#6b5040',
    triangle1:   '#c0392b',
    triangle2:   '#2980b9',
    barArea:     '#b8a99a',
    boardBorder: '#a09080',
    highlight:   'rgba(255, 200, 0, 0.55)',
    validMove:   'rgba(39, 174, 96, 0.55)',
    selected:    'rgba(192, 57, 43, 0.75)',
  },
};

// Default player colors indexed by player slot
export const DEFAULT_COLORS = ['#e74c3c', '#2ecc71', '#f1c40f', '#3498db'];
