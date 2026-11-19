// Finding the structure under the pointer. Each mesh gets a spatial index
// (three-mesh-bvh) so a hit test takes a fraction of a millisecond even with
// the whole body shown. The indexes are built in small slices after loading so
// the page never freezes; until a mesh has one, the ordinary slower test is used.
import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const SLICE_MS = 4;
const schedule = typeof window !== 'undefined' && window.requestIdleCallback
  ? (fn) => window.requestIdleCallback(fn, { timeout: 60 })
  : (fn) => setTimeout(fn, 0);

export function createPicker({ camera, domElement, registry, getTargets, getClipPlane = () => null }) {
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const pointer = new THREE.Vector2();

  const queue = [];
  const queued = new Set();
  let working = false;
  let paused = false;

  function work() {
    if (paused) { working = false; return; }
    const until = performance.now() + SLICE_MS;
    while (queue.length && performance.now() < until) {
      const geometry = queue.pop();
      try { computeBoundsTree.call(geometry); } catch (error) { console.warn('Could not index a mesh for picking:', error); }
    }
    if (queue.length && !paused) schedule(work);
    else working = false;
  }

  /** Queue every mesh under this object for indexing. */
  function index(object) {
    object.traverse((child) => {
      const geometry = child.isMesh ? child.geometry : null;
      if (!geometry || geometry.boundsTree || queued.has(geometry)) return;
      queued.add(geometry);
      queue.push(geometry);
    });
    if (!working && !paused && queue.length) { working = true; schedule(work); }
  }

  /** Pause background indexing while the camera moves so rotation stays smooth. */
  function setPaused(on) {
    paused = !!on;
    if (!paused && !working && queue.length) { working = true; schedule(work); }
  }

  /** The shown structure at a point of the page, or null. */
  function pick(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const clip = getClipPlane();
    raycaster.firstHitOnly = !clip;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(getTargets(), false)
      .find((h) => h.object.visible && (!clip || clip.distanceToPoint(h.point) >= -1e-4));
    if (!hit) return null;
    const entry = registry.fromMesh(hit.object);
    return entry ? { entry, point: hit.point } : null;
  }

  return { index, pick, setPaused, get pending() { return queue.length; } };
}
