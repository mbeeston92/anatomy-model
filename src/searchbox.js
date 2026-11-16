// The search box at the top of the panel. Results appear as you type; a
// left/right pair is one row with a button for each side.
import { createSearch } from './search.js';

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

const SIDE_BUTTONS = [['left', 'Left'], ['right', 'Right'], ['midline', 'Show']];

export function createSearchBox({ registry, showMedical = () => false, onPick }) {
  const input = document.getElementById('search');
  const box = document.getElementById('search-results');
  const search = createSearch(registry.all().map((entry) => entry.data));
  const systemLabel = (id) => registry.systems.find((s) => s.id === id)?.label ?? id;

  function clear() {
    input.value = '';
    box.replaceChildren();
    box.hidden = true;
  }

  function pick(id) {
    clear();
    input.blur();
    onPick(id);
  }

  function render() {
    const query = input.value.trim();
    box.replaceChildren();
    box.hidden = !query;
    if (!query) return;
    const results = search(query);
    if (!results.length) {
      box.append(el('p', { class: 'search__none', text: `Nothing found for “${query}”.` }));
      return;
    }
    for (const result of results) {
      const buttons = SIDE_BUTTONS.filter(([side]) => result[side]).map(([side, label]) => {
        const button = el('button', { type: 'button', class: 'search__pick', text: label });
        button.dataset.result = result[side];
        button.addEventListener('click', () => pick(result[side]));
        return button;
      });
      const text = [el('span', { class: 'search__name', text: result.name })];
      if (showMedical() && result.medicalName) text.push(el('span', { class: 'search__medical', text: result.medicalName }));
      text.push(el('span', { class: 'search__system', text: systemLabel(result.system) }));
      box.append(el('div', { class: 'search__row' }, [
        el('div', { class: 'search__text' }, text),
        el('div', { class: 'search__sides' }, buttons),
      ]));
    }
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (input.value) event.preventDefault();      // first Esc clears the search, not the selection
      clear();
    } else if (event.key === 'Enter') {
      box.querySelector('.search__pick')?.click();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      box.querySelector('.search__pick')?.focus();
    }
  });
  // Arrow keys move through the result buttons.
  box.addEventListener('keydown', (event) => {
    const buttons = [...box.querySelectorAll('.search__pick')];
    const at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (move) {
      event.preventDefault();
      (buttons[at + move] ?? (move < 0 ? input : buttons[at])).focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      clear();
      input.focus();
    }
  });

  return { clear, refresh: render };
}
