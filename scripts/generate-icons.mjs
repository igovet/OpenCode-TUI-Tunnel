#!/usr/bin/env node
// scripts/generate-icons.mjs
// Creates PNG icons for PWA using pure Node.js (no external deps)

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

function createPNG(size, bgR, bgG, bgB) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  
  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const o = y * rowBytes + 1 + x * 3;
      raw[o] = bgR; raw[o+1] = bgG; raw[o+2] = bgB;
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

// Dark background: #0d1117 = rgb(13, 17, 23)
const [r, g, b] = [13, 17, 23];

writeFileSync('web/public/icons/icon-192.png', createPNG(192, r, g, b));
writeFileSync('web/public/icons/icon-512.png', createPNG(512, r, g, b));
writeFileSync('web/public/icons/icon-maskable-512.png', createPNG(512, r, g, b));
writeFileSync('web/public/apple-touch-icon.png', createPNG(180, r, g, b));

console.log('Icons generated.');
