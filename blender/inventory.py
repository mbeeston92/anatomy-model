"""
Stage 1a: write a full inventory of the Z-Anatomy .blend file.

Run headless (never saves the .blend, so the source is not modified):

  blender --background --factory-startup --disable-autoexec \
      source/Z-Anatomy/Startup.blend --python blender/inventory.py -- data

Outputs (in the folder given after "--"):
  inventory.csv                One row per MESH object.
  inventory-other-objects.csv  One row per non-mesh object (text labels,
                               curves, empties, cameras, lights ...).
"""
import csv
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv
out_dir = argv[argv.index("--") + 1] if "--" in argv else "data"
os.makedirs(out_dir, exist_ok=True)

# ---------------------------------------------------------------- collections
parent_of = {}
for coll in bpy.data.collections:
    for child in coll.children:
        parent_of[child.name] = coll.name
for scene in bpy.data.scenes:
    for child in scene.collection.children:
        parent_of.setdefault(child.name, None)


def collection_path(coll):
    parts = [coll.name]
    seen = {coll.name}
    cur = parent_of.get(coll.name)
    while cur and cur not in seen:
        parts.append(cur)
        seen.add(cur)
        cur = parent_of.get(cur)
    return "/".join(reversed(parts))


def object_collections(obj):
    return " ; ".join(sorted(collection_path(c) for c in obj.users_collection))


# ----------------------------------------------------------------------- side
def side_from_name(name):
    """Z-Anatomy marks side with a .l / .r suffix (sometimes followed by
    another suffix or a Blender duplicate number such as .001)."""
    parts = name.lower().split(".")[1:]
    for p in parts:
        if p == "l":
            return "left"
        if p == "r":
            return "right"
    low = name.lower()
    if low.startswith("left ") or " left " in low:
        return "left"
    if low.startswith("right ") or " right " in low:
        return "right"
    return ""


def side_from_bbox(min_x, max_x, tol=0.002):
    """Geometric side. In Blender the model faces -Y, so the body's own
    LEFT is +X and its RIGHT is -X."""
    if min_x > -tol and max_x > tol:
        return "left"
    if max_x < tol and min_x < -tol:
        return "right"
    return "midline"


def world_bbox(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = [min(p[i] for p in pts) for i in range(3)]
    mx = [max(p[i] for p in pts) for i in range(3)]
    return mn, mx


def safe_text_body(obj):
    """Text of a label object. Some labels hold bytes that are not valid
    UTF-8, which makes Blender raise an error; skip those."""
    if obj.type != "FONT":
        return ""
    try:
        return obj.data.body.replace("\n", " ")[:120]
    except UnicodeDecodeError:
        return "(unreadable text)"


def r(v):
    return round(v, 5)


def evaluated_counts(obj):
    """Triangles after modifiers, total and per material slot.
    Works for meshes and for curves (which Blender turns into a mesh)."""
    try:
        ev = obj.evaluated_get(depsgraph)
        em = ev.to_mesh()
    except Exception:
        return -1, ""
    if em is None:
        return 0, ""
    names = [s.material.name if s.material else "(none)"
             for s in obj.material_slots]
    per = {}
    total = 0
    for p in em.polygons:
        t = len(p.vertices) - 2
        total += t
        key = names[p.material_index] if p.material_index < len(names) else "(none)"
        per[key] = per.get(key, 0) + t
    ev.to_mesh_clear()
    return total, "|".join("%s:%d" % kv for kv in sorted(per.items()))


scene = bpy.context.scene
view_layer_objects = set(o.name for o in bpy.context.view_layer.objects)
depsgraph = bpy.context.evaluated_depsgraph_get()

mesh_rows = []
other_rows = []

for obj in bpy.data.objects:
    colls = object_collections(obj)
    parent = obj.parent.name if obj.parent else ""
    common = {
        "object_name": obj.name,
        "type": obj.type,
        "collection_path": colls,
        "parent": parent,
        "in_view_layer": obj.name in view_layer_objects,
        "hidden_viewport": obj.hide_viewport,
        "hidden_render": obj.hide_render,
    }
    if obj.type != "MESH":
        mn, mx = world_bbox(obj)
        tris_as_mesh, by_mat = (evaluated_counts(obj) if obj.type == "CURVE"
                                else (0, ""))
        name_side = side_from_name(obj.name)
        row = dict(common)
        row.update({
            "data_name": obj.data.name if obj.data else "",
            "text_body": safe_text_body(obj),
            "triangles_if_converted_to_mesh": tris_as_mesh,
            "bbox_min_x": r(mn[0]), "bbox_min_y": r(mn[1]), "bbox_min_z": r(mn[2]),
            "bbox_max_x": r(mx[0]), "bbox_max_y": r(mx[1]), "bbox_max_z": r(mx[2]),
            "side_from_name": name_side,
            "side": name_side or (side_from_bbox(mn[0], mx[0])
                                  if obj.type == "CURVE" else ""),
            "materials": "|".join(s.material.name for s in obj.material_slots
                                  if s.material),
            "curve_bevel_depth": (round(obj.data.bevel_depth, 5)
                                  if obj.type == "CURVE" else ""),
            "curve_bevel_object": (obj.data.bevel_object.name
                                   if obj.type == "CURVE" and obj.data.bevel_object
                                   else ""),
        })
        other_rows.append(row)
        continue

    me = obj.data
    verts = len(me.vertices)
    faces = len(me.polygons)
    tris = sum(len(p.vertices) - 2 for p in me.polygons)

    # Triangle count after modifiers (solidify, subdivision, mirror ...),
    # and how those triangles divide between material slots. Z-Anatomy uses
    # materials to mark e.g. the tendon part of a muscle mesh and the
    # articular-cartilage part of a bone mesh.
    mods = [m.type for m in obj.modifiers]
    tris_eval, by_mat = evaluated_counts(obj)

    mn, mx = world_bbox(obj)
    name_side = side_from_name(obj.name)
    geo_side = side_from_bbox(mn[0], mx[0]) if verts else ""
    row = dict(common)
    row.update({
        "mesh_data_name": me.name,
        "mesh_users": me.users,
        "vertices": verts,
        "faces": faces,
        "triangles": tris,
        "modifiers": "|".join(mods),
        "triangles_after_modifiers": tris_eval,
        "bbox_min_x": r(mn[0]), "bbox_min_y": r(mn[1]), "bbox_min_z": r(mn[2]),
        "bbox_max_x": r(mx[0]), "bbox_max_y": r(mx[1]), "bbox_max_z": r(mx[2]),
        "side_from_name": name_side,
        "side_from_geometry": geo_side,
        "side": name_side or geo_side,
        "materials": "|".join(s.material.name for s in obj.material_slots
                              if s.material),
        "triangles_by_material": by_mat,
        "shape_keys": len(me.shape_keys.key_blocks) if me.shape_keys else 0,
    })
    mesh_rows.append(row)


def write(path, rows):
    if not rows:
        return
    rows.sort(key=lambda x: (x["collection_path"], x["object_name"]))
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


write(os.path.join(out_dir, "inventory.csv"), mesh_rows)
write(os.path.join(out_dir, "inventory-other-objects.csv"), other_rows)

print("INVENTORY_DONE meshes=%d other=%d total_tris=%d blender=%s file=%s" % (
    len(mesh_rows), len(other_rows),
    sum(x["triangles"] for x in mesh_rows),
    bpy.app.version_string, bpy.data.filepath))
print("UNIT_SCALE", scene.unit_settings.scale_length, scene.unit_settings.system)
