#!/usr/bin/env node
// scripts/generate-icons.mjs
// Creates PNG icons for PWA with T logomark + blue→cyan→green gradient
// Pure Node.js (no external deps)

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Color helpers
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// Gradient colors: #58a6ff (blue) -> #39d0d8 (cyan) -> #39d353 (green)
const blue = hexToRgb('#58a6ff');
const cyan = hexToRgb('#39d0d8');
const green = hexToRgb('#39d353');

function gradientColor(t) {
  // t: 0 = top-left (blue), 0.5 = center (cyan), 1 = bottom-right (green)
  let r, g, b;
  if (t <= 0.5) {
    const f = t * 2;
    r = lerp(blue[0], cyan[0], f);
    g = lerp(blue[1], cyan[1], f);
    b = lerp(blue[2], cyan[2], f);
  } else {
    const f = (t - 0.5) * 2;
    r = lerp(cyan[0], green[0], f);
    g = lerp(cyan[1], green[1], f);
    b = lerp(cyan[2], green[2], f);
  }
  return [r, g, b];
}

// Background gradient: #05060a -> #0b0e13 (top to bottom)
const bgTop = hexToRgb('#05060a');
const bgBottom = hexToRgb('#0b0e13');

function bgColor(y, size) {
  const t = y / (size - 1);
  return [lerp(bgTop[0], bgBottom[0], t), lerp(bgTop[1], bgBottom[1], t), lerp(bgTop[2], bgBottom[2], t)];
}

// Signed distance to a rectangle (for anti-aliased edges)
function rectSDF(px, py, cx, cy, hw, hh) {
  const dx = Math.max(Math.abs(px - cx) - hw, 0);
  const dy = Math.max(Math.abs(py - cy) - hh, 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function createPNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const scale = size / 512;
  const cx = size / 2;

  // T logomark dimensions (at 512 scale):
  // Horizontal bar: centered at (256, 200), half-width 100, half-height 28
  // Vertical stem: centered at (256, 308), half-width 28, half-height 80
  // Both fit within the 40% center safe-zone for maskable icons
  const barHW = 100 * scale;
  const barHH = 28 * scale;
  const barCY = 200 * scale;

  const stemHW = 28 * scale;
  const stemHH = 80 * scale;
  const stemCY = 308 * scale;

  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(size * rowBytes);

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const o = y * rowBytes + 1 + x * 4;

      // Background color (subtle vertical gradient)
      const [bgR, bgG, bgB] = bgColor(y, size);

      // Distance to T shape (union of horizontal bar and vertical stem)
      const dBar = rectSDF(x, y, cx, barCY, barHW, barHH);
      const dStem = rectSDF(x, y, cx, stemCY, stemHW, stemHH);
      const dT = Math.min(dBar, dStem);

      // Gradient position along the 135-degree diagonal
      const t = (x + y) / (2 * (size - 1));
      const [fgR, fgG, fgB] = gradientColor(Math.max(0, Math.min(1, t)));

      if (dT <= 0) {
        // Inside the T — solid gradient color
        raw[o] = fgR;
        raw[o + 1] = fgG;
        raw[o + 2] = fgB;
        raw[o + 3] = 255;
      } else if (dT < 1.5) {
        // Anti-aliased edge — blend gradient with background
        const alpha = Math.max(0, 1 - dT / 1.5);
        raw[o] = lerp(bgR, fgR, alpha);
        raw[o + 1] = lerp(bgG, fgG, alpha);
        raw[o + 2] = lerp(bgB, fgB, alpha);
        raw[o + 3] = 255;
      } else {
        // Background
        raw[o] = bgR;
        raw[o + 1] = bgG;
        raw[o + 2] = bgB;
        raw[o + 3] = 255;
      }
    }
  }

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('web/public/icons', { recursive: true });

writeFileSync('web/public/icons/icon-192.png', createPNG(192));
writeFileSync('web/public/icons/icon-512.png', createPNG(512));
writeFileSync('web/public/icons/icon-maskable-192.png', createPNG(192));
writeFileSync('web/public/icons/icon-maskable-512.png', createPNG(512));
writeFileSync('web/public/apple-touch-icon.png', createPNG(180));

console.log('Icons generated with T logomark (blue->cyan->green gradient).');
