// Entry point: wires the modules together and runs the frame loop.
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles.css';

import * as THREE from 'three';
import { createStage } from './scene.js';
import { createMaterials, createLooks } from './materials.js';
import { createRegistry } from './registry.js';
import { createModelLoader, loadStructureData, loadPresets } from './loader.js';
import { createCameraRig } from './camera.js';
import { createUI, listInWords } from './ui.js';
import { createVisibility } from './visibility.js';
import { createPanel } from './panel.js';
import { createPicker } from './picking.js';
import { createSelection } from './selection.js';
import { createSearchBox } from './searchbox.js';
import { createLabels } from './labels.js';
import { createPalette } from './palette.js';
import { createHighlights } from './highlights.js';
import { createPresentation } from './present.js';
import { createHelp } from './help.js';

const canvas = document.getElementById('canvas');
const viewport = document.getElementById('viewport');

const SETTLE_MS = 400;  // how long after movement stops before the sharp redraw
const VIEW_KEYS = { 1: 'front', 2: 'back', 3: 'left', 4: 'right', 5: 'top' };
const isTyping = (target) => target instanceof HTMLElement
  && target.matches('input[type="text"], input[type="search"], textarea, [contenteditable="true"]');

let stage, rig, registry, loader, visibility, panel, picker, selection, searchBox, labels;
let highlights, presentation;
const help = createHelp();
const palette = createPalette();   // highlight colours and their meanings (this session only)
let frameOnIsolate = true;
let needsRender = true;
let moving = false;
let lastMoved = 0;
const stats = { frames: 0, startedAt: performance.now(), firstModelAt: null, allLoadedAt: null };

const requestRender = () => { needsRender = true; };

const ui = createUI({
  onView: (name) => rig?.goTo(name),
  onRetry: () => start(),
});

function frame(now) {
  requestAnimationFrame(frame);
  if (!stage || !rig) return;

  const cameraMoved = rig.update(now);
  selection?.tick(cameraMoved);          // hover: at most one hit test per frame

  if (cameraMoved) {
    lastMoved = now;
    if (!moving) { moving = true; stage.setMoving(true); picker?.setPaused(true); }
    needsRender = true;
  } else if (moving && now - lastMoved > SETTLE_MS) {
    moving = false;
    stage.setMoving(false);
    picker?.setPaused(false);
    needsRender = true;          // one sharp frame once everything is still
  }

  // Draw only when something has changed: an idle model costs nothing.
  if (needsRender) {
    needsRender = false;
    stage.render();
    labels?.update();
    stats.frames++;
  }
}

function setUpStage() {
  try {
    stage = createStage(canvas, viewport, { highlightColours: palette.colours });
  } catch (cause) {
    console.error(cause);
    ui.showError({
      title: 'This browser cannot show the 3D model',
      detail: 'Open the page in an up-to-date version of Chrome, Edge or Safari. If that does not help, check that hardware acceleration is switched on in the browser settings.',
    });
    document.getElementById('error-retry').hidden = true;
    return false;
  }

  rig = createCameraRig({
    camera: stage.camera,
    domElement: canvas,
    getPickTargets: () => visibility?.shownMeshes() ?? [],
    onViewChange: (name) => ui.setCurrentView(name),
  });
  rig.goTo('front', { immediate: true });

  new ResizeObserver(() => {
    stage.resize();
    stage.render();              // redraw at once so the picture never stretches
  }).observe(viewport);

  stage.renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    ui.showError({
      title: 'The 3D view stopped',
      detail: 'The browser ran short of graphics memory. Reload the page to carry on.',
    });
  });

  requestAnimationFrame(frame);
  return true;
}

function frameRegion(region, sides, view = null) {
  const box = visibility.frameBox(region, sides);
  if (box) rig.frame(box, { view });
}

/** Turn a quick view's "view" into a camera view. "outer" and "inner" depend on the side. */
function presetView(view, sides) {
  if (view !== 'outer' && view !== 'inner') return view ?? null;
  if (sides.length !== 1) return 'front';
  const other = { left: 'right', right: 'left' };
  return view === 'outer' ? sides[0] : other[sides[0]];
}

// Keyboard shortcuts (ignored while typing in the search box or editing highlight labels).
window.addEventListener('keydown', (event) => {
  if (isTyping(event.target)) return;
  if (event.ctrlKey || event.metaKey) {
    if (!visibility || event.altKey) return;
    const letter = event.key.toLowerCase();
    if (letter === 'z') { event.preventDefault(); if (event.shiftKey) visibility.redo(); else visibility.undo(); }
    else if (letter === 'y') { event.preventDefault(); visibility.redo(); }
    return;
  }
  if (event.altKey) return;
  if (event.key === '?') { event.preventDefault(); help.toggle(); return; }
  if (help.isOpen) return;

  const view = VIEW_KEYS[event.key];
  if (view && rig) { event.preventDefault(); rig.goTo(view); return; }
  const letter = event.key.toLowerCase();
  if (letter === 'r' && rig) { event.preventDefault(); rig.goTo('reset'); }
  else if (letter === 'a' && visibility) { event.preventDefault(); visibility.showEverything(); }
  else if (letter === 'c' && visibility) { event.preventDefault(); visibility.clearHighlights(); }
});

async function start() {
  if (!stage && !setUpStage()) return;

  try {
    if (!registry) {
      const data = await loadStructureData();
      registry = createRegistry(data);
      const materials = createMaterials(data.systems);
      visibility = createVisibility({
        registry,
        materials,
        looks: createLooks(palette),
        onChange: () => {
          stage.glow.set(visibility.highlightedMeshes(), visibility.emphasis);
          panel?.refresh(); selection?.refresh(); highlights?.refresh(); presentation?.refreshKey();
          labels?.invalidate(); requestRender();
        },
      });
      picker = createPicker({
        camera: stage.camera,
        domElement: canvas,
        registry,
        getTargets: () => visibility.shownMeshes(),
      });
      selection = createSelection({
        registry, visibility, picker, rig, canvas, viewport,
        outline: stage.outline,
        shouldZoom: () => frameOnIsolate,
        requestRender,
        onChange: () => { highlights?.refresh(); labels?.invalidate(); requestRender(); },
      });
      highlights = createHighlights({
        palette, registry, visibility, selection, picker, canvas, viewport,
        onNamesChanged: () => presentation?.refreshKey(),
      });
      presentation = createPresentation({
        stage, viewport, requestRender,
        coloursInUse: () => highlights.coloursInUse(),
        getLabels: () => labels?.getLayout() ?? [],
        onChange: () => { highlights.closeMenu(); selection.setHover(null); },
      });
      searchBox = createSearchBox({
        registry,
        showMedical: () => selection.medical,
        onPick: (id) => selection.select(id, { reveal: true, zoom: true }),
      });
      labels = createLabels({
        registry, visibility, viewport,
        camera: stage.camera,
        getSelectedId: () => selection.selectedId,
        onPick: (id) => selection.select(id),
        onHover: (id) => selection.setHover(id, false),
      });
      panel = createPanel({
        visibility,
        registry,
        systems: data.systems,
        presets: await loadPresets(),
        onIsolated: (region, sides) => { if (frameOnIsolate) frameRegion(region, sides); },
        onPreset: (preset, sides) => {
          const isolated = visibility.applyPreset(preset, sides);
          if (isolated) frameRegion(isolated.region, isolated.sides, presetView(preset.view, sides));
          else if (preset.view) rig.goTo(presetView(preset.view, sides) ?? 'front');
        },
        onGhost: (on) => visibility.setGhost(on),
        onFrameOption: (on) => { frameOnIsolate = on; },
        onMedicalOption: (on) => { selection.setMedical(on); searchBox.refresh(); },
        onLabelsOption: (on) => { labels.setEnabled(on); requestRender(); },
      });
      loader = createModelLoader({
        registry,
        materials,
        parent: stage.scene,
        onProgress: (state) => ui.setProgress(state),
        onSystemLoaded: (system, group) => {
          if (system.id === 'bone') {
            // Frame the camera on the skeleton as soon as it arrives.
            rig.setBounds(new THREE.Box3().setFromObject(group));
            rig.goTo('front', { immediate: true });
            stats.firstModelAt = performance.now();
          }
          visibility.apply();      // newly arrived parts follow the current settings
          picker.index(group);     // build the fast hit-test index in the background
        },
      });
    }

    const failed = await loader.load();
    if (failed.length === 0) {
      stats.allLoadedAt = performance.now();
      const missing = registry.missing();
      if (missing.length) console.warn(`${missing.length} structures have no mesh:`, missing);
      return;
    }

    const names = listInWords(failed.map((s) => s.label.toLowerCase()));
    const nothingShown = !loader.isLoaded('bone');
    ui.showError({
      title: nothingShown ? 'The model could not be loaded' : `Some parts could not be loaded: ${names}`,
      detail: 'Check the internet connection, then try again.',
      partial: !nothingShown,
    });
  } catch (error) {
    console.error(error);
    ui.showError({
      title: 'The model could not be loaded',
      detail: 'Check the internet connection, then try again.',
    });
  }
}

start();

// A handle for automated checks and for later stages' debugging. No data is stored.
window.__viewer = {
  get stage() { return stage; },
  get rig() { return rig; },
  get registry() { return registry; },
  get visibility() { return visibility; },
  get picker() { return picker; },
  get selection() { return selection; },
  get labels() { return labels; },
  get highlights() { return highlights; },
  get presentation() { return presentation; },
  help,
  palette,
  stats,
  requestRender,
};
