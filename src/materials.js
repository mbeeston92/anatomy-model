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

const MAX_SPOTS = 6;

/**
 * Shaded pain areas: every surface within a set distance of a chosen point is
 * tinted. The same values are shared by all the materials that take part.
 */
const spotUniforms = {
  spotPlace: { value: Array.from({ length: MAX_SPOTS }, () => new THREE.Vector4()) },   // x, y, z, radius
  spotColour: { value: Array.from({ length: MAX_SPOTS }, () => new THREE.Vector3()) },
  spotCount: { value: 0 },
};

function withSpots(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, spotUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSpotWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSpotWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSpotWorld;
uniform vec4 spotPlace[${MAX_SPOTS}];
uniform vec3 spotColour[${MAX_SPOTS}];
uniform int spotCount;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
for (int i = 0; i < ${MAX_SPOTS}; i++) {
  if (i >= spotCount) break;
  float reach = distance(vSpotWorld, spotPlace[i].xyz) / spotPlace[i].w;
  float amount = (1.0 - smoothstep(0.55, 1.0, reach)) * 0.62;
  diffuseColor.rgb = mix(diffuseColor.rgb, spotColour[i], amount);
  diffuseColor.a = max(diffuseColor.a, amount);
}`);
  };
  material.customProgramCacheKey = () => 'spots';
  return material;
}

/**
 * The looks used for injury highlights: one glowing material per palette
 * colour, the pale see-through material for "fade everything else", and the
 * shaded pain areas.
 */
export function createLooks(palette) {
  const highlight = new Map();
  for (const { id, colour } of palette.colours) {
    const base = new THREE.Color(colour);
    highlight.set(id, new THREE.MeshStandardMaterial({
      name: `mat_highlight_${id}`,
      color: base,
      emissive: base.clone().multiplyScalar(0.5),   // glows, so it stays vivid in shadow
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
    }));
  }
  const fade = withSpots(new THREE.MeshStandardMaterial({
    name: 'mat_fade',
    color: 0xd3d9de,
    roughness: 0.9,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  }));

  function setSpots(spots) {
    const count = Math.min(spots.length, MAX_SPOTS);
    const colour = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const spot = spots[i];
      spotUniforms.spotPlace.value[i].set(spot.x, spot.y, spot.z, spot.r);
      colour.set(palette.get(spot.colour)?.colour ?? '#F0123C');
      spotUniforms.spotColour.value[i].set(colour.r, colour.g, colour.b);
    }
    spotUniforms.spotCount.value = count;
  }

  return { highlight, fade, setSpots };
}

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
    materials.set(system.id, withSpots(material));
  }
  return materials;
}
