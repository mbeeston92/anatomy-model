// Hover and selection: the name label that follows the pointer, clicking to
// select, the outline, and the info card with its quick actions.
// All names come from the registry (structures.json).
import * as THREE from 'three';
import { fullLabel, sideWord, regionLabel } from './names.js';

const $ = (id) => document.getElementById(id);
const CLICK_SLOP = 5;   // pixels the pointer may move and still count as a click

export function createSelection({
  registry, visibility, picker, outline, rig, canvas, viewport,
  shouldZoom = () => true, requestRender, onChange = () => {},
}) {
  let selectedId = null;
  let hoverId = null;
  let medical = false;
  let interceptClick = null;   // set while the next click means something else (placing a pain area)
  const pointer = { x: 0, y: 0, inside: false, buttons: 0, dirty: false, down: null };

  const hoverLabel = $('hover-label');
  const meshOf = (id) => registry.get(id)?.mesh ?? null;

  function syncOutline() {
    if (outline.set(meshOf(selectedId), meshOf(hoverId))) requestRender();
  }

  // ----- Hover -----

  function placeHoverLabel() {
    const rect = viewport.getBoundingClientRect();
    const width = hoverLabel.offsetWidth;
    const height = hoverLabel.offsetHeight;
    let x = pointer.x - rect.left + 16;
    let y = pointer.y - rect.top + 18;
    if (x + width > rect.width - 8) x = pointer.x - rect.left - width - 12;
    if (y + height > rect.height - 8) y = pointer.y - rect.top - height - 12;
    hoverLabel.style.transform = `translate(${Math.max(8, Math.round(x))}px, ${Math.max(8, Math.round(y))}px)`;
  }

  /** withLabel: show the name by the pointer (not wanted when hovering a floating label). */
  function setHover(id, withLabel = true) {
    const entry = id ? registry.get(id) : null;
    if (entry && withLabel) {
      $('hover-name').textContent = fullLabel(entry.data);
      $('hover-medical').textContent = entry.data.medicalName ?? '';
      $('hover-medical').hidden = !medical || !entry.data.medicalName;
      hoverLabel.hidden = false;
      placeHoverLabel();
    } else {
      hoverLabel.hidden = true;
    }
    canvas.classList.toggle('is-over-structure', !!entry);
    if ((entry?.id ?? null) === hoverId) return;
    hoverId = entry?.id ?? null;
    syncOutline();
  }

  /**
   * Call once per frame. The hit test runs at most once a frame, and not
   * while the camera is moving or a button is held (dragging).
   */
  function tick(cameraMoving) {
    if (!pointer.dirty) return;
    if (cameraMoving || pointer.buttons) { setHover(null); return; }   // try again once still
    pointer.dirty = false;
    const hit = pointer.inside ? picker.pick(pointer.x, pointer.y) : null;
    setHover(hit?.entry.id ?? null);
  }

  canvas.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.buttons = event.buttons;
    pointer.inside = event.pointerType !== 'touch';
    pointer.dirty = true;
  });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; pointer.dirty = true; });
  canvas.addEventListener('wheel', () => { pointer.dirty = true; }, { passive: true });

  // ----- Click to select -----

  canvas.addEventListener('pointerdown', (event) => {
    pointer.buttons = event.buttons;
    pointer.down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  });
  canvas.addEventListener('pointerup', (event) => {
    pointer.buttons = event.buttons;
    pointer.dirty = true;
    const down = pointer.down;
    pointer.down = null;
    if (!down || event.button !== 0) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLOP) return;   // it was a drag
    const hit = picker.pick(event.clientX, event.clientY);
    if (interceptClick?.(hit)) return;
    if (hit) select(hit.entry.id);
    else deselect();
  });
  canvas.addEventListener('pointercancel', () => { pointer.down = null; pointer.buttons = 0; });

  // ----- Info card -----

  function refreshCard() {
    const entry = selectedId ? registry.get(selectedId) : null;
    $('info-card').hidden = !entry;
    $('info-empty').hidden = !!entry;
    if (!entry) return;
    const d = entry.data;
    $('info-name').textContent = d.name;
    $('info-medical').textContent = d.medicalName ?? '';
    $('info-medical').hidden = !medical || !d.medicalName;
    $('info-side').textContent = sideWord(d);
    $('info-system').textContent = entry.system?.label ?? d.system;
    $('info-regions-label').textContent = d.regions.length === 1 ? 'Region' : 'Regions';
    $('info-regions').textContent = d.regions.map(regionLabel).join(', ');

    const isolated = visibility.only === entry.id;
    const switchedOff = !visibility.structureOn(entry.id);
    const shown = visibility.statusOf(entry) === 'shown';
    $('info-hide').textContent = switchedOff ? 'Show this' : 'Hide this';
    $('info-isolate').classList.toggle('is-current', isolated);
    $('info-isolate').setAttribute('aria-pressed', String(isolated));
    $('info-state').hidden = shown;
    if (!shown) {
      $('info-state').textContent = switchedOff
        ? 'Hidden at the moment.'
        : 'Hidden at the moment (its region, system or side is switched off).';
    }
  }

  function zoomTo(id = selectedId) {
    const mesh = meshOf(id);
    if (!mesh) return;
    const box = new THREE.Box3().expandByObject(mesh);
    if (!box.isEmpty()) rig.frame(box);
  }

  function select(id, { reveal = false, zoom = false } = {}) {
    if (!registry.has(id)) return;
    selectedId = id;
    if (reveal) visibility.reveal(id);
    refreshCard();
    syncOutline();
    $('info').scrollIntoView({ block: 'nearest' });
    if (zoom) zoomTo(id);
    onChange();
  }

  function deselect() {
    if (!selectedId) return;
    selectedId = null;
    refreshCard();
    syncOutline();
    onChange();
  }

  $('info-close').addEventListener('click', deselect);
  $('info-hide').addEventListener('click', () => {
    if (selectedId) visibility.setStructure(selectedId, !visibility.structureOn(selectedId));
  });
  $('info-isolate').addEventListener('click', () => {
    if (selectedId && visibility.isolateStructure(selectedId) && shouldZoom()) zoomTo();
  });
  $('info-zoom').addEventListener('click', () => zoomTo());

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    deselect();
  });

  refreshCard();

  return {
    select,
    deselect,
    zoomTo,
    tick,
    setHover,
    get selectedId() { return selectedId; },
    get hoverId() { return hoverId; },
    get medical() { return medical; },
    setClickInterceptor(fn) { interceptClick = fn; },
    setMedical(on) { medical = !!on; refreshCard(); pointer.dirty = true; },
    /** Call when visibility changes: the card and the hover may be out of date. */
    refresh() { refreshCard(); pointer.dirty = true; requestRender(); },
  };
}
