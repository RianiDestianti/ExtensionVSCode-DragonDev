(function () {
  "use strict";

  const vscodeApi = acquireVsCodeApi();
  const sceneCanvas = document.getElementById("scene");
  const sceneContext = sceneCanvas.getContext("2d");
  const nameLabel = document.getElementById("label");
  const emptyMessage = document.getElementById("empty");
  const spriteWidth = Dragon.width;
  const spriteHeight = Dragon.height;
  const shadowColor = "rgba(20, 50, 10, 0.32)";

  const pixelSprites = {
    heart: {
      rows: [".1.1.", "11111", "11111", ".111.", "..1.."],
      colors: [null, "#ff5d7a"],
    },
    star: {
      rows: [".1.", "121", ".1."],
      colors: [null, "#ffd84a", "#fff6c4"],
    },
    puff: {
      rows: [".1.", "111", ".1."],
      colors: [null, "#f4f4ec"],
    },
    sleepLetter: {
      rows: ["1111", "..1.", ".1..", "1111"],
      colors: [null, "#ffffff"],
    },
    meat: {
      rows: [".1111...", "122221..", "122321..", "122221..", ".111144.", ".....444", "......4."],
      colors: [null, "#6b2f1a", "#d0603f", "#f08a62", "#f4ead5"],
    },
  };

  const paletteCache = {};

  let canvasWidth = 1;
  let canvasHeight = 1;
  let pixelSize = 2;
  let columns = 1;
  let rows = 1;
  let pixelRatio = 1;
  let dragons = [];
  let particles = [];
  let food = null;
  let pendingFoodPoint = null;
  let isSleepy = false;
  let isHappy = false;
  let hoveredDragon = null;
  let lastFrameTime = performance.now();

  const grassCanvas = document.createElement("canvas");
  const grassContext = grassCanvas.getContext("2d");

  function hexToRgb(hexColor) {
    return [parseInt(hexColor.slice(1, 3), 16), parseInt(hexColor.slice(3, 5), 16), parseInt(hexColor.slice(5, 7), 16)];
  }

  function getRgbPalette(color) {
    if (!paletteCache[color]) {
      paletteCache[color] = Dragon.buildPalette(color).map((hexColor) => (hexColor ? hexToRgb(hexColor) : null));
    }
    return paletteCache[color];
  }

  function drawPixelSprite(sprite, positionX, positionY) {
    const startX = Math.round(positionX);
    const startY = Math.round(positionY);
    sprite.rows.forEach((spriteRow, rowOffset) => {
      [...spriteRow].forEach((symbol, columnOffset) => {
        if (symbol === ".") {
          return;
        }
        sceneContext.fillStyle = sprite.colors[Number(symbol)];
        sceneContext.fillRect(
          (startX + columnOffset) * pixelSize,
          (startY + rowOffset) * pixelSize,
          pixelSize,
          pixelSize
        );
      });
    });
  }

  function fillPixelEllipse(centerX, centerY, radiusX, radiusY) {
    for (let rowOffset = -radiusY; rowOffset <= radiusY; rowOffset++) {
      const edge = (radiusY + 0.5) * (radiusY + 0.5);
      const halfWidth = Math.round(radiusX * Math.sqrt(Math.max(0, 1 - (rowOffset * rowOffset) / edge)));
      if (halfWidth <= 0) {
        continue;
      }
      sceneContext.fillRect(
        (centerX - halfWidth) * pixelSize,
        (centerY + rowOffset) * pixelSize,
        (2 * halfWidth + 1) * pixelSize,
        pixelSize
      );
    }
  }

  function clampColumn(positionX) {
    const lowest = spriteWidth / 2;
    const highest = columns - spriteWidth / 2;
    return highest < lowest ? columns / 2 : Math.max(lowest, Math.min(highest, positionX));
  }

  function clampRow(positionY) {
    const lowest = spriteHeight + 1;
    const highest = rows - 2;
    return highest < lowest ? rows - 2 : Math.max(lowest, Math.min(highest, positionY));
  }

  function randomPoint() {
    return {
      positionX: clampColumn(spriteWidth / 2 + Math.random() * (columns - spriteWidth)),
      positionY: clampRow(spriteHeight + 1 + Math.random() * (rows - spriteHeight - 3)),
    };
  }

  function resizeScene() {
    pixelRatio = window.devicePixelRatio || 1;
    canvasWidth = Math.max(1, Math.round(sceneCanvas.clientWidth * pixelRatio));
    canvasHeight = Math.max(1, Math.round(sceneCanvas.clientHeight * pixelRatio));
    sceneCanvas.width = canvasWidth;
    sceneCanvas.height = canvasHeight;

    const fittedSize = Math.round(Math.min((canvasHeight * 0.34) / spriteHeight, (canvasWidth * 0.3) / spriteWidth));
    pixelSize = Math.max(1, Math.min(Math.round(3 * pixelRatio), fittedSize));
    columns = Math.ceil(canvasWidth / pixelSize);
    rows = Math.ceil(canvasHeight / pixelSize);

    grassCanvas.width = columns;
    grassCanvas.height = rows;
    const grassImage = grassContext.createImageData(columns, rows);
    grassImage.data.set(Grass.renderGrass(columns, rows, 7));
    grassContext.putImageData(grassImage, 0, 0);

    dragons.forEach((dragon) => {
      dragon.positionX = dragon.targetX = clampColumn(dragon.positionX);
      dragon.positionY = dragon.targetY = clampRow(dragon.positionY);
    });
    if (food) {
      food.positionX = Math.min(food.positionX, columns - 6);
      food.positionY = clampRow(food.positionY);
    }
  }

  function createDragon(dragonInfo) {
    const startPoint = randomPoint();
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteWidth;
    spriteCanvas.height = spriteHeight;
    const spriteContext = spriteCanvas.getContext("2d");
    return {
      id: dragonInfo.id,
      name: dragonInfo.name,
      color: dragonInfo.color,
      positionX: startPoint.positionX,
      positionY: startPoint.positionY,
      targetX: startPoint.positionX,
      targetY: startPoint.positionY,
      mode: "idle",
      idleTimer: 0.5 + Math.random() * 2,
      facing: Math.random() < 0.5 ? -1 : 1,
      walkTime: 0,
      hopProgress: -1,
      blinkTimer: 1 + Math.random() * 4,
      blinkRemaining: 0,
      eatRemaining: 0,
      fireRemaining: 0,
      loveRemaining: 0,
      phase: Math.random() * 10,
      spriteCanvas: spriteCanvas,
      spriteContext: spriteContext,
      spriteImage: spriteContext.createImageData(spriteWidth, spriteHeight),
    };
  }

  function syncDragons(dragonInfos) {
    const dragonsById = new Map(dragons.map((dragon) => [dragon.id, dragon]));
    const nextDragons = dragonInfos.map((dragonInfo) => {
      const dragon = dragonsById.get(dragonInfo.id) || createDragon(dragonInfo);
      dragon.name = dragonInfo.name;
      dragon.color = dragonInfo.color;
      dragonsById.delete(dragonInfo.id);
      return dragon;
    });
    dragonsById.forEach((removedDragon) => {
      spawnBurst("puff", removedDragon.positionX, removedDragon.positionY - spriteHeight / 2, 10, 22);
    });
    dragons = nextDragons;
    if (hoveredDragon && !dragons.includes(hoveredDragon)) {
      hoveredDragon = null;
    }
    emptyMessage.hidden = dragons.length > 0;
  }

  function spawnBurst(kind, originX, originY, count, spread) {
    for (let particleNumber = 0; particleNumber < count; particleNumber++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (spread || 10) * (0.4 + Math.random() * 0.6);
      const isHeart = kind === "heart";
      particles.push({
        kind: kind,
        positionX: originX + (Math.random() - 0.5) * 8,
        positionY: originY,
        velocityX: isHeart ? (Math.random() - 0.5) * 6 : Math.cos(angle) * speed,
        velocityY: isHeart ? -10 - Math.random() * 8 : Math.sin(angle) * speed - 8,
        life: 1,
        duration: kind === "puff" ? 0.6 : 1.2,
        delay: 0,
      });
    }
  }

  function breatheFire(dragon) {
    dragon.fireRemaining = 0.9;
    dragon.mode = "idle";
    dragon.idleTimer = 1.5;
    for (let flameNumber = 0; flameNumber < 18; flameNumber++) {
      particles.push({
        kind: "fire",
        positionX: dragon.positionX + dragon.facing * 5,
        positionY: dragon.positionY - spriteHeight + 22,
        velocityX: dragon.facing * (26 + Math.random() * 30),
        velocityY: (Math.random() - 0.5) * 14,
        life: 1,
        duration: 0.5 + Math.random() * 0.4,
        delay: flameNumber * 0.03,
      });
    }
  }

  function updateParticles(deltaTime) {
    particles.forEach((particle) => {
      if (particle.delay > 0) {
        particle.delay -= deltaTime;
        return;
      }
      particle.positionX += particle.velocityX * deltaTime;
      particle.positionY += particle.velocityY * deltaTime;
      if (particle.kind !== "fire") {
        particle.velocityY += 14 * deltaTime;
      }
      particle.life -= deltaTime / particle.duration;
    });
    particles = particles.filter((particle) => particle.life > 0);
  }

  function flameColor(life) {
    if (life > 0.65) {
      return "#ffe066";
    }
    if (life > 0.35) {
      return "#ff9a3a";
    }
    return "#e2431a";
  }

  function drawParticles() {
    particles.forEach((particle) => {
      if (particle.delay > 0) {
        return;
      }
      sceneContext.globalAlpha = Math.min(1, particle.life * 1.6);
      if (particle.kind === "fire") {
        const flameSize = (particle.life > 0.5 ? 2 : 1) * pixelSize;
        sceneContext.fillStyle = flameColor(particle.life);
        sceneContext.fillRect(
          Math.round(particle.positionX) * pixelSize,
          Math.round(particle.positionY) * pixelSize,
          flameSize,
          flameSize
        );
      } else {
        drawPixelSprite(pixelSprites[particle.kind], particle.positionX, particle.positionY);
      }
    });
    sceneContext.globalAlpha = 1;
  }

  function isWalking(dragon) {
    return dragon.mode === "walk" || dragon.mode === "food";
  }

  function tickTimers(dragon, deltaTime) {
    dragon.blinkTimer -= deltaTime;
    if (dragon.blinkRemaining > 0) {
      dragon.blinkRemaining -= deltaTime;
    }
    if (dragon.blinkTimer <= 0) {
      dragon.blinkRemaining = 0.15;
      dragon.blinkTimer = 2 + Math.random() * 4;
    }
    dragon.eatRemaining = Math.max(0, dragon.eatRemaining - deltaTime);
    dragon.fireRemaining = Math.max(0, dragon.fireRemaining - deltaTime);
    dragon.loveRemaining = Math.max(0, dragon.loveRemaining - deltaTime);
    if (dragon.hopProgress >= 0) {
      dragon.hopProgress += deltaTime / 0.5;
      if (dragon.hopProgress >= 1) {
        dragon.hopProgress = -1;
      }
    }
  }

  function walkTowardTarget(dragon, deltaTime) {
    const distanceX = dragon.targetX - dragon.positionX;
    const distanceY = dragon.targetY - dragon.positionY;
    const distance = Math.hypot(distanceX, distanceY);
    const stepLength = (dragon.mode === "food" ? 28 : 13) * deltaTime;
    if (Math.abs(distanceX) > 0.5) {
      dragon.facing = distanceX > 0 ? 1 : -1;
    }
    if (distance > stepLength + 0.01) {
      dragon.positionX += (distanceX / distance) * stepLength;
      dragon.positionY += (distanceY / distance) * stepLength;
      dragon.walkTime += deltaTime;
      return;
    }
    dragon.positionX = dragon.targetX;
    dragon.positionY = dragon.targetY;
    dragon.walkTime = 0;
    if (dragon.mode === "food" && food) {
      food = null;
      dragon.eatRemaining = 1.4;
      dragon.loveRemaining = 2;
      spawnBurst("heart", dragon.positionX, dragon.positionY - spriteHeight + 4, 4);
    }
    dragon.mode = "idle";
    dragon.idleTimer = 1 + Math.random() * 3;
  }

  function chooseNextIdleAction(dragon) {
    const choice = Math.random();
    if (choice < 0.6) {
      const destination = randomPoint();
      dragon.targetX = destination.positionX;
      dragon.targetY = destination.positionY;
      dragon.mode = "walk";
    } else if (choice < 0.8) {
      dragon.hopProgress = 0;
      dragon.idleTimer = 1.5 + Math.random() * 2;
    } else {
      dragon.facing = -dragon.facing;
      dragon.idleTimer = 1 + Math.random() * 2;
    }
  }

  function updateDragon(dragon, deltaTime) {
    tickTimers(dragon, deltaTime);

    if (isSleepy) {
      dragon.mode = "sleep";
      return;
    }
    if (dragon.mode === "sleep") {
      dragon.mode = "idle";
      dragon.idleTimer = 1;
    }
    if (dragon.eatRemaining > 0 || dragon.fireRemaining > 0) {
      return;
    }

    if (food) {
      dragon.mode = "food";
      dragon.targetX = food.positionX;
      dragon.targetY = clampRow(food.positionY - 2);
    } else if (dragon.mode === "food") {
      dragon.mode = "idle";
      dragon.idleTimer = 0.5 + Math.random();
      return;
    }

    if (isWalking(dragon)) {
      walkTowardTarget(dragon, deltaTime);
      return;
    }

    dragon.idleTimer -= deltaTime;
    if (dragon.idleTimer <= 0) {
      chooseNextIdleAction(dragon);
    }
  }

  function wingLiftFor(dragon, time) {
    if (dragon.mode === "sleep") {
      return 0;
    }
    if (dragon.hopProgress >= 0) {
      return Math.sin(dragon.hopProgress * Math.PI);
    }
    if (isWalking(dragon)) {
      return 0.25 + 0.25 * Math.sin(dragon.walkTime * 14);
    }
    return 0.15 + 0.15 * Math.sin(time / 400 + dragon.phase);
  }

  function mouthOpenFor(dragon, time) {
    if (dragon.mode === "sleep") {
      return 0;
    }
    if (dragon.fireRemaining > 0) {
      return 1;
    }
    if (dragon.eatRemaining > 0) {
      return Math.sin(time / 80) > 0 ? 0.8 : 0;
    }
    return 0;
  }

  function renderDragonSprite(dragon, time) {
    const isSleeping = dragon.mode === "sleep";
    const idleGlance = Math.round(Math.sin(time / 1800 + dragon.phase));
    const frame = Dragon.drawDragon({
      wing: wingLiftFor(dragon, time),
      blink: isSleeping || dragon.blinkRemaining > 0,
      look: isSleeping ? 0 : isWalking(dragon) ? dragon.facing : idleGlance,
      blush: isHappy || dragon.loveRemaining > 0 || dragon.eatRemaining > 0,
      mouth: mouthOpenFor(dragon, time),
    });
    const palette = getRgbPalette(dragon.color);
    const imageData = dragon.spriteImage.data;
    frame.pixels.forEach((paletteIndex, pixelIndex) => {
      const offset = pixelIndex * 4;
      if (!paletteIndex) {
        imageData[offset + 3] = 0;
        return;
      }
      const [red, green, blue] = palette[paletteIndex];
      imageData[offset] = red;
      imageData[offset + 1] = green;
      imageData[offset + 2] = blue;
      imageData[offset + 3] = 255;
    });
    dragon.spriteContext.putImageData(dragon.spriteImage, 0, 0);
  }

  function liftFor(dragon, time) {
    if (dragon.hopProgress >= 0) {
      return Math.round(Math.sin(dragon.hopProgress * Math.PI) * 7);
    }
    if (isWalking(dragon)) {
      return Math.floor(dragon.walkTime * 8) % 2;
    }
    if (dragon.mode === "sleep") {
      return 0;
    }
    return Math.sin(time / 650 + dragon.phase) > 0.4 ? 1 : 0;
  }

  function drawDragon(dragon, time) {
    renderDragonSprite(dragon, time);
    const footX = Math.round(dragon.positionX);
    const footY = Math.round(dragon.positionY);
    const shadowScale = dragon.hopProgress >= 0 ? 1 - Math.sin(dragon.hopProgress * Math.PI) * 0.35 : 1;
    sceneContext.fillStyle = shadowColor;
    fillPixelEllipse(footX, footY - 1, Math.round(13 * shadowScale), Math.max(1, Math.round(3 * shadowScale)));

    const spriteX = footX - spriteWidth / 2;
    const spriteY = footY - (spriteHeight - 1) - liftFor(dragon, time);
    sceneContext.drawImage(
      dragon.spriteCanvas,
      spriteX * pixelSize,
      spriteY * pixelSize,
      spriteWidth * pixelSize,
      spriteHeight * pixelSize
    );

    if (dragon.mode === "sleep") {
      const sleepCycle = (time / 1400 + dragon.phase) % 1;
      sceneContext.globalAlpha = 1 - sleepCycle;
      drawPixelSprite(
        pixelSprites.sleepLetter,
        spriteX + spriteWidth - 8 + sleepCycle * 4,
        spriteY + 2 - sleepCycle * 8
      );
      sceneContext.globalAlpha = 1;
    }
  }

  function drawFood(time) {
    const bounce = Math.sin(time / 200) > 0 ? 1 : 0;
    sceneContext.fillStyle = shadowColor;
    fillPixelEllipse(food.positionX, food.positionY, 4, 1);
    drawPixelSprite(pixelSprites.meat, food.positionX - 4, food.positionY - 7 - bounce);
  }

  function renderFrame(time) {
    const deltaTime = Math.min(0.05, (time - lastFrameTime) / 1000);
    lastFrameTime = time;

    dragons.forEach((dragon) => updateDragon(dragon, deltaTime));
    if (food && dragons.length === 0) {
      food.expiresIn -= deltaTime;
      if (food.expiresIn <= 0) {
        food = null;
      }
    }
    updateParticles(deltaTime);

    sceneContext.imageSmoothingEnabled = false;
    sceneContext.drawImage(grassCanvas, 0, 0, columns * pixelSize, rows * pixelSize);

    const drawables = dragons.map((dragon) => ({ depth: dragon.positionY, dragon: dragon }));
    if (food) {
      drawables.push({ depth: food.positionY, dragon: null });
    }
    drawables.sort((first, second) => first.depth - second.depth);
    drawables.forEach((drawable) => {
      if (drawable.dragon) {
        drawDragon(drawable.dragon, time);
      } else {
        drawFood(time);
      }
    });
    drawParticles();

    if (hoveredDragon) {
      const labelTop = hoveredDragon.positionY - spriteHeight - liftFor(hoveredDragon, time);
      nameLabel.style.left = (hoveredDragon.positionX * pixelSize) / pixelRatio + "px";
      nameLabel.style.top = (labelTop * pixelSize) / pixelRatio + "px";
    }
    requestAnimationFrame(renderFrame);
  }

  function toScenePoint(mouseEvent) {
    return {
      positionX: (mouseEvent.offsetX * pixelRatio) / pixelSize,
      positionY: (mouseEvent.offsetY * pixelRatio) / pixelSize,
    };
  }

  function findDragonAt(point) {
    const frontToBack = dragons.slice().sort((first, second) => second.positionY - first.positionY);
    return frontToBack.find(
      (dragon) =>
        point.positionX >= dragon.positionX - 15 &&
        point.positionX <= dragon.positionX + 15 &&
        point.positionY >= dragon.positionY - spriteHeight + 2 &&
        point.positionY <= dragon.positionY
    );
  }

  function dropFood(point) {
    food = {
      positionX: Math.max(5, Math.min(columns - 5, Math.round(point.positionX))),
      positionY: clampRow(Math.round(point.positionY)),
      expiresIn: 15,
    };
  }

  function handleAction(message) {
    const targetDragon = message.id ? dragons.find((dragon) => dragon.id === message.id) : undefined;
    const affectedDragons = targetDragon ? [targetDragon] : dragons;
    switch (message.action) {
      case "eat":
        dropFood(pendingFoodPoint || randomPoint());
        pendingFoodPoint = null;
        break;
      case "play":
        affectedDragons.forEach((dragon) => {
          dragon.hopProgress = 0;
          dragon.loveRemaining = 1.6;
          spawnBurst("heart", dragon.positionX, dragon.positionY - spriteHeight + 2, 3);
        });
        break;
      case "fire":
        affectedDragons.forEach(breatheFire);
        break;
      case "hatch":
      case "levelup":
        affectedDragons.forEach((dragon) => {
          dragon.hopProgress = 0;
          spawnBurst("star", dragon.positionX, dragon.positionY - spriteHeight / 2, 8, 20);
        });
        break;
      case "xp": {
        const luckyDragon = dragons[Math.floor(Math.random() * dragons.length)];
        if (luckyDragon) {
          spawnBurst("star", luckyDragon.positionX, luckyDragon.positionY - spriteHeight + 2, 2, 8);
        }
        break;
      }
    }
  }

  sceneCanvas.addEventListener("mousemove", (mouseEvent) => {
    hoveredDragon = findDragonAt(toScenePoint(mouseEvent)) || null;
    nameLabel.hidden = !hoveredDragon;
    if (hoveredDragon) {
      nameLabel.textContent = hoveredDragon.name;
    }
    sceneCanvas.style.cursor = hoveredDragon ? "pointer" : "default";
  });

  sceneCanvas.addEventListener("mouseleave", () => {
    hoveredDragon = null;
    nameLabel.hidden = true;
  });

  sceneCanvas.addEventListener("click", (mouseEvent) => {
    const clickedDragon = findDragonAt(toScenePoint(mouseEvent));
    if (clickedDragon) {
      vscodeApi.postMessage({ type: "play", id: clickedDragon.id });
    }
  });

  sceneCanvas.addEventListener("dblclick", (mouseEvent) => {
    const point = toScenePoint(mouseEvent);
    if (findDragonAt(point) || dragons.length === 0) {
      return;
    }
    pendingFoodPoint = point;
    vscodeApi.postMessage({ type: "feed" });
  });

  window.addEventListener("message", (messageEvent) => {
    const message = messageEvent.data;
    if (message.type === "state") {
      const petState = message.state;
      isSleepy = petState.energy < 20;
      isHappy = (petState.hunger + petState.happiness) / 2 > 72;
      syncDragons(petState.dragons || []);
    } else if (message.type === "action") {
      handleAction(message);
    }
  });

  window.addEventListener("resize", resizeScene);
  resizeScene();
  requestAnimationFrame(renderFrame);
  vscodeApi.postMessage({ type: "ready" });
})();
