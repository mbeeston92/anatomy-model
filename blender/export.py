"""
Stage 1b: export the approved structures from Z-Anatomy to one .glb per system.

Run headless. The .blend is opened and changed only in memory; it is never
saved, so the original in source/ is not modified.

  blender --background --factory-startup --disable-autoexec \
      Source/Z-Anatomy/Startup.blend --python blender/export.py -- \
      data/structures-approved.csv work/export data/export-report.json

What it does
  1. Reads data/structures-approved.csv.
  2. Decides which left-side soft-tissue structures are exact mirror images of
     their right-side partner. Those are NOT exported; the app mirrors the
     right side instead. Bones, and any pair that is not an exact mirror, are
     exported for both sides.
  3. Builds one mesh per structure id from the listed Z-Anatomy objects, with
     the source's own modifiers applied (ligament thickness etc.) and nerve
     curves turned into tubes. "#Material" parts are cut along the material
     boundary painted in the source. Nothing is sculpted or added.
  4. Simplifies only dense meshes, never ligaments, cartilage or rotator cuff.
  5. Gives each system one simple material and writes <system>.glb files,
     in metres, Y-up, front of the body facing +Z.
  6. Writes a report (triangle counts before/after, mirrored ids, warnings).
"""
import csv
import json
import os
import sys
import time

import bpy
import bmesh
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
CSV_PATH, OUT_DIR, REPORT_PATH = argv[0], argv[1], argv[2]
os.makedirs(OUT_DIR, exist_ok=True)
T0 = time.time()


def log(*a):
    print("[export %6.1fs]" % (time.time() - T0), *a, flush=True)


# --------------------------------------------------------------- settings
# File name and colour (sRGB hex, alpha) for each system. Colours follow
# CLAUDE.md. Ligament and tendon share the same pale silver-cream, kept a
# little cooler than the warm off-white of bone so they can be told apart.
SYSTEMS = {
    "bone":      ("bones",     "EFE6CF", 1.0),
    "cartilage": ("cartilage", "A9C3D6", 1.0),
    "ligament":  ("ligaments", "C9CEC6", 1.0),
    "tendon":    ("tendons",   "C9CEC6", 1.0),
    "muscle":    ("muscles",   "A8514B", 1.0),
    "nerve":     ("nerves",    "E8C83A", 1.0),
    "bursa":     ("bursae",    "9CC7EA", 0.55),
}

# Simplification. Meshes at or below DECIMATE_FLOOR triangles are untouched.
# Above it, only the excess is reduced: target = floor + slope * (n - floor).
DECIMATE_FLOOR = 3000
DECIMATE_SLOPE = 0.30
# Never simplified: all ligaments and cartilage (menisci, labra, discs, joint
# surfaces), bursae, and the rotator cuff muscles and tendon.
NO_DECIMATE_SYSTEMS = {"ligament", "cartilage", "bursa"}
NO_DECIMATE_PREFIXES = (
    "muscle_supraspinatus", "muscle_infraspinatus", "muscle_teres_minor",
    "muscle_subscapularis", "tendon_infraspinatus", "tendon_achilles",
    "tendon_quadriceps_patellar",
)

# Nerves are curves in the source. A curve is turned into a tube using these
# tessellation settings (source uses 4 and 12, which gives far more triangles
# than a 1 mm-wide tube needs). The path and thickness are not changed.
CURVE_BEVEL_RESOLUTION = 1     # 6-sided tube
CURVE_RESOLUTION_U = 6

MIRROR_TOLERANCE = 1e-5        # metres (0.01 mm)

# -------------------------------------------------------------------- CSV
with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
    ROWS = list(csv.DictReader(f))
BY_ID = {r["id"]: r for r in ROWS}
warnings = []


def parse_sources(row):
    """'A.r#Tendon^lower + B.r' -> [(object, material, selector), ...]"""
    out = []
    for part in row["source_object_names"].split(" + "):
        part = part.strip()
        name, _, sub = part.partition("#")
        mat, _, sel = sub.partition("^")
        out.append((name, mat or None, sel or None))
    return out


for r in ROWS:
    r["_src"] = parse_sources(r)
    if r["system"] not in SYSTEMS:
        raise SystemExit("Unknown system %r in row %s" % (r["system"], r["id"]))
    for name, _, _ in r["_src"]:
        if name not in bpy.data.objects:
            raise SystemExit("Row %s: Z-Anatomy object not found: %r" % (r["id"], name))

# ------------------------------------------------- nerve curve tessellation
for r in ROWS:
    for name, _, _ in r["_src"]:
        ob = bpy.data.objects[name]
        if ob.type == "CURVE":
            cu = ob.data
            cu.bevel_resolution = min(cu.bevel_resolution, CURVE_BEVEL_RESOLUTION)
            cu.resolution_u = min(cu.resolution_u, CURVE_RESOLUTION_U)
bpy.context.view_layer.update()
DG = bpy.context.evaluated_depsgraph_get()


def world_verts(name):
    ob = bpy.data.objects[name]
    ev = ob.evaluated_get(DG)
    me = ev.to_mesh()
    a = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", a)
    a = a.reshape(-1, 3)
    mw = np.array(ob.matrix_world)
    a = a @ mw[:3, :3].T + mw[:3, 3]
    ev.to_mesh_clear()
    return a


# ----------------------------------------------------------- mirror check
log("checking left/right mirror pairs")
mirror_of = {}       # left id -> right id (left is not exported)
not_mirror = []      # [left id, reason]
for r in ROWS:
    if r["side"] != "left" or r["system"] == "bone":
        continue
    partner = BY_ID.get(r["id"][:-2] + "_r") if r["id"].endswith("_l") else None
    if partner is None or len(partner["_src"]) != len(r["_src"]):
        not_mirror.append([r["id"], "no matching right-side row"])
        continue
    reason = None
    for (ln, lm, ls), (rn, rm, rs) in zip(r["_src"], partner["_src"]):
        if (lm, ls) != (rm, rs):
            reason = "different parts listed"
            break
        va = world_verts(ln)
        vb = world_verts(rn) * np.array([-1.0, 1.0, 1.0])
        if va.shape != vb.shape:
            reason = "%r has %d points, %r has %d" % (ln, len(va), rn, len(vb))
            break
        d = float(np.abs(va - vb).max()) if len(va) else 0.0
        if d > MIRROR_TOLERANCE:
            reason = "%r differs from mirrored %r by up to %.1f mm" % (ln, rn, d * 1000)
            break
    if reason:
        not_mirror.append([r["id"], reason])
    else:
        mirror_of[r["id"]] = partner["id"]
log("mirrored (not exported): %d   exported both sides: %d" % (len(mirror_of), len(not_mirror)))

EXPORT_ROWS = [r for r in ROWS if r["id"] not in mirror_of]

# ------------------------------------------------ gather geometry per object
# For each Z-Anatomy object: which rows claim a painted part, and which row
# takes the whole object / the rest.
claims = {}     # object -> [(row id, material, selector)]
rest = {}       # object -> row id
for r in EXPORT_ROWS:
    for name, mat, sel in r["_src"]:
        if mat is None or mat == "rest":
            if name in rest:
                raise SystemExit("Object %r is used whole by two rows: %s and %s" % (name, rest[name], r["id"]))
            rest[name] = r["id"]
        else:
            claims.setdefault(name, []).append((r["id"], mat, sel))


def tri_count_bm(bm):
    return sum(len(f.verts) - 2 for f in bm.faces)


def components(faces):
    """Split a set of faces into connected pieces (joined through edges)."""
    fset = set(faces)
    seen = set()
    out = []
    for f in faces:
        if f in seen:
            continue
        comp = []
        stack = [f]
        seen.add(f)
        while stack:
            g = stack.pop()
            comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h in fset and h not in seen:
                        seen.add(h)
                        stack.append(h)
        out.append(comp)
    return out


def zrange(faces):
    zs = [v.co.z for f in faces for v in f.verts]
    return min(zs), max(zs)


parts = {}          # row id -> [temporary mesh datablocks]
src_tris = {}       # row id -> triangles before simplification
cut_log = {}        # row id -> description of pieces taken
all_objects = sorted(set(rest) | set(claims))
log("extracting geometry from %d Z-Anatomy objects" % len(all_objects))

for n_done, name in enumerate(all_objects):
    ob = bpy.data.objects[name]
    ev = ob.evaluated_get(DG)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    ev.to_mesh_clear()
    bm.transform(ob.matrix_world)
    if ob.matrix_world.determinant() < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    bm.faces.index_update()
    slot_names = [s.material.name if s.material else "" for s in ob.material_slots]

    def mat_of(f):
        return slot_names[f.material_index] if f.material_index < len(slot_names) else ""

    owner = {}
    for rid, mat, sel in claims.get(name, []):
        faces = [f for f in bm.faces if mat_of(f) == mat]
        if not faces:
            warnings.append("%s: %r has no faces with material %r" % (rid, name, mat))
            continue
        chosen = faces
        if sel:
            comps = components(faces)
            lo, hi = zrange(faces)
            mid = (lo + hi) / 2.0
            if sel == "largest":
                keep = [max(comps, key=lambda c: sum(len(f.verts) - 2 for f in c))]
            elif sel in ("upper", "lower"):
                keep = []
                for c in comps:
                    clo, chi = zrange(c)
                    is_upper = (clo + chi) / 2.0 > mid
                    if is_upper == (sel == "upper"):
                        keep.append(c)
            else:
                raise SystemExit("%s: unknown selector ^%s" % (rid, sel))
            chosen = [f for c in keep for f in c]
            cut_log.setdefault(rid, []).append(
                "%s#%s^%s: %d of %d separate pieces" % (name, mat, sel, len(keep), len(comps)))
            if not chosen:
                warnings.append("%s: %r #%s^%s matched nothing" % (rid, name, mat, sel))
                continue
        for f in chosen:
            if f.index in owner:
                raise SystemExit("%s: part of %r is claimed twice (%s)" % (rid, name, owner[f.index]))
            owner[f.index] = rid
    rest_id = rest.get(name)
    owners = set(owner.values())
    if rest_id:
        owners.add(rest_id)
    for rid in owners:
        if rid == rest_id and not owner:
            part = bm                       # whole object, nothing cut out
        else:
            part = bm.copy()
            part.faces.ensure_lookup_table()
            kill = [f for f in part.faces if owner.get(f.index, rest_id) != rid]
            bmesh.ops.delete(part, geom=kill, context="FACES")
        t = tri_count_bm(part)
        if t == 0:
            warnings.append("%s: nothing left of %r after cutting" % (rid, name))
        tmp = bpy.data.meshes.new("tmp")
        part.to_mesh(tmp)
        parts.setdefault(rid, []).append(tmp)
        src_tris[rid] = src_tris.get(rid, 0) + t
        if part is not bm:
            part.free()
    bm.free()
    if n_done % 150 == 0:
        log("  %d / %d" % (n_done, len(all_objects)))

# --------------------------------------- drop everything from the source scene
log("clearing the in-memory scene (the .blend on disk is untouched)")
bpy.data.batch_remove(ids=list(bpy.data.objects))
scene = bpy.context.scene


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


MATERIALS = {}
for system, (fname, hexcol, alpha) in SYSTEMS.items():
    rgb = [srgb_to_linear(int(hexcol[i:i + 2], 16) / 255.0) for i in (0, 2, 4)]
    m = bpy.data.materials.new("mat_" + system)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.65
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Alpha"].default_value = alpha
    m.diffuse_color = (*rgb, alpha)
    m.use_backface_culling = False          # exported as double-sided
    if alpha < 1.0:
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    MATERIALS[system] = m

# ------------------------------------------------------- build export objects
log("building %d export meshes" % len(EXPORT_ROWS))
objects = {}
decimated = {}
for r in EXPORT_ROWS:
    rid = r["id"]
    if rid not in parts:
        warnings.append("%s: no geometry was produced" % rid)
        continue
    bm = bmesh.new()
    for tmp in parts[rid]:
        bm.from_mesh(tmp)
    bm.verts.index_update()
    boundary = {v.index for e in bm.edges if len(e.link_faces) == 1 for v in e.verts}
    n_verts = len(bm.verts)
    me = bpy.data.meshes.new(rid)
    bm.to_mesh(me)
    bm.free()
    for tmp in parts[rid]:
        bpy.data.meshes.remove(tmp)
    me.materials.clear()
    me.materials.append(MATERIALS[r["system"]])
    me.polygons.foreach_set("material_index", [0] * len(me.polygons))
    ob = bpy.data.objects.new(rid, me)
    scene.collection.objects.link(ob)
    objects[rid] = ob

    n = src_tris[rid]
    protect = r["system"] in NO_DECIMATE_SYSTEMS or rid.startswith(NO_DECIMATE_PREFIXES)
    if n > DECIMATE_FLOOR and not protect:
        target = DECIMATE_FLOOR + DECIMATE_SLOPE * (n - DECIMATE_FLOOR)
        mod = ob.modifiers.new("simplify", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = target / n
        mod.use_collapse_triangulate = True
        # Keep open edges (cut lines, sheet outlines) in place so that a tendon
        # still meets its muscle after simplification.
        inner = [i for i in range(n_verts) if i not in boundary]
        if boundary and inner:
            vg = ob.vertex_groups.new(name="inner")
            vg.add(inner, 1.0, "REPLACE")
            mod.vertex_group = "inner"
            mod.vertex_group_factor = 1000.0
        decimated[rid] = True

log("simplifying %d dense meshes" % len(decimated))
bpy.context.view_layer.update()
DG = bpy.context.evaluated_depsgraph_get()
out_tris = {}
for rid, ob in objects.items():
    if rid in decimated:
        new = bpy.data.meshes.new_from_object(ob.evaluated_get(DG))
        old = ob.data
        ob.modifiers.clear()
        ob.vertex_groups.clear()
        ob.data = new
        bpy.data.meshes.remove(old)
        new.name = rid
    out_tris[rid] = sum(len(p.vertices) - 2 for p in ob.data.polygons)

# -------------------------------------------------------------------- export
props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
WANTED = dict(
    export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
    export_materials="EXPORT", export_normals=True, export_texcoords=False,
    export_tangents=False, export_animations=False, export_skins=False,
    export_morph=False, export_cameras=False, export_lights=False,
    export_extras=False, export_attributes=False, export_vertex_color="NONE",
    export_shared_accessors=False,
)
files = {}
for system, (fname, _, _) in SYSTEMS.items():
    ids = [r["id"] for r in EXPORT_ROWS if r["system"] == system and r["id"] in objects]
    if not ids:
        continue
    for ob in scene.objects:
        ob.select_set(ob.name in ids)
    bpy.context.view_layer.objects.active = objects[ids[0]]
    path = os.path.join(OUT_DIR, fname + ".glb")
    kw = {k: v for k, v in WANTED.items() if k in props}
    bpy.ops.export_scene.gltf(filepath=path, **kw)
    files[system] = {"file": fname + ".glb", "meshes": len(ids),
                     "bytes_uncompressed": os.path.getsize(path)}
    log("wrote %s  (%d meshes, %.1f MB)" % (path, len(ids), os.path.getsize(path) / 1e6))

# -------------------------------------------------------------------- report
structures = {}
for r in ROWS:
    rid = r["id"]
    if rid in mirror_of:
        p = mirror_of[rid]
        structures[rid] = {"system": r["system"], "mirror_of": p,
                           "triangles_source": src_tris.get(p, 0),
                           "triangles_export": 0,
                           "triangles_displayed": out_tris.get(p, 0)}
    else:
        structures[rid] = {"system": r["system"], "mirror_of": None,
                           "triangles_source": src_tris.get(rid, 0),
                           "triangles_export": out_tris.get(rid, 0),
                           "triangles_displayed": out_tris.get(rid, 0),
                           "simplified": rid in decimated}
        if rid in cut_log:
            structures[rid]["cuts"] = cut_log[rid]

by_system = {}
for system in SYSTEMS:
    ss = [s for s in structures.values() if s["system"] == system]
    by_system[system] = {
        "structures": len(ss),
        "meshes_exported": sum(1 for s in ss if not s["mirror_of"]),
        "triangles_source_both_sides": sum(s["triangles_source"] for s in ss),
        "triangles_in_files": sum(s["triangles_export"] for s in ss),
        "triangles_displayed_both_sides": sum(s["triangles_displayed"] for s in ss),
        **files.get(system, {}),
    }
report = {
    "blender": bpy.app.version_string,
    "settings": {"decimate_floor": DECIMATE_FLOOR, "decimate_slope": DECIMATE_SLOPE,
                 "curve_bevel_resolution": CURVE_BEVEL_RESOLUTION,
                 "curve_resolution_u": CURVE_RESOLUTION_U,
                 "mirror_tolerance_m": MIRROR_TOLERANCE},
    "systems": {s: {"file": v[0] + ".glb", "material": "mat_" + s, "colour": "#" + v[1], "opacity": v[2]}
                for s, v in SYSTEMS.items()},
    "totals": {
        "structures": len(ROWS),
        "meshes_exported": len(objects),
        "mirrored_in_app": len(mirror_of),
        "triangles_source_both_sides": sum(s["triangles_source"] for s in structures.values()),
        "triangles_in_files": sum(s["triangles_export"] for s in structures.values()),
        "triangles_displayed_both_sides": sum(s["triangles_displayed"] for s in structures.values()),
    },
    "by_system": by_system,
    "exported_both_sides_not_exact_mirror": not_mirror,
    "warnings": warnings,
    "structures": structures,
}
with open(REPORT_PATH, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=1)
log("report written to", REPORT_PATH)
print(json.dumps(report["totals"], indent=1))
print(json.dumps(by_system, indent=1))
print("NOT MIRROR:", json.dumps(not_mirror, indent=1))
print("WARNINGS:", json.dumps(warnings, indent=1))
print("EXPORT_DONE")
