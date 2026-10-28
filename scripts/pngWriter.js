const zlib = require("zlib");

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function hexToRgb(hexColor) {
  return [parseInt(hexColor.slice(1, 3), 16), parseInt(hexColor.slice(3, 5), 16), parseInt(hexColor.slice(5, 7), 16)];
}

function crc32(buffer) {
  let checksum = ~0;
  for (let index = 0; index < buffer.length; index++) {
    checksum ^= buffer[index];
    for (let bit = 0; bit < 8; bit++) {
      checksum = checksum & 1 ? (checksum >>> 1) ^ 0xedb88320 : checksum >>> 1;
    }
  }
  return ~checksum;
}

function createChunk(chunkType, chunkData) {
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(chunkData.length, 0);
  const typeBuffer = Buffer.from(chunkType, "ascii");
  const checksumBuffer = Buffer.alloc(4);
  checksumBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, chunkData])) >>> 0, 0);
  return Buffer.concat([lengthBuffer, typeBuffer, chunkData, checksumBuffer]);
}

function encodePng(width, height, rgbaPixels) {
  const rowLength = width * 4 + 1;
  const scanlines = Buffer.alloc(height * rowLength);
  for (let row = 0; row < height; row++) {
    scanlines[row * rowLength] = 0;
    for (let byteIndex = 0; byteIndex < width * 4; byteIndex++) {
      scanlines[row * rowLength + 1 + byteIndex] = rgbaPixels[row * width * 4 + byteIndex];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    pngSignature,
    createChunk("IHDR", header),
    createChunk("IDAT", zlib.deflateSync(scanlines)),
    createChunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { encodePng, hexToRgb };
