(function () {
  const menu = document.querySelector(".debug-menu");
  if (!menu) return;

  const params = new URLSearchParams(window.location.search);
  if (!params.has("debug")) {
    menu.remove();
    return;
  }

  const root = document.documentElement;
  const bgInput = menu.elements.bg;
  const inkInput = menu.elements.ink;
  const charsetInput = menu.elements.charset;
  const customCharsetInput = menu.elements.customCharset;
  const customCharsetField = menu.querySelector(".custom-charset-field");
  const shapeInput = menu.elements.shape;
  const circleThicknessInput = menu.elements.circleThickness;
  const circleThicknessField = menu.querySelector(".circle-thickness-field");
  const copyButton = menu.elements.copy;
  let forceShape = params.has("shape");

  menu.hidden = false;
  applyUrlSettings();

  function getDebugConfig() {
    return {
      bg: bgInput.value,
      textBorder: inkInput.value,
      charset: charsetInput.value,
      customCharset: customCharsetInput.value,
      shape: shapeInput.value,
      circleThickness: Number(circleThicknessInput.value),
    };
  }

  function applyDebugSettings() {
    const bg = bgInput.value;
    const ink = inkInput.value;
    const charset = charsetInput.value;
    const customCharset = customCharsetInput.value;
    const shape = shapeInput.value;
    const circleThickness = Number(circleThicknessInput.value);

    customCharsetField.hidden = charset !== "custom";
    circleThicknessField.hidden = shape !== "circle";

    root.style.setProperty("--page", bg);
    root.style.setProperty("--ink", ink);

    window.dispatchEvent(new CustomEvent("site-debug-change", {
      detail: { bg, ink, charset, customCharset, shape, circleThickness, forceShape },
    }));
  }

  async function copyConfig() {
    const text = JSON.stringify(getDebugConfig(), null, 2);

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        copyWithTextarea(text);
      }
      copyButton.textContent = "copied";
      window.setTimeout(() => {
        copyButton.textContent = "copy config";
      }, 1200);
    } catch (_error) {
      copyWithTextarea(text);
    }
  }

  function copyWithTextarea(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function applyUrlSettings() {
    const bg = params.get("bg");
    const ink = params.get("ink") || params.get("textBorder");
    const charset = params.get("charset");
    const customCharset = params.get("customCharset");
    const shape = params.get("shape");
    const circleThickness = params.get("circleThickness");

    if (bg) bgInput.value = bg;
    if (ink) inkInput.value = ink;
    if (charset && charsetInput.querySelector(`option[value="${CSS.escape(charset)}"]`)) {
      charsetInput.value = charset;
    }
    if (customCharset) customCharsetInput.value = customCharset;
    if (shape && shapeInput.querySelector(`option[value="${CSS.escape(shape)}"]`)) {
      shapeInput.value = shape;
    } else if (window.matchMedia("(max-width: 640px)").matches) {
      shapeInput.value = "box";
    }
    if (circleThickness) circleThicknessInput.value = circleThickness;
  }

  menu.addEventListener("input", applyDebugSettings);
  menu.addEventListener("change", applyDebugSettings);
  shapeInput.addEventListener("change", () => {
    forceShape = true;
    applyDebugSettings();
  });
  copyButton.addEventListener("click", copyConfig);
  applyDebugSettings();
})();
