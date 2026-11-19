# Progress log

## Environment (recorded once)

- **Blender:** `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe` (version 5.3.0). Not on the PATH, so scripts use the full path.
- **Node:** v26. **Python:** 3.15 (used for the proposal script).
- **Source files** (git-ignored, never modified):
  - `Source/Z-Anatomy/Startup.blend` (294 MB). The full atlas. This is the file all geometry comes from.
  - `Source/Z-Biomechanics/Startup.blend` (133 MB). Skeleton and muscle attachment marks only, rigged to an armature (movable skeleton). Not used. It was kept for joint movement, which has since been dropped (see the end of this file).
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
- `npm run check:regions`, `check:select` and `check:highlights` run the checks for Stages 3, 4 and 5.
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

Done; see Stage 4 below.

## Stage 4: names, selection and search — DONE

### How to use it

- **Point at a structure:** a small dark label by the pointer gives its name and side, and the structure gets a thin blue outline. Hidden structures and faint ghost outlines never respond.
- **Click a structure:** it gets a thicker blue outline and an info card opens near the top of the side panel with its name, side, system and region(s). Click empty space, press `Esc`, or press the × on the card to deselect. Dragging to rotate does not select. Double-click still centres the view.
- **Info card buttons:**
  - **Hide this** hides that one structure (the button becomes "Show this").
  - **Isolate this** shows only that structure, with the rest of the body as a faint outline. Press it again, or "Show the rest" in the panel, to end it.
  - **Zoom to this** moves the camera to it.
  - Hide and Isolate are steps in the same Undo/Redo history as the region controls; "Show everything" clears them.
- **Search box** (top of the panel): results appear as you type. A left/right pair is one row with a **Left** and a **Right** button. Picking one selects it, brings it back if it was hidden, and zooms to it. `Enter` picks the first result; `Esc` clears the box. Typing "left" or "right" as an extra word narrows the side.
- **Options, both off to start with and not stored:**
  - "Show medical names as well" adds the medical name under the plain name in the pointer label, the info card and the search results.
  - "Label the structures in the isolated region" turns on floating labels with leader lines. Clicking a label selects that structure.

### What was built

- `src/picking.js`: hit testing with `three-mesh-bvh` 0.9.18 (version pinned). The index is built in small slices after loading so the page does not freeze.
- `src/outline.js`: the blue outline. Only the selected and pointed-at structures are drawn a second time, so it costs almost nothing.
- `src/selection.js`: pointer label, click to select, info card. `src/searchbox.js` and `src/search.js`: the search. `src/labels.js`: labels mode. `src/names.js`: how names are worded.
- `src/visibility.js`: new single-structure actions (hide one, show one on its own, reveal for search), all in the undo history.
- `npm run check:select` (`tests/check-select.mjs`): about 70 pass/fail checks and screenshots 20 to 30 in `work/screens/`.

### Decisions made

- **Label wording:** name, then side and region for a one-region structure ("Anterior cruciate ligament (ACL) – left knee"); side only for a structure in several regions ("Achilles tendon – left"); name only for midline structures. Agreed with the user.
- **All names come from `structures.json`.** Nothing is typed into the interface. Abbreviations (ACL, MCL, ATFL, ITB and so on) are found because they are in brackets in the plain names.
- **Search matching:** every typed word must match a word of the plain or medical name: exactly, as its beginning, inside it, or within one letter (two for words of eight letters or more). Plain-name matches rank above medical-name matches.
- **Outline colour** is a clear blue (#0077A8), away from every tissue colour and from the red and amber planned for injury highlights. The outline of a selected structure shows through whatever is in front of it, so a deep structure can still be located.
- **Any other visibility change ends "Isolate this"** (hiding a region, a quick view, a system tick box).
- **Picking from the search while a region is isolated** brings back the regions that structure belongs to; it does not end the isolation.
- **Labels mode** labels the isolated region (or the single isolated structure) plus the selected structure. Most relevant first: structures belonging only to that region, then ligaments, cartilage, tendons, bursae, nerves, bones, muscles. If they do not all fit, the rest are left out and a note says how many. Structures whose middle is off-screen get no label.
- The quick-view note now reads "N single structures are hidden" because single structures can also be hidden from the info card.

### Checked (16 November 2026)

- `npm run check:select`: all pass, no console errors. Hover and click checked on the ACL (left knee isolated, muscles off, from behind), Achilles tendon (whole body, from behind), supraspinatus (rotator cuff quick view) and sciatic nerve (muscles off, from behind). Searches "acl", "achillies", "rotator", "mcl", "atfl", "itb" and the medical name "ischiadicus" all find the right structure first. Hide this with Undo/Redo, Isolate this, Zoom to this, Esc, medical names and labels mode all checked. Screenshots looked at.
- Hit test on the whole body: about 0.4 ms each (was the slow part noted in Stage 2). 60 frames per second while turning the whole body with a structure selected.
- `npm run check` and `npm run check:regions` (Stages 2 and 3) still pass. `npm run build` succeeds.

### Names for the user to look at (nothing was changed)

Plain names:

- **"Wrist cartilage disc (TFCC)"**: the mesh is the articular disc only; the TFCC is the disc plus its ligaments.
- **"Breastbone (sternum)"**: this row is the body of the sternum only (the manubrium and xiphoid are separate rows).
- **"Common extensor tendon at the elbow (ECRB; tennis elbow)"**: the piece is cut from ECRB only, not the whole common extensor origin.
- **"Quadriceps: vastus medialis (inner; VMO)"**: VMO is strictly the lower oblique fibres, not the whole muscle.
- **"Lateral femoral cutaneous nerve"** and **"Posterior femoral cutaneous nerve"**: usual UK wording is "lateral cutaneous nerve of the thigh" and "posterior cutaneous nerve of the thigh".
- **"Ischial bursa (over the sitting bone)"**: still waiting for confirmation from Stage 1.
- **"Hip bone (pelvis)"**: one row per side; each is one half of the pelvis.
- Plain names say "peroneal", medical names say "fibularis". Both are correct; searching either word works.

Medical names (only seen when the option is on):

- "Musculi thenaris" and "Musculi hypothenaris": the usual forms are "Musculi thenares" / "Musculi hypothenares".
- "Tendo musculi iliopsoas": strictly "iliopsoatis".

No non-UK spellings were found.

### Known issues / things to look at

- **Labels mode is busy with every system on.** A whole knee with muscles and bursae has about 40 labels: readable, none overlapping, but crowded, and leader lines cross. It is clean with muscles and bursae unticked (about 20 labels). Long names are cut short with "…"; resting the pointer on the label shows the full name.
- Label lines point at a spot on the structure's surface near its middle. That spot can be behind another structure from some angles.
- Search only knows words that are in the names. "Slipped disc" or "funny bone" find nothing. A `search_terms` column in the CSV could add such words; not added, as agreed.
- "Isolate this" draws the whole body as faint outlines, which shows as a grey haze around a small structure when zoomed in.
- Selecting a structure scrolls the panel just enough to show the info card; the search box may then be just above the visible part.
- The app code is now 774 KB (202 KB compressed).
- Still not built: the whole-body soft-tissue side switch (noted under Stage 3).

### Next step

Done; see Stage 5 below.

## Stage 5: injury highlights, emphasis, pain areas, presentation view and Save image — DONE

### How to use it

- **Highlight a structure.** Select it (click it or use the search), then click a colour. The colour buttons are in three places: on the info card ("Highlight"), in the **Highlights** section of the panel, and in the right-click menu. Clicking the same colour again removes it; a different colour replaces it.
- **Colours and what they mean:** Red "Injured", Amber "Affected / under strain", Green "Healing", Blue "Area to strengthen". Click the wording next to a colour in the Highlights section to change it. The change lasts until the page is refreshed.
- **Right-click a structure** for a small menu: the four colours, Remove highlight, Hide this, Isolate this, Zoom to this. Right-*drag* still moves the model.
- **Highlight list** (under the colours): colour dot, name, side and meaning. Click a row to select the structure and go to it (it is brought back if it was hidden). The × removes that highlight.
- **Clear all highlights** removes every highlight and pain area. "Show everything" does not touch highlights.
- **Undo / Redo** (buttons, `Ctrl+Z`, `Ctrl+Shift+Z`) cover highlights and pain areas, in the same history as hiding and showing.
- **"Fade everything that is not highlighted"** (tick box): everything else turns a pale see-through grey so the highlighted structures are the focus. It does nothing until at least one highlight or pain area exists.
- **Shade a pain area** (for vaguer presentations): choose a colour and a size (4 to 24 cm across), press "Shade a pain area", then click the model where the pain is. Everything within that distance of the point is tinted. `Esc` cancels. Up to 6 at once. Listed with the highlights; × removes it.
- **Presentation view:** the button at the top right of the model, or the `P` key. Everything is hidden except the model, the colour key (only the colours in use, with their current wording) and the credit line. `P` or `Esc` returns. A short note about these keys shows for 3 seconds and then fades, so it is not in a screenshot taken after that.
- **Save image:** the button at the top right, or `S` while in presentation view. Saves a PNG to the Downloads folder, twice the on-screen size, light background, with the colour key and credit line. The file is named `anatomy-model-date-time.png`.
- **Option:** "Show the colour key in presentation view and saved images" (on to start with).

### What was built

- `src/palette.js`: the four colours and their meanings.
- `src/visibility.js`: highlights and pain areas are part of the same state as hide/show, which is what makes Undo/Redo work for them.
- `src/materials.js`: a glowing material per highlight colour, the pale "faded" material, and the pain-area tint (added to the normal tissue materials).
- `src/outline.js`: a second outline pass that draws a coloured line, soft glow and faint tint round every highlighted structure, visible through whatever is in front of it.
- `src/highlights.js`: palette, info-card buttons, highlight list, right-click menu, fade option, pain-area controls.
- `src/present.js`: presentation view, colour key, Save image.
- `npm run check:highlights` (`tests/check-highlights.mjs`): 52 pass/fail checks and screenshots 31 to 43 in `work/screens/`.

### Decisions made

- **Shades:** red #F0123C (a vivid crimson, well away from the muted muscle red #A8514B), amber #FF8A00 (a strong orange, so it is not confused with the yellow nerves), green #12A84A, blue #3554F2 (deeper than cartilage, bursae and the selection outline).
- **Region shading as asked could not be done:** there is no skin in the app, so there is no surface to shade, and "lateral knee" is finer than the regions. The pain-area spot was built instead, agreed with the user. It tints the real structures near the clicked point; no geometry is added.
- **"Show everything" and quick views keep highlights.** Only "Clear all highlights" (or × on a row) removes them.
- **A highlighted structure that gets hidden stays in the list**, marked "hidden at the moment", and returns when its row is clicked. Its colour is not shown in the key while it is hidden.
- **Fade is a display option, not an Undo step** (like the faint-outline option).
- **Presentation view and saved images leave out the blue selection outline and the hover name.** Highlights are shown.
- **Saved image is the model area only.** From the normal view that is the area to the right of the panel; from presentation view it is the full width.
- **Privacy:** highlights, pain areas and reworded meanings are held in memory only. The check confirms no cookies, no localStorage or sessionStorage, no requests to other sites and no uploads; a refresh clears everything. The image is made inside the browser and handed to the browser's own download.

### Checked (16 November 2026)

- `npm run check:highlights`: all pass, no console errors. ACL red (info card) + MCL amber (right-click menu) + medial meniscus amber (panel), left knee. Screenshots looked at with the fade off and on, from front and back, and with muscles on. Presentation view looked at. Both saved PNGs opened and looked at: 2880 x 1552 from presentation view (key and credit present, colours correct) and 2120 x 1552 from the normal view with fade on and the key switched off.
- 60 frames per second turning the whole body with three highlights, and the same with everything else faded.
- `npm run check`, `check:regions` and `check:select` (Stages 2 to 4) still pass. `npm run build` succeeds.

### Known issues / things to look at

- **Floating labels (labels mode) are not included in a saved image.** They do appear in presentation view, so a normal screenshot captures them.
- **Highlight outlines show through everything**, by design. With several highlights behind one another the outlines overlap, and which colour is on top depends on the order they were made, not on which is nearer.
- **Faded view is see-through all the way**, so the far side shows faintly through the near side.
- **A pain area is a ball, not a patch of skin:** it tints every structure within reach of the point, including deeper ones that become visible when a system is hidden. On red muscle, a blue pain area looks purple, because the tint is translucent.
- A pain area has no outline and is not shown through structures in front of it.
- The saved image's size follows the browser window. A small window gives a small image.
- The Highlights section makes the panel longer; Quick views now sit below it.
- Screenshots 33, 35, 36 and 38 (further angles of the same knee, and the whole body without fade) were taken but not looked at by eye; the others were.
- Still not built: the whole-body soft-tissue side switch (noted under Stage 3).
- The app code is now 789 KB (207 KB compressed).

### Next step

Not decided. See "Joint movement: dropped" below for what is still open.

## Joint movement: dropped (17 November 2026)

### Decision

- Joint movement (knee, ankle and shoulder sliders, with soft tissue following the bones) will not be built. A start was made on the knee and then removed completely by the user; nothing of it is in the project.
- `CLAUDE.md` updated to match: "how a joint moves" and the joint movement feature were removed, and joint movement is listed as not in scope.

### Still open from the brief and earlier stages

- **Not measured:** frame rate on a 4K screen and on older Intel graphics, and live testing on Safari (macOS/iPadOS).

## Stage 7: soft-tissue side switch, polish, shortcuts, accessibility and publishing — DONE

### What was built (Part A — 19 November 2026)

- **Whole-body soft-tissue side switch** (`src/visibility.js`, `src/panel.js`, `index.html`):
  - Choose **Left**, **Right** or **Both** to show muscles, tendons, ligaments, cartilage, nerves and bursae on one side while keeping bones on both sides and midline spinal structures visible.
  - The diaphragm (`muscle_diaphragm`) is hidden when a single side is chosen (user decision, since it spans both sides of the rib cage).
  - Switching soft-tissue side moves the individual body-region rows and Quick views side selector to match, works with **Undo / Redo**, resets to **Both** on **Show everything**, and reveals the hidden side automatically if you pick a structure from search.
- **Appointment workflow polish:**
  - **Highlights** and **Quick views** sections can now be collapsed/expanded to free up room in the side panel.
  - Clicking a **Quick view** syncs the isolated region row's `Left / Right / Both` selector so pressing Isolate on that row toggles it off directly.
  - Selecting a structure scrolls the panel back to the top so the search box and info card stay in sight together.
  - Secondary buttons, segmented side selectors and close buttons enlarged to 36–38 px for easier laptop-trackpad use.
  - **Save image** now composites visible floating labels and leader lines (with clean ellipsis truncation) when labels mode is on.
- **Keyboard shortcuts and `?` help overlay** (`src/help.js`, `src/main.js`, `index.html`):
  - `1`–`5` Front / Back / Left / Right / Top views; `R` Reset view; `P` Presentation view; `S` Save image (in presentation view); `A` Show everything; `C` Clear all highlights; `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` Undo / Redo; `Esc` close dialog/menu/presentation/deselect; `?` toggle help.
  - Added a `?` button at the top right opening a modal with a **30-second guide** and full keyboard shortcuts list.
- **Accessibility and colour-blind distinction** (`src/palette.js`, `src/outline.js`, `src/highlights.js`, `src/present.js`, `src/styles.css`):
  - Distinct 3D outline patterns and matching UI/handout swatch patterns for all four highlight colours: **Red** = solid, **Amber** = dashed, **Green** = dotted, **Blue** = double outline.
  - Raised contrast on disabled buttons and hidden/crossed-out region labels, added clear focus rings, and ensured every visible button and input has an accessible label.
- **Performance optimisations** (`index.html`, `src/loader.js`, `src/picking.js`, `vite.config.js`):
  - Preloaded `structures.json` and `bones.glb`, overlapped downloading the remaining 6 systems with bone parsing, paused background BVH indexing while the camera moves (using `requestIdleCallback`), and split Three.js into its own browser-cached vendor chunk (`three-*.js`, 187 KB gzip; app code is now 21.7 KB gzip).
- **Robustness, docs and deploy config:**
  - Loading bar hides immediately when WebGL fails (`src/ui.js`).
  - Wrote `USER-GUIDE.md` covering everyday use, editing `data/structures-approved.csv`, adding Quick views in `presets.json`, and updating the live site.
  - Added `.github/workflows/deploy.yml` to build and publish `dist/` to GitHub Pages on every push to `main`.

### Performance before / after (built site `dist/`, 1440 × 810, AMD Radeon 780M)

| Metric | Before | After |
|---|---:|---:|
| Simulated 20 Mbit/s broadband — skeleton visible (from script start) | 1.45 s | **1.06 s** (1.49 s wall) |
| Simulated 20 Mbit/s broadband — all 817 structures loaded | 3.65 s | **3.26 s** (3.60 s wall) |
| Local disk — all 817 structures loaded (wall time) | 1.14 s | **0.83 s** |
| Frame rate — whole body immediately after load (during BVH indexing) | 58.3 fps | **58.7 fps** (slowest 1%: 59.5) |
| Frame rate — whole body, all systems | 60.0 fps | **59.7–60.0 fps** |
| Frame rate — left soft tissue only | 60.0 fps | **60.0 fps** |
| Frame rate — isolated left knee + ghost outlines | 60.0 fps | **60.0 fps** |
| Frame rate — whole body, 3 highlights + fade everything else | 60.0 fps | **60.0 fps** |
| App JS bundle (gzipped) | 207.5 KB (1 file) | **21.7 KB app + 187.3 KB cached Three.js** |

### Checked (19 November 2026)

- `npm.cmd run check:side` (26 checks, screenshots 44–47), `npm.cmd run check:polish` (24 checks, screenshots 48–51), `npm.cmd run check`, `check:regions`, `check:select`, `check:highlights`, and `npm.cmd run build` all pass with zero console errors or warnings. Screenshots 44–51 inspected visually.
- **Browsers tested:** Playwright Chromium, **Google Chrome** (installed), and **Microsoft Edge** (installed) — all loaded all 817 structures with zero console errors. **Safari** could not be tested directly because Safari is macOS/iOS only and this laptop runs Windows 11.
- **Repository file sizes:** `Source/` (`Startup.blend`) is excluded by `.gitignore`. Largest file in the repo is `public/models/muscles.glb` at 2.93 MB (all 7 models total 7.85 MB — well under GitHub's 50 MB / 100 MB limits).
- **Clinical names decision:** the user chose to keep all existing structure names as they are and hide the diaphragm on single-side soft-tissue view.

### Published to GitHub Pages (Part B — 19 November 2026)

- **Live site:** https://mbeeston92.github.io/anatomy-model/
- **Repository (public):** https://github.com/mbeeston92/anatomy-model
- **Automatic deployment:** `.github/workflows/deploy.yml` builds with Vite (`base: './'`) and deploys `dist/` to GitHub Pages on every push to `main`.
- **Live verification (Playwright, cold load over real broadband):**
  - HTTP 200, all 817 structures loaded, 0 missing, 0 console errors or warnings.
  - **Skeleton visible:** 2.30 s wall time (1.05 s from script start).
  - **All 817 structures loaded:** 3.17 s wall time (2.00 s from script start — well within the ~10 s target).
  - Interactive checks (soft-tissue side switch, search, selection, red highlight, `?` help overlay) all passed on the live URL.
  - Privacy verified on the live URL: 0 cookies, 0 localStorage/sessionStorage entries, 0 third-party requests.

### Follow-up: Linea alba added (19 November 2026)

- Added **`ligament_linea_alba`** (*Linea alba (midline abdominal connective tissue)*, medical name *Linea alba*, midline, `abdomen and lower back (lumbar)`, system `ligament`) to `data/structures-approved.csv` (and `scripts/propose_structures.py`).
- Rebuilt models via `npm.cmd run build:models -- --no-previews`: now **818 structures** (538 exported meshes, 280 mirrored; `ligaments.glb` is 68 meshes, 0.48 MB; total models 7.86 MB). Closes the front abdominal midline gap between the rectus abdominis muscles noted in Stage 1b.

### Follow-up: 12 Common injury demonstrations added (19 November 2026)

- Added **`public/data/injuries.json`** with 12 one-click clinical injury demonstrations (using real Z-Anatomy meshes only; no sculpted geometry): **ACL tear**, **MCL sprain / tear**, **Lumbar disc herniation**, **Rotator cuff injury**, **Lateral ankle sprain**, **Achilles tendinopathy**, **Tennis elbow**, **Plantar fasciopathy**, **Gluteal tendinopathy**, **Patellar tendon overload**, **Hamstring strain**, and **Calf strain**.
- Extended `src/visibility.js` `applyPreset()` and `frameBox()` to support `extraRegions` (e.g. lower back + pelvis for sciatica, lower leg + ankle for Achilles tendinopathy) and automatic `highlights` (`red` + `amber`, single Undo/Redo step).
- Added collapsible **Common injuries** section with a `Left / Right` chooser (synced with **Soft-tissue side**) and a plain-English patient summary card in `index.html` and `src/panel.js`.
- Added `npm.cmd run check:injuries` (`tests/check-injuries.mjs`, screenshots 55–60) verifying all 12 injuries load with zero warnings and every highlighted structure is visible.

### Follow-up: Muscle layer peeling, 3D cross-section slice plane & 20 Common injuries (19 November 2026)

- **"Peel back a layer" muscle depth control** (`src/layers.js`, `src/visibility.js`, `src/panel.js`, `index.html`):
  - Classified all 113 unique muscles into 3 anatomical depth layers (Layer 1 superficial, Layer 2 intermediate, Layer 3 deep).
  - Added **Peel a layer**, **Restore**, and a 4-step **Muscle layers** slider (*All muscles* → *Intermediate & deep* → *Deep only* → *No muscles*) inside the **Systems** section. Integrated into Undo/Redo, **Show everything**, and search-to-reveal.
- **3D cross-section slice plane** (`src/slice.js`, `src/scene.js`, `src/picking.js`, `src/camera.js`, `src/panel.js`):
  - Added **Horizontal** (axial), **Front–back** (coronal), and **Side–side** (sagittal) clipping planes with a position slider, **Flip side** button, and a subtle teal cut-frame guide (automatically hidden in presentation view and saved images).
  - Automatically scales the slider travel to the currently shown region (or whole body), updates raycast hover/click/double-click picking so clipped-away halves never intercept pointers, and clears cleanly on **Show everything**.
- **Expanded Common injuries to 20 presets** (`public/data/injuries.json`):
  - Added 8 more clinical presentations: **Carpal tunnel syndrome**, **Meniscal tear**, **ITB syndrome**, **De Quervain's**, **Golfer's elbow**, **Cervical radiculopathy**, **High ankle sprain**, and **SI joint pain** (all using real Z-Anatomy geometry).
- Added `npm.cmd run check:explore` (`tests/check-explore.mjs`, screenshots 61–65) and expanded `tests/check-injuries.mjs` (screenshots 66–69).

### Next step

All stages in the brief are complete. Future updates (renaming structures in `data/structures-approved.csv` or adding quick views in `public/data/presets.json`) are documented in `USER-GUIDE.md`.
