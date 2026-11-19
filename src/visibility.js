// Visibility: which structures are shown, hidden or ghosted, decided from the
// region controls, the system tick boxes and any individually hidden
// structures (set by quick views). Also keeps the undo / redo history.
//
// The rule:
//   1. A structure whose system is unticked, whose soft-tissue side is switched
//      off, or which is individually hidden, is not shown.
//   2. A structure in the isolated region is shown.
//   3. Otherwise soft tissue is hidden if ANY of its regions is hidden;
//      a bone is hidden only when ALL of its regions are hidden.
// Midline structures (spine, sacrum, spinal cord) count a region as hidden
// only when both its left and right sides are hidden, and stay shown when
// soft tissue is set to one side.
import * as THREE from 'three';

export const SIDES = ['left', 'right'];

// Regions that are controlled as a whole (no separate left and right).
const UNPAIRED = new Set([
  'head and neck',
  'chest and upper back (thoracic)',
  'abdomen and lower back (lumbar)',
]);

// Midline soft-tissue meshes that span both sides of the body (hidden when
// soft tissue is switched to a single side, as agreed with the user).
const BILATERAL_MIDLINE = new Set(['muscle_diaphragm']);

const HISTORY_LIMIT = 100;
export const MAX_SPOTS = 6;     // shaded pain areas at once (the oldest goes when a seventh is added)
const key = (region, side) => `${region}|${side}`;

const emptyState = () => ({
  hidden: new Set(),          // "region|side" keys
  isolated: null,             // { region, sides: ['left', 'right'] } or null
  softSide: null,             // 'left' or 'right' when soft tissue is shown on one side only; null for both
  systemsOff: new Set(),      // system ids that are unticked
  structuresOff: new Set(),   // structure ids hidden one by one (quick views, "Hide this")
  only: null,                 // id of the one structure being shown on its own ("Isolate this")
  preset: null,               // label of the quick view that produced this state
  marks: [],                  // injury highlights, in the order made: [structure id, colour id]
  spots: [],                  // shaded pain areas: { x, y, z, r, colour, on }
});

const serialise = (s) => JSON.stringify({
  hidden: [...s.hidden].sort(),
  isolated: s.isolated && {
    region: s.isolated.region,
    sides: [...s.isolated.sides].sort(),
    ...(s.isolated.extra?.length
      ? { extra: s.isolated.extra.map((ex) => ({ region: ex.region, sides: [...ex.sides].sort() })) }
      : {}),
  },
  softSide: s.softSide,
  systemsOff: [...s.systemsOff].sort(),
  structuresOff: [...s.structuresOff].sort(),
  only: s.only,
  preset: s.preset,
  marks: s.marks,
  spots: s.spots,
});

/** The same, leaving out highlights: "is anything hidden?" must not count them. */
const serialiseView = (s) => serialise({ ...s, marks: [], spots: [] });

const deserialise = (text) => {
  const o = JSON.parse(text);
  return {
    hidden: new Set(o.hidden),
    isolated: o.isolated,
    softSide: o.softSide ?? null,
    systemsOff: new Set(o.systemsOff),
    structuresOff: new Set(o.structuresOff),
    only: o.only ?? null,
    preset: o.preset,
    marks: o.marks ?? [],
    spots: o.spots ?? [],
  };
};

export function createVisibility({ registry, materials, looks = null, onChange = () => {} }) {
  const regions = registry.regions;
  let state = emptyState();
  let history = [serialise(state)];
  let position = 0;
  let ghost = false;
  let emphasis = false;       // fade everything that is not highlighted
  let shown = [];
  let highlighted = [];       // [{ mesh, colour }] for the highlights that are on show

  const ghostMaterial = new THREE.MeshBasicMaterial({
    name: 'mat_ghost',
    color: 0x7f8d98,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const isPaired = (region) => !UNPAIRED.has(region);
  /** The sides an action applies to: unpaired regions always act on both. */
  const sidesFor = (region, sides) => (isPaired(region) && sides?.length ? sides : SIDES);

  // ----- The rule -----

  /** 'shown', 'filtered' (system, soft-tissue side or single structure switched off) or 'hidden' (by region). */
  function statusOf(entry, s = state) {
    const d = entry.data;
    // One structure on its own: everything else counts as hidden (and is ghosted).
    if (s.only) return entry.id === s.only ? 'shown' : 'hidden';
    if (s.systemsOff.has(d.system) || s.structuresOff.has(entry.id)) return 'filtered';
    if (s.softSide && d.system !== 'bone'
      && (d.side !== 'midline' ? d.side !== s.softSide : BILATERAL_MIDLINE.has(entry.id))) {
      return 'filtered';
    }

    const iso = s.isolated;
    if (iso) {
      if (d.regions.includes(iso.region) && (d.side === 'midline' || iso.sides.includes(d.side))) return 'shown';
      if (iso.extra?.some((ex) => d.regions.includes(ex.region) && (d.side === 'midline' || ex.sides.includes(d.side)))) {
        return 'shown';
      }
    }
    const regionHidden = (region) => (d.side === 'midline'
      ? SIDES.every((side) => s.hidden.has(key(region, side)))
      : s.hidden.has(key(region, d.side)));
    const hidden = d.system === 'bone' ? d.regions.every(regionHidden) : d.regions.some(regionHidden);
    return hidden ? 'hidden' : 'shown';
  }

  /** Put the current state onto the meshes. */
  function apply() {
    shown = [];
    highlighted = [];
    const marks = new Map(state.marks);
    const fade = emphasis && looks && (marks.size > 0 || state.spots.length > 0);
    for (const entry of registry.all()) {
      const mesh = entry.mesh;
      if (!mesh) continue;
      const status = statusOf(entry);
      const ghosted = (ghost || state.only !== null) && status === 'hidden';
      const colour = status === 'shown' && looks ? marks.get(entry.id) : null;
      mesh.visible = status === 'shown' || ghosted;
      if (ghosted) mesh.material = ghostMaterial;
      else if (colour && looks.highlight.has(colour)) mesh.material = looks.highlight.get(colour);
      else mesh.material = fade ? looks.fade : materials.get(entry.data.system);
      mesh.userData.ghost = ghosted;
      if (status === 'shown') shown.push(mesh);
      if (colour) highlighted.push({ mesh, colour });
    }
    looks?.setSpots(state.spots);
    onChange();
  }

  // ----- History -----

  function commit(change, { keep = false } = {}) {
    const next = deserialise(serialise(state));
    if (!keep) {                   // highlights (keep) leave the view as it is
      next.preset = null;
      next.only = null;            // any other change ends "Isolate this"
    }
    change(next);
    const text = serialise(next);
    if (text === history[position]) return false;
    history = history.slice(Math.max(0, position + 1 - HISTORY_LIMIT), position + 1);
    history.push(text);
    position = history.length - 1;
    state = next;
    apply();
    return true;
  }

  function step(by) {
    const target = position + by;
    if (target < 0 || target >= history.length) return false;
    position = target;
    state = deserialise(history[position]);
    apply();
    return true;
  }

  // ----- Actions -----

  function isolateIn(s, region, sides, extra = []) {
    const kept = new Map([[region, sides]]);
    for (const ex of extra) kept.set(ex.region, ex.sides);
    s.hidden = new Set();
    for (const r of regions) {
      const keepSides = kept.get(r) ?? [];
      for (const side of SIDES) {
        if (!keepSides.includes(side)) s.hidden.add(key(r, side));
      }
    }
    s.isolated = extra.length
      ? { region, sides: [...sides], extra: extra.map((ex) => ({ region: ex.region, sides: [...ex.sides] })) }
      : { region, sides: [...sides] };
  }

  const isIsolated = (region, sides) => {
    const iso = state.isolated;
    return !!iso && iso.region === region
      && iso.sides.length === sides.length && sides.every((side) => iso.sides.includes(side));
  };

  function hide(region, sides) {
    const list = sidesFor(region, sides);
    return commit((s) => {
      // Hiding the isolated region ends the isolation first.
      if (s.isolated?.region === region && list.some((side) => s.isolated.sides.includes(side))) {
        s.hidden = new Set();
        s.isolated = null;
      }
      for (const side of list) s.hidden.add(key(region, side));
    });
  }

  function show(region, sides) {
    const list = sidesFor(region, sides);
    return commit((s) => { for (const side of list) s.hidden.delete(key(region, side)); });
  }

  /** Show only this region. Pressing it again on the same region ends the isolation. */
  function isolate(region, sides) {
    const list = sidesFor(region, sides);
    if (isIsolated(region, list)) {
      commit((s) => { s.hidden = new Set(); s.isolated = null; });
      return false;
    }
    commit((s) => isolateIn(s, region, list));
    return true;
  }

  function setSystem(systemId, on) {
    return commit((s) => { if (on) s.systemsOff.delete(systemId); else s.systemsOff.add(systemId); });
  }

  /** Show soft tissue on 'left', 'right' or both (null / 'both'). Bones and midline structures always stay. */
  function setSoftSide(side) {
    const next = side === 'left' || side === 'right' ? side : null;
    return commit((s) => { s.softSide = next; });
  }

  function showStructures() {
    return commit((s) => { s.structuresOff = new Set(); });
  }

  /** Hide or show one structure ("Hide this" on the info card). */
  function setStructure(id, on) {
    if (!registry.has(id)) return false;
    return commit((s) => { if (on) s.structuresOff.delete(id); else s.structuresOff.add(id); });
  }

  /** Show one structure on its own, the rest as a faint outline. Again on the same one ends it. */
  function isolateStructure(id) {
    if (!registry.has(id)) return false;
    if (state.only === id) { commit(() => {}); return false; }
    commit((s) => { s.structuresOff.delete(id); s.only = id; });
    return true;
  }

  /** Make sure one structure is shown (used when it is picked from the search). */
  function reveal(id) {
    const entry = registry.get(id);
    if (!entry || statusOf(entry) === 'shown') return false;
    return commit((s) => {
      s.structuresOff.delete(id);
      s.systemsOff.delete(entry.data.system);
      if (s.softSide && entry.data.system !== 'bone'
        && (entry.data.side !== 'midline' ? entry.data.side !== s.softSide : BILATERAL_MIDLINE.has(entry.id))) {
        s.softSide = null;
      }
      if (statusOf(entry, s) === 'shown') return;
      const sides = entry.data.side === 'midline' ? SIDES : [entry.data.side];
      for (const region of entry.data.regions) for (const side of sides) s.hidden.delete(key(region, side));
    });
  }

  function showEverything() {
    // Highlights stay: only "Clear all highlights" removes them.
    return commit((s) => Object.assign(s, emptyState(), { marks: s.marks, spots: s.spots }));
  }

  /**
   * Apply a quick view (presets.json) or common injury (injuries.json).
   * `sides` is the side chosen in the panel. Returns what was isolated (for the camera).
   */
  function applyPreset(preset, sides, { prefix = '' } = {}) {
    const region = preset.isolate ?? null;
    if (region && !regions.includes(region)) {
      console.warn(`Preset "${preset.label}": unknown region "${region}"`);
      return null;
    }
    const extraRegions = [];
    for (const r of preset.extraRegions ?? []) {
      if (regions.includes(r)) extraRegions.push(r);
      else console.warn(`Preset "${preset.label}": unknown extra region "${r}"`);
    }
    const list = region ? sidesFor(region, sides) : sides;
    const extra = extraRegions.map((r) => ({ region: r, sides: sidesFor(r, sides) }));
    const systemsOff = new Set();
    for (const id of preset.hideSystems ?? []) {
      if (registry.systems.some((sys) => sys.id === id)) systemsOff.add(id);
      else console.warn(`Preset "${preset.label}": unknown system "${id}"`);
    }
    const matchEntries = (base, allowedSides) => {
      const found = [base, `${base}_l`, `${base}_r`]
        .map((id) => registry.get(id))
        .filter((e) => e && (e.data.side === 'midline' || allowedSides.includes(e.data.side)));
      if (!registry.has(base) && !registry.has(`${base}_l`) && !registry.has(`${base}_r`)) {
        console.warn(`Preset "${preset.label}": unknown structure "${base}"`);
      }
      return found;
    };
    const structuresOff = new Set();
    for (const base of preset.hideStructures ?? []) {
      for (const e of matchEntries(base, list)) structuresOff.add(e.id);
    }
    // Common injuries provide a highlights map ({ red: [...], amber: [...] });
    // regular quick views leave existing highlights untouched.
    let nextMarks = null;
    if (preset.highlights) {
      nextMarks = [];
      const pickSides = sides?.length ? sides : SIDES;
      for (const [colour, bases] of Object.entries(preset.highlights)) {
        for (const base of bases ?? []) {
          for (const e of matchEntries(base, pickSides)) {
            if (!nextMarks.some(([id]) => id === e.id)) nextMarks.push([e.id, colour]);
          }
        }
      }
    }
    const presetSides = sides?.length ? sides : list;
    commit((s) => {
      Object.assign(s, emptyState(), nextMarks
        ? { marks: nextMarks, spots: [] }
        : { marks: s.marks, spots: s.spots });
      if (region) isolateIn(s, region, list, extra);
      s.systemsOff = systemsOff;
      s.structuresOff = structuresOff;
      s.preset = `${prefix}${preset.id}|${[...presetSides].sort().join('+')}`;
    });
    return region ? { region, sides: list, extraRegions } : null;
  }

  // ----- Highlights (injury colours) and shaded pain areas -----

  const highlightOf = (id) => state.marks.find(([markId]) => markId === id)?.[1] ?? null;

  /** Give a structure a highlight colour. The same colour again removes it. */
  function setHighlight(id, colour) {
    if (!registry.has(id)) return false;
    const current = highlightOf(id);
    return commit((s) => {
      if (current === colour) s.marks = s.marks.filter(([markId]) => markId !== id);
      else if (current) s.marks = s.marks.map((mark) => (mark[0] === id ? [id, colour] : mark));
      else s.marks.push([id, colour]);
    }, { keep: true });
  }

  function removeHighlight(id) {
    return commit((s) => { s.marks = s.marks.filter(([markId]) => markId !== id); }, { keep: true });
  }

  function clearHighlights() {
    return commit((s) => { s.marks = []; s.spots = []; }, { keep: true });
  }

  /** Shade everything within r metres of a point. `on` is the structure that was clicked. */
  function addSpot({ x, y, z, r, colour, on = null }) {
    const round = (n) => Math.round(n * 1000) / 1000;
    return commit((s) => {
      s.spots.push({ x: round(x), y: round(y), z: round(z), r: round(r), colour, on });
      if (s.spots.length > MAX_SPOTS) s.spots.shift();
    }, { keep: true });
  }

  function removeSpot(index) {
    return commit((s) => { s.spots.splice(index, 1); }, { keep: true });
  }

  // ----- Questions the interface asks -----

  /** 'only', 'hidden' or 'shown' for one side of a region. */
  function regionStatus(region, side) {
    if (state.isolated?.region === region && state.isolated.sides.includes(side)) return 'only';
    return state.hidden.has(key(region, side)) ? 'hidden' : 'shown';
  }

  /**
   * The box the camera should frame for a region (or regions): the structures
   * that belong to each region alone (so "knee" frames the joint, not the whole femur).
   * When `includeHighlights` is set (common injuries), every shown highlighted
   * structure is also kept inside the frame.
   */
  function frameBox(region, sides, { extraRegions = [], includeHighlights = false } = {}) {
    const box = new THREE.Box3();
    let hasCore = false;
    for (const r of [region, ...extraRegions]) {
      const list = sidesFor(r, sides);
      const inRegion = registry.byRegion(r).filter((e) => e.mesh
        && (e.data.side === 'midline' || list.includes(e.data.side)));
      const visible = inRegion.filter((e) => statusOf(e) === 'shown');
      const pool = visible.length ? visible : inRegion;
      const core = pool.filter((e) => e.data.regions.length === 1);
      if (core.length) {
        hasCore = true;
        for (const e of core) box.expandByObject(e.mesh);
      } else if (!includeHighlights || !highlighted.length) {
        for (const e of pool) box.expandByObject(e.mesh);
      }
    }
    if (includeHighlights && highlighted.length) {
      for (const { mesh } of highlighted) box.expandByObject(mesh);
      // If none of the regions had single-region structures (e.g. thigh), the
      // highlights themselves give a much cleaner frame than long nerves crossing it.
      void hasCore;
    }
    return box.isEmpty() ? null : box;
  }

  return {
    regions,
    isPaired,
    hide, show, isolate, isIsolated, setSystem, setSoftSide, showStructures, showEverything, applyPreset,
    setStructure, isolateStructure, reveal,
    highlightOf, setHighlight, removeHighlight, clearHighlights, addSpot, removeSpot,
    /** [{ id, colour }] in the order they were made. */
    highlights: () => state.marks.map(([id, colour]) => ({ id, colour })),
    spots: () => state.spots.map((spot) => ({ ...spot })),
    /** [{ mesh, colour }] for highlighted structures that are on show. */
    highlightedMeshes: () => highlighted,
    get emphasis() { return emphasis; },
    setEmphasis(on) { emphasis = !!on; apply(); },
    get only() { return state.only; },
    get isolated() { return state.isolated; },
    get softSide() { return state.softSide; },
    structureOn: (id) => !state.structuresOff.has(id),
    undo: () => step(-1),
    redo: () => step(1),
    get canUndo() { return position > 0; },
    get canRedo() { return position < history.length - 1; },
    get ghost() { return ghost; },
    setGhost(on) { ghost = !!on; apply(); },
    apply,
    statusOf,
    regionStatus,
    frameBox,
    systemOn: (id) => !state.systemsOff.has(id),
    get structuresOffCount() { return state.structuresOff.size; },
    get preset() { return state.preset; },
    get isDefault() { return serialiseView(state) === serialiseView(emptyState()); },
    /** Meshes that are really shown (not ghosts): the ones a click can hit. */
    shownMeshes: () => shown,
  };
}
