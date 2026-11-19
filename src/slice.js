// 3D cross-section slice plane: cuts cleanly through the model along a
// horizontal (axial), front-to-back (coronal) or side-to-side (sagittal) plane
// so deep structures (spinal canal, discs, hip socket, knee interior) can be
// seen in cross-section. Purely visual; never alters geometry.
import * as THREE from 'three';

const AXES = {
  y: { normal: [0, -1, 0], label: 'Horizontal' },
  z: { normal: [0, 0, -1], label: 'Front to back' },
  x: { normal: [-1, 0, 0], label: 'Side to side' },
};

const PAD = 0.015;  // 1.5 cm margin past the visible bounds so 0% / 100% clears the model

export function createSlice({ stage, visibility, onChange = () => {} }) {
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const bounds = new THREE.Box3(new THREE.Vector3(-0.45, 0, -0.18), new THREE.Vector3(0.45, 1.8, 0.18));
  const boxSize = new THREE.Vector3();
  const boxCentre = new THREE.Vector3();

  // Subtle teal outline rectangle marking where the slice cuts (hidden in presentation/saved images).
  const frameGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.5, -0.5, 0),
    new THREE.Vector3(0.5, -0.5, 0),
    new THREE.Vector3(0.5, 0.5, 0),
    new THREE.Vector3(-0.5, 0.5, 0),
  ]);
  const frameMaterial = new THREE.LineBasicMaterial({
    color: 0x1f6f78,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  // Keep the guide rectangle itself unclipped.
  frameMaterial.clippingPlanes = [];
  const guide = new THREE.LineLoop(frameGeometry, frameMaterial);
  guide.name = 'slice_guide';
  guide.visible = false;
  guide.renderOrder = 5;
  stage.scene.add(guide);

  let axis = null;       // null | 'y' | 'z' | 'x'
  let fraction = 0.5;    // 0..1 across the current visible bounds along `axis`
  let flipped = false;
  let guideHidden = false;

  /** Compute the bounding box of currently shown structures (for tight slider travel). */
  function measureBounds() {
    const meshes = visibility.shownMeshes();
    const measured = new THREE.Box3();
    for (const mesh of meshes) measured.expandByObject(mesh);
    if (!measured.isEmpty()) bounds.copy(measured).expandByScalar(PAD);
  }

  function apply() {
    if (!axis) {
      stage.setClipPlane(null);
      guide.visible = false;
      onChange();
      return;
    }
    const min = bounds.min[axis];
    const max = bounds.max[axis];
    const position = THREE.MathUtils.lerp(min, max, fraction);

    const [nx, ny, nz] = AXES[axis].normal;
    const sign = flipped ? -1 : 1;
    plane.normal.set(nx * sign, ny * sign, nz * sign);
    // Keep points where dot(normal, p) + constant >= 0.
    // With normal = -axis (sign=1): keeps p[axis] <= position -> constant = position.
    // With normal = +axis (sign=-1): keeps p[axis] >= position -> constant = -position.
    plane.constant = sign > 0 ? position : -position;

    bounds.getSize(boxSize);
    bounds.getCenter(boxCentre);
    guide.position.copy(boxCentre);
    // Sit 0.5 mm on the kept side of the plane so the global clip never trims the guide line.
    guide.position[axis] = position + (flipped ? 0.0005 : -0.0005);
    guide.rotation.set(0, 0, 0);
    if (axis === 'y') {
      guide.rotation.x = Math.PI / 2;
      guide.scale.set(boxSize.x + 0.04, boxSize.z + 0.04, 1);
    } else if (axis === 'x') {
      guide.rotation.y = Math.PI / 2;
      guide.scale.set(boxSize.z + 0.04, boxSize.y + 0.04, 1);
    } else {
      guide.scale.set(boxSize.x + 0.04, boxSize.y + 0.04, 1);
    }
    guide.visible = !guideHidden;
    stage.setClipPlane(plane);
    onChange();
  }

  function setAxis(next) {
    const valid = next && AXES[next] ? next : null;
    if (valid === axis) return;
    axis = valid;
    if (axis) {
      measureBounds();
      fraction = 0.5;
      flipped = false;
    }
    apply();
  }

  function setFraction(next) {
    fraction = THREE.MathUtils.clamp(Number(next), 0, 1);
    if (axis) apply();
  }

  function flip() {
    if (!axis) return;
    flipped = !flipped;
    apply();
  }

  function clear() {
    if (!axis) return;
    axis = null;
    flipped = false;
    apply();
  }

  /** Re-measure visible bounds when regions/presets change while slicing is active. */
  function syncBounds() {
    if (!axis) return;
    measureBounds();
    apply();
  }

  /** Hide the teal guide frame during presentation view or saved images. */
  function setGuideHidden(hidden) {
    guideHidden = !!hidden;
    guide.visible = !!axis && !guideHidden;
  }

  function positionCm() {
    if (!axis) return 0;
    return Math.round(THREE.MathUtils.lerp(bounds.min[axis], bounds.max[axis], fraction) * 100);
  }

  return {
    setAxis,
    setFraction,
    flip,
    clear,
    syncBounds,
    setGuideHidden,
    positionCm,
    get axis() { return axis; },
    get fraction() { return fraction; },
    get flipped() { return flipped; },
    get active() { return axis !== null; },
    get plane() { return axis ? plane : null; },
  };
}
