// Generates solid-color PNG icons for the Chrome extension.
// Run: node extension/generate-icons.js
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  table[i] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeB = Buffer.from(type, "ascii");
  const lenB = Buffer.alloc(4); lenB.writeUInt32BE(data.length);
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([lenB, typeB, data, crcB]);
}

function solidPNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB truecolor

  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(size * rowLen);
  for (let y = 0; y < size; y++) {
    const base = y * rowLen;
    raw[base] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      raw[base + 1 + x * 3] = r;
      raw[base + 1 + x * 3 + 1] = g;
      raw[base + 1 + x * 3 + 2] = b;
    }
  }

  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", zlib.deflateSync(raw)),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = path.join(__dirname, "icons");
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

// #4f46e5 — indigo-600
const [r, g, b] = [0x4f, 0x46, 0xe5];
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(dir, `icon${size}.png`), solidPNG(size, r, g, b));
  console.log(`Created icons/icon${size}.png`);
}
