# Progress log

## Environment (recorded once)

- **Blender:** `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe` (version 5.3.0). Not on the PATH, so scripts use the full path.
- **Node:** v26. **Python:** 3.15 (used for the proposal script).
- **Source files** (git-ignored, never modified):
  - `Source/Z-Anatomy/Startup.blend` (294 MB). The full atlas. This is the file all geometry comes from.
  - `Source/Z-Biomechanics/Startup.blend` (133 MB). Skeleton and muscle attachment marks only, rigged to an armature (movable skeleton). Not used yet; likely useful for Stage 5 (joint movement).
- The folder on disk is `Source` with a capital S. Windows treats it the same as `source`.

## Stage 1a: inventory and proposed structure list — DONE, list approved

### What was done

- Git repository created with `.gitignore` (ignores `source/`, `node_modules/`, `.blend` files and other large intermediates).
- `blender/inventory.py` reads the Z-Anatomy file headless and writes:
  - `data/inventory.csv`: one row per mesh object (4,569 rows): name, collection path, vertex/face/triangle counts, triangles after modifiers, triangles per material, bounding box, side.
  - `data/inventory-other-objects.csv`: text labels, curves (nerves and vessels), lights, camera (2,615 rows).
- `scripts/propose_structures.py` builds `data/structures-proposed.csv` (762 structures) and checks every source name against the inventory. It stops with an error if a name is not in the source.
- `data/structures-proposed-summary.md`: counts, missing structures, uncertain naming choices, size estimates.

### How to re-run

```
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --background --factory-startup --disable-autoexec Source/Z-Anatomy/Startup.blend --python blender/inventory.py -- data
python scripts/propose_structures.py
```

The Blender file is opened and never saved. `--disable-autoexec` stops the script embedded in the .blend from running.

### What was learned about the Z-Anatomy file

- Scale is metres; the figure is about 1.79 m tall, standing in the anatomical position. The body's left is +X, right is -X.
- Names are English Terminologia Anatomica terms (not Latin). Sides use `.l` / `.r` suffixes; midline objects have none.
- Other suffixes are not anatomy: `.t` and `.s` text labels, `.j` and `.i` label leader lines (2-point meshes), `.g` group titles, `.ol/.or/.el/.er` muscle origin and insertion marks.
- Top-level collections: 1 Skeletal, 2 Muscular insertions, 3 Joints, 4 Muscular, 5 Cardiovascular, 6 Lymphoid, 7 Nervous and sense organs, 8 Visceral, 9 Regions of body (skin). Each object also sits in a detailed "Bonus collection" tree.
- Ligaments, menisci, labra and discs are in "3: Joints". Most ligaments are flat straps given thickness by Solidify and Subdivision modifiers, so modifiers must be applied at export.
- Tendons are mostly NOT separate objects. Muscle meshes have two materials, one for the belly and one called "Tendon". Only the Achilles tendon and toe-extensor tendon are their own objects.
- Articular cartilage is NOT separate. Bone meshes have a "Cartilage" material on the joint surfaces.
- Nerves (and blood vessels) are curve objects, not meshes. They must be converted to tubes at export.
- Whole file: 4.1 million triangles as stored; about 11.5 million with modifiers applied and curves converted.

### Decisions made

- Use `Source/Z-Anatomy/Startup.blend` as the single geometry source.
- IDs follow `system_name_side`, e.g. `ligament_acl_l`, `bone_sacrum` (no suffix for midline).
- `source_object_names` syntax: `A + B` merges objects; `Name#Material` takes only the part with that material; `Name#!Material` takes everything else.
- Side is taken from the name suffix and cross-checked against geometry.

### Known issues / open questions for the user

- Patellar tendon, three of four rotator cuff tendons, common extensor/flexor origins, individual lumbar and sacral nerve roots, and separate articular cartilage are not in the source as objects (details in the summary file).
- Material-based cuts (tendon from muscle, cartilage from bone) are proposed but not yet visually checked.
- Lateral TMJ ligament left/right labels are swapped in the source; handled in the script.
- Left "Iliocostalis colli muscle" and right "Common plantar digital branches of medial plantar nerve" lack their side suffix in the source; handled in the script.
- Bursae (78 in source) are left out because the brief has no bursa system. Waiting for the user's decision.
- About 2.73 million triangles as proposed; plan to simplify the over-detailed meshes to roughly 1.2–1.5 million in Stage 1b.

### Review outcome (16 November 2026)

The user saved `data/structures-approved.csv` with no row edits and answered the review questions:

1. Cut key tendons out of their muscles: **yes**.
2. Cut articular cartilage out of the nine major bones: **yes**.
3. Bursae: **add those of the shoulder, hip and knee**. Added 32 per side (64 rows) with system `bursa`.
4. Split any merged muscles: **no**.
5. Keep disc centres (nucleus pulposus) as separate structures: **no**. The 23 `disc_nucleus_` rows were removed.

`scripts/propose_structures.py` was updated to match. The list is now **803 structures, about 2.80 million triangles** before simplification (bone 208, cartilage 78, ligament 116, tendon 48, muscle 225, nerve 64, bursa 64).

`data/structures-approved.csv` now holds this 803-row list (identical to `structures-proposed.csv`).

### Decisions after review (16 November 2026)

- **Mirror soft tissue, with a side switch.** Soft tissue is exported for the right side only and mirrored in the app to make the left. The app gets a switch: soft tissue on left, right or both. Bones are exported for both sides. Reason: halves the soft-tissue download (about 1.06 million triangles per side before simplification) and keeps rotation smooth when one side is shown, while still showing the injury on the correct side. Left and right in the source are mirror copies (952 of 975 pairs match by vertex count, size and position).
  - Stage 1b must check each proposed left/right pair properly (vertex positions, not just bounding boxes) and export both sides as they are for any pair that is not an exact mirror.
  - The CSV keeps separate `_l` and `_r` rows for every structure; mirroring is an export and loading detail.
- **Bursae are a seventh system** with their own show/hide switch. Colour: pale translucent blue (my suggestion; the user has not commented on the colour).
- `CLAUDE.md` updated with both decisions.

### Next step

Stage 1b (export). Stage 1a is complete with no open questions.
