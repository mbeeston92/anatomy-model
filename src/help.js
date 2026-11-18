// Help overlay: 30-second "How to use" guide and keyboard shortcuts list.
// Opens from the "?" button or the "?" key; closes on Esc, "?" or clicking outside.

const $ = (id) => document.getElementById(id);

export function createHelp() {
  const dialog = $('help-dialog');
  const openButton = $('help-open');
  const closeButton = $('help-close');
  let returnFocus = null;

  const isOpen = () => !!dialog && !dialog.hidden;

  function open() {
    if (!dialog || isOpen()) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : openButton;
    dialog.hidden = false;
    openButton?.setAttribute('aria-expanded', 'true');
    closeButton?.focus();
  }

  function close() {
    if (!isOpen()) return;
    dialog.hidden = true;
    openButton?.setAttribute('aria-expanded', 'false');
    (returnFocus?.isConnected ? returnFocus : openButton)?.focus();
    returnFocus = null;
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  openButton?.addEventListener('click', open);
  closeButton?.addEventListener('click', close);
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  // Esc closes the help overlay before anything else handles it.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }, true);

  return {
    open,
    close,
    toggle,
    get isOpen() { return isOpen(); },
  };
}
