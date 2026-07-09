(function () {
  const canvas = document.querySelector(".ascii-border");
  const card = document.querySelector(".card");
  if (!canvas || !card) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const chars = [" ", ".", "-", "+", "x", "#"];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let lastWidth = 0;
  let lastHeight = 0;

  function resize() {
    const rect = card.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(timestamp) {
    ctx.clearRect(0, 0, width, height);
    ctx.font = "11px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const cell = 11;
    const row = 16;
    const pad = 12;
    const thickness = 22;
    const right = width - pad;
    const bottom = height - pad;
    const time = timestamp * 0.001;

    for (let y = pad; y <= bottom; y += row) {
      for (let x = pad; x <= right; x += cell) {
        const edge = Math.min(x - pad, right - x, y - pad, bottom - y);
        if (edge > thickness) continue;

        const cornerDist = Math.min(
          Math.hypot(x - pad, y - pad),
          Math.hypot(x - right, y - pad),
          Math.hypot(x - pad, y - bottom),
          Math.hypot(x - right, y - bottom)
        );
        const cornerFade = Math.min(1, cornerDist / 30);
        const edgeFade = 1 - edge / thickness;
        const wave = Math.sin(x * 0.028 + y * 0.021 - time * 1.25) * 0.5 + 0.5;
        const noise = Math.sin(x * 12.9898 + y * 78.233 + Math.floor(time * 8)) * 43758.5453;
        const flicker = noise - Math.floor(noise);
        const density = Math.max(0, Math.min(1, edgeFade * 0.65 + wave * 0.35));

        if (flicker < 0.08) continue;

        const char = chars[Math.min(chars.length - 1, Math.floor(density * chars.length))];
        if (char === " ") continue;

        const alpha = (0.18 + density * 0.58) * cornerFade;
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fillText(char, x, y);
      }
    }

    if (!reduceMotion.matches) {
      raf = requestAnimationFrame(draw);
    }
  }

  function start() {
    cancelAnimationFrame(raf);
    resize();
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
  start();
})();
