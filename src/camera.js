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
const FRAME_MARGIN = 1.2;    // space round a framed region
const WHEEL_ZOOM_RATE = 0.00154; // one mouse-wheel notch (100 units) = about 14% closer or further
const ZOOM_GLIDE_MS = 70;        // how quickly the camera catches up with the wheel

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createCameraRig({ camera, domElement, getPickTargets, getClipPlane = () => null, onViewChange = () => {} }) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 1.1;          // touch pinch only; the wheel is handled below
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
  raycaster.firstHitOnly = true;   // used by the spatial index (see picking.js)
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

  /**
   * Move smoothly so a box fills the screen. Keeps the current viewing angle
   * unless a named view (front, back, left, right, top) is given.
   */
  function frame(box, { view = null } = {}) {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const tanUp = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfAngle = Math.atan(Math.min(tanUp, tanUp * camera.aspect));
    const radius = THREE.MathUtils.clamp(
      (Math.max(sphere.radius, 0.03) / Math.sin(halfAngle)) * FRAME_MARGIN, MIN_DISTANCE * 2, MAX_DISTANCE);
    spherical.setFromVector3(scratch.copy(camera.position).sub(controls.target));
    const angle = VIEWS[view] ?? { theta: spherical.theta, phi: spherical.phi };
    startTransition({ radius, theta: angle.theta, phi: angle.phi, target: sphere.center });
    setCurrentView(null);
  }

  function pick(event) {
    const rect = domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const clip = getClipPlane();
    raycaster.firstHitOnly = !clip;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(getPickTargets(), false);
    return hits.find((hit) => hit.object.visible && (!clip || clip.distanceToPoint(hit.point) >= -1e-4)) ?? null;
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

  // ----- Smooth wheel / trackpad zoom -----
  // The built-in wheel zoom moves in small fixed jumps. Instead, each wheel
  // movement adds to an amount still to be zoomed, and the camera glides
  // through it over the next few frames, towards the point under the pointer.
  const zoom = { pending: 0, pointer: new THREE.Vector2(), lastTime: 0 };
  const zoomPlane = new THREE.Plane();
  const zoomPoint = new THREE.Vector3();
  const viewDirection = new THREE.Vector3();

  domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();          // keep OrbitControls' stepped zoom out of it
    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 32;    // lines (some mice)
    else if (event.deltaMode === 2) delta *= 400;
    if (event.ctrlKey) delta *= 8;             // trackpad pinch arrives as small ctrl+wheel steps
    delta = THREE.MathUtils.clamp(delta, -240, 240);
    zoom.pending = THREE.MathUtils.clamp(zoom.pending + delta * WHEEL_ZOOM_RATE, -2.5, 2.5);

    const rect = domElement.getBoundingClientRect();
    zoom.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    transition = null;
    setCurrentView(null);
  }, { capture: true, passive: false });

  function applyZoom(now) {
    const dt = Math.min(now - zoom.lastTime, 50);
    const step = zoom.pending * (1 - Math.exp(-dt / ZOOM_GLIDE_MS));
    zoom.pending -= step;
    if (Math.abs(zoom.pending) < 0.0005) zoom.pending = 0;

    const distance = camera.position.distanceTo(controls.target);
    const wanted = THREE.MathUtils.clamp(distance * Math.exp(step), MIN_DISTANCE, MAX_DISTANCE);
    const scale = wanted / distance;
    if (wanted !== distance * Math.exp(step)) zoom.pending = 0;   // reached a zoom limit
    if (scale === 1) return;

    // The point under the pointer, at the depth of the orbit centre, stays put.
    camera.getWorldDirection(viewDirection);
    zoomPlane.setFromNormalAndCoplanarPoint(viewDirection, controls.target);
    raycaster.setFromCamera(zoom.pointer, camera);
    if (!raycaster.ray.intersectPlane(zoomPlane, zoomPoint)) zoomPoint.copy(controls.target);
    camera.position.sub(zoomPoint).multiplyScalar(scale).add(zoomPoint);
    controls.target.sub(zoomPoint).multiplyScalar(scale).add(zoomPoint);
  }

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
    const zooming = zoom.pending !== 0;
    if (zooming) applyZoom(now);
    zoom.lastTime = now;
    const moved = controls.update();
    if (!animating) keepInReach();
    fitDepthRange();
    return animating || zooming || moved;
  }

  return {
    controls,
    setBounds,
    goTo,
    focusOn,
    frame,
    update,
    get currentView() { return currentView; },
    get isTransitioning() { return transition !== null; },
  };
}
