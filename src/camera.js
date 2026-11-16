// Camera: orbit controls, preset views with smooth transitions, and
// double-click to centre the orbit on a point of the model.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const HALF_PI = Math.PI / 2;

// theta: angle round the body (0 = in front). phi: angle down from overhead.
// The model faces +Z and its left is +X, so "left" puts the camera on +X.
const VIEWS = {
  front: { theta: 0, phi: HALF_PI },
  back: { theta: Math.PI, phi: HALF_PI },
  left: { theta: HALF_PI, phi: HALF_PI },
  right: { theta: -HALF_PI, phi: HALF_PI },
  top: { theta: 0, phi: 0.001 },   // from above, front of the body towards the bottom of the screen
};

const TRANSITION_MS = 700;
const MIN_DISTANCE = 0.06;   // 6 cm: close enough to fill the screen with one ligament
const MAX_DISTANCE = 9;
const FIT_MARGIN = 1.16;     // space round the model for the buttons

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createCameraRig({ camera, domElement, getPickTargets, onViewChange = () => {} }) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 1.1;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = true;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  // Left drag rotates, right drag pans, wheel zooms; one finger rotates,
  // two fingers pan and pinch-zoom. (These are the OrbitControls defaults.)

  const bounds = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.2), new THREE.Vector3(0.5, 1.8, 0.2));
  const centre = new THREE.Vector3(0, 0.9, 0);
  const size = new THREE.Vector3(1, 1.8, 0.4);
  const panLimit = new THREE.Box3();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let transition = null;
  let currentView = null;
  const raycaster = new THREE.Raycaster();
  const scratch = new THREE.Vector3();
  const spherical = new THREE.Spherical();

  function setCurrentView(name) {
    if (name === currentView) return;
    currentView = name;
    onViewChange(name);
  }

  /** Tell the rig how big the model is (called once the skeleton has loaded). */
  function setBounds(box) {
    bounds.copy(box);
    bounds.getCenter(centre);
    bounds.getSize(size);
    panLimit.copy(bounds).expandByScalar(0.15);
  }
  setBounds(bounds);

  /** Distance at which the whole model fits the screen for a given view. */
  function fitDistance(viewName) {
    // across / up = the model's extent on screen; depth = its extent towards the camera.
    let across = size.x, up = size.y, depth = size.z;                      // front, back
    if (viewName === 'left' || viewName === 'right') { across = size.z; depth = size.x; }
    if (viewName === 'top') { up = size.z; depth = size.y; }
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const forHeight = up / 2 / tan;
    const forWidth = across / 2 / (tan * camera.aspect);
    return Math.max(forHeight, forWidth) * FIT_MARGIN + depth / 2;
  }

  function startTransition(to, duration = TRANSITION_MS) {
    spherical.setFromVector3(scratch.copy(camera.position).sub(controls.target));
    let dTheta = to.theta - spherical.theta;
    dTheta = ((dTheta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; // shortest way round
    transition = {
      start: performance.now(),
      duration: reduceMotion.matches ? 0 : duration,
      from: { radius: spherical.radius, theta: spherical.theta, phi: spherical.phi, target: controls.target.clone() },
      to: { radius: to.radius, theta: spherical.theta + dTheta, phi: to.phi, target: to.target.clone() },
    };
  }

  /** Move smoothly to a named view: front, back, left, right, top or reset. */
  function goTo(name, { immediate = false } = {}) {
    const viewName = name === 'reset' ? 'front' : name;
    const view = VIEWS[viewName];
    if (!view) return;
    startTransition({ ...view, radius: fitDistance(viewName), target: centre }, immediate ? 0 : TRANSITION_MS);
    setCurrentView(viewName);
  }

  /** Smoothly centre the orbit on a point, keeping the viewing angle and distance. */
  function focusOn(point) {
    spherical.setFromVector3(scratch.copy(camera.position).sub(controls.target));
    startTransition({ radius: spherical.radius, theta: spherical.theta, phi: spherical.phi, target: point }, 450);
    setCurrentView(null);
  }

  function pick(event) {
    const rect = domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(getPickTargets(), false);
    return hits.find((hit) => hit.object.visible) ?? null;
  }

  domElement.addEventListener('dblclick', (event) => {
    const hit = pick(event);
    if (hit) focusOn(hit.point);
  });

  // Any direct handling of the model takes over from a transition.
  controls.addEventListener('start', () => {
    transition = null;
    setCurrentView(null);
  });

  function applyTransition(now) {
    const { start, duration, from, to } = transition;
    const t = duration <= 0 ? 1 : Math.min((now - start) / duration, 1);
    const k = easeInOut(t);
    spherical.set(
      THREE.MathUtils.lerp(from.radius, to.radius, k),
      THREE.MathUtils.lerp(from.phi, to.phi, k),
      THREE.MathUtils.lerp(from.theta, to.theta, k),
    );
    controls.target.lerpVectors(from.target, to.target, k);
    camera.position.setFromSpherical(spherical).add(controls.target);
    camera.lookAt(controls.target);
    if (t >= 1) transition = null;
  }

  /** Keep the orbit centre near the model so it cannot be lost off-screen. */
  function keepInReach() {
    if (panLimit.containsPoint(controls.target)) return;
    panLimit.clampPoint(controls.target, scratch);
    scratch.sub(controls.target);
    controls.target.add(scratch);
    camera.position.add(scratch);
  }

  /** Adjust the depth range to the viewing distance for precise depth sorting. */
  function fitDepthRange() {
    const distance = camera.position.distanceTo(controls.target);
    const near = THREE.MathUtils.clamp(distance * 0.06, 0.004, 0.25);
    const far = distance + 4;
    if (Math.abs(near - camera.near) > camera.near * 0.02 || Math.abs(far - camera.far) > 0.05) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  /** Call once per frame. Returns true if the camera moved. */
  function update(now) {
    const animating = transition !== null;
    if (animating) applyTransition(now);
    const moved = controls.update();
    if (!animating) keepInReach();
    fitDepthRange();
    return animating || moved;
  }

  return {
    controls,
    setBounds,
    goTo,
    focusOn,
    update,
    get currentView() { return currentView; },
    get isTransitioning() { return transition !== null; },
  };
}
