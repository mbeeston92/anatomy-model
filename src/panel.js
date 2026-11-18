// The side panel's controls: quick views, restore buttons, system tick boxes,
// region rows and display options. It reads everything from the visibility
// module and redraws itself whenever that changes.
import { SIDES } from './visibility.js';
import { regionLabel, fullLabel } from './names.js';

const $ = (id) => document.getElementById(id);

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

export { regionLabel };

const SIDE_CHOICES = [
  { id: 'left', label: 'Left', sides: ['left'] },
  { id: 'right', label: 'Right', sides: ['right'] },
  { id: 'both', label: 'Both', sides: SIDES },
];
const sidesOf = (choice) => SIDE_CHOICES.find((c) => c.id === choice).sides;

/** A Left / Right / Both chooser. Returns { node, get value, set value, refresh(marks) }. */
function sideChooser(label, initial, onPick) {
  let value = initial;
  const buttons = SIDE_CHOICES.map((choice) => {
    const button = el('button', { type: 'button', class: 'seg__option', role: 'radio', text: choice.label });
    button.dataset.side = choice.id;
    button.addEventListener('click', () => { value = choice.id; onPick(choice.id); });
    return button;
  });
  const node = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, buttons);
  return {
    node,
    get value() { return value; },
    set value(next) { value = next; },
    /** marks: { left: 'hidden'|'only'|'shown', right: ..., both: ... } (optional) */
    refresh(marks = {}) {
      for (const button of buttons) {
        const id = button.dataset.side;
        button.setAttribute('aria-checked', String(id === value));
        button.classList.toggle('is-selected', id === value);
        button.classList.toggle('is-hidden', marks[id] === 'hidden');
        button.classList.toggle('is-only', marks[id] === 'only');
      }
    },
  };
}

export function createPanel({ visibility, registry, systems, presets, onIsolated, onPreset, onGhost, onFrameOption, onMedicalOption, onLabelsOption }) {
  const refreshers = [];
  const regionChoosers = new Map();
  let lastSoftSide = visibility.softSide;
  let lastIsoKey = null;

  const setRegionChoosers = (choice) => {
    for (const chooser of regionChoosers.values()) chooser.value = choice;
  };

  // Collapsible sections (Highlights, Quick views) so users can free up room on a laptop screen.
  for (const button of document.querySelectorAll('.section__toggle[aria-controls]')) {
    const body = $(button.getAttribute('aria-controls'));
    if (!body) continue;
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
    });
  }

  // ----- Quick views -----
  const presetSide = sideChooser('Side for quick views', 'right', () => refresh());
  $('preset-side').append(presetSide.node);
  refreshers.push(() => presetSide.refresh());

  const presetBox = $('presets');
  if (!presets.length) $('quick-views').hidden = true;
  for (const preset of presets) {
    const button = el('button', { type: 'button', class: 'button button--small preset', text: preset.label });
    button.addEventListener('click', () => onPreset(preset, sidesOf(presetSide.value)));
    presetBox.append(button);
    refreshers.push(() => {
      const current = visibility.preset?.startsWith(`${preset.id}|`) ?? false;
      button.classList.toggle('is-current', current);
      button.setAttribute('aria-pressed', String(current));
    });
  }

  // ----- Restore -----
  $('show-everything').addEventListener('click', () => visibility.showEverything());
  $('undo').addEventListener('click', () => visibility.undo());
  $('redo').addEventListener('click', () => visibility.redo());
  $('structures-show').addEventListener('click', () => visibility.showStructures());
  $('only-end').addEventListener('click', () => visibility.isolateStructure(visibility.only));
  refreshers.push(() => {
    $('undo').disabled = !visibility.canUndo;
    $('redo').disabled = !visibility.canRedo;
    $('show-everything').classList.toggle('button--primary', !visibility.isDefault);
    const count = visibility.structuresOffCount;
    $('structures-note').hidden = count === 0;
    $('structures-count').textContent = count === 1
      ? '1 single structure is hidden.'
      : `${count} single structures are hidden.`;
    const only = visibility.only && registry.get(visibility.only);
    $('only-note').hidden = !only;
    if (only) $('only-name').textContent = `Showing only: ${fullLabel(only.data)}.`;
  });

  // ----- Soft-tissue side -----
  const softSide = sideChooser('Side for soft tissue', 'both', (choice) => {
    setRegionChoosers(choice);
    presetSide.value = choice;
    if (!visibility.setSoftSide(choice)) refresh();
  });
  $('soft-side').append(softSide.node);
  refreshers.push(() => softSide.refresh());

  // ----- Systems -----
  const systemBox = $('systems');
  for (const system of systems) {
    const input = el('input', { type: 'checkbox', class: 'check__box' });
    input.dataset.system = system.id;
    input.addEventListener('change', () => visibility.setSystem(system.id, input.checked));
    const swatch = el('span', { class: 'check__swatch', 'aria-hidden': 'true' });
    swatch.style.background = system.colour;
    systemBox.append(el('label', { class: 'check' }, [input, swatch, el('span', { text: system.label })]));
    refreshers.push(() => { input.checked = visibility.systemOn(system.id); });
  }

  // ----- Regions -----
  const regionBox = $('regions');
  for (const region of visibility.regions) {
    const label = regionLabel(region);
    const paired = visibility.isPaired(region);
    const chooser = paired ? sideChooser(`Side for ${label}`, 'both', () => refresh()) : null;
    if (chooser) regionChoosers.set(region, chooser);
    const selected = () => (chooser ? sidesOf(chooser.value) : SIDES);

    const stateText = el('span', { class: 'region__state' });
    const name = el('span', { class: 'region__name', text: label });
    const action = (id, text, title, run) => {
      const button = el('button', { type: 'button', class: 'region__action', text, title, 'aria-label': title });
      button.dataset.action = id;
      button.addEventListener('click', run);
      return button;
    };
    const hide = action('hide', 'Hide', `Hide ${label.toLowerCase()}`, () => visibility.hide(region, selected()));
    const show = action('show', 'Show', `Show ${label.toLowerCase()}`, () => visibility.show(region, selected()));
    const isolate = action('isolate', 'Isolate', `Show only ${label.toLowerCase()}`, () => {
      const sides = selected();
      if (visibility.isolate(region, sides)) onIsolated(region, sides);
    });

    const row = el('div', { class: 'region', role: 'group', 'aria-label': label }, [
      el('div', { class: 'region__head' }, [name, stateText]),
      el('div', { class: 'region__controls' }, [
        ...(chooser ? [chooser.node] : []),
        el('div', { class: 'region__actions' }, [hide, show, isolate]),
      ]),
    ]);
    row.dataset.region = region;
    regionBox.append(row);

    refreshers.push(() => {
      const left = visibility.regionStatus(region, 'left');
      const right = visibility.regionStatus(region, 'right');
      const both = left === right ? left : 'shown';
      chooser?.refresh({ left, right, both });

      const allHidden = left === 'hidden' && right === 'hidden';
      const anyOnly = left === 'only' || right === 'only';
      row.classList.toggle('is-hidden', allHidden);
      row.classList.toggle('is-only', anyOnly);

      let text = '';
      if (left === 'only' && right === 'only') text = 'Showing only this';
      else if (left === 'only') text = 'Showing only left';
      else if (right === 'only') text = 'Showing only right';
      else if (allHidden) text = 'Hidden';
      else if (left === 'hidden') text = 'Left hidden';
      else if (right === 'hidden') text = 'Right hidden';
      stateText.textContent = text;

      const sides = selected();
      const status = sides.map((side) => visibility.regionStatus(region, side));
      const pressedHide = status.every((s) => s === 'hidden');
      const pressedIsolate = visibility.isIsolated(region, sides);
      hide.classList.toggle('is-pressed', pressedHide);
      hide.setAttribute('aria-pressed', String(pressedHide));
      isolate.classList.toggle('is-pressed', pressedIsolate);
      isolate.setAttribute('aria-pressed', String(pressedIsolate));
    });
  }

  // ----- Options -----
  $('option-ghost').addEventListener('change', (event) => onGhost(event.target.checked));
  $('option-frame').addEventListener('change', (event) => onFrameOption(event.target.checked));
  $('option-medical').addEventListener('change', (event) => onMedicalOption(event.target.checked));
  $('option-labels').addEventListener('change', (event) => onLabelsOption(event.target.checked));

  function syncFromState() {
    const current = visibility.softSide ?? 'both';
    softSide.value = current;
    if (visibility.softSide !== lastSoftSide) {
      lastSoftSide = visibility.softSide;
      setRegionChoosers(current);
      presetSide.value = current;
    }
    const iso = visibility.isolated;
    const isoKey = iso ? `${iso.region}|${[...iso.sides].sort().join('+')}` : null;
    if (isoKey !== lastIsoKey) {
      lastIsoKey = isoKey;
      if (iso) {
        const chooser = regionChoosers.get(iso.region);
        if (chooser) chooser.value = iso.sides.length === 1 ? iso.sides[0] : 'both';
      }
    }
  }

  function refresh() {
    syncFromState();
    for (const run of refreshers) run();
  }
  refresh();

  return { refresh };
}
