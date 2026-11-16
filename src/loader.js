// Model loading: fetches structures.json and one .glb per system, reports
// overall progress, and links every mesh to the registry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = import.meta.env.BASE_URL;

export class LoadError extends Error {
  constructor(what, cause) {
    super(`Could not load ${what}`);
    this.what = what;
    this.cause = cause;
  }
}

export async function loadStructureData() {
  try {
    const response = await fetch(`${BASE}data/structures.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (cause) {
    throw new LoadError('the structure list', cause);
  }
}

/** Download a file, calling onBytes(count) as each piece arrives. */
async function fetchWithProgress(url, onBytes) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onBytes(buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
    onBytes(value.byteLength);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return joined.buffer;
}

/**
 * @param {object} options
 * @param {ReturnType<import('./registry.js').createRegistry>} options.registry
 * @param {Map<string, THREE.Material>} options.materials
 * @param {THREE.Object3D} options.parent  where system groups are added
 * @param {(state:{fraction:number, label:string}) => void} options.onProgress
 * @param {(system:object, group:THREE.Group) => void} options.onSystemLoaded
 */
export function createModelLoader({ registry, materials, parent, onProgress, onSystemLoaded }) {
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  const systems = registry.systems;
  const totalBytes = systems.reduce((sum, s) => sum + s.bytes, 0);
  const received = new Map(systems.map((s) => [s.id, 0]));
  const finished = new Set();

  function report() {
    let bytes = 0;
    for (const s of systems) bytes += Math.min(received.get(s.id), s.bytes);
    const waiting = systems.filter((s) => !finished.has(s.id));
    onProgress({
      fraction: finished.size === systems.length ? 1 : Math.min(bytes / totalBytes, 0.99),
      label: waiting.length ? `Loading ${waiting[0].label.toLowerCase()}` : 'Ready',
    });
  }

  function addSystem(system, gltf) {
    const group = new THREE.Group();
    group.name = `system_${system.id}`;
    const material = materials.get(system.id);

    // Meshes as exported (bones on both sides, soft tissue on the right, midline).
    gltf.scene.name = `${system.id}_as_exported`;
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      object.material = material;
      if (!registry.attach(object.name, object)) {
        console.warn(`Mesh "${object.name}" is not in structures.json`);
      }
    });
    group.add(gltf.scene);

    // Left-side soft tissue: a mirror copy of the right. Each copy is its own
    // mesh with its own id; only the geometry data is shared. The flip is on
    // the parent because each mesh node carries its own unpacking transform.
    const mirror = new THREE.Group();
    mirror.name = `${system.id}_mirrored`;
    mirror.scale.x = -1;
    for (const entry of registry.bySystem(system.id)) {
      const sourceId = entry.data.mirrorOf;
      if (!sourceId) continue;
      const source = registry.get(sourceId)?.mesh;
      if (!source) {
        console.warn(`"${entry.id}" should mirror "${sourceId}", which has no mesh`);
        continue;
      }
      const copy = source.clone();
      copy.name = entry.id;
      copy.userData = {};
      registry.attach(entry.id, copy);
      mirror.add(copy);
    }
    group.add(mirror);

    parent.add(group);
    group.updateMatrixWorld(true);
    return group;
  }

  async function loadSystem(system) {
    received.set(system.id, 0);
    try {
      const buffer = await fetchWithProgress(`${BASE}${system.file}`, (count) => {
        received.set(system.id, received.get(system.id) + count);
        report();
      });
      const gltf = await gltfLoader.parseAsync(buffer, '');
      const group = addSystem(system, gltf);
      finished.add(system.id);
      report();
      onSystemLoaded(system, group);
    } catch (cause) {
      received.set(system.id, 0);
      report();
      throw new LoadError(system.label.toLowerCase(), cause);
    }
  }

  /**
   * Load the given systems (default: all not yet loaded). Bones go first so
   * the skeleton appears quickly; the rest download together.
   * Returns the list of systems that failed (empty when all is well).
   */
  async function load(only = systems.filter((s) => !finished.has(s.id))) {
    const failed = [];
    report();
    const bones = only.find((s) => s.id === 'bone');
    if (bones) {
      try { await loadSystem(bones); } catch (error) { console.error(error); failed.push(bones); }
    }
    const rest = only.filter((s) => s !== bones);
    const results = await Promise.allSettled(rest.map(loadSystem));
    results.forEach((result, i) => {
      if (result.status === 'rejected') { console.error(result.reason); failed.push(rest[i]); }
    });
    return failed;
  }

  return { load, isLoaded: (id) => finished.has(id) };
}
