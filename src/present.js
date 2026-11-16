// Presentation view (a clean picture for the patient or a screenshot) and
// "Save image". The image is made in the browser and handed straight to the
// browser's own download; nothing is uploaded or kept.

const $ = (id) => document.getElementById(id);
const CREDIT = 'Anatomy models: Z-Anatomy (CC BY-SA 4.0)  ·  For patient education only. Not a diagnostic tool.';
const IMAGE_SCALE = 2;          // saved image = twice the on-screen size
const MAX_IMAGE_SIDE = 8192;    // stay inside what integrated graphics can draw
const FONT = "'Atkinson Hyperlegible', system-ui, 'Segoe UI', sans-serif";

const isTyping = (target) => target instanceof HTMLElement
  && target.matches('input[type="text"], input[type="search"], textarea, [contenteditable="true"]');

export function createPresentation({ stage, viewport, coloursInUse, requestRender, onChange = () => {} }) {
  const app = $('app');
  const key = $('key');
  const hint = $('present-hint');
  let presenting = false;
  let hintTimers = [];

  /** Redraw the colour key from the colours in use. */
  function refreshKey() {
    const colours = $('option-key').checked ? coloursInUse() : [];
    $('key-list').replaceChildren(...colours.map((colour) => {
      const dot = document.createElement('span');
      dot.className = 'key__dot';
      dot.style.setProperty('--swatch', colour.colour);
      const item = document.createElement('li');
      item.append(dot, colour.name);
      return item;
    }));
    key.hidden = colours.length === 0;
    return colours;
  }

  function showHint() {
    for (const timer of hintTimers) clearTimeout(timer);
    hint.hidden = false;
    hint.classList.remove('is-fading');
    hintTimers = [
      setTimeout(() => hint.classList.add('is-fading'), 2500),
      setTimeout(() => { hint.hidden = true; }, 3100),
    ];
  }

  function setPresenting(on) {
    if (on === presenting) return;
    presenting = on;
    app.classList.toggle('is-presenting', on);
    stage.setPlain(on);
    refreshKey();
    if (on) showHint();
    else { for (const timer of hintTimers) clearTimeout(timer); hint.hidden = true; }
    onChange(on);
    requestRender();
  }

  // ----- Save image -----

  function roundedBox(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  /** Build the picture: light backdrop, the model, the key (if shown) and the credit line. */
  function composeImage() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const scale = Math.min(IMAGE_SCALE, MAX_IMAGE_SIDE / Math.max(width, height));
    const picture = document.createElement('canvas');
    picture.width = Math.round(width * scale);
    picture.height = Math.round(height * scale);
    const ctx = picture.getContext('2d');

    // The same light backdrop as on screen.
    const style = getComputedStyle(document.documentElement);
    const centre = style.getPropertyValue('--ground-lift').trim() || '#f8fafb';
    const edge = style.getPropertyValue('--ground').trim() || '#e9edf0';
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, picture.width, picture.height);
    ctx.save();
    ctx.translate(picture.width * 0.5, picture.height * 0.45);
    ctx.scale(picture.width * 0.7, picture.height * 0.75);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, centre);
    glow.addColorStop(1, edge);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // The model, drawn fresh at the larger size and copied at once.
    stage.snapshot(scale, (canvas) => ctx.drawImage(canvas, 0, 0, picture.width, picture.height));

    ctx.scale(scale, scale);     // from here on, work in on-screen pixels
    ctx.textBaseline = 'middle';

    const colours = refreshKey();
    if (colours.length) {
      ctx.font = `16px ${FONT}`;
      const row = 26;
      const textWidth = Math.max(...colours.map((c) => ctx.measureText(c.name).width));
      const boxWidth = Math.min(width - 36, 14 + 16 + 10 + textWidth + 14);
      const boxHeight = 20 + colours.length * row - 6;
      const x = 18;
      const y = height - 18 - boxHeight;
      roundedBox(ctx, x, y, boxWidth, boxHeight, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fill();
      ctx.strokeStyle = '#d3dae0';
      ctx.lineWidth = 1;
      ctx.stroke();
      colours.forEach((colour, i) => {
        const cy = y + 10 + i * row + 10;
        ctx.fillStyle = colour.colour;
        ctx.beginPath();
        ctx.arc(x + 14 + 8, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e2a33';
        ctx.fillText(colour.name, x + 14 + 16 + 10, cy + 1, boxWidth - 54);
      });
    }

    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = '#55636f';
    ctx.textAlign = 'right';
    ctx.fillText(CREDIT, width - 14, height - 14, width - 28);
    return picture;
  }

  function fileName() {
    const now = new Date();
    const two = (n) => String(n).padStart(2, '0');
    return `anatomy-model-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}.png`;
  }

  /** Make the PNG and give it to the browser to save in Downloads. */
  function saveImage() {
    const picture = composeImage();
    return new Promise((resolve) => {
      picture.toBlob((blob) => {
        if (!blob) { resolve(false); return; }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName();
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
        resolve(true);
      }, 'image/png');
    });
  }

  $('present').addEventListener('click', () => setPresenting(true));
  $('save-image').addEventListener('click', () => saveImage());
  $('option-key').addEventListener('change', refreshKey);

  // P toggles; Esc leaves (before Esc does anything else); S saves while presenting.
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    const letter = event.key.toLowerCase();
    if (letter === 'p') { event.preventDefault(); setPresenting(!presenting); }
    else if (presenting && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setPresenting(false); }
    else if (presenting && letter === 's') { event.preventDefault(); saveImage(); }
  }, true);

  return {
    get presenting() { return presenting; },
    setPresenting,
    saveImage,
    refreshKey,
  };
}
