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

Done; see Stage 1b below.

## Stage 1b: export pipeline — DONE

### How to run

```
npm install            (first time only)
npm run build:models
```

That one command runs four steps and stops with a clear error if any fails:

1. **Export** (`blender/export.py`, Blender headless): Z-Anatomy to `work/export/*.glb` (not committed) and `data/export-report.json`.
2. **Compress** (`scripts/compress.mjs`, gltf-transform): dedup, prune, weld, meshopt into `public/models/`.
3. **Data** (`scripts/build-data.mjs`): `structures-approved.csv` to `public/data/structures.json`, then checks every id against the models in both directions.
4. **Previews** (`blender/preview.py`): renders 30 images of the exported models to `data/previews/` (not committed; about 65 MB).

Options: `npm run build:models -- --no-previews`, or `-- --only export|compress|data|previews`. Blender is found automatically; set `BLENDER_PATH` to override. The whole run takes about two minutes.

### Results (16 November 2026)

| System | File | Download | Meshes in file | Triangles in file | Triangles shown, both sides |
|---|---|---:|---:|---:|---:|
| Bones | bones.glb | 2.63 MB | 208 | 371,614 | 371,618 |
| Cartilage | cartilage.glb | 0.73 MB | 56 | 104,567 | 160,770 |
| Ligaments | ligaments.glb | 0.48 MB | 67 | 64,700 | 105,696 |
| Tendons | tendons.glb | 0.43 MB | 26 | 62,461 | 124,922 |
| Muscles | muscles.glb | 2.93 MB | 113 | 404,011 | 794,288 |
| Nerves | nerves.glb | 0.32 MB | 33 | 46,706 | 83,510 |
| Bursae | bursae.glb | 0.34 MB | 34 | 52,024 | 90,488 |
| **Total** | | **7.85 MB** | **537** | **1,106,083** | **1,731,292** |

- 817 structures: 537 have their own mesh, 280 left-side soft-tissue structures are mirrored from the right in the app.
- Before simplification the same set was 2,565,860 triangles (both sides). 125 dense meshes were simplified.
- With soft tissue on one side only, about 1.42 million triangles are shown; with both sides, 1.73 million. That is a little above the 1.2 to 1.5 million aim for both sides. To go lower, reduce `DECIMATE_SLOPE` in `blender/export.py`.
- No export warnings. All ids match.

### Decisions made

- **Coordinates:** metres, Y-up, front of body faces +Z, body's left is +X. Every mesh has its geometry in body position (node origin at the body origin). Note for Stage 2: meshopt quantisation gives each node its own small scale/offset transform, so mirroring must be done by a parent flipped in X, not by overwriting the node's own transform.
- **Mirroring:** `structures.json` gives `mirrorOf` (the right-side id) for each mirrored left structure, and `mirrorAxis: "x"`. A pair counts as a mirror only if every point matches within 0.01 mm.
- **Pieces of painted areas:** new selectors `^upper`, `^lower`, `^largest` pick the physically separate pieces of a tendon or cartilage area; `#rest` is whatever no other row uses. This changed the approved list from 803 to 817 rows (see below).
- **Simplification:** meshes of 3,000 triangles or fewer are untouched. Above that only the excess is reduced to 30%. Never simplified: all ligaments, all cartilage, bursae, rotator cuff muscles and tendon, Achilles, quadriceps/patellar tendon. Open edges (cut lines) are held in place so tendons still meet their muscles.
- **Nerves:** curves become 6-sided tubes with 6 segments per curve section (source settings are 12-sided and 12). Path and thickness unchanged.
- **Materials:** one per system, `mat_bone`, `mat_cartilage`, `mat_ligament`, `mat_tendon`, `mat_muscle`, `mat_nerve`, `mat_bursa`; double-sided. Colours are in `blender/export.py` and copied into `structures.json`. Bone is a warm off-white (#EFE6CF) and ligament/tendon a cooler silver-cream (#C9CEC6) so they can be told apart.
- `scripts/propose_structures.py` remains the generator for the list. The user has made no hand edits to `structures-approved.csv` so far, so the two CSVs are identical. If the user edits the approved CSV by hand in future, stop regenerating it from the script.

### Changes to the approved list in this stage (803 to 817)

Made because the painted areas turned out to be cleanly separate pieces:

- Joint cartilage split by joint: femur (hip head / knee), tibia (knee / ankle), humerus (shoulder / elbow), radius (elbow / wrist), ulna (elbow / wrist). Hip socket and shoulder socket now take only the socket surface.
- Biceps: long head and short head tendons at the shoulder, plus a new "biceps tendon at the elbow".
- Hamstrings: new "hamstring tendons at the sitting bone"; the three existing rows are now the knee ends only.
- Triceps, finger flexors, finger extensors, ECU: the far (wrist or elbow) end only; the origin end stays with the muscle.
- Common extensor and common flexor tendons: now the elbow end only.
- Quadriceps/patellar tendon: lower pieces of rectus femoris, vastus lateralis and vastus intermedius.

### Not in the source / could not be done

- **Quadriceps tendon and patellar tendon are one continuous piece** in the source. They cannot be separated without cutting by hand, so they stay one structure.
- Vastus medialis has no separate lower tendon piece; its tendon stays with the muscle.

### Left/right pairs that are NOT exact mirrors (exported for both sides as they are)

MCL (superficial part), sacrotuberous ligament, sacrospinous ligament, transverse humeral ligament, costoclavicular ligament, annular ligament of the radius, bursa under trapezius, intermuscular gluteal bursae. In most, the two sides differ in level of detail or by a few millimetres.

### Known issues / things to look at

- **Jagged tendon edges.** Where a tendon is cut from its muscle the edge is zig-zag, because the source paints the muscle-to-tendon join as interlocking fibres. With muscles shown it looks natural; with muscles hidden the tendon ends look frayed.
- **Simple ligaments.** Many ligaments (ankle, hip, wrist, coracoclavicular) are flat straps in the source.
- **Interspinous ligaments** are one flat sheet down the midline, extending a little behind the spinous processes.
- **Gap between sacrum and coccyx:** the sacrococcygeal joint is not in the list.
- **Linea alba is not in the list**, so the spine shows through a gap between the two rectus abdominis muscles from the front.
- Bursae render opaque in the previews; they are translucent in the exported material.
- The inside-out-face test (previews 07 and 09) showed no difference from the normal renders. I am not certain the test setting takes effect in background rendering, so treat this as "nothing seen", not "proven clean". Materials are exported double-sided, so an inside-out face would still display.
- A stray folder `C:\data\previews` was created by an early preview run (Blender treated the path as relative to the drive). The script is fixed. The folder holds 30 PNGs and can be deleted by hand.

### Next step

Done; see Stage 2 below.

## Stage 2: the 3D viewer — DONE

### How to start the app on the laptop

**Easiest:** in the project folder, double-click `Start anatomy model.cmd`. A black window opens and the app appears in the browser at `http://localhost:5173/`. Close the black window to stop it.

**From a terminal (PowerShell):**

1. `cd "C:\Users\Mbees\Desktop\anatomy-model"`
2. First time only, or after pulling changes: `npm.cmd install`
3. `npm.cmd start`
4. To stop it, click in the terminal and press `Ctrl` + `C`.

On this laptop PowerShell blocks plain `npm` ("running scripts is disabled on this system"). Typing `npm.cmd` instead avoids that without changing any Windows security setting. The same applies to the other commands below (`npm.cmd run build`, and so on).

Other commands:

- `npm run build` makes the finished static site in `dist/` (this is what goes on GitHub Pages; about 9 MB in total).
- `npm run preview` opens that built site, to check it before publishing.
- `npm run check` runs the automated check: it starts the app, takes screenshots into `work/screens/` (not committed) and prints load time and frame rate. Add `-- --headed` to watch it in a real browser window.

### What was built

- Vite 8.3.8 and Three.js 0.187.0, versions pinned in `package.json`. Playwright 1.65.1 is used for the automated check only. The typeface (Atkinson Hyperlegible) is bundled with the app; nothing is fetched from other sites.
- Code layout in `src/`:
  - `scene.js`: renderer, camera, lights.
  - `materials.js`: one material per system (colour from `structures.json`, finish set here).
  - `registry.js`: the structure registry. Every structure id maps to its data and its own mesh. Look-ups by id, system, region or mesh. Later stages hide, select and highlight through this.
  - `loader.js`: downloads the models with overall progress; builds the mirrored left side.
  - `camera.js`: orbit controls, preset views, transitions, double-click to centre.
  - `ui.js`: side panel, loading bar, error message, view buttons.
  - `main.js`: joins them up and runs the drawing loop.
- **Loading:** bones first, then the other six systems together. One progress bar with the overall percentage. If a file fails, a message names the part ("Some parts could not be loaded: muscles") with a "Try again" button that reloads only what failed.
- **Mirroring:** the 280 left-side soft-tissue structures are copies of the right, flipped by a parent group. Each is its own mesh with its own `_l` id; only the shape data is shared. All 817 structures have a separate mesh.
- **Rendering:** soft studio environment light plus key, fill and rim lights that travel with the camera, so the side facing the viewer is always lit. Matte bone and muscle; slightly glossy cartilage, ligaments and tendons; translucent bursae. Light neutral backdrop.
- **Depth sorting:** bone and muscle are drawn fractionally behind the tissues that lie on them, and the camera's depth range follows the zoom distance. No flicker seen in the knee close-ups.
- **Camera:** drag to rotate, right-drag or two fingers to pan, scroll or pinch to zoom (zooms towards the pointer). Zoom limits 6 cm to 9 m. Front, Back, Left, Right, Top and Reset view with 0.7-second transitions. Double-click centres the orbit on that point. The orbit centre cannot be dragged far off the body, so the model cannot be lost.
- **Layout:** model fills the screen; collapsible side panel (currently holds the mouse/touch instructions); footer with the Z-Anatomy credit, licence link and disclaimer.

### Decisions made

- "Left" and "Right" views show the body's left and right sides (the camera stands on that side).
- "Top" view looks straight down with the front of the body towards the bottom of the screen.
- "Reset view" returns to the front view with the whole body in frame.
- **No ambient occlusion.** It needs an extra full-screen pass every frame, which is the most likely thing to cost smoothness on integrated graphics, and the lighting already shows form well. Can be revisited.
- **Performance measures used:** the picture is only redrawn when something changes (a still model uses no graphics power); on high-resolution screens the picture is drawn at standard resolution while moving and sharpened as soon as it stops; meshes off-screen are skipped. No meshes were merged.
- Accent colour for the interface is a muted teal (#1F6F78), chosen to stay clear of the red and amber planned for injury highlights.

### Measured (16 November 2026, this laptop, AMD Radeon 780M integrated graphics)

- **Frame rate:** 60 frames per second (the screen's limit), slowest 1% of frames 59.5, while spinning the whole body with every system visible (1.82 million triangles drawn, 881 draw calls) and when zoomed in.
- **Load time from this laptop's own disk:** skeleton visible in about 0.45 s, everything in about 0.75 s. That is not an internet figure. The whole download is about 8.1 MB (models 7.85 MB, app code 0.17 MB compressed, typeface 0.04 MB), so on a 20 Mbit/s connection expect roughly 4 seconds in total, with the skeleton after about 1.5 seconds. To be confirmed once the site is on GitHub Pages.
- The frame rate was measured at a 1440 x 810 window at standard resolution. Not yet measured on a 4K screen or on older Intel graphics.

### Changes after the user's first test (16 November 2026)

- The user reported: rotate, move and double-click good; **zoom clunky, slow and delayed**.
- Cause: the built-in wheel zoom moves about 5% per wheel notch in instant jumps, and the picture switched resolution on every notch.
- Fix: the wheel (and trackpad) now uses our own smooth zoom in `camera.js`. Each notch zooms about 20% and the camera glides to it over a few frames, still towards the point under the pointer. The sharpen-when-still delay went from 0.18 s to 0.4 s so it no longer switches between notches. Touch pinch is unchanged.
- Measured: the camera starts moving within 60 ms of the first notch; five notches take the view from whole body (4.07 m) to 1.36 m. Tune with `WHEEL_ZOOM_RATE` and `ZOOM_GLIDE_MS` in `src/camera.js`.
- The user confirmed it is more responsive and asked for 30% less zoom per notch. `WHEEL_ZOOM_RATE` went from 0.0022 to 0.00154, so each notch is now about 14% (the figures above were measured at the earlier setting).

### Known issues / things to look at

- On a phone-width screen the view buttons cover the feet in the starting view. Phones are not a target device; left as it is.
- Double-click uses a simple hit test that takes a moment on the full model (not noticeable on a double-click). Stage 3 hover names will need a faster method (a spatial index such as three-mesh-bvh).
- The issues listed under Stage 1b (jagged tendon edges with muscles hidden, flat ligament straps, linea alba gap) are visible in the viewer as expected.
- The app code is one 680 KB file (172 KB compressed). Fine for now.

### Next step

Done; see Stage 3 below.

## Stage 3: hide and restore by region, system filter, quick views — DONE

### How to use the region controls

Everything is in the side panel, top to bottom:

1. **Quick views.** One click sets region, systems and camera together. Choose Left, Right or Both first (it starts on Right), then click a view. The button stays teal while that view is on.
2. **Show everything / Undo / Redo.** This bar stays in sight while the panel scrolls. "Show everything" brings back all regions, all systems and anything a quick view hid. Undo and Redo step through visibility changes; `Ctrl+Z` and `Ctrl+Shift+Z` do the same (`Cmd` on a Mac; `Ctrl+Y` also redoes). The camera is not part of undo.
3. **Systems.** Untick a system to remove it everywhere, e.g. untick Muscles to see the ligaments underneath. This works together with the regions.
4. **Body regions**, head to toe. For arm and leg regions, first pick **Left**, **Right** or **Both**, then press:
   - **Hide**: removes that region.
   - **Show**: brings it back.
   - **Isolate**: shows only that region and zooms to it. Press Isolate again to end it.
   A hidden region is greyed and crossed out and says "Hidden" (or "Left hidden" / "Right hidden"). The isolated region has a teal bar and says "Showing only this". Head and neck, chest and lower back have no left/right choice.
5. **Options.**
   - "Show hidden regions as a faint outline": hidden regions stay as a see-through silhouette so the patient keeps their bearings. Off to start with.
   - "Zoom to a region when I isolate it": untick to keep the camera where it is.

Example: knee row, Left, Isolate, then untick Muscles and Bursae = left knee bones, ligaments, cartilage, tendons and nerves. Rotate to the back to see the cruciates.

### The rule for structures in more than one region

Agreed with the user (the alternative to the rule in the stage brief):

- **Soft tissue** is shown only if none of its regions is hidden. Hiding the thigh removes the quadriceps, the hamstrings and their tendons, including the quadriceps/patellar tendon at the knee.
- **Bones** stay until every region they belong to is hidden. Hiding the thigh leaves the femur, so the hip and knee stay whole. Hiding the right shoulder removes the collar bone but leaves the humerus and shoulder blade.
- **Isolate** shows everything listed under that region, even where it runs into the next region (isolating the knee shows the whole femur, tibia, fibula and the full length of the muscles that cross the knee). The camera frames only the structures that belong to that region alone, so it lands on the joint.
- **Midline structures** (spine, sacrum, spinal cord) count a region as hidden only when both sides are hidden, and show when either side is isolated.
- Structures removed by a system tick box or by a quick view are never shown, isolated or not.

### How to add a quick view

Open `public/data/presets.json` in a text editor, copy one block between `{` and `}` (with the comma between blocks) and change:

- `id`: a short name of your own, no spaces, different from the others.
- `label`: the words on the button.
- `isolate`: the region, spelt exactly as in `public/data/structures.json` under "regions" (e.g. `"pelvis and hip"`, `"abdomen and lower back (lumbar)"`). Leave the line out to show the whole body.
- `hideSystems`: any of `"bone"`, `"cartilage"`, `"ligament"`, `"tendon"`, `"muscle"`, `"nerve"`, `"bursa"`.
- `hideStructures`: single structures to hide, by id from `data/structures-approved.csv` without the `_l` / `_r` ending (e.g. `"muscle_deltoid"`).
- `view`: `"front"`, `"back"`, `"left"`, `"right"`, `"top"`, or `"outer"` / `"inner"` (the outer or inner side of whichever limb is chosen).

Save and refresh the browser. A mistyped name is skipped and reported in the browser console (F12); the app carries on.

Current quick views:

| Quick view | Isolates | Hides | Camera |
|---|---|---|---|
| Knee – ligaments | knee | muscles, bursae | front |
| Shoulder – rotator cuff | shoulder | bursae; deltoid, trapezius (3 parts), pectoralis major, latissimus dorsi | back |
| Ankle – ligaments | ankle and foot | muscles | outer side |
| Lower back | abdomen and lower back | nothing (muscles shown, as the user asked) | back |

### What was built

- `src/visibility.js`: the rule above, the undo/redo history (100 steps) and ghost mode. One place decides what every structure looks like.
- `src/panel.js`: the panel controls. `public/data/presets.json`: the quick views.
- `src/camera.js`: new `frame(box, { view })` to glide to a region.
- Panel widened from 280 to 380 pixels to fit the region rows.
- `npm run check:regions` (`tests/check-regions.mjs`): drives the real panel, 34 pass/fail checks and screenshots 10 to 19 in `work/screens/`.

### Decisions made

- **Bursae tick box added** (seventh system), as agreed.
- **Left/Right/Both** for shoulder to hand and pelvis to foot; one control for head and neck, chest and lower back, as agreed.
- **Ghost outlines apply to regions only.** Something removed with a system tick box or by a quick view disappears completely, so it does not haze over what is being revealed.
- Ghosts cannot be double-clicked; only real, shown structures respond.
- Hiding the region that is currently isolated ends the isolation (everything else comes back) and then hides that region.
- A quick view replaces whatever was set before, and always moves the camera, even when "zoom when I isolate" is off.
- The Shoulder quick view also hides bursae, because the subacromial bursa sits over the cuff. Remove `"bursa"` from its `hideSystems` to change this.
- Nothing is stored: all of this resets when the page is refreshed.

### Checked (16 November 2026)

- `npm run check:regions`: all checks pass, no console errors. Screenshots looked at: isolate left knee; the same with muscles off (ACL, PCL and both menisci clearly visible from behind); hide right shoulder; hide thigh; ghost mode (whole body and zoomed); all four quick views; quick view on the left side.
- `npm run check` (Stage 2): views, double-click, wheel zoom, load-failure message and retry all still work. `npm run build` succeeds.

### Known issues / things to look at

- **Not measured: frame rate with ghost mode on.** Ghost mode draws the whole body see-through, which is more work for the graphics chip. It looked fine in the check but was not timed.
- The panel is long: the region list needs scrolling on a laptop screen. The restore bar stays visible. Systems sit above the regions so both are reachable without much scrolling.
- After a quick view, the region row's own Left/Right/Both chooser does not move to match (the row still says "Showing only right" correctly).
- With the knee isolated and viewed from the front, the cruciates are behind the patella and patellar tendon; rotate to the back or side to see them.
- The **soft-tissue side switch** from the brief (soft tissue on left, right or both for the whole body) is not built yet. The Left/Right region controls partly cover it.
- Close-up views have strong perspective (near parts look larger). This is the Stage 2 camera lens; it can be made flatter if wanted.

### Next step

Stage 4 (selection, names, search). Not started.
