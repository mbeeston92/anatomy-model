// Scene setup: renderer, camera, lighting. No knowledge of anatomy or the interface.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MAX_PIXEL_RATIO = 2;      // sharp when still
const MOVING_PIXEL_RATIO = 1;   // lighter while the camera is moving

export function createStage(canvas, container) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,                 // the page's backdrop shows through
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();

  // A narrow field of view keeps proportions true (little perspective distortion).
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  camera.position.set(0, 0.9, 4);
  scene.add(camera);

  // Soft, even base light from a neutral studio environment.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.42;

  // Key, fill and rim lights travel with the camera, so the side facing the
  // viewer is always well lit whichever way the model is turned.
  const rig = new THREE.Group();
  camera.add(rig);
  const addLight = (colour, intensity, x, y, z) => {
    const light = new THREE.DirectionalLight(colour, intensity);
    light.position.set(x, y, z);
    rig.add(light);
    rig.add(light.target);       // target stays at the camera; direction = position
    return light;
  };
  const lights = {
    key: addLight(0xfff6ea, 2.0, -1.7, 1.9, 1.3),   // upper left, warm
    fill: addLight(0xe6efff, 0.4, 1.8, 0.1, 1.2),   // right, cool, soft
    rim: addLight(0xffffff, 1.2, 0.8, 1.2, -2.5),   // from behind, picks out edges
  };

  let pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  /** Lower the resolution while moving; full resolution when still. */
  function setMoving(moving) {
    const device = window.devicePixelRatio || 1;
    const wanted = Math.min(device, moving ? MOVING_PIXEL_RATIO : MAX_PIXEL_RATIO);
    if (wanted === pixelRatio) return false;
    pixelRatio = wanted;
    renderer.setPixelRatio(pixelRatio);
    return true;
  }

  function render() {
    renderer.render(scene, camera);
  }

  resize();
  return { renderer, scene, camera, lights, resize, render, setMoving };
}
