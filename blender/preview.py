"""
Stage 1b: render preview images of the EXPORTED models (not of the source),
so that what you see is what the app will load.

  blender --background --factory-startup --python blender/preview.py -- \
      work/export data/export-report.json data/previews

It imports each <system>.glb, recreates the mirrored left-side soft tissue the
same way the app will (a copy flipped left-to-right), and renders a set of
views with Blender's fast "Workbench" renderer.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
GLB_DIR, REPORT_PATH, OUT_DIR = (os.path.abspath(a) for a in argv[:3])
os.makedirs(OUT_DIR, exist_ok=True)
report = json.load(open(REPORT_PATH, encoding="utf-8"))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ------------------------------------------------------------------- import
system_of = {}
for system, info in report["systems"].items():
    path = os.path.join(GLB_DIR, info["file"])
    if not os.path.exists(path):
        print("MISSING FILE", path)
        continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    for ob in set(bpy.data.objects) - before:
        if ob.type == "MESH":
            system_of[ob.name] = system
            rgb = [int(info["colour"][i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
            for m in ob.data.materials:
                m.diffuse_color = (*rgb, 1.0)

# Mirror the right side to make the left, exactly as the app will.
missing = []
for sid, s in report["structures"].items():
    if s["mirror_of"]:
        src = bpy.data.objects.get(s["mirror_of"])
        if src is None:
            missing.append(sid)
            continue
        ob = bpy.data.objects.new(sid, src.data)
        ob.matrix_world = src.matrix_world.copy()
        ob.scale.x *= -1.0
        scene.collection.objects.link(ob)
        system_of[sid] = s["system"]
    elif sid not in bpy.data.objects:
        missing.append(sid)
print("PREVIEW objects:", len(system_of), "missing:", missing)

# ------------------------------------------------------------------- render
scene.render.engine = "BLENDER_WORKBENCH"
sh = scene.display.shading
sh.light = "STUDIO"
sh.color_type = "MATERIAL"
sh.show_cavity = True
sh.cavity_type = "BOTH"
sh.show_shadows = False
sh.show_backface_culling = False
sh.show_object_outline = False
scene.display.render_aa = "8"
scene.render.film_transparent = False
world = bpy.data.worlds.new("w")
world.color = (0.91, 0.92, 0.93)
scene.world = world
scene.view_settings.view_transform = "Standard"
scene.render.image_settings.file_format = "PNG"

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.clip_start = 0.01
cam_data.clip_end = 50
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

ALL = set(report["systems"])
DEEP = ALL - {"muscle", "bursa"}


def shot(name, centre, direction, height, aspect, systems=ALL, px=1400, cull=False, only=None):
    """direction: where the camera sits relative to the centre
    (Blender axes: -Y is the front of the body, +X is the body's left)."""
    for obn, system in system_of.items():
        ob = bpy.data.objects[obn]
        show = system in systems and (only is None or only(obn))
        ob.hide_render = not show
    sh.show_backface_culling = cull
    d = Vector(direction).normalized()
    cam.location = Vector(centre) + d * 5.0
    # Look from the camera towards the centre, keeping the head at the top.
    fwd = -d
    right = fwd.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(fwd).normalized()
    rot = Matrix((right, up, -fwd)).transposed()
    cam.rotation_euler = rot.to_euler()
    scene.render.resolution_y = px
    scene.render.resolution_x = int(px * aspect)
    cam_data.ortho_scale = height if aspect <= 1 else height * aspect
    scene.render.filepath = os.path.join(OUT_DIR, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name)


BODY = (0, 0, 0.83)
shot("01_front_all", BODY, (0, -1, 0), 1.9, 0.5, px=1800)
shot("02_back_all", BODY, (0, 1, 0), 1.9, 0.5, px=1800)
shot("03_right_side_all", BODY, (-1, 0, 0), 1.9, 0.5, px=1800)
shot("04_front_deep_no_muscles", BODY, (0, -1, 0), 1.9, 0.5, DEEP, px=1800)
shot("05_back_deep_no_muscles", BODY, (0, 1, 0), 1.9, 0.5, DEEP, px=1800)
shot("06_front_bones_only", BODY, (0, -1, 0), 1.9, 0.5, {"bone"}, px=1800)
shot("07_front_bones_backface_test", BODY, (0, -1, 0), 1.9, 0.5, {"bone"}, px=1800, cull=True)
shot("08_front_bones_nerves", BODY, (0, -1, 0), 1.9, 0.5, {"bone", "nerve"}, px=1800)
shot("09_front_all_backface_test", BODY, (0, -1, 0), 1.9, 0.5, px=1800, cull=True)

KNEE_R = (-0.10, 0.0, 0.44)
KNEE_L = (0.10, 0.0, 0.44)
shot("10_knee_right_front_deep", KNEE_R, (0, -1, 0), 0.26, 1.0, DEEP)
shot("11_knee_right_back_deep", KNEE_R, (0, 1, 0), 0.26, 1.0, DEEP)
shot("12_knee_right_outer_side_deep", KNEE_R, (-1, 0, 0), 0.26, 1.0, DEEP)
shot("13_knee_right_inner_side_deep", KNEE_R, (1, 0, 0), 0.26, 1.0, DEEP,
     only=lambda n: not n.endswith("_l"))
shot("14_knee_right_front_ligaments_cartilage", KNEE_R, (0.3, -1, 0.25), 0.2, 1.0, {"bone", "ligament", "cartilage"})
shot("15_knee_right_front_all", KNEE_R, (0, -1, 0), 0.26, 1.0)
shot("16_knee_right_front_with_bursae", KNEE_R, (-0.5, -1, 0), 0.26, 1.0, DEEP | {"bursa"})
shot("17_knee_left_front_deep_mirrored", KNEE_L, (0, -1, 0), 0.26, 1.0, DEEP)

SHOULDER_R = (-0.17, 0.0, 1.37)
shot("20_shoulder_right_front_deep", SHOULDER_R, (0, -1, 0), 0.30, 1.0, DEEP)
shot("21_shoulder_right_back_deep", SHOULDER_R, (0, 1, 0), 0.30, 1.0, DEEP)
shot("22_shoulder_right_front_all", SHOULDER_R, (0, -1, 0), 0.30, 1.0)
shot("23_shoulder_right_back_all", SHOULDER_R, (0, 1, 0), 0.30, 1.0)
shot("24_shoulder_right_side_rotator_cuff", SHOULDER_R, (-1, -0.2, 0.5), 0.30, 1.0, ALL,
     only=lambda n: system_of[n] != "muscle" or any(k in n for k in ("supraspinatus", "infraspinatus", "teres_minor", "subscapularis")))
shot("25_shoulder_right_with_bursae", SHOULDER_R, (-0.6, -1, 0.3), 0.30, 1.0, DEEP | {"bursa"})

ANKLE_R = (-0.09, 0.0, 0.07)
shot("30_ankle_right_outer_side_deep", ANKLE_R, (-1, -0.3, 0.1), 0.24, 1.0, DEEP)
shot("31_ankle_right_inner_side_deep", ANKLE_R, (1, -0.3, 0.1), 0.24, 1.0, DEEP,
     only=lambda n: not n.endswith("_l"))
HIP_R = (-0.10, 0.0, 0.88)
shot("40_hip_right_front_deep", HIP_R, (0, -1, 0), 0.36, 1.0, DEEP)
shot("41_spine_lumbar_side_deep", (0, 0.03, 1.02), (-1, 0, 0), 0.36, 1.0, DEEP,
     only=lambda n: not n.endswith(("_l", "_r")))
shot("42_elbow_wrist_right_front_deep", (-0.24, 0, 0.95), (0, -1, 0), 0.5, 0.6, DEEP)
shot("43_head_neck_front_all", (0, 0, 1.58), (0, -1, 0), 0.36, 1.0)
shot("44_head_neck_side_deep", (0, 0, 1.58), (-1, 0, 0), 0.36, 1.0, DEEP)
print("PREVIEW_DONE")
