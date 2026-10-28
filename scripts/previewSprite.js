const fs = require("fs");
const path = require("path");
const Dragon = require("../media/dragon.js");
const { encodePng, hexToRgb } = require("./pngWriter.js");

const pixelScale = 10;
const backgroundColor = [90, 160, 78];
const poses = [
  { wing: 0, blink: false, look: 0, blush: true, mouth: 0 },
  { wing: 1, blink: false, look: 1, blush: false, mouth: 0 },
  { wing: 0.5, blink: true, look: 0, blush: false, mouth: 0 },
  { wing: 0.2, blink: false, look: -1, blush: true, mouth: 1 },
];

const imageWidth = Dragon.width * pixelScale * poses.length + (poses.length + 1) * pixelScale;
const imageHeight = Dragon.height * pixelScale + 2 * pixelScale;
const rgbaPixels = new Uint8Array(imageWidth * imageHeight * 4);

function paintPixel(pixelX, pixelY, color) {
  const offset = (pixelY * imageWidth + pixelX) * 4;
  rgbaPixels[offset] = color[0];
  rgbaPixels[offset + 1] = color[1];
  rgbaPixels[offset + 2] = color[2];
  rgbaPixels[offset + 3] = 255;
}

for (let pixelY = 0; pixelY < imageHeight; pixelY++) {
  for (let pixelX = 0; pixelX < imageWidth; pixelX++) {
    paintPixel(pixelX, pixelY, backgroundColor);
  }
}

const palette = Dragon.buildPalette("night");
poses.forEach((pose, poseIndex) => {
  const frame = Dragon.drawDragon(pose);
  const originX = pixelScale + poseIndex * (Dragon.width * pixelScale + pixelScale);
  const originY = pixelScale;
  for (let row = 0; row < Dragon.height; row++) {
    for (let column = 0; column < Dragon.width; column++) {
      const paletteIndex = frame.pixels[row * Dragon.width + column];
      if (!paletteIndex) {
        continue;
      }
      const color = hexToRgb(palette[paletteIndex]);
      for (let offsetY = 0; offsetY < pixelScale; offsetY++) {
        for (let offsetX = 0; offsetX < pixelScale; offsetX++) {
          paintPixel(originX + column * pixelScale + offsetX, originY + row * pixelScale + offsetY, color);
        }
      }
    }
  }
});

const outputPath = path.join(__dirname, "spritePreview.png");
fs.writeFileSync(outputPath, encodePng(imageWidth, imageHeight, rgbaPixels));
console.log("wrote", outputPath);
