export class PixelArt {
  /**
   * Draw a simple pixel-art warrior character on `canvas` using `color`.
   * @param {HTMLCanvasElement} canvas
   * @param {string} color  hex color string
   */
  static drawCharacter(canvas, color) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const scale = W / 16; // 16-column grid

    const px = (col, row, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(col * scale, row * scale, scale, scale);
    };

    const dark   = PixelArt._darken(color, 60);
    const light  = PixelArt._lighten(color, 60);
    const skin   = '#f5c5a3';
    const black  = '#222';
    const white  = '#fff';

    // helmet
    for (let c = 5; c <= 10; c++) px(c, 0, dark);
    for (let c = 4; c <= 11; c++) px(c, 1, color);
    px(4, 1, dark); px(11, 1, dark);

    // face
    for (let c = 5; c <= 10; c++) for (let r = 2; r <= 4; r++) px(c, r, skin);
    px(6, 3, black); px(9, 3, black);   // eyes
    px(7, 4, black); px(8, 4, black);   // mouth

    // body / chestplate
    for (let c = 4; c <= 11; c++) for (let r = 5; r <= 9; r++) px(c, r, color);
    for (let c = 6; c <= 9;  c++) for (let r = 5; r <= 8; r++) px(c, r, light);
    px(7, 6, white); px(8, 6, white); // emblem

    // arms
    for (let r = 5; r <= 8; r++) { px(3, r, color); px(12, r, color); }
    // hands (holding weapons)
    for (let r = 8; r <= 10; r++) { px(2, r, skin); px(13, r, skin); }
    // sword (right)
    for (let r = 7; r <= 13; r++) px(14, r, '#ccc');
    px(13, 7, '#aaa'); px(15, 8, '#888');
    // shield (left)
    for (let r = 5; r <= 10; r++) px(1, r, dark);
    px(0, 6, color); px(0, 7, color); px(0, 8, color);
    px(1, 11, dark);

    // legs
    for (let r = 10; r <= 13; r++) { px(5, r, dark);  px(6, r, dark);  }
    for (let r = 10; r <= 13; r++) { px(9, r, dark);  px(10, r, dark); }
    // boots
    for (let c = 4; c <= 7;  c++) px(c, 14, black);
    for (let c = 8; c <= 11; c++) px(c, 14, black);
    for (let c = 4; c <= 6;  c++) px(c, 15, black);
    for (let c = 9; c <= 11; c++) px(c, 15, black);
  }

  /**
   * Show a brief elimination animation on `canvas`.
   * @param {HTMLCanvasElement} canvas
   * @param {string} attackerColor
   * @param {string} defenderColor
   * @param {Function} callback  called when animation ends
   */
  static showEliminationAnimation(canvas, attackerColor, defenderColor, callback) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    // Work in CSS-pixel space so positions are independent of DPR.
    const W   = canvas.width  / dpr;
    const H   = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const words  = ['BONK!', 'ZAP!', 'BOOM!', 'POW!', 'WHAM!', 'KAPOW!'];
    const word   = words[Math.floor(Math.random() * words.length)];

    // Draw character sprites at full device resolution for sharpness.
    const atkCanvas = document.createElement('canvas');
    atkCanvas.width  = 64 * dpr; atkCanvas.height = 64 * dpr;
    PixelArt.drawCharacter(atkCanvas, attackerColor);

    const defCanvas = document.createElement('canvas');
    defCanvas.width  = 64 * dpr; defCanvas.height = 64 * dpr;
    PixelArt.drawCharacter(defCanvas, defenderColor);

    const TOTAL = 90;
    let frame = 0;

    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.fillRect(0, 0, W, H);

      const t = frame / TOTAL;

      // Attacker — left side, slight bounce
      const atkX = W / 2 - 110 + Math.sin(frame * 0.4) * 4;
      const atkY = H / 2 - 32;
      ctx.drawImage(atkCanvas, atkX, atkY, 64, 64);

      // Defender — flies off right + spins
      const defX = W / 2 + 46 + t * 260;
      const defY = H / 2 - 32 - t * t * 120;
      ctx.save();
      ctx.translate(defX + 32, defY + 32);
      ctx.rotate(t * Math.PI * 3);
      ctx.globalAlpha = Math.max(0, 1 - t * 1.6);
      ctx.drawImage(defCanvas, -32, -32, 64, 64);
      ctx.restore();
      ctx.globalAlpha = 1;

      // Effect word
      if (frame < TOTAL * 0.65) {
        const scale = frame < 12 ? frame / 12 : 1 - Math.max(0, frame - 40) * 0.012;
        ctx.save();
        ctx.translate(W / 2 - 10, H / 2 - 70);
        ctx.scale(scale * 2.4, scale * 2.4);
        ctx.font = 'bold 20px "Arial Black", Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.strokeText(word, 0, 0);
        ctx.fillStyle = '#ffe800';
        ctx.fillText(word, 0, 0);
        ctx.restore();
      }

      frame++;
      if (frame < TOTAL) {
        requestAnimationFrame(tick);
      } else {
        callback && callback();
      }
    };

    requestAnimationFrame(tick);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  static _darken(hex, amount) {
    return PixelArt._adjust(hex, -amount);
  }
  static _lighten(hex, amount) {
    return PixelArt._adjust(hex, amount);
  }
  static _adjust(hex, amount) {
    const h = hex.replace('#', '');
    const r = Math.min(255, Math.max(0, parseInt(h.slice(0,2),16) + amount));
    const g = Math.min(255, Math.max(0, parseInt(h.slice(2,4),16) + amount));
    const b = Math.min(255, Math.max(0, parseInt(h.slice(4,6),16) + amount));
    return `rgb(${r},${g},${b})`;
  }
}
