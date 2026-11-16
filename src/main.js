// Entry point: wires the modules together and runs the frame loop.
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles.css';

import * as THREE from 'three';
import { createStage } from './scene.js';
import { createMaterials } from './materials.js';
import { createRegistry } from './registry.js';
import { createModelLoader, loadStructureData } from './loader.js';
import { createCameraRig } from './camera.js';
import { createUI, listInWords } from './ui.js';

const canvas = document.getElementById('canvas');
const viewport = document.getElementById('viewport');

const SETTLE_MS = 180;   // how long after movement stops before the sharp redraw

let stage, rig, registry, loader;
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

  if (rig.update(now)) {
    lastMoved = now;
    if (!moving) { moving = true; stage.setMoving(true); }
    needsRender = true;
  } else if (moving && now - lastMoved > SETTLE_MS) {
    moving = false;
    stage.setMoving(false);
    needsRender = true;          // one sharp frame once everything is still
  }

  // Draw only when something has changed: an idle model costs nothing.
  if (needsRender) {
    needsRender = false;
    stage.render();
    stats.frames++;
  }
}

function setUpStage() {
  try {
    stage = createStage(canvas, viewport);
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
    getPickTargets: () => registry?.meshes() ?? [],
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

async function start() {
  if (!stage && !setUpStage()) return;

  try {
    if (!registry) {
      const data = await loadStructureData();
      registry = createRegistry(data);
      loader = createModelLoader({
        registry,
        materials: createMaterials(data.systems),
        parent: stage.scene,
        onProgress: (state) => ui.setProgress(state),
        onSystemLoaded: (system, group) => {
          if (system.id === 'bone') {
            // Frame the camera on the skeleton as soon as it arrives.
            rig.setBounds(new THREE.Box3().setFromObject(group));
            rig.goTo('front', { immediate: true });
            stats.firstModelAt = performance.now();
          }
          requestRender();
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
  stats,
  requestRender,
};
