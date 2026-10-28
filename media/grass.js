(function (globalScope) {
  "use strict";

  const grassColors = {
    base: [98, 160, 56],
    light: [114, 176, 64],
    dark: [84, 144, 48],
    bladeLight: [140, 200, 80],
    bladeDark: [64, 120, 40],
    petalWhite: [246, 246, 236],
    petalBlue: [126, 170, 244],
    petalPink: [244, 156, 196],
    flowerCenter: [250, 212, 84],
  };

  const tuftColors = [null, [38, 84, 30], [58, 112, 38], [92, 150, 52]];

  const tuftRows = [
    "....1......",
    ".1..13..1..",
    ".13.12.13.1",
    "..12.1212.1",
    "1.12121212.",
    ".122122321.",
    "..11222211.",
    "...111111..",
  ];

  function hash(positionX, positionY, seed) {
    let value =
      Math.imul(positionX | 0, 374761393) ^ Math.imul(positionY | 0, 668265263) ^ Math.imul(seed | 0, -2048144789);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }

  function valueNoise(positionX, positionY, cellSize, seed) {
    const cellX = Math.floor(positionX / cellSize);
    const cellY = Math.floor(positionY / cellSize);
    let fractionX = positionX / cellSize - cellX;
    let fractionY = positionY / cellSize - cellY;
    fractionX = fractionX * fractionX * (3 - 2 * fractionX);
    fractionY = fractionY * fractionY * (3 - 2 * fractionY);
    const topLeft = hash(cellX, cellY, seed);
    const topRight = hash(cellX + 1, cellY, seed);
    const bottomLeft = hash(cellX, cellY + 1, seed);
    const bottomRight = hash(cellX + 1, cellY + 1, seed);
    return (
      topLeft +
      (topRight - topLeft) * fractionX +
      (bottomLeft - topLeft) * fractionY +
      (topLeft - topRight - bottomLeft + bottomRight) * fractionX * fractionY
    );
  }

  function renderGrass(columns, rows, seed) {
    const fieldSeed = seed || 1;
    const pixels = new Uint8ClampedArray(columns * rows * 4);

    function paint(column, row, color) {
      if (column < 0 || row < 0 || column >= columns || row >= rows) {
        return;
      }
      const offset = (row * columns + column) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const noise = valueNoise(column, row, 16, fieldSeed) + (hash(column, row, fieldSeed + 1) - 0.5) * 0.16;
        let groundColor = grassColors.base;
        if (noise > 0.62) {
          groundColor = grassColors.light;
        } else if (noise < 0.36) {
          groundColor = grassColors.dark;
        }
        paint(column, row, groundColor);
      }
    }

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const chance = hash(column, row, fieldSeed + 2);
        if (chance < 0.016) {
          paint(column, row, grassColors.bladeLight);
          paint(column, row + 1, grassColors.bladeLight);
        } else if (chance < 0.034) {
          paint(column, row, grassColors.bladeDark);
          paint(column + 1, row + 1, grassColors.bladeDark);
          paint(column + 2, row, grassColors.bladeDark);
        }
      }
    }

    const tuftCellWidth = 26;
    const tuftCellHeight = 20;
    for (let cellRow = -1; cellRow * tuftCellHeight < rows; cellRow++) {
      for (let cellColumn = -1; cellColumn * tuftCellWidth < columns; cellColumn++) {
        if (hash(cellColumn, cellRow, fieldSeed + 3) > 0.42) {
          continue;
        }
        const tuftX =
          cellColumn * tuftCellWidth + Math.floor(hash(cellColumn, cellRow, fieldSeed + 4) * (tuftCellWidth - 6));
        const tuftY =
          cellRow * tuftCellHeight + Math.floor(hash(cellColumn, cellRow, fieldSeed + 5) * (tuftCellHeight - 4));
        tuftRows.forEach((tuftRow, rowOffset) => {
          [...tuftRow].forEach((symbol, columnOffset) => {
            if (symbol !== ".") {
              paint(tuftX + columnOffset, tuftY + rowOffset, tuftColors[Number(symbol)]);
            }
          });
        });
      }
    }

    const flowerCellWidth = 44;
    const flowerCellHeight = 32;
    for (let cellRow = 0; cellRow * flowerCellHeight < rows; cellRow++) {
      for (let cellColumn = 0; cellColumn * flowerCellWidth < columns; cellColumn++) {
        if (hash(cellColumn, cellRow, fieldSeed + 6) > 0.35) {
          continue;
        }
        const flowerX =
          cellColumn * flowerCellWidth +
          2 +
          Math.floor(hash(cellColumn, cellRow, fieldSeed + 7) * (flowerCellWidth - 4));
        const flowerY =
          cellRow * flowerCellHeight +
          2 +
          Math.floor(hash(cellColumn, cellRow, fieldSeed + 8) * (flowerCellHeight - 4));
        const petalChance = hash(cellColumn, cellRow, fieldSeed + 9);
        let petalColor = grassColors.petalPink;
        if (petalChance < 0.45) {
          petalColor = grassColors.petalWhite;
        } else if (petalChance < 0.8) {
          petalColor = grassColors.petalBlue;
        }
        paint(flowerX, flowerY - 1, petalColor);
        paint(flowerX - 1, flowerY, petalColor);
        paint(flowerX + 1, flowerY, petalColor);
        paint(flowerX, flowerY + 1, petalColor);
        paint(flowerX, flowerY, grassColors.flowerCenter);
        paint(flowerX + 1, flowerY + 2, tuftColors[2]);
      }
    }

    return pixels;
  }

  const grassApi = { renderGrass: renderGrass };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = grassApi;
  } else {
    globalScope.Grass = grassApi;
  }
})(typeof window !== "undefined" ? window : this);
