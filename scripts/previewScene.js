const fs = require("fs");
const path = require("path");
const Dragon = require("../media/dragon.js");
const Grass = require("../media/grass.js");
const { encodePng, hexToRgb } = require("./pngWriter.js");

const pixelScale = 2;
const columns = 170;
const rows = 96;
const shadowColor = [20, 50, 10];
const shadowOpacity = 0.32;

const artPixels = Grass.renderGrass(columns, rows, 7);

function blendArtPixel(column, row, color, opacity) {
  if (column < 0 || row < 0 || column >= columns || row >= rows) {
    return;
  }
  const offset = (row * columns + column) * 4;
  const strength = opacity === undefined ? 1 : opacity;
  for (let channel = 0; channel < 3; channel++) {
    artPixels[offset + channel] = artPixels[offset + channel] * (1 - strength) + color[channel] * strength;
  }
}

const dragons = [
  { positionX: 30, positionY: 60, color: "night", pose: { look: -1, wing: 0.2, blush: true } },
  { positionX: 120, positionY: 52, color: "crimson", pose: { look: 1, wing: 0.6 } },
  { positionX: 76, positionY: 90, color: "night", pose: { look: 0, wing: 0.1, blink: true } },
].sort((first, second) => first.positionY - second.positionY);

dragons.forEach((dragon) => {
  for (let rowOffset = -3; rowOffset <= 3; rowOffset++) {
    const halfWidth = Math.round(13 * Math.sqrt(1 - (rowOffset * rowOffset) / 12.25));
    for (let columnOffset = -halfWidth; columnOffset <= halfWidth; columnOffset++) {
      blendArtPixel(dragon.positionX + columnOffset, dragon.positionY - 1 + rowOffset, shadowColor, shadowOpacity);
    }
  }
  const palette = Dragon.buildPalette(dragon.color);
  const frame = Dragon.drawDragon(dragon.pose);
  const spriteX = dragon.positionX - Dragon.width / 2;
  const spriteY = dragon.positionY - (Dragon.height - 1);
  for (let row = 0; row < Dragon.height; row++) {
    for (let column = 0; column < Dragon.width; column++) {
      const paletteIndex = frame.pixels[row * Dragon.width + column];
      if (paletteIndex) {
        blendArtPixel(spriteX + column, spriteY + row, hexToRgb(palette[paletteIndex]));
      }
    }
  }
});

const imageWidth = columns * pixelScale;
const imageHeight = rows * pixelScale;
const rgbaPixels = new Uint8Array(imageWidth * imageHeight * 4);
for (let pixelY = 0; pixelY < imageHeight; pixelY++) {
  for (let pixelX = 0; pixelX < imageWidth; pixelX++) {
    const sourceOffset = (Math.floor(pixelY / pixelScale) * columns + Math.floor(pixelX / pixelScale)) * 4;
    const targetOffset = (pixelY * imageWidth + pixelX) * 4;
    rgbaPixels[targetOffset] = artPixels[sourceOffset];
    rgbaPixels[targetOffset + 1] = artPixels[sourceOffset + 1];
    rgbaPixels[targetOffset + 2] = artPixels[sourceOffset + 2];
    rgbaPixels[targetOffset + 3] = 255;
  }
}

const outputPath = path.join(__dirname, "scenePreview.png");
fs.writeFileSync(outputPath, encodePng(imageWidth, imageHeight, rgbaPixels));
console.log("wrote", outputPath);
