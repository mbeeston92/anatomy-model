// One shared material per system. Colours come from structures.json (set in the
// export stage); surface finish and depth ordering are set here.
import * as THREE from 'three';

// roughness: 1 = matte, 0 = mirror.
// depthBias: where two systems touch, the one with the lower number is drawn
// in front, which stops the surfaces flickering (z-fighting).
const FINISH = {
  bone:      { roughness: 0.82, depthBias: 2 },
  muscle:    { roughness: 0.74, depthBias: 1 },
  cartilage: { roughness: 0.32, depthBias: 0 },
  ligament:  { roughness: 0.4,  depthBias: 0 },
  tendon:    { roughness: 0.4,  depthBias: 0 },
  nerve:     { roughness: 0.55, depthBias: 0 },
  bursa:     { roughness: 0.25, depthBias: 0, opacity: 0.45 },
};

export function createMaterials(systems) {
  const materials = new Map();
  for (const system of systems) {
    const finish = FINISH[system.id] ?? { roughness: 0.6, depthBias: 0 };
    const opacity = system.opacity < 1 ? system.opacity : (finish.opacity ?? 1);
    const material = new THREE.MeshStandardMaterial({
      name: `mat_${system.id}`,
      color: new THREE.Color(system.colour),
      roughness: finish.roughness,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
      polygonOffset: finish.depthBias > 0,
      polygonOffsetFactor: finish.depthBias,
      polygonOffsetUnits: finish.depthBias,
    });
    materials.set(system.id, material);
  }
  return materials;
}
