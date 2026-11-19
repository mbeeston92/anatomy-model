// 3D cross-section slice plane: cuts cleanly through the model along a
// horizontal (axial), front-to-back (coronal) or side-to-side (sagittal) plane
// and renders solid colour-matched cross-section caps via the stencil buffer so
// bones, discs, muscles, ligaments and nerves read as solid rather than hollow
// shells. Purely visual; never alters anatomy geometry.
import * as THREE from 'three';
import { withSpots } from './materials.js';

const AXES = {
  y: { normal: [0, -1, 0], label: 'Horizontal' },
  z: { normal: [0, 0, -1], label: 'Front to back' },
  x: { normal: [-1, 0, 0], label: 'Side to side' },
};

const PAD = 0.015;  // 1.5 cm margin past the visible bounds so 0% / 100% clears the model
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Systems drawn as solid cross-section caps, in paint order: outer soft tissue
// first, then solid bone core, then cartilage (discs/menisci), then nerves, with
// injury highlights last so key structures always read crisply.
const CAP_SYSTEMS = ['muscle', 'tendon', 'ligament', 'bone', 'cartilage', 'nerve'];

// Articular cartilage patches were cut out of their parent bone surface at export,
// so pairing them in the bone stencil pass closes the bone solid cleanly without holes.
const BONE_CARTILAGE = {
  bone_femur: ['cartilage_articular_femur_head', 'cartilage_articular_femur_condyles'],
  bone_tibia: ['cartilage_articular_tibia_plateau', 'cartilage_articular_tibia_ankle'],
  bone_patella: ['cartilage_articular_patella'],
  bone_talus: ['cartilage_articular_talus'],
  bone_hip_bone: ['cartilage_articular_acetabulum'],
  bone_scapula: ['cartilage_articular_glenoid'],
  bone_humerus: ['cartilage_articular_humerus_head', 'cartilage_articular_humerus_elbow'],
  bone_radius: ['cartilage_articular_radius_elbow', 'cartilage_articular_radius_wrist'],
  bone_ulna: ['cartilage_articular_ulna_elbow', 'cartilage_articular_ulna_wrist'],
};

// Split muscle/tendon solids cut along their shared musculotendinous seam at export.
const TENDON_MUSCLES = {
  tendon_quadriceps_patellar: ['muscle_rectus_femoris', 'muscle_vastus_lateralis', 'muscle_vastus_intermedius'],
  tendon_biceps_long_head: ['muscle_biceps_long_head'],
  tendon_biceps_short_head: ['muscle_biceps_short_head'],
  tendon_biceps_distal: ['muscle_biceps_long_head', 'muscle_biceps_short_head'],
  tendon_triceps: ['muscle_triceps'],
  tendon_infraspinatus: ['muscle_infraspinatus'],
  tendon_common_extensor: ['muscle_ecrb'],
  tendon_common_flexor: ['muscle_flexor_carpi_radialis', 'muscle_pronator_teres'],
  tendon_finger_extensors: ['muscle_extensor_digitorum'],
  tendon_finger_flexors: ['muscle_flexor_digitorum_superficialis', 'muscle_flexor_digitorum_profundus'],
  tendon_de_quervain: ['muscle_abductor_pollicis_longus', 'muscle_extensor_pollicis_brevis'],
  tendon_ecu: ['muscle_extensor_carpi_ulnaris'],
  tendon_gluteus_medius: ['muscle_gluteus_medius'],
  tendon_iliopsoas: ['muscle_psoas_major', 'muscle_iliacus'],
  tendon_adductor_longus: ['muscle_adductor_longus'],
  tendon_hamstring_origin: ['muscle_biceps_femoris', 'muscle_semitendinosus', 'muscle_semimembranosus'],
  tendon_hamstring_biceps_femoris: ['muscle_biceps_femoris'],
  tendon_hamstring_semitendinosus: ['muscle_semitendinosus'],
  tendon_hamstring_semimembranosus: ['muscle_semimembranosus'],
  tendon_tibialis_posterior: ['muscle_tibialis_posterior'],
  tendon_tibialis_anterior: ['muscle_tibialis_anterior'],
  tendon_peroneal: ['muscle_fibularis_longus', 'muscle_fibularis_brevis'],
  tendon_fhl: ['muscle_flexor_hallucis_longus'],
};

const MUSCLE_TENDONS = {};
for (const [tendon, muscles] of Object.entries(TENDON_MUSCLES)) {
  for (const muscle of muscles) {
    (MUSCLE_TENDONS[muscle] ??= []).push(tendon);
  }
}

function splitSide(id) {
  if (id.endsWith('_l')) return { base: id.slice(0, -2), suffix: '_l' };
  if (id.endsWith('_r')) return { base: id.slice(0, -2), suffix: '_r' };
  return { base: id, suffix: '' };
}

/**
 * Returns -1 if the box is strictly clipped (discarded), +1 if strictly on the
 * kept side of the plane, or 0 if it intersects the slice plane.
 */
function boxRelation(box, plane) {
  const { x: nx, y: ny, z: nz } = plane.normal;
  const d = plane.constant;
  const minD = (nx > 0 ? box.min.x : box.max.x) * nx
    + (ny > 0 ? box.min.y : box.max.y) * ny
    + (nz > 0 ? box.min.z : box.max.z) * nz + d;
  if (minD > 0) return 1;
  const maxD = (nx > 0 ? box.max.x : box.min.x) * nx
    + (ny > 0 ? box.max.y : box.min.y) * ny
    + (nz > 0 ? box.max.z : box.min.z) * nz + d;
  if (maxD < 0) return -1;
  return 0;
}

export function createSlice({ stage, registry, visibility, palette, onChange = () => {} }) {
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const bounds = new THREE.Box3(new THREE.Vector3(-0.45, 0, -0.18), new THREE.Vector3(0.45, 1.8, 0.18));
  const boxSize = new THREE.Vector3();
  const boxCentre = new THREE.Vector3();
  const outwardNormal = new THREE.Vector3();
  const keyPos = new THREE.Vector3();
  const keyTarget = new THREE.Vector3();
  const noClips = [];

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
  const guide = new THREE.LineLoop(frameGeometry, frameMaterial);
  guide.name = 'slice_guide';
  guide.visible = false;
  guide.renderOrder = 5;
  stage.scene.add(guide);

  // ----- Stencil-based solid cross-section cap resources (allocated once) -----
  const stencilBack = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.IncrementWrapStencilOp,
    stencilZFail: THREE.IncrementWrapStencilOp,
    stencilZPass: THREE.IncrementWrapStencilOp,
  });
  const stencilFront = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    side: THREE.FrontSide,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: THREE.DecrementWrapStencilOp,
    stencilZFail: THREE.DecrementWrapStencilOp,
    stencilZPass: THREE.DecrementWrapStencilOp,
  });

  const capBaseProps = {
    roughness: 0.86,
    metalness: 0,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
    stencilWrite: true,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilRef: 0,
    stencilFail: THREE.ZeroStencilOp,
    stencilZFail: THREE.ZeroStencilOp,
    stencilZPass: THREE.ZeroStencilOp,
  };

  // Slightly deeper cross-section shade per tissue system so cut faces read clearly.
  const systemCapMaterials = new Map();
  for (const sys of registry?.systems ?? []) {
    if (!CAP_SYSTEMS.includes(sys.id)) continue;
    const shade = sys.id === 'bone' || sys.id === 'muscle' ? 0.84 : 0.88;
    const mat = withSpots(new THREE.MeshStandardMaterial({
      ...capBaseProps,
      name: `mat_cap_${sys.id}`,
      color: new THREE.Color(sys.colour).multiplyScalar(shade),
    }));
    systemCapMaterials.set(sys.id, mat);
  }

  const highlightCapMaterials = new Map();
  for (const { id, colour } of palette?.colours ?? []) {
    const base = new THREE.Color(colour);
    highlightCapMaterials.set(id, new THREE.MeshStandardMaterial({
      ...capBaseProps,
      name: `mat_cap_highlight_${id}`,
      color: base,
      emissive: base.clone().multiplyScalar(0.42),
      roughness: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }));
  }

  const capScene = new THREE.Scene();
  capScene.environment = stage.scene.environment;
  capScene.environmentIntensity = stage.scene.environmentIntensity;
  const capKey = new THREE.DirectionalLight(0xfff6ea, 1.85);
  capScene.add(capKey);
  capScene.add(capKey.target);
  capScene.add(new THREE.AmbientLight(0xf3f6fa, 0.32));

  // Large plane quad positioned on the cut plane, oriented to face the camera side.
  const capQuad = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), null);
  capQuad.frustumCulled = false;
  capScene.add(capQuad);

  // Cached world bounding boxes (anatomy meshes are static; computed once per mesh).
  const meshBoxes = new WeakMap();
  const buckets = new Map();
  for (const id of CAP_SYSTEMS) buckets.set(id, []);
  for (const { id } of palette?.colours ?? []) buckets.set(`hl:${id}`, []);
  const seen = new Set();
  const unique = [];

  let axis = null;       // null | 'y' | 'z' | 'x'
  let fraction = 0.5;    // 0..1 across the current visible bounds along `axis`
  let flipped = false;
  let guideHidden = false;

  function worldBoxOf(mesh) {
    let box = meshBoxes.get(mesh);
    if (!box) {
      box = new THREE.Box3().setFromObject(mesh);
      meshBoxes.set(mesh, box);
    }
    return box;
  }

  const isOpaqueSolid = (mesh) => mesh && mesh.visible && !mesh.userData.ghost
    && (!mesh.material?.transparent || (mesh.material?.opacity ?? 1) >= 1);

  /** Compute the bounding box of currently shown structures (for tight slider travel). */
  function measureBounds() {
    const meshes = visibility.shownMeshes();
    const measured = new THREE.Box3();
    for (const mesh of meshes) measured.union(worldBoxOf(mesh));
    if (!measured.isEmpty()) bounds.copy(measured).expandByScalar(PAD);
  }

  function addUnique(list, mesh) {
    if (!mesh || seen.has(mesh)) return;
    seen.add(mesh);
    list.push(mesh);
  }

  function drawStencilMesh(mesh, material) {
    const ownMaterial = mesh.material;
    const wasVisible = mesh.visible;
    mesh.visible = true;
    mesh.material = material;
    stage.renderer.render(mesh, stage.camera);
    mesh.material = ownMaterial;
    mesh.visible = wasVisible;
  }

  /**
   * Render solid cross-section caps for every sliced tissue system and active
   * injury highlight. Runs right after the clipped 3D scene and before glow/outline.
   */
  function renderCaps() {
    if (!axis || !registry) return;
    // The cut face points toward -plane.normal, so it is only visible when the
    // camera sits on the clipped side (distance < 0). From behind the cut, exit at once.
    if (plane.distanceToPoint(stage.camera.position) >= 0) return;

    for (const list of buckets.values()) list.length = 0;

    // Collect intersecting solid opaque meshes and pair split solids so stencil counts close cleanly.
    const shown = visibility.shownMeshes();
    for (const mesh of shown) {
      if (!isOpaqueSolid(mesh)) continue;
      if (boxRelation(worldBoxOf(mesh), plane) !== 0) continue;

      const entry = registry.fromMesh(mesh);
      if (!entry) continue;
      const { id } = entry;
      const system = entry.data.system;

      // Articular cartilage is a zero-thickness surface patch cut from its bone;
      // its solid interior is capped as part of the bone solid below.
      if (id.startsWith('cartilage_articular_')) continue;
      if (!CAP_SYSTEMS.includes(system)) continue;

      const mark = visibility.highlightOf(id);
      const bucketKey = mark ? `hl:${mark}` : system;
      const list = buckets.get(bucketKey);
      if (!list) continue;

      const { base, suffix } = splitSide(id);

      // For split tendons: if a paired muscle on the same side also crosses the
      // cut plane with the same colour bucket, the muscle pass already closes both
      // together seamlessly. Otherwise cap the tendon cleanly with kept-side partners.
      if (system === 'tendon' && TENDON_MUSCLES[base]) {
        const pairedMuscles = TENDON_MUSCLES[base];
        let handledByMuscle = false;
        for (const mBase of pairedMuscles) {
          const partner = registry.get(`${mBase}${suffix}`)?.mesh;
          if (!partner || !isOpaqueSolid(partner)) continue;
          if (boxRelation(worldBoxOf(partner), plane) !== 0) continue;
          const partnerMark = visibility.highlightOf(`${mBase}${suffix}`);
          if (partnerMark === mark) { handledByMuscle = true; break; }
        }
        if (handledByMuscle) continue;

        list.push(mesh);
        for (const mBase of pairedMuscles) {
          const partner = registry.get(`${mBase}${suffix}`)?.mesh;
          if (!partner) continue;
          // Only include a hidden muscle partner when it lies strictly on the kept side
          // (plugs the tendon's open seam without painting a hidden muscle on the cut plane).
          const rel = boxRelation(worldBoxOf(partner), plane);
          if (rel === 1) list.push(partner);
        }
        continue;
      }

      list.push(mesh);

      // Only the right-side bones had articular cartilage cut out at export; left bones are already closed.
      if (system === 'bone' && suffix === '_r' && BONE_CARTILAGE[base]) {
        for (const cBase of BONE_CARTILAGE[base]) {
          const partner = registry.get(`${cBase}${suffix}`)?.mesh;
          if (partner && boxRelation(worldBoxOf(partner), plane) >= 0) list.push(partner);
        }
      } else if (system === 'muscle' && MUSCLE_TENDONS[base]) {
        for (const tBase of MUSCLE_TENDONS[base]) {
          const partner = registry.get(`${tBase}${suffix}`)?.mesh;
          if (!partner) continue;
          const rel = boxRelation(worldBoxOf(partner), plane);
          if (rel === 1 || (rel === 0 && isOpaqueSolid(partner))) list.push(partner);
        }
      }
    }

    // Position and orient the cap quad onto the cut plane (0.15 mm toward the camera
    // side so it cleanly seals cut interiors without z-fighting the cut edges).
    bounds.getCenter(boxCentre);
    const centreDist = plane.distanceToPoint(boxCentre);
    capQuad.position.copy(boxCentre).addScaledVector(plane.normal, -(centreDist + 0.00015));
    outwardNormal.copy(plane.normal).negate();
    capQuad.quaternion.setFromUnitVectors(Z_AXIS, outwardNormal);
    capQuad.updateMatrixWorld();

    // Sync the cap key light with the camera's studio key light.
    stage.lights.key.getWorldPosition(keyPos);
    stage.lights.key.target.getWorldPosition(keyTarget);
    capKey.position.copy(keyPos);
    capKey.target.position.copy(keyTarget);
    capKey.target.updateMatrixWorld();

    const { renderer, camera } = stage;
    const prevAutoClear = renderer.autoClear;
    const prevClips = renderer.clippingPlanes;
    renderer.autoClear = false;
    renderer.clearStencil();

    for (const [key, list] of buckets) {
      if (!list.length) continue;
      const capMat = key.startsWith('hl:')
        ? highlightCapMaterials.get(key.slice(3))
        : systemCapMaterials.get(key);
      if (!capMat) continue;

      // Deduplicate meshes within this pass (e.g. a shared tendon paired with two muscles).
      seen.clear();
      unique.length = 0;
      for (const m of list) addUnique(unique, m);

      renderer.clippingPlanes = prevClips;
      for (const m of unique) drawStencilMesh(m, stencilBack);
      for (const m of unique) drawStencilMesh(m, stencilFront);

      // Disable global clipping while drawing the cap quad itself.
      renderer.clippingPlanes = noClips;
      capQuad.material = capMat;
      renderer.render(capScene, camera);
      renderer.clearStencil();
    }

    renderer.clippingPlanes = prevClips;
    renderer.autoClear = prevAutoClear;
  }

  stage.setAfterScene(renderCaps);

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
