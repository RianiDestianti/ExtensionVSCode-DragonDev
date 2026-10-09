// Renders the dragon sprite to a big PNG so we can eyeball it.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const Dragon = require("../media/dragon.js");

const SCALE = 10;
const frames = [
  { wing: 0.0, blink: false, look: 0, blush: true, mouth: 0 },
  { wing: 1.0, blink: false, look: 1, blush: false, mouth: 0 },
  { wing: 0.5, blink: true, look: 0, blush: false, mouth: 0 },
  { wing: 0.2, blink: false, look: -1, blush: true, mouth: 1 },
];

const W = Dragon.W,
  H = Dragon.H;
const cols = frames.length;
const IW = W * SCALE * cols + (cols + 1) * SCALE;
const IH = H * SCALE + 2 * SCALE;

function hexToRgb(h) {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

const img = Buffer.alloc(IH * (IW * 4 + 1));
// fill background checker-ish grass color
for (let y = 0; y < IH; y++) {
  img[y * (IW * 4 + 1)] = 0;
  for (let x = 0; x < IW; x++) {
    const o = y * (IW * 4 + 1) + 1 + x * 4;
    img[o] = 90;
    img[o + 1] = 160;
    img[o + 2] = 78;
    img[o + 3] = 255;
  }
}

function blit(frame, fx) {
  const { g } = Dragon.draw(frame);
  const ox = SCALE + fx * (W * SCALE + SCALE);
  const oy = SCALE;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ci = g[y * W + x];
      if (!ci) continue;
      const [r, gr, b] = hexToRgb(Dragon.PAL[ci]);
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const px = ox + x * SCALE + sx;
          const py = oy + y * SCALE + sy;
          const o = py * (IW * 4 + 1) + 1 + px * 4;
          img[o] = r;
          img[o + 1] = gr;
          img[o + 2] = b;
          img[o + 3] = 255;
        }
      }
    }
  }
}

frames.forEach((f, i) => blit(f, i));

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
ihdr.writeUInt32BE(IW, 0);
ihdr.writeUInt32BE(IH, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(img)),
  chunk("IEND", Buffer.alloc(0)),
]);
const out = path.join(__dirname, "preview.png");
fs.writeFileSync(out, png);
console.log("wrote", out);
