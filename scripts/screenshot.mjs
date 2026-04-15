/**
 * Takes screenshots of each Gammon game mode using Playwright + chromium.
 * Run: node scripts/screenshot.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE_URL  = 'http://localhost:8099/Gammon/';
const VIEWPORT  = { width: 1280, height: 720 };

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const ctx  = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();

// ── Helper: wait for PixiJS canvas to be rendered (non-blank) ─────────────────
async function waitForCanvas(page, timeout = 8000) {
  await page.waitForSelector('#game-canvas', { timeout });
  await page.waitForTimeout(1200); // let PixiJS paint at least one frame
}

// ── Helper: set player names to short fixed values so screenshots look clean ──
async function fillPlayerNames(page, names) {
  for (let i = 0; i < names.length; i++) {
    const input = page.locator(`#player-setup .player-row:nth-child(${i + 1}) input[type="text"]`).first();
    if (await input.count()) {
      await input.fill(names[i]);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Setup screen
// ─────────────────────────────────────────────────────────────────────────────
await page.goto(BASE_URL);
await page.waitForSelector('.mode-cards', { timeout: 8000 });
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT_DIR, 'setup.png') });
console.log('✓ setup.png');

// ─────────────────────────────────────────────────────────────────────────────
// 2. Unigammon (1 player)
// ─────────────────────────────────────────────────────────────────────────────
await page.click('[data-mode="unigammon"]');
await page.waitForTimeout(200);
await fillPlayerNames(page, ['You']);
await page.click('#start-btn');
await waitForCanvas(page);
await page.screenshot({ path: path.join(OUT_DIR, 'unigammon.png') });
console.log('✓ unigammon.png');

// ─────────────────────────────────────────────────────────────────────────────
// 3. Bigammon (2 player)
// ─────────────────────────────────────────────────────────────────────────────
await page.click('#back-btn');
await page.waitForSelector('.mode-cards', { timeout: 5000 });
await page.waitForTimeout(200);
await page.click('[data-mode="bigammon"]');
await page.waitForTimeout(200);
await fillPlayerNames(page, ['Red', 'Blue']);
await page.click('#start-btn');
await waitForCanvas(page);
await page.screenshot({ path: path.join(OUT_DIR, 'bigammon.png') });
console.log('✓ bigammon.png');

// ─────────────────────────────────────────────────────────────────────────────
// 4. Trigammon (3 player)
// ─────────────────────────────────────────────────────────────────────────────
await page.click('#back-btn');
await page.waitForSelector('.mode-cards', { timeout: 5000 });
await page.waitForTimeout(200);
await page.click('[data-mode="trigammon"]');
await page.waitForTimeout(200);
await fillPlayerNames(page, ['Red', 'Blue', 'Green']);
await page.click('#start-btn');
await waitForCanvas(page);
await page.screenshot({ path: path.join(OUT_DIR, 'trigammon.png') });
console.log('✓ trigammon.png');

// ─────────────────────────────────────────────────────────────────────────────
// 5. Quadgammon (4 player)
// ─────────────────────────────────────────────────────────────────────────────
await page.click('#back-btn');
await page.waitForSelector('.mode-cards', { timeout: 5000 });
await page.waitForTimeout(200);
await page.click('[data-mode="quadgammon"]');
await page.waitForTimeout(200);
await fillPlayerNames(page, ['Red', 'Blue', 'Green', 'Gold']);
await page.click('#start-btn');
await waitForCanvas(page);
await page.screenshot({ path: path.join(OUT_DIR, 'quadgammon.png') });
console.log('✓ quadgammon.png');

await browser.close();
console.log('\nAll screenshots saved to docs/screenshots/');
