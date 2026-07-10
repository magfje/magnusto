(function () {
  const canvas = document.querySelector(".ascii-border");
  const card = document.querySelector(".card");
  if (!canvas || !card) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const CHAR_RAMPS = {
    blocks: " ░▒▓█",
    code: " ._-~:;=!*#$@",
    minimal: " .-+X#",
  };

  const config = {
    cellSize: 11,
    speed: 0.9,
    waveFreq: 3,
    waveIntensity: 0.64,
    mouseRadius: 115,
    flickerRate: 12,
    noiseAmount: 0.14,
    scanlines: 0,
    charSet: "blocks",
    customChars: "",
    shape: "circle",
    mobileShape: "box",
    mobileBreakpoint: 640,
    forceShape: false,
    frameOutset: 18,
    borderCols: 3,
    borderRows: 2,
    circleThickness: 60,
    color: { r: 184, g: 183, b: 171 },
    maxSnakes: 5,
    snakeSpawnMin: 0.55,
    snakeSpawnMax: 1.8,
  };

  const MAX_FLYING = 250;
  const BASE_CARD_WIDTH = 520;
  const BASE_CARD_HEIGHT = 650;
  const bootChars = "01{}[]<>/\\|!@#$%&*:;=+-_~";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let cardRect = { left: 0, top: 0, right: 0, bottom: 0 };
  let dpr = 1;
  let raf = 0;
  let lastFrame = 0;
  let startTime = null;
  let initialized = false;
  let resizeObserved = false;
  let renderScale = 1;
  let bounds = { minCol: 0, maxCol: 1, minRow: 0, maxRow: 1 };

  const mouse = { x: -9999, y: -9999 };
  const prevMouse = { x: -9999, y: -9999, time: 0 };
  const velocity = { vx: 0, vy: 0, speed: 0 };
  const cells = [];
  const flying = [];
  const snakes = [];
  let nextSnakeSpawn = 0;

  function init() {
    const canvasRect = canvas.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    renderScale = Math.max(
      0.65,
      Math.min(1, rect.width / BASE_CARD_WIDTH, rect.height / BASE_CARD_HEIGHT)
    );
    dpr = window.devicePixelRatio || 1;
    width = Math.max(1, Math.round(canvasRect.width));
    height = Math.max(1, Math.round(canvasRect.height));
    cardRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    buildGrid();
    flying.length = 0;
    snakes.length = 0;
    nextSnakeSpawn = 0;
    lastFrame = 0;
    startTime = null;
  }

  function buildGrid() {
    cells.length = 0;

    if (getEffectiveShape() === "circle") {
      buildCircleGrid();
      return;
    }

    buildBoxGrid();
  }

  function buildBoxGrid() {
    cells.length = 0;

    const charSize = scaled(config.cellSize);
    const rowH = charSize * 1.6;
    const halfChar = charSize / 2;
    const baselineOffset = charSize * 0.8;
    const frame = createBoxFrame(cardRect);
    const minCol = Math.ceil((frame.outer.left - halfChar) / charSize);
    const maxCol = Math.floor((frame.outer.right - halfChar) / charSize);
    const minRow = Math.ceil((frame.outer.top - baselineOffset) / rowH);
    const maxRow = Math.floor((frame.outer.bottom - baselineOffset) / rowH);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = col * charSize + halfChar;
        const y = row * rowH + baselineOffset;

        const edgeCol = Math.min(col - minCol, maxCol - col);
        const edgeRow = Math.min(row - minRow, maxRow - row);
        if (edgeCol >= config.borderCols && edgeRow >= config.borderRows) continue;

        const colLayer = edgeCol < config.borderCols
          ? 1 - edgeCol / Math.max(1, config.borderCols)
          : 0;
        const rowLayer = edgeRow < config.borderRows
          ? 1 - edgeRow / Math.max(1, config.borderRows)
          : 0;
        const layer = Math.max(colLayer, rowLayer);
        const density = layer * 0.58;
        const edgeFactor = layer * 0.72;

        cells.push({
          col,
          row,
          x,
          y,
          density,
          edgeFactor,
          perimeter: getBoxPerimeter(col, row, minCol, maxCol, minRow, maxRow),
          across: getBoxAcross(col, row, minCol, maxCol, minRow, maxRow),
          tornUntil: 0,
        });
      }
    }

    bounds = {
      minCol,
      maxCol,
      minRow,
      maxRow,
    };
  }

  function buildCircleGrid() {
    cells.length = 0;

    const charSize = scaled(config.cellSize);
    const rowH = charSize * 1.6;
    const halfChar = charSize / 2;
    const baselineOffset = charSize * 0.8;
    const centerX = (cardRect.left + cardRect.right) / 2;
    const centerY = (cardRect.top + cardRect.bottom) / 2;
    const thickness = scaled(config.circleThickness);
    const desiredRadius = (
      Math.max(cardRect.right - cardRect.left, cardRect.bottom - cardRect.top) / 2
      + scaled(config.frameOutset)
    );
    const viewportMargin = 18;
    const maxRadius = Math.max(
      thickness,
      Math.min(
        centerX,
        width - centerX,
        centerY,
        height - centerY
      ) - thickness - viewportMargin
    );
    const radius = Math.min(desiredRadius, maxRadius);
    const outerRadius = radius + thickness;
    const minCol = Math.ceil((centerX - outerRadius - halfChar) / charSize);
    const maxCol = Math.floor((centerX + outerRadius - halfChar) / charSize);
    const minRow = Math.ceil((centerY - outerRadius - baselineOffset) / rowH);
    const maxRow = Math.floor((centerY + outerRadius - baselineOffset) / rowH);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = col * charSize + halfChar;
        const y = row * rowH + baselineOffset;
        const dist = Math.hypot(x - centerX, y - centerY);
        const edgeDist = Math.abs(dist - radius);
        if (edgeDist > thickness) continue;

        const layer = 1 - edgeDist / thickness;
        const density = layer * 0.58;
        const edgeFactor = layer * 0.72;
        const angle = Math.atan2(y - centerY, x - centerX);

        cells.push({
          col,
          row,
          x,
          y,
          density,
          edgeFactor,
          perimeter: wrapUnit((angle + Math.PI) / (Math.PI * 2)),
          across: edgeDist / thickness,
          tornUntil: 0,
        });
      }
    }

    bounds = {
      minCol,
      maxCol,
      minRow,
      maxRow,
    };
  }

  function createBoxFrame(rect) {
    const outer = {
      left: rect.left - scaled(config.frameOutset),
      top: rect.top - scaled(config.frameOutset),
      right: rect.right + scaled(config.frameOutset),
      bottom: rect.bottom + scaled(config.frameOutset),
    };

    return { outer };
  }

  function animate(timestamp) {
    if (startTime === null) startTime = timestamp;
    const introElapsed = (timestamp - startTime) * 0.001;
    const introDuration = reduceMotion.matches ? 0 : 1.35;
    const dt = Math.min((timestamp - (lastFrame || timestamp)) / 1000, 0.05);
    lastFrame = timestamp;

    const time = timestamp * 0.001 * config.speed;
    const ramp = getRamp();
    const rampLen = ramp.length;
    const mouseRadius = scaled(config.mouseRadius);
    const mouseRadSq = mouseRadius * mouseRadius;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (cells.length === 0) {
      ctx.restore();
      raf = requestAnimationFrame(animate);
      return;
    }

    decayVelocity(dt);
    spawnFlying(timestamp, time, ramp, rampLen, mouseRadSq);
    updateSnakes(time);
    drawFlying(dt);
    drawCells(timestamp, introElapsed, introDuration, time, ramp, rampLen, mouseRadSq);
    drawNoise(time);

    ctx.restore();

    if (!reduceMotion.matches) {
      raf = requestAnimationFrame(animate);
    }
  }

  function spawnFlying(timestamp, time, ramp, rampLen, mouseRadSq) {
    const speedThresh = 1600;
    if (velocity.speed <= speedThresh || flying.length >= MAX_FLYING) return;

    const spawnBudget = Math.min(
      Math.floor((velocity.speed - speedThresh) / 400),
      6,
      MAX_FLYING - flying.length
    );
    if (spawnBudget <= 0) return;

    const dirX = velocity.vx / velocity.speed;
    const dirY = velocity.vy / velocity.speed;
    const baseAngle = Math.atan2(dirY, dirX);
    const startIdx = Math.floor(Math.random() * cells.length);
    let spawned = 0;

    for (let j = 0; j < cells.length && spawned < spawnBudget; j++) {
      const i = (startIdx + j) % cells.length;
      const cell = cells[i];
      if (cell.tornUntil > timestamp) continue;

      const dx = cell.x - mouse.x;
      const dy = cell.y - mouse.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > mouseRadSq) continue;

      const distNorm = Math.sqrt(distSq) / scaled(config.mouseRadius);
      if (Math.random() > (1 - distNorm) * 0.7) continue;

      const renderState = getCellRenderState(cell, timestamp, time, ramp, rampLen, mouseRadSq);
      if (!renderState || renderState.char === " ") continue;
      const displayChar = getDisplayChar(cell, renderState, time, true);

      const mass = 0.5 + Math.random() * 1.5;
      const spreadAngle = (1.2 / mass) * (Math.random() - 0.5);
      const angle = baseAngle + spreadAngle;
      const speedMul = (0.06 + Math.random() * 0.16) / Math.sqrt(mass);
      const magnitude = velocity.speed * speedMul;
      const perpSign = Math.random() > 0.5 ? 1 : -1;
      const perpAngle = baseAngle + perpSign * 1.5708;
      const perpMag = velocity.speed * (0.01 + Math.random() * 0.04) / mass;
      const lifespan = 1.0 + Math.random() * 1.2 + mass * 0.3;

      cell.tornUntil = timestamp + lifespan * 1000;
      flying.push({
        x: cell.x,
        y: cell.y,
        vx: Math.cos(angle) * magnitude + Math.cos(perpAngle) * perpMag,
        vy: Math.sin(angle) * magnitude + Math.sin(perpAngle) * perpMag - 30 * (1 / mass),
        char: displayChar,
        r: renderState.color.r,
        g: renderState.color.g,
        b: renderState.color.b,
        releaseAlpha: renderState.alpha,
        life: lifespan,
        maxLife: lifespan,
        size: scaled(config.cellSize),
        rotation: (Math.random() - 0.5) * 0.3,
        rotSpeed: (Math.random() - 0.5) * (8 / mass),
        cellIdx: i,
        mass,
        dragCoeff: 0.001 + Math.random() * 0.002,
        tumblePhase: Math.random() * 6.28,
        tumbleFreq: 2 + Math.random() * 4,
        scaleY: 1,
        flipSpeed: (Math.random() - 0.5) * (6 / mass),
      });
      spawned++;
    }
  }

  function drawFlying(dt) {
    const baseGravity = 280;

    ctx.font = `${scaled(config.cellSize)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let writeIdx = 0;
    for (let i = 0; i < flying.length; i++) {
      const char = flying[i];
      const elapsed = char.maxLife - char.life;

      char.vy += baseGravity * char.mass * 0.7 * dt;

      const speed = Math.sqrt(char.vx * char.vx + char.vy * char.vy);
      if (speed > 1) {
        const dragMag = char.dragCoeff * speed * speed / char.mass;
        char.vx -= (char.vx / speed) * dragMag * dt;
        char.vy -= (char.vy / speed) * dragMag * dt;
      }

      const turbX = Math.sin(elapsed * char.tumbleFreq + char.tumblePhase) * 15 / char.mass;
      const turbY = Math.cos(elapsed * char.tumbleFreq * 0.7 + char.tumblePhase * 1.3) * 8 / char.mass;
      char.vx += turbX * dt;
      char.vy += turbY * dt;
      char.x += char.vx * dt;
      char.y += char.vy * dt;
      char.rotation += char.rotSpeed * dt;
      char.rotSpeed *= 1 - 1.2 * dt;
      char.scaleY = Math.cos(elapsed * char.flipSpeed + char.tumblePhase);
      char.life -= dt;

      if (char.life <= 0 || char.x < -200 || char.x > width + 200 || char.y > height + 200) {
        continue;
      }

      const cosR = Math.cos(char.rotation);
      const sinR = Math.sin(char.rotation);
      const lifeRatio = char.life / char.maxLife;
      const fadeAlpha = lifeRatio < 0.35 ? (lifeRatio / 0.35) * (lifeRatio / 0.35) : 1;
      const alpha = fadeAlpha * (char.releaseAlpha || 1);

      ctx.setTransform(
        dpr * cosR,
        dpr * sinR * char.scaleY,
        -dpr * sinR,
        dpr * cosR * char.scaleY,
        dpr * char.x,
        dpr * char.y
      );
      ctx.fillStyle = `rgba(${char.r},${char.g},${char.b},${alpha})`;
      ctx.fillText(char.char, 0, 0);

      if (writeIdx !== i) flying[writeIdx] = char;
      writeIdx++;
    }
    flying.length = writeIdx;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawCells(timestamp, introElapsed, introDuration, time, ramp, rampLen, mouseRadSq) {
    const colRange = Math.max(1, bounds.maxCol - bounds.minCol);
    const rowRange = Math.max(1, bounds.maxRow - bounds.minRow);

    ctx.font = `${scaled(config.cellSize)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const cell of cells) {
      if (cell.tornUntil > timestamp) continue;

      const normCol = (cell.col - bounds.minCol) / colRange;
      const normRow = (cell.row - bounds.minRow) / rowRange;
      const cellDelay = (normCol * 0.5 + normRow * 0.5) * 0.55;
      const cellElapsed = Math.max(0, introElapsed - cellDelay);
      const progress = introDuration > 0 ? Math.min(cellElapsed / (introDuration * 0.36), 1) : 1;
      const appearAt = 0.18;
      if (progress <= appearAt) continue;

      const isSettled = progress >= 1;
      const visibleProgress = Math.min((progress - appearAt) / (1 - appearAt), 1);
      const introAlpha = visibleProgress * visibleProgress * (3 - 2 * visibleProgress);
      const renderState = getCellRenderState(cell, timestamp, time, ramp, rampLen, mouseRadSq);
      if (!renderState || renderState.char === " ") continue;
      const displayChar = getDisplayChar(cell, renderState, time, isSettled);
      let alpha = renderState.alpha;

      if (!isSettled) {
        alpha *= introAlpha;
      }

      renderState.alpha = alpha;
      const color = renderState.color;
      const glow = Math.max(renderState.mouseInf, renderState.snake * 0.55);
      if (glow > 0.08) {
        ctx.shadowColor = `rgba(${color.r},${color.g},${color.b},${glow * 0.55})`;
        ctx.shadowBlur = 10 * glow;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha})`;
      ctx.fillText(displayChar, cell.x, cell.y);
    }

    ctx.shadowBlur = 0;
  }

  function getDisplayChar(cell, renderState, time, allowScramble) {
    if (allowScramble && renderState.mouseInf > 0.3 && renderState.flicker < 0.3) {
      return bootChars[
        (cell.col * 7 + cell.row * 13 + ((time * 12) | 0)) % bootChars.length
      ];
    }

    return renderState.char;
  }

  function getCellRenderState(cell, timestamp, time, ramp, rampLen, mouseRadSq) {
    const dx = cell.x - mouse.x;
    const dy = cell.y - mouse.y;
    const distSq = dx * dx + dy * dy;
    const mouseInf = distSq < mouseRadSq ? Math.max(0, 1 - Math.sqrt(distSq) / scaled(config.mouseRadius)) : 0;
    const wavePhase = getWave(cell, time);
    let brightness = getBrightness(cell, wavePhase, mouseInf);
    const flickerSeed = Math.sin(
      cell.col * 127.1 +
      cell.row * 311.7 +
      ((time * config.flickerRate) | 0) * 43.37
    ) * 43758.5453;
    const flicker = flickerSeed - Math.floor(flickerSeed);
    if (flicker < config.noiseAmount * 0.15) brightness = flicker * 2.5;

    const snake = getSnakeHighlight(cell, time);
    if (snake > 0) {
      brightness = Math.min(1, brightness + snake * 0.48);
    }

    let charIdx = Math.min((brightness * (rampLen - 1)) | 0, rampLen - 1);
    if (snake > 0.64 && config.charSet === "blocks") {
      charIdx = rampLen - 1;
    }

    const char = ramp[charIdx];
    if (char === " ") return null;

    let alpha = getAlpha(brightness);
    if (snake > 0.64 && config.charSet === "blocks") {
      alpha = Math.min(1, alpha + snake * 0.28);
    }
    const color = getColor(brightness, wavePhase, mouseInf);

    return {
      char,
      alpha,
      color,
      brightness,
      flicker,
      mouseInf,
      snake,
      wavePhase,
      timestamp,
    };
  }

  function updateSnakes(time) {
    let writeIdx = 0;
    for (let i = 0; i < snakes.length; i++) {
      const snake = snakes[i];
      if (time < snake.endsAt) {
        if (writeIdx !== i) snakes[writeIdx] = snake;
        writeIdx++;
      }
    }
    snakes.length = writeIdx;

    if (time < nextSnakeSpawn || snakes.length >= config.maxSnakes) return;

    snakes.push(createSnake(time));
    nextSnakeSpawn = time + randomBetween(config.snakeSpawnMin, config.snakeSpawnMax);
  }

  function createSnake(time) {
    const fadeIn = randomBetween(0.22, 0.55);
    const fadeOut = randomBetween(0.35, 0.9);
    const hold = randomBetween(1.2, 3.8);
    const lifetime = fadeIn + hold + fadeOut;

    return {
      start: Math.random(),
      speed: randomBetween(0.035, 0.14),
      direction: Math.random() > 0.5 ? 1 : -1,
      length: randomBetween(0.025, 0.095),
      width: randomBetween(0.55, 1.7),
      sparkle: randomBetween(0.25, 0.62),
      strength: randomBetween(0.72, 1.15),
      bornAt: time,
      fadeIn,
      fadeOut,
      endsAt: time + lifetime,
    };
  }

  function getSnakeHighlight(cell, time) {
    const perimeter = cell.perimeter;
    if (perimeter < 0) return 0;

    const seed = seededNoise(cell.col, cell.row);
    let highlight = 0;

    for (const snake of snakes) {
      if (seed < snake.sparkle) continue;

      const age = time - snake.bornAt;
      const remaining = snake.endsAt - time;
      const fade = Math.min(1, age / snake.fadeIn, remaining / snake.fadeOut);
      if (fade <= 0) continue;

      const head = wrapUnit(snake.start + age * snake.speed * snake.direction);
      const backwards = snake.direction > 0
        ? wrapUnit(head - perimeter)
        : wrapUnit(perimeter - head);
      if (backwards > snake.length) continue;

      const along = 1 - backwards / snake.length;
      const across = cell.across / snake.width;
      if (across > 1) continue;

      const body = Math.sin(along * Math.PI);
      const widthFalloff = 1 - across * across;
      const jitter = 0.72 + seed * 0.28;
      highlight = Math.max(highlight, body * widthFalloff * fade * snake.strength * jitter);
    }

    return Math.min(1, highlight);
  }

  function getBoxPerimeter(col, row, left, right, top, bottom) {
    const widthCells = Math.max(1, right - left);
    const heightCells = Math.max(1, bottom - top);
    const perimeter = widthCells * 2 + heightCells * 2;
    const edgeCol = Math.min(col - left, right - col);
    const edgeRow = Math.min(row - top, bottom - row);

    let distance = -1;
    if (edgeRow < config.borderRows && row <= top + config.borderRows - 1) {
      distance = col - left;
    } else if (edgeCol < config.borderCols && col >= right - config.borderCols + 1) {
      distance = widthCells + (row - top);
    } else if (edgeRow < config.borderRows && row >= bottom - config.borderRows + 1) {
      distance = widthCells + heightCells + (right - col);
    } else if (edgeCol < config.borderCols && col <= left + config.borderCols - 1) {
      distance = widthCells * 2 + heightCells + (bottom - row);
    }

    if (distance < 0) return -1;
    return (distance % perimeter) / perimeter;
  }

  function getBoxAcross(col, row, left, right, top, bottom) {
    const edgeCol = Math.min(col - left, right - col);
    const edgeRow = Math.min(row - top, bottom - row);
    return Math.min(edgeCol / Math.max(1, config.borderCols - 1), edgeRow / Math.max(1, config.borderRows - 1));
  }

  function wrapUnit(value) {
    return ((value % 1) + 1) % 1;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function seededNoise(col, row) {
    const seed = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
    return seed - Math.floor(seed);
  }

  function getRamp() {
    if (config.charSet === "custom" && config.customChars.trim().length > 0) {
      return ` ${config.customChars}`;
    }

    return CHAR_RAMPS[config.charSet] || CHAR_RAMPS.blocks;
  }

  function getEffectiveShape() {
    if (config.forceShape) return config.shape;
    const isShortLandscape = window.innerWidth > window.innerHeight && window.innerHeight <= 560;
    return window.innerWidth <= config.mobileBreakpoint || isShortLandscape
      ? config.mobileShape
      : config.shape;
  }

  function scaled(value) {
    return value * renderScale;
  }

  function getWave(cell, time) {
    return Math.sin(
      (cell.x / width) * config.waveFreq * 6.28 +
      (cell.y / height) * config.waveFreq * 3.14 -
      time * 2
    ) * 0.5 + 0.5;
  }

  function getBrightness(cell, wavePhase, mouseInf) {
    let brightness = cell.density * 0.5 + cell.edgeFactor * 0.3 + wavePhase * config.waveIntensity * 0.3;
    if (mouseInf > 0) brightness = Math.min(1, brightness + mouseInf * 0.5);
    const cap = mouseInf > 0 ? 1 : 0.78;
    return Math.min(cap, brightness);
  }

  function getAlpha(brightness) {
    if (config.charSet === "blocks") return 0.4 + brightness * 0.6;
    if (config.charSet === "code") return 0.35 + brightness * 0.65;
    return 0.3 + brightness * 0.7;
  }

  function getColor(brightness, wavePhase, mouseInf) {
    const tint = config.color;
    const level = Math.min(1, 0.34 + brightness * 0.58 + wavePhase * 0.08);
    let r = (tint.r * level) | 0;
    let g = (tint.g * level) | 0;
    let b = (tint.b * level) | 0;

    if (mouseInf > 0.1) {
      r = (r + (255 - r) * mouseInf * 0.75) | 0;
      g = (g + (255 - g) * mouseInf * 0.75) | 0;
      b = (b + (255 - b) * mouseInf * 0.75) | 0;
    }

    return { r, g, b };
  }

  function hexToRgb(hex) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!match) return null;

    return {
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16),
    };
  }

  function drawNoise(time) {
    if (config.noiseAmount <= 0.1) return;

    const count = (config.noiseAmount * 40) | 0;
    const timeSlot = (time * 3) | 0;
    ctx.font = `${scaled(config.cellSize) * 0.8}px monospace`;
    ctx.fillStyle = "rgba(160,170,190,0.04)";

    for (let i = 0; i < count; i++) {
      const seed = Math.sin(i * 127.1 + timeSlot * 311.7) * 43758.5453;
      const randX = seed - Math.floor(seed);
      const seed2 = Math.sin(i * 269.5 + timeSlot * 183.3) * 43758.5453;
      const randY = seed2 - Math.floor(seed2);
      const alpha = 0.03 + randX * 0.06;
      ctx.fillStyle = `rgba(160,170,190,${alpha})`;
      ctx.fillText(
        bootChars[(i * 7 + timeSlot) % bootChars.length],
        width * 0.2 + randX * width * 0.6,
        height * 0.15 + randY * height * 0.7
      );
    }
  }

  function updatePointer(x, y) {
    const now = performance.now();
    const dt = (now - prevMouse.time) / 1000;

    if (dt > 0.001 && dt < 0.15) {
      const rx = (x - prevMouse.x) / dt;
      const ry = (y - prevMouse.y) / dt;
      velocity.vx = velocity.vx * 0.55 + rx * 0.45;
      velocity.vy = velocity.vy * 0.55 + ry * 0.45;
      velocity.speed = Math.sqrt(velocity.vx * velocity.vx + velocity.vy * velocity.vy);
    }

    prevMouse.x = x;
    prevMouse.y = y;
    prevMouse.time = now;
    mouse.x = x;
    mouse.y = y;

    if (reduceMotion.matches) animate(now);
  }

  function decayVelocity(dt) {
    if (velocity.speed === 0) return;

    const decay = Math.exp(-6 * dt);
    velocity.vx *= decay;
    velocity.vy *= decay;
    velocity.speed = Math.hypot(velocity.vx, velocity.vy);

    if (velocity.speed < 5) {
      velocity.vx = 0;
      velocity.vy = 0;
      velocity.speed = 0;
    }
  }

  function pointerFromEvent(event) {
    updatePointer(event.clientX, event.clientY);
  }

  function touchFromEvent(event) {
    if (!event.touches[0]) return;
    updatePointer(event.touches[0].clientX, event.touches[0].clientY);
  }

  function clearPointer() {
    mouse.x = -9999;
    mouse.y = -9999;
    prevMouse.x = -9999;
    prevMouse.y = -9999;
    prevMouse.time = 0;
    velocity.vx = 0;
    velocity.vy = 0;
    velocity.speed = 0;
    if (reduceMotion.matches) animate(performance.now());
  }

  function start() {
    cancelAnimationFrame(raf);
    init();
    initialized = true;
    animate(performance.now());
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      if (!resizeObserved) {
        resizeObserved = true;
        return;
      }
      if (initialized) start();
    }).observe(card);
  }

  window.addEventListener("resize", start);
  reduceMotion.addEventListener("change", start);
  window.addEventListener("site-debug-change", (event) => {
    const detail = event.detail || {};
    const previousShape = config.shape;
    const previousCircleThickness = config.circleThickness;

    if (CHAR_RAMPS[detail.charset] || detail.charset === "custom") {
      config.charSet = detail.charset;
    }

    if (typeof detail.customCharset === "string") {
      config.customChars = detail.customCharset;
    }

    if (detail.shape === "box" || detail.shape === "circle") {
      config.shape = detail.shape;
    }

    config.forceShape = detail.forceShape === true;

    if (Number.isFinite(detail.circleThickness)) {
      config.circleThickness = Math.max(6, Math.min(80, detail.circleThickness));
    }

    const color = hexToRgb(detail.ink);
    if (color) {
      config.color = color;
    }

    if (config.shape !== previousShape || config.circleThickness !== previousCircleThickness) {
      start();
    } else if (reduceMotion.matches) {
      animate(performance.now());
    }
  });
  window.addEventListener("mousemove", pointerFromEvent);
  window.addEventListener("mouseleave", clearPointer);
  window.addEventListener("touchstart", touchFromEvent, { passive: true });
  window.addEventListener("touchmove", touchFromEvent, { passive: true });
  window.addEventListener("touchend", clearPointer, { passive: true });
  window.addEventListener("touchcancel", clearPointer, { passive: true });

  start();
})();
