// Interface: side panel, loading bar, error message and view buttons.
// Talks to the rest of the app only through the callbacks passed in.

const $ = (id) => document.getElementById(id);

export function createUI({ onView, onRetry }) {
  const app = $('app');
  const toggle = $('panel-toggle');
  const toggleLabel = $('panel-toggle-label');
  const loading = $('loading');
  const error = $('error');
  const viewButtons = [...document.querySelectorAll('[data-view]')];

  // ----- Side panel -----
  function setPanelOpen(open) {
    app.classList.toggle('is-panel-closed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    const text = open ? 'Hide panel' : 'Show panel';
    toggle.title = text;
    toggleLabel.textContent = text;
  }
  toggle.addEventListener('click', () => setPanelOpen(app.classList.contains('is-panel-closed')));
  setPanelOpen(!window.matchMedia('(max-width: 760px)').matches);

  // ----- View buttons -----
  for (const button of viewButtons) {
    button.addEventListener('click', () => onView(button.dataset.view));
  }
  function setCurrentView(name) {
    for (const button of viewButtons) {
      const current = button.dataset.view === name;
      button.classList.toggle('is-current', current);
      if (button.dataset.view !== 'reset') button.setAttribute('aria-pressed', String(current));
    }
  }

  // ----- Loading -----
  function setProgress({ fraction, label }) {
    const percent = Math.round(fraction * 100);
    $('loading-label').textContent = label;
    $('loading-percent').textContent = `${percent}%`;
    $('loading-bar').style.width = `${percent}%`;
    $('loading-track').setAttribute('aria-valuenow', String(percent));
    loading.classList.toggle('is-done', fraction >= 1);
  }

  // ----- Errors -----
  function showError({ title, detail, partial = false }) {
    $('error-title').textContent = title;
    $('error-detail').textContent = detail;
    error.classList.toggle('is-partial', partial);
    error.hidden = false;
    loading.classList.add('is-done');
  }
  function hideError() {
    error.hidden = true;
  }
  $('error-retry').addEventListener('click', () => {
    hideError();
    loading.classList.remove('is-done');
    onRetry();
  });

  return { setProgress, showError, hideError, setCurrentView, setPanelOpen };
}

/** "Muscles", "Muscles and nerves", "Muscles, nerves and bursae". */
export function listInWords(words) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}
