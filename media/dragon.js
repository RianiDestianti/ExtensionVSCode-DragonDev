(function (globalScope) {
  "use strict";

  const spriteWidth = 40;
  const spriteHeight = 38;

  const colorIndex = {
    transparent: 0,
    outline: 1,
    body: 2,
    bodyShade: 3,
    bodyHighlight: 4,
    innerEar: 5,
    deepShade: 6,
    claw: 7,
    clawShade: 8,
    iris: 9,
    pupil: 10,
    wingRib: 11,
    wingMembrane: 12,
    mouth: 13,
    blush: 14,
    eyeShine: 15,
  };

  const basePalette = [
    null,
    "#121216",
    "#6b6e76",
    "#55585f",
    "#7f828a",
    "#34353b",
    "#45474d",
    "#9be81c",
    "#6fb312",
    "#a8f020",
    "#0c0c0f",
    "#45474e",
    "#5c5f67",
    "#1e1f24",
    "#ff9db0",
    "#f2f2f2",
  ];

  const themes = {
    night: ["#6b6e76", "#55585f", "#7f828a", "#45474e", "#5c5f67"],
    emerald: ["#4fbf72", "#37985a", "#6fd68e", "#2c7a47", "#3fa863"],
    crimson: ["#d9584c", "#b03a30", "#ef7a6e", "#862a22", "#c0463b"],
    sapphire: ["#4a7bd6", "#3459a8", "#6d98ea", "#253f7a", "#3d68bd"],
    amethyst: ["#9460cc", "#7043a6", "#ad80e3", "#512f7a", "#8050b8"],
    gold: ["#ddb03e", "#b58a24", "#f0cb66", "#85651a", "#c99a2e"],
  };

  const neighborOffsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  function createGrid() {
    return new Uint8Array(spriteWidth * spriteHeight);
  }

  function mirrorX(positionX) {
    return spriteWidth - positionX;
  }

  function setPixel(grid, positionX, positionY, color) {
    const column = Math.round(positionX);
    const row = Math.round(positionY);
    if (column < 0 || row < 0 || column >= spriteWidth || row >= spriteHeight) {
      return;
    }
    grid[row * spriteWidth + column] = color;
  }

  function fillEllipse(grid, centerX, centerY, radiusX, radiusY, color) {
    for (let row = Math.floor(centerY - radiusY); row <= Math.ceil(centerY + radiusY); row++) {
      for (let column = Math.floor(centerX - radiusX); column <= Math.ceil(centerX + radiusX); column++) {
        const distanceX = (column - centerX) / radiusX;
        const distanceY = (row - centerY) / radiusY;
        if (distanceX * distanceX + distanceY * distanceY <= 1) {
          setPixel(grid, column, row, color);
        }
      }
    }
  }

  function fillMirroredEllipse(grid, centerX, centerY, radiusX, radiusY, color) {
    fillEllipse(grid, centerX, centerY, radiusX, radiusY, color);
    fillEllipse(grid, mirrorX(centerX), centerY, radiusX, radiusY, color);
  }

  function fillPolygon(grid, points, color) {
    const pointRows = points.map((point) => point[1]);
    const topRow = Math.floor(Math.min(...pointRows));
    const bottomRow = Math.ceil(Math.max(...pointRows));
    for (let row = topRow; row <= bottomRow; row++) {
      for (let column = 0; column < spriteWidth; column++) {
        let isInside = false;
        for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
          const [currentX, currentY] = points[current];
          const [previousX, previousY] = points[previous];
          const crossesRow = currentY > row !== previousY > row;
          if (crossesRow) {
            const edgeX = ((previousX - currentX) * (row - currentY)) / (previousY - currentY) + currentX;
            if (column < edgeX) {
              isInside = !isInside;
            }
          }
        }
        if (isInside) {
          setPixel(grid, column, row, color);
        }
      }
    }
  }

  function drawLine(grid, startPoint, endPoint, color) {
    const [startX, startY] = startPoint;
    const [endX, endY] = endPoint;
    const stepCount = Math.max(Math.abs(endX - startX), Math.abs(endY - startY)) || 1;
    for (let step = 0; step <= stepCount; step++) {
      const progress = step / stepCount;
      setPixel(grid, startX + (endX - startX) * progress, startY + (endY - startY) * progress, color);
    }
  }

  function stampLayer(targetGrid, layerGrid) {
    for (let index = 0; index < targetGrid.length; index++) {
      if (layerGrid[index]) {
        targetGrid[index] = layerGrid[index];
      }
    }
  }

  function addOutline(grid) {
    const source = grid.slice();
    for (let row = 0; row < spriteHeight; row++) {
      for (let column = 0; column < spriteWidth; column++) {
        if (source[row * spriteWidth + column] !== colorIndex.transparent) {
          continue;
        }
        const touchesShape = neighborOffsets.some(([offsetX, offsetY]) => {
          const neighborColumn = column + offsetX;
          const neighborRow = row + offsetY;
          if (neighborColumn < 0 || neighborRow < 0 || neighborColumn >= spriteWidth || neighborRow >= spriteHeight) {
            return false;
          }
          const neighborColor = source[neighborRow * spriteWidth + neighborColumn];
          return neighborColor !== colorIndex.transparent && neighborColor !== colorIndex.outline;
        });
        if (touchesShape) {
          grid[row * spriteWidth + column] = colorIndex.outline;
        }
      }
    }
  }

  function drawWing(grid, wingLift, isMirrored) {
    const place = ([pointX, pointY]) => [isMirrored ? mirrorX(pointX) : pointX, pointY];
    const tipY = 23 - wingLift * 9;
    const membranePoints = [
      [13, 25],
      [7, tipY + 1.5],
      [1.5, tipY],
      [2, tipY + 2.5],
      [3, 32 - wingLift * 3],
      [6, 30.5 - wingLift * 2],
      [9, 32.5 - wingLift * 1.5],
      [13, 31],
    ].map(place);
    fillPolygon(grid, membranePoints, colorIndex.wingMembrane);

    const shoulder = place([13, 26]);
    const wingTip = place([2, tipY + 1]);
    const elbow = place([7.5, tipY + 2.5]);
    const outerRibEnd = place([3.2, 31 - wingLift * 3]);
    const innerRibEnd = place([6.5, 30 - wingLift * 2]);
    drawLine(grid, shoulder, wingTip, colorIndex.wingRib);
    drawLine(grid, elbow, outerRibEnd, colorIndex.wingRib);
    drawLine(grid, elbow, innerRibEnd, colorIndex.wingRib);
  }

  function drawEar(grid, isMirrored) {
    const placeX = (positionX) => (isMirrored ? mirrorX(positionX) : positionX);
    fillEllipse(grid, placeX(11.8), 8, 2.7, 3.8, colorIndex.body);
    fillEllipse(grid, placeX(10.6), 4.4, 1.9, 3.2, colorIndex.body);
    fillEllipse(grid, placeX(9.6), 1.6, 1.1, 1.7, colorIndex.body);
    fillEllipse(grid, placeX(11), 5.6, 0.8, 2.6, colorIndex.innerEar);
  }

  function drawBody(grid, centerX) {
    fillMirroredEllipse(grid, 11.5, 33.5, 3.5, 2.6, colorIndex.bodyShade);
    fillMirroredEllipse(grid, 11.5, 33, 2.8, 2, colorIndex.body);
    fillEllipse(grid, centerX, 28, 8.5, 8.5, colorIndex.bodyShade);
    fillEllipse(grid, centerX - 0.5, 27.5, 7.8, 8, colorIndex.body);
    fillMirroredEllipse(grid, 16, 32, 3.2, 5, colorIndex.body);
    drawLine(grid, [centerX, 30], [centerX, 36], colorIndex.bodyShade);
    drawLine(grid, [13, 31], [13.5, 35], colorIndex.bodyShade);
    drawLine(grid, [mirrorX(13), 31], [mirrorX(13.5), 35], colorIndex.bodyShade);

    const clawColumns = [9.5, 11.5, 14.5, 16.5, 18.5];
    clawColumns.forEach((clawX, clawPosition) => {
      setPixel(grid, clawX, 36, colorIndex.claw);
      setPixel(grid, mirrorX(clawX), 36, colorIndex.claw);
      if (clawPosition < 2) {
        setPixel(grid, clawX, 35, colorIndex.claw);
        setPixel(grid, mirrorX(clawX), 35, colorIndex.claw);
      }
    });
  }

  function drawHead(grid, centerX) {
    drawEar(grid, false);
    drawEar(grid, true);
    fillMirroredEllipse(grid, 16.5, 5.5, 1.3, 2, colorIndex.body);
    fillMirroredEllipse(grid, 5.5, 13, 3, 1.4, colorIndex.body);
    fillMirroredEllipse(grid, 6.2, 16.6, 2.6, 1.3, colorIndex.body);
    fillEllipse(grid, centerX, 14, 12, 8.8, colorIndex.bodyShade);
    fillEllipse(grid, centerX - 0.5, 13.5, 11.6, 8.4, colorIndex.body);
    fillEllipse(grid, centerX - 4, 10, 3.8, 2, colorIndex.bodyHighlight);
    setPixel(grid, 7.5, 13.5, colorIndex.bodyShade);
    setPixel(grid, mirrorX(7.5), 13.5, colorIndex.bodyShade);
  }

  function drawEyes(grid, isBlinking, glance) {
    const eyeCenters = [13.5, mirrorX(13.5)];
    if (isBlinking) {
      for (let offset = -3; offset <= 3; offset++) {
        const rowLift = Math.abs(offset) === 3 ? -1 : 0;
        eyeCenters.forEach((eyeX) => setPixel(grid, eyeX + offset, 15 + rowLift, colorIndex.outline));
      }
      return;
    }
    eyeCenters.forEach((eyeX) => fillEllipse(grid, eyeX, 14.3, 4.2, 4.2, colorIndex.iris));
    const pupilCenters = [14.5 + glance, 25.5 + glance];
    pupilCenters.forEach((pupilX) => {
      fillEllipse(grid, pupilX, 15, 2.4, 3.2, colorIndex.pupil);
      setPixel(grid, pupilX - 1, 13.5, colorIndex.eyeShine);
      setPixel(grid, pupilX, 13.5, colorIndex.eyeShine);
      setPixel(grid, pupilX - 1, 14.5, colorIndex.eyeShine);
      setPixel(grid, pupilX + 1, 17, colorIndex.eyeShine);
    });
  }

  function drawMouth(grid, centerX, mouthOpen) {
    setPixel(grid, centerX - 1.5, 18.5, colorIndex.mouth);
    setPixel(grid, centerX + 1.5, 18.5, colorIndex.mouth);
    if (mouthOpen > 0.2) {
      fillEllipse(grid, centerX, 20 + mouthOpen, 2.5 + mouthOpen, 0.6 + mouthOpen * 1.2, colorIndex.mouth);
      fillEllipse(grid, centerX, 20.6 + mouthOpen * 1.2, 1.5, mouthOpen * 0.8, colorIndex.blush);
      return;
    }
    const smilePoints = [
      [-2, 19.6],
      [-1, 20.2],
      [0, 20.2],
      [1, 20.2],
      [2, 19.6],
    ];
    smilePoints.forEach(([offsetX, positionY]) => {
      setPixel(grid, centerX + offsetX, positionY, colorIndex.mouth);
    });
  }

  function drawDragon(pose) {
    const settings = pose || {};
    const wingLift = settings.wing || 0;
    const centerX = spriteWidth / 2;
    const pixels = createGrid();

    const wingLayer = createGrid();
    drawWing(wingLayer, wingLift, false);
    drawWing(wingLayer, wingLift, true);
    addOutline(wingLayer);
    stampLayer(pixels, wingLayer);

    const bodyLayer = createGrid();
    drawBody(bodyLayer, centerX);
    addOutline(bodyLayer);
    stampLayer(pixels, bodyLayer);

    const headLayer = createGrid();
    drawHead(headLayer, centerX);
    drawEyes(headLayer, Boolean(settings.blink), settings.look || 0);
    drawMouth(headLayer, centerX, settings.mouth || 0);
    if (settings.blush) {
      fillMirroredEllipse(headLayer, 9.5, 19, 1.8, 0.9, colorIndex.blush);
    }
    addOutline(headLayer);
    stampLayer(pixels, headLayer);

    return { width: spriteWidth, height: spriteHeight, pixels: pixels };
  }

  function shiftColor(hexColor, amount) {
    let shiftedColor = "#";
    for (let offset = 1; offset < 7; offset += 2) {
      const channel = parseInt(hexColor.slice(offset, offset + 2), 16);
      const shiftedChannel = amount > 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
      shiftedColor += ("0" + Math.round(shiftedChannel).toString(16)).slice(-2);
    }
    return shiftedColor;
  }

  function resolveTheme(color) {
    if (themes[color]) {
      return themes[color];
    }
    if (/^#[0-9a-f]{6}$/i.test(color || "")) {
      return [
        color,
        shiftColor(color, -0.2),
        shiftColor(color, 0.15),
        shiftColor(color, -0.38),
        shiftColor(color, -0.12),
      ];
    }
    return themes.night;
  }

  function buildPalette(color) {
    const [body, bodyShade, bodyHighlight, wingRib, wingMembrane] = resolveTheme(color);
    const palette = basePalette.slice();
    palette[colorIndex.body] = body;
    palette[colorIndex.bodyShade] = bodyShade;
    palette[colorIndex.bodyHighlight] = bodyHighlight;
    palette[colorIndex.wingRib] = wingRib;
    palette[colorIndex.wingMembrane] = wingMembrane;
    return palette;
  }

  const dragonApi = {
    drawDragon: drawDragon,
    buildPalette: buildPalette,
    resolveTheme: resolveTheme,
    themes: themes,
    basePalette: basePalette,
    width: spriteWidth,
    height: spriteHeight,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = dragonApi;
  } else {
    globalScope.Dragon = dragonApi;
  }
})(typeof window !== "undefined" ? window : this);
