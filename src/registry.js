// The structure registry: one entry per structure in structures.json, each
// linked to its own mesh once that mesh has loaded. Later stages (regions,
// selection, highlights, movement) find and change structures through this.

export function createRegistry(data) {
  /** @type {Map<string, {id:string, data:object, system:object, mesh:import('three').Mesh|null}>} */
  const entries = new Map();
  const systems = new Map(data.systems.map((s) => [s.id, s]));

  for (const structure of data.structures) {
    entries.set(structure.id, {
      id: structure.id,
      data: structure,
      system: systems.get(structure.system),
      mesh: null,
    });
  }

  return {
    regions: data.regions,
    systems: data.systems,
    get size() { return entries.size; },

    get(id) { return entries.get(id) ?? null; },
    has(id) { return entries.has(id); },
    all() { return [...entries.values()]; },
    bySystem(systemId) { return this.all().filter((e) => e.data.system === systemId); },
    byRegion(region) { return this.all().filter((e) => e.data.regions?.includes(region)); },

    /** Link a loaded mesh to its structure. Returns false if the id is unknown. */
    attach(id, mesh) {
      const entry = entries.get(id);
      if (!entry) return false;
      entry.mesh = mesh;
      mesh.userData.structureId = id;
      return true;
    },

    /** Look up the structure a mesh belongs to (for clicks and hovers). */
    fromMesh(mesh) { return entries.get(mesh?.userData?.structureId) ?? null; },

    /** All meshes loaded so far. */
    meshes() {
      const list = [];
      for (const entry of entries.values()) if (entry.mesh) list.push(entry.mesh);
      return list;
    },

    /** Ids that have no mesh yet (useful for checks after loading). */
    missing() { return this.all().filter((e) => !e.mesh).map((e) => e.id); },
  };
}
