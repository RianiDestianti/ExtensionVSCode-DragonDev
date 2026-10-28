const fs = require("fs");
const path = require("path");
const Dragon = require("../media/dragon.js");
const { encodePng, hexToRgb } = require("./pngWriter.js");

const iconSize = 128;
const gradientTop = [150, 210, 120];
const gradientBottom = [74, 138, 72];

const frame = Dragon.drawDragon({ wing: 0.2, blink: false, look: 0, blush: true, mouth: 0 });
const palette = Dragon.buildPalette("night");
const spriteScale = Math.floor((iconSize * 0.82) / Dragon.height);
const offsetX = Math.floor((iconSize - Dragon.width * spriteScale) / 2);
const offsetY = Math.floor((iconSize - Dragon.height * spriteScale) / 2) + 4;

const rgbaPixels = new Uint8Array(iconSize * iconSize * 4);
for (let pixelY = 0; pixelY < iconSize; pixelY++) {
  const progress = pixelY / iconSize;
  const backgroundColor = gradientTop.map((channel, channelIndex) =>
    Math.round(channel + (gradientBottom[channelIndex] - channel) * progress)
  );
  for (let pixelX = 0; pixelX < iconSize; pixelX++) {
    let color = backgroundColor;
    const spriteColumn = Math.floor((pixelX - offsetX) / spriteScale);
    const spriteRow = Math.floor((pixelY - offsetY) / spriteScale);
    const isInsideSprite =
      spriteColumn >= 0 && spriteRow >= 0 && spriteColumn < Dragon.width && spriteRow < Dragon.height;
    if (isInsideSprite) {
      const paletteIndex = frame.pixels[spriteRow * Dragon.width + spriteColumn];
      if (paletteIndex) {
        color = hexToRgb(palette[paletteIndex]);
      }
    }
    const offset = (pixelY * iconSize + pixelX) * 4;
    rgbaPixels[offset] = color[0];
    rgbaPixels[offset + 1] = color[1];
    rgbaPixels[offset + 2] = color[2];
    rgbaPixels[offset + 3] = 255;
  }
}

const outputPath = path.join(__dirname, "..", "media", "icon.png");
const pngBuffer = encodePng(iconSize, iconSize, rgbaPixels);
fs.writeFileSync(outputPath, pngBuffer);
console.log("wrote", outputPath, pngBuffer.length, "bytes");
