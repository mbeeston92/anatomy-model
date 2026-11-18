// Injury highlights in the interface: the colour palette with its editable
// meanings, the colour buttons on the info card, the list of current
// highlights, the right-click menu, "fade everything else" and shaded pain
// areas. The highlights themselves live in the visibility module (so Undo and
// Redo cover them) and only in memory: nothing is stored or sent anywhere.
import { fullLabel } from './names.js';

const $ = (id) => document.getElementById(id);
const CLICK_SLOP = 5;

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value);
  }
  for (const child of children) node.append(child);
  return node;
};

export function createHighlights({
  palette, registry, visibility, selection, picker, canvas, viewport,
  onNamesChanged = () => {},
}) {
  const refreshers = [];
  const swatch = (colour, extra = {}) => {
    const button = el('button', { type: 'button', class: 'swatch', ...extra });
    button.style.setProperty('--swatch', colour.colour);
    button.dataset.colour = colour.id;
    button.dataset.pattern = colour.pattern;
    return button;
  };

  /** Apply (or, with the same colour again, remove) a colour on the selected structure. */
  function applyToSelected(colourId) {
    const id = selection.selectedId;
    if (!id) {
      $('palette-hint').animate?.([{ color: '#1f6f78' }, { color: '#55636f' }], { duration: 900 });
      return;
    }
    visibility.setHighlight(id, colourId);
  }

  // ----- Palette: a colour button and its editable meaning -----
  for (const colour of palette.colours) {
    const button = swatch(colour);
    button.addEventListener('click', () => applyToSelected(colour.id));
    const input = el('input', {
      type: 'text', class: 'palette__name', maxlength: '40', spellcheck: 'true',
      'aria-label': `What ${colour.id} means`,
    });
    input.value = colour.name;
    input.dataset.colourName = colour.id;
    input.addEventListener('input', () => { palette.rename(colour.id, input.value); refresh(); onNamesChanged(); });
    input.addEventListener('change', () => { input.value = colour.name; });
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); input.blur(); } });
    $('palette').append(el('div', { class: 'palette__row' }, [button, input]));

    const cardButton = swatch(colour);
    cardButton.addEventListener('click', () => applyToSelected(colour.id));
    $('info-swatches').append(cardButton);

    refreshers.push(() => {
      const selected = selection.selectedId;
      const on = !!selected && visibility.highlightOf(selected) === colour.id;
      for (const b of [button, cardButton]) {
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
        b.title = on ? `Remove “${colour.name}”` : `Mark as “${colour.name}”`;
        b.setAttribute('aria-label', b.title);
      }
    });
  }

  // ----- The list of current highlights -----
  const list = $('highlight-list');
  function refreshList() {
    list.replaceChildren();
    for (const { id, colour } of visibility.highlights()) {
      const entry = registry.get(id);
      const shade = palette.get(colour);
      if (!entry || !shade) continue;
      const dot = el('span', { class: 'marks__dot', 'aria-hidden': 'true' });
      dot.style.setProperty('--swatch', shade.colour);
      dot.dataset.pattern = shade.pattern;
      const hidden = visibility.statusOf(entry) !== 'shown';
      const jump = el('button', { type: 'button', class: 'marks__jump', title: 'Go to this structure' }, [
        fullLabel(entry.data),
        el('small', { text: hidden ? `${shade.name} (hidden at the moment)` : shade.name }),
      ]);
      jump.dataset.jump = id;
      jump.addEventListener('click', () => selection.select(id, { reveal: true, zoom: true }));
      const remove = el('button', { type: 'button', class: 'marks__remove', title: 'Remove this highlight', 'aria-label': `Remove highlight from ${fullLabel(entry.data)}`, text: '×' });
      remove.dataset.remove = id;
      remove.addEventListener('click', () => visibility.removeHighlight(id));
      list.append(el('li', { class: 'marks__row' }, [dot, jump, remove]));
    }
    visibility.spots().forEach((spot, index) => {
      const shade = palette.get(spot.colour);
      if (!shade) return;
      const on = spot.on ? registry.get(spot.on) : null;
      const dot = el('span', { class: 'marks__dot marks__dot--area', 'aria-hidden': 'true' });
      dot.style.setProperty('--swatch', shade.colour);
      dot.dataset.pattern = shade.pattern;
      const text = el('span', { class: 'marks__jump' }, [
        `Pain area, ${Math.round(spot.r * 200)} cm across`,
        el('small', { text: on ? `${shade.name} · placed on ${fullLabel(on.data)}` : shade.name }),
      ]);
      const remove = el('button', { type: 'button', class: 'marks__remove', title: 'Remove this pain area', 'aria-label': 'Remove this pain area', text: '×' });
      remove.dataset.removeSpot = String(index);
      remove.addEventListener('click', () => visibility.removeSpot(index));
      list.append(el('li', { class: 'marks__row' }, [dot, text, remove]));
    });
    $('highlights-clear').disabled = list.children.length === 0;
  }
  refreshers.push(refreshList);
  $('highlights-clear').addEventListener('click', () => visibility.clearHighlights());

  // ----- Fade everything else -----
  $('option-emphasis').addEventListener('change', (event) => visibility.setEmphasis(event.target.checked));

  // ----- Shaded pain area -----
  let spotColour = palette.colours[0].id;
  let placing = false;
  const spotButtons = palette.colours.map((colour) => {
    const button = swatch(colour, { role: 'radio' });
    button.addEventListener('click', () => { spotColour = colour.id; refresh(); });
    $('spot-colours').append(button);
    return button;
  });
  refreshers.push(() => {
    for (const button of spotButtons) {
      const on = button.dataset.colour === spotColour;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-checked', String(on));
      button.title = `Pain area colour: ${palette.get(button.dataset.colour).name}`;
      button.setAttribute('aria-label', button.title);
    }
  });
  const spotRadius = () => Number($('spot-size').value) / 100;     // the slider is the radius in cm
  const showSize = () => { $('spot-size-text').textContent = `${Number($('spot-size').value) * 2} cm across`; };
  $('spot-size').addEventListener('input', showSize);
  showSize();

  function setPlacing(on) {
    placing = on;
    canvas.classList.toggle('is-placing', on);
    $('spot-hint').hidden = !on;
    $('spot-add').classList.toggle('is-current', on);
    $('spot-add').setAttribute('aria-pressed', String(on));
  }
  $('spot-add').addEventListener('click', () => setPlacing(!placing));
  // While placing, the next click on the model sets the pain area instead of selecting.
  selection.setClickInterceptor((hit) => {
    if (!placing) return false;
    if (hit) {
      visibility.addSpot({ x: hit.point.x, y: hit.point.y, z: hit.point.z, r: spotRadius(), colour: spotColour, on: hit.entry.id });
      setPlacing(false);
    }
    return true;
  });

  // ----- Right-click menu -----
  const menu = $('menu');
  let rightDown = null;

  function closeMenu() {
    if (menu.hidden) return false;
    menu.hidden = true;
    menu.replaceChildren();
    return true;
  }

  function openMenu(id, clientX, clientY) {
    const entry = registry.get(id);
    if (!entry) return;
    menu.replaceChildren(el('p', { class: 'menu__title', text: fullLabel(entry.data) }));
    const item = (text, run, { colour = null, on = false } = {}) => {
      const button = el('button', { type: 'button', class: `menu__item${on ? ' is-on' : ''}`, role: 'menuitem' });
      if (colour) {
        const dot = el('span', { class: 'menu__dot', 'aria-hidden': 'true' });
        dot.style.setProperty('--swatch', colour.colour);
        dot.dataset.pattern = colour.pattern;
        button.append(dot);
        button.dataset.menuColour = colour.id;
      }
      button.append(text);
      button.addEventListener('click', () => { closeMenu(); run(); });
      menu.append(button);
      return button;
    };
    const current = visibility.highlightOf(id);
    for (const colour of palette.colours) {
      item(colour.name, () => visibility.setHighlight(id, colour.id), { colour, on: current === colour.id });
    }
    if (current) item('Remove highlight', () => visibility.removeHighlight(id)).dataset.menu = 'remove';
    menu.append(el('div', { class: 'menu__rule' }));
    item('Hide this', () => visibility.setStructure(id, false)).dataset.menu = 'hide';
    item(visibility.only === id ? 'Show the rest' : 'Isolate this', () => visibility.isolateStructure(id)).dataset.menu = 'isolate';
    item('Zoom to this', () => selection.zoomTo(id)).dataset.menu = 'zoom';

    menu.hidden = false;
    const rect = viewport.getBoundingClientRect();
    const x = Math.min(clientX - rect.left, rect.width - menu.offsetWidth - 8);
    const y = Math.min(clientY - rect.top, rect.height - menu.offsetHeight - 8);
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
  }

  canvas.addEventListener('pointerdown', (event) => {
    closeMenu();
    rightDown = event.button === 2 ? { x: event.clientX, y: event.clientY } : null;
  });
  // A right-click that did not drag opens the menu; a right-drag still moves the model.
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const down = rightDown;
    rightDown = null;
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLOP) return;
    const hit = picker.pick(event.clientX, event.clientY);
    if (!hit) return;
    selection.select(hit.entry.id);
    openMenu(hit.entry.id, event.clientX, event.clientY);
  });
  canvas.addEventListener('wheel', closeMenu, { passive: true });
  window.addEventListener('pointerdown', (event) => { if (!menu.contains(event.target) && event.target !== canvas) closeMenu(); });
  window.addEventListener('blur', closeMenu);

  // Esc closes the menu or cancels placing before anything else reacts to it.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (closeMenu() || placing) {
      setPlacing(false);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  function refresh() {
    for (const run of refreshers) run();
  }
  refresh();

  return {
    refresh,
    closeMenu,
    /** The palette colours in use right now (highlights that are on show, and pain areas), in palette order. */
    coloursInUse() {
      const used = new Set(visibility.spots().map((spot) => spot.colour));
      for (const { id, colour } of visibility.highlights()) {
        if (visibility.statusOf(registry.get(id)) === 'shown') used.add(colour);
      }
      return palette.colours.filter((colour) => used.has(colour.id));
    },
  };
}
