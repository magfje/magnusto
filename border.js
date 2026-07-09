(function () {
  const canvas = document.querySelector(".ascii-border");
  const card = document.querySelector(".card");
  const content = document.querySelector(".card-content");
  if (!canvas || !card || !content) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const config = {
    cellSize: 11,
    speed: 0.9,
    waveFreq: 3,
    waveIntensity: 0.64,
    mouseRadius: 90,
    flickerRate: 12,
    noiseAmount: 0.14,
    borderPad: 12,
    borderThickness: 24,
    particleBleed: 160,
  };
  const ramp = " ░▒▓█";
  const bootChars = "01{}[]<>/\\|!@#$%&*:;=+-_~";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let cardWidth = 0;
  let cardHeight = 0;
  let dpr = 1;
  let raf = 0;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastDpr = 0;
  let lastFrame = 0;
  let startTime = 0;
  let bounds = { minCol: 0, maxCol: 1, minRow: 0, maxRow: 1 };

  const mouse = { x: -9999, y: -9999 };
  const prevMouse = { x: -9999, y: -9999, time: 0 };
  const velocity = { vx: 0, vy: 0, speed: 0 };
  const cells = [];
  const flying = [];
  const maxFlying = 180;

  function init() {
    const rect = card.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cardWidth = Math.max(1, Math.round(rect.width));
    cardHeight = Math.max(1, Math.round(rect.height));
    width = cardWidth + config.particleBleed * 2;
    height = cardHeight + config.particleBleed * 2;

    if (width !== lastWidth || height !== lastHeight || dpr !== lastDpr) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      lastWidth = width;
      lastHeight = height;
      lastDpr = dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildCells();
    flying.length = 0;
    lastFrame = 0;
    startTime = 0;
  }

  function buildCells() {
    cells.length = 0;

    const cell = config.cellSize;
    const rowH = cell * 1.45;
    const pad = config.particleBleed + config.borderPad;
    const thickness = config.borderThickness;
    const right = config.particleBleed + cardWidth - config.borderPad;
    const bottom = config.particleBleed + cardHeight - config.borderPad;

    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;

    for (let y = pad; y <= bottom; y += rowH) {
      for (let x = pad; x <= right; x += cell) {
        const edgeDist = Math.min(x - pad, right - x, y - pad, bottom - y);
        if (edgeDist > thickness) continue;

        const col = Math.round(x / cell);
        const row = Math.round(y / rowH);
        const density = Math.max(0, Math.min(1, 1 - edgeDist / thickness));
        const cornerDist = Math.min(
          Math.hypot(x - pad, y - pad),
          Math.hypot(x - right, y - pad),
          Math.hypot(x - pad, y - bottom),
          Math.hypot(x - right, y - bottom)
        );

        cells.push({
          col,
          row,
          x,
          y,
          density,
          edgeFactor: Math.min(1, cornerDist / 30),
          tornUntil: 0,
        });

        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
      }
    }

    bounds = {
      minCol: Number.isFinite(minCol) ? minCol : 0,
      maxCol: Number.isFinite(maxCol) ? maxCol : 1,
      minRow: Number.isFinite(minRow) ? minRow : 0,
      maxRow: Number.isFinite(maxRow) ? maxRow : 1,
    };
  }

  function draw(timestamp) {
    if (!startTime) startTime = timestamp;
    const introElapsed = (timestamp - startTime) * 0.001;
    const introDuration = reduceMotion.matches ? 0 : 1.5;
    const dt = Math.min((timestamp - (lastFrame || timestamp)) / 1000, 0.05);
    lastFrame = timestamp;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${config.cellSize}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    maybeTear(timestamp);
    drawFlying(dt);
    drawCells(timestamp, introElapsed, introDuration);

    if (!reduceMotion.matches) {
      raf = requestAnimationFrame(draw);
    }
  }

  function drawCells(timestamp, introElapsed, introDuration) {
    const time = timestamp * 0.001 * config.speed;
    const colRange = Math.max(1, bounds.maxCol - bounds.minCol);
    const rowRange = Math.max(1, bounds.maxRow - bounds.minRow);
    const mouseRadiusSq = config.mouseRadius * config.mouseRadius;

    for (const cell of cells) {
      if (cell.tornUntil > timestamp) continue;

      const normCol = (cell.col - bounds.minCol) / colRange;
      const normRow = (cell.row - bounds.minRow) / rowRange;
      const cellDelay = (normCol * 0.5 + normRow * 0.5) * 0.75;
      const cellElapsed = Math.max(0, introElapsed - cellDelay);
      const progress = introDuration > 0 ? Math.min(cellElapsed / (introDuration * 0.45), 1) : 1;
      if (progress <= 0) continue;

      const dx = cell.x - mouse.x;
      const dy = cell.y - mouse.y;
      const distSq = dx * dx + dy * dy;
      const mouseInf = distSq < mouseRadiusSq ? Math.max(0, 1 - Math.sqrt(distSq) / config.mouseRadius) : 0;

      const wave = Math.sin(
        (cell.x / width) * config.waveFreq * 6.28 +
        (cell.y / height) * config.waveFreq * 3.14 -
        time * 2
      ) * 0.5 + 0.5;
      const flickerSeed = Math.sin(
        cell.col * 127.1 +
        cell.row * 311.7 +
        ((time * config.flickerRate) | 0) * 43.37
      ) * 43758.5453;
      const flicker = flickerSeed - Math.floor(flickerSeed);

      let brightness = cell.density * 0.58 + wave * config.waveIntensity * 0.26;
      brightness = Math.min(1, brightness + mouseInf * 0.55);
      if (flicker < config.noiseAmount * 0.15) brightness = flicker * 2.5;

      let char = ramp[Math.min((brightness * (ramp.length - 1)) | 0, ramp.length - 1)];
      if (char === " ") continue;

      const isSettled = progress >= 1;
      if (!isSettled) {
        const cycle = Math.floor(cellElapsed * 22 + cell.col * 7 + cell.row * 13);
        char = bootChars[Math.abs(cycle) % bootChars.length];
      } else if (mouseInf > 0.28 && flicker < 0.36) {
        char = bootChars[(cell.col * 7 + cell.row * 13 + ((time * 12) | 0)) % bootChars.length];
      }

      const alpha = (0.12 + brightness * 0.48 + mouseInf * 0.25) * cell.edgeFactor * progress;
      ctx.fillStyle = `rgba(255,255,255,${Math.min(alpha, 0.96).toFixed(3)})`;
      ctx.fillText(char, cell.x, cell.y);
    }
  }

  function maybeTear(timestamp) {
    if (velocity.speed < 1250 || flying.length >= maxFlying) return;

    const budget = Math.min(Math.floor((velocity.speed - 1250) / 360), 7, maxFlying - flying.length);
    if (budget <= 0) return;

    const mouseRadiusSq = config.mouseRadius * config.mouseRadius;
    const dir = Math.atan2(velocity.vy, velocity.vx);
    let spawned = 0;
    const start = Math.floor(Math.random() * Math.max(cells.length, 1));

    for (let j = 0; j < cells.length && spawned < budget; j++) {
      const cell = cells[(start + j) % cells.length];
      if (cell.tornUntil > timestamp) continue;

      const dx = cell.x - mouse.x;
      const dy = cell.y - mouse.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > mouseRadiusSq) continue;

      const distNorm = Math.sqrt(distSq) / config.mouseRadius;
      if (Math.random() > (1 - distNorm) * 0.72) continue;

      const mass = 0.55 + Math.random() * 1.45;
      const spread = (1.15 / mass) * (Math.random() - 0.5);
      const angle = dir + spread;
      const speed = velocity.speed * (0.055 + Math.random() * 0.14) / Math.sqrt(mass);
      const char = ramp[Math.max(1, Math.floor(cell.density * (ramp.length - 1)))];
      const life = 1.8 + Math.random() * 1.6 + mass * 0.45;

      cell.tornUntil = timestamp + life * 1000;
      flying.push({
        x: cell.x,
        y: cell.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 28 / mass,
        char,
        life,
        maxLife: life,
        rotation: (Math.random() - 0.5) * 0.35,
        rotSpeed: (Math.random() - 0.5) * (7 / mass),
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
    if (flying.length === 0) return;

    let write = 0;
    for (let i = 0; i < flying.length; i++) {
      const f = flying[i];
      const elapsed = f.maxLife - f.life;

      f.vy += 280 * f.mass * 0.7 * dt;
      const speed = Math.hypot(f.vx, f.vy);
      if (speed > 1) {
        const drag = f.dragCoeff * speed * speed / f.mass;
        f.vx -= (f.vx / speed) * drag * dt;
        f.vy -= (f.vy / speed) * drag * dt;
      }

      f.vx += Math.sin(elapsed * f.tumbleFreq + f.tumblePhase) * 15 / f.mass * dt;
      f.vy += Math.cos(elapsed * f.tumbleFreq * 0.7 + f.tumblePhase * 1.3) * 8 / f.mass * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rotation += f.rotSpeed * dt;
      f.rotSpeed *= 1 - 1.2 * dt;
      f.scaleY = Math.cos(elapsed * f.flipSpeed + f.tumblePhase);
      f.life -= dt;

      if (f.life <= 0 || f.x < -80 || f.x > width + 80 || f.y > height + 100) continue;

      const alphaBase = f.life / f.maxLife;
      const alpha = alphaBase < 0.35 ? (alphaBase / 0.35) * (alphaBase / 0.35) : 1;
      const cos = Math.cos(f.rotation);
      const sin = Math.sin(f.rotation);

      ctx.save();
      ctx.transform(cos, sin * f.scaleY, -sin, cos * f.scaleY, f.x, f.y);
      ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.74).toFixed(3)})`;
      ctx.fillText(f.char, 0, 0);
      ctx.restore();

      if (write !== i) flying[write] = f;
      write++;
    }
    flying.length = write;
  }

  function updatePointer(x, y) {
    const now = performance.now();
    const previous = prevMouse;
    const dt = (now - previous.time) / 1000;

    if (dt > 0.001 && dt < 0.15) {
      const rx = (x - previous.x) / dt;
      const ry = (y - previous.y) / dt;
      velocity.vx = velocity.vx * 0.55 + rx * 0.45;
      velocity.vy = velocity.vy * 0.55 + ry * 0.45;
      velocity.speed = Math.hypot(velocity.vx, velocity.vy);
    }

    previous.x = x;
    previous.y = y;
    previous.time = now;
    mouse.x = x;
    mouse.y = y;
    if (reduceMotion.matches) draw(now);
  }

  function pointerFromEvent(event) {
    const rect = card.getBoundingClientRect();
    updatePointer(
      event.clientX - rect.left + config.particleBleed,
      event.clientY - rect.top + config.particleBleed
    );
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
    if (reduceMotion.matches) draw(performance.now());
  }

  function start() {
    cancelAnimationFrame(raf);
    init();
    draw(performance.now());
  }

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(start);
    observer.observe(card);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start);
  }

  window.addEventListener("resize", start);
  reduceMotion.addEventListener("change", start);
  card.addEventListener("pointermove", pointerFromEvent);
  card.addEventListener("pointerleave", clearPointer);
  card.addEventListener("touchstart", (event) => {
    if (event.touches[0]) {
      const rect = card.getBoundingClientRect();
      updatePointer(
        event.touches[0].clientX - rect.left + config.particleBleed,
        event.touches[0].clientY - rect.top + config.particleBleed
      );
    }
  }, { passive: true });
  card.addEventListener("touchmove", (event) => {
    if (event.touches[0]) {
      const rect = card.getBoundingClientRect();
      updatePointer(
        event.touches[0].clientX - rect.left + config.particleBleed,
        event.touches[0].clientY - rect.top + config.particleBleed
      );
    }
  }, { passive: true });

  start();
})();
