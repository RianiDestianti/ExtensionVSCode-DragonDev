// Generates media/icon.png (128x128) using the shared dragon sprite,
// centered on a grassy gradient. No dependencies.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const Dragon = require("../media/dragon.js");

const SIZE = 128;
const { W, H, g } = Dragon.draw({ wing: 0.2, blink: false, look: 0, blush: true, mouth: 0 });
const S = Math.floor((SIZE * 0.82) / H); // sprite scale
const ox = Math.floor((SIZE - W * S) / 2);
const oy = Math.floor((SIZE - H * S) / 2) + 4;

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0;
  for (let x = 0; x < SIZE; x++) {
    // grassy gradient background
    const t = y / SIZE;
    let r = Math.round(150 + (74 - 150) * t);
    let gg = Math.round(210 + (138 - 210) * t);
    let b = Math.round(120 + (72 - 120) * t);
    // sprite overlay
    const sx = Math.floor((x - ox) / S);
    const sy = Math.floor((y - oy) / S);
    if (sx >= 0 && sy >= 0 && sx < W && sy < H) {
      const ci = g[sy * W + sx];
      if (ci) {
        const c = hex(Dragon.PAL[ci]);
        r = c[0]; gg = c[1]; b = c[2];
      }
    }
    raw[p++] = r; raw[p++] = gg; raw[p++] = b; raw[p++] = 255;
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const out = path.join(__dirname, "..", "media", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
