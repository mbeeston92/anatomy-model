// Outline for the selected structure and a lighter one for the structure under
// the pointer. Only those one or two meshes are drawn again (into a mask), then
// one cheap pass draws the edge of the mask over the picture. When nothing is
// selected or hovered this costs nothing at all.
import * as THREE from 'three';

const COLOUR = new THREE.Color(0x0077a8);   // clear of every tissue colour and of red / amber highlights

const FRAGMENT = /* glsl */ `
uniform sampler2D mask;
uniform vec2 texel;
uniform float scale;
uniform vec3 colour;
varying vec2 vUv;

void main() {
  vec2 here = texture2D(mask, vUv).rg;          // r: selected, g: hovered
  vec2 wideMax = here, wideMin = here, thinMax = here, thinMin = here;
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.7853982;
    vec2 step = vec2(cos(angle), sin(angle)) * texel * scale;
    vec2 wide = texture2D(mask, vUv + step * 2.3).rg;
    vec2 thin = texture2D(mask, vUv + step * 1.3).rg;
    wideMax = max(wideMax, wide); wideMin = min(wideMin, wide);
    thinMax = max(thinMax, thin); thinMin = min(thinMin, thin);
  }
  float selectedLine = wideMax.r - wideMin.r;
  float hoverLine = (thinMax.g - thinMin.g) * 0.85;
  float selectedFill = here.r * 0.16;
  float hoverFill = here.g * 0.16;

  // Layer them: fills first, lines on top.
  vec4 sum = vec4(colour * selectedFill, selectedFill);
  sum = vec4(vec3(1.0) * hoverFill, hoverFill) + sum * (1.0 - hoverFill);
  sum = vec4(colour * hoverLine, hoverLine) + sum * (1.0 - hoverLine);
  sum = vec4(colour * selectedLine, selectedLine) + sum * (1.0 - selectedLine);
  if (sum.a < 0.004) discard;
  gl_FragColor = vec4(sum.rgb / sum.a, sum.a);
}`;

export function createOutline(renderer, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: false });
  const size = new THREE.Vector2();
  const flat = { side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false };
  const selectedMask = new THREE.MeshBasicMaterial({ ...flat, color: 0xff0000 });
  const hoverMask = new THREE.MeshBasicMaterial({ ...flat, color: 0x00ff00, blending: THREE.AdditiveBlending });

  const uniforms = {
    mask: { value: target.texture },
    texel: { value: new THREE.Vector2(1, 1) },
    scale: { value: 1 },
    colour: { value: new THREE.Vector3(COLOUR.r, COLOUR.g, COLOUR.b) },
  };
  // The colour goes to the screen as it is, so give it in screen (sRGB) values.
  const srgb = COLOUR.clone().convertLinearToSRGB();
  uniforms.colour.value.set(srgb.r, srgb.g, srgb.b);

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  quad.frustumCulled = false;

  let selected = null;
  let hovered = null;

  const drawable = (mesh) => (mesh && mesh.visible && !mesh.userData.ghost ? mesh : null);

  function draw(mesh, material) {
    const own = mesh.material;
    mesh.material = material;
    renderer.render(mesh, camera);
    mesh.material = own;
  }

  /** Call straight after the main picture has been drawn. */
  function render() {
    const first = drawable(selected);
    const second = hovered === selected ? null : drawable(hovered);
    if (!first && !second) return;

    renderer.getDrawingBufferSize(size);
    if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);

    const autoClear = renderer.autoClear;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.autoClear = false;
    if (first) draw(first, selectedMask);
    if (second) draw(second, hoverMask);
    renderer.setRenderTarget(null);

    uniforms.texel.value.set(1 / size.x, 1 / size.y);
    uniforms.scale.value = renderer.getPixelRatio();
    renderer.render(quad, camera);
    renderer.autoClear = autoClear;
  }

  return {
    render,
    /** Returns true if anything changed (so the caller can redraw). */
    set(selectedMesh, hoveredMesh) {
      if (selectedMesh === selected && hoveredMesh === hovered) return false;
      selected = selectedMesh;
      hovered = hoveredMesh;
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Injury highlights: a coloured line and soft glow round every highlighted
// structure, plus a faint tint, all of which show through whatever lies in
// front. Each highlighted mesh is drawn once more, flat, in its own colour.

const GLOW_FRAGMENT = /* glsl */ `
uniform sampler2D mask;
uniform vec2 texel;
uniform float scale;
uniform float fill;
varying vec2 vUv;

vec3 toScreen(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }

void main() {
  vec4 here = texture2D(mask, vUv);
  vec4 nearMax = here, farMax = here;
  float nearMin = here.a, farMin = here.a;
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.7853982;
    vec2 step = vec2(cos(angle), sin(angle)) * texel * scale;
    vec4 a = texture2D(mask, vUv + step * 2.4);
    vec4 b = texture2D(mask, vUv + step * 6.0);
    if (a.a > nearMax.a) nearMax = a;
    if (b.a > farMax.a) farMax = b;
    nearMin = min(nearMin, a.a); farMin = min(farMin, b.a);
  }
  float line = nearMax.a - nearMin;
  float halo = (farMax.a - farMin) * 0.38;
  float tint = here.a * fill;

  vec3 lineColour = nearMax.rgb / max(nearMax.a, 0.001);
  vec3 haloColour = farMax.rgb / max(farMax.a, 0.001);
  vec3 tintColour = here.rgb / max(here.a, 0.001);

  vec4 sum = vec4(tintColour * tint, tint);
  sum = vec4(haloColour * halo, halo) + sum * (1.0 - halo);
  sum = vec4(lineColour * line, line) + sum * (1.0 - line);
  if (sum.a < 0.004) discard;
  gl_FragColor = vec4(toScreen(sum.rgb / sum.a), sum.a);
}`;

export function createGlow(renderer, camera, colours) {
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: false });
  const size = new THREE.Vector2();
  const masks = new Map();
  for (const { id, colour } of colours) {
    masks.set(id, new THREE.MeshBasicMaterial({
      color: colour, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false,
    }));
  }
  const uniforms = {
    mask: { value: target.texture },
    texel: { value: new THREE.Vector2(1, 1) },
    scale: { value: 1 },
    fill: { value: 0.22 },
  };
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  quad.frustumCulled = false;

  let list = [];

  /** Call straight after the main picture has been drawn. */
  function render() {
    if (!list.length) return;
    renderer.getDrawingBufferSize(size);
    if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);

    const autoClear = renderer.autoClear;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.autoClear = false;
    for (const { mesh, colour } of list) {
      const material = masks.get(colour);
      if (!material || !mesh.visible) continue;
      const own = mesh.material;
      mesh.material = material;
      renderer.render(mesh, camera);
      mesh.material = own;
    }
    renderer.setRenderTarget(null);

    uniforms.texel.value.set(1 / size.x, 1 / size.y);
    uniforms.scale.value = renderer.getPixelRatio();
    renderer.render(quad, camera);
    renderer.autoClear = autoClear;
  }

  return {
    render,
    /** list: [{ mesh, colour }]. strong: a heavier tint, for when everything else is faded. */
    set(next, strong = false) { list = next; uniforms.fill.value = strong ? 0.34 : 0.22; },
  };
}
