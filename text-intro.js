(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) return;

  const bootChars = "01{}[]<>/\\|!@#$%&*:;=+-_~";
  const targets = Array.from(document.querySelectorAll([
    ".card-content h1",
    ".card-content .tagline",
    ".card-content .contact-links a",
    ".card-content .section-title",
    ".card-content .links a",
  ].join(",")));

  if (targets.length === 0) return;

  const items = targets.map((element, index) => {
    const text = normalizeText(element.textContent);
    element.dataset.textValue = text;
    element.textContent = maskText(text, index);
    element.setAttribute("aria-label", text);
    element.classList.add("text-intro-running");

    return {
      element,
      text,
      delay: index * 80,
      duration: 900 + Math.min(text.length, 28) * 20,
      seed: index * 97,
    };
  });

  const start = performance.now();
  let hoverReady = false;

  function frame(now) {
    let done = true;

    for (const item of items) {
      const elapsed = now - start - item.delay;
      if (elapsed < 0) {
        done = false;
        continue;
      }

      const progress = Math.min(elapsed / item.duration, 1);
      item.element.textContent = renderText(item.text, progress, item.seed, now);

      if (progress < 1) {
        done = false;
      } else {
        item.element.classList.remove("text-intro-running");
      }
    }

    if (!done) {
      requestAnimationFrame(frame);
    } else if (!hoverReady) {
      hoverReady = true;
      setupHover(items.filter((item) => item.element.matches("a")));
    }
  }

  frame(performance.now());

  function renderText(text, progress, seed, now) {
    const eased = 1 - Math.pow(1 - progress, 3);
    let output = "";

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === " ") {
        output += " ";
        continue;
      }

      const threshold = (i + 1) / text.length;
      const appearAt = Math.max(0, threshold - 0.28);
      const jitter = seededNoise(seed + i, Math.floor(now / 48)) * 0.2;
      if (eased < appearAt) {
        output += "\u00a0";
      } else if (eased + jitter >= threshold) {
        output += char;
      } else {
        output += bootChars[(seed + i * 7 + Math.floor(now / 42)) % bootChars.length];
      }
    }

    return output;
  }

  function maskText(text, seed) {
    return text.replace(/\S/g, "\u00a0");
  }

  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function seededNoise(seed, time) {
    const value = Math.sin(seed * 127.1 + time * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function setupHover(items) {
    for (const item of items) {
      let hoverFrame = 0;
      let hovering = false;

      item.element.addEventListener("pointerenter", () => {
        hovering = true;
        item.element.classList.add("text-hover-active");
        tickHover();
      });

      item.element.addEventListener("pointerleave", () => {
        hovering = false;
        cancelAnimationFrame(hoverFrame);
        item.element.textContent = item.text;
        item.element.classList.remove("text-hover-active");
      });

      function tickHover(now = performance.now()) {
        if (!hovering) return;

        item.element.textContent = renderHoverText(item.text, item.seed, now);
        hoverFrame = requestAnimationFrame(tickHover);
      }
    }
  }

  function renderHoverText(text, seed, now) {
    const slot = Math.floor(now / 58);
    let output = "";

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === " ") {
        output += " ";
        continue;
      }

      const flicker = seededNoise(seed + i * 13, slot);
      output += flicker > 0.82
        ? bootChars[(seed + i * 11 + slot) % bootChars.length]
        : char;
    }

    return output;
  }
})();
