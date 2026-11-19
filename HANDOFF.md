# HANDOFF — anatomy-model (updated 2026-11-19)

Read `CLAUDE.md` (binding project brief) and `PROGRESS.md` (full stage log, decisions, known issues) first. This file is the compressed state plus what is NOT yet in either.

**State in one line:** All stages (1a–5 and 7, including the soft-tissue side switch, polish, shortcuts, accessibility, performance optimisations, `USER-GUIDE.md`, and live GitHub Pages deployment at https://mbeeston92.github.io/anatomy-model/) are complete, verified and pushed to `main`. Nothing is in progress.

---

## 1. Project Overview & Tech Stack

**Purpose.** Static browser app: interactive 3D adult-male musculoskeletal model for a UK physiotherapist to show patients where an injury is and which structures are involved. Physio drives; patient watches. Clinical credibility is the top priority: **all geometry comes from Z-Anatomy; nothing is sculpted, invented or approximated.**

**The user is a physiotherapist, not a developer.** Report in plain English, give exact commands, ask clinical questions instead of guessing. `CLAUDE.md` requires: present a short plan and wait for approval before major work; check work visually with Playwright screenshots; update `PROGRESS.md` and commit at the end of each stage.

| Thing | Version / value |
|---|---|
| Node | v26 (ES modules, `"type": "module"`) |
| three | 0.187.0 (pinned, exact) |
| three-mesh-bvh | 0.9.18 (pinned) |
| @fontsource/atkinson-hyperlegible | 5.3.0 (bundled; no external font fetch) |
| vite | 8.3.8 (dev) |
| playwright | 1.65.1 (dev; checks only) |
| @gltf-transform/core, /extensions, /functions | 4.5.1 (dev) |
| meshoptimizer | 1.3.0 (dev) |
| Blender | 5.3.0 at `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe` (not on PATH; `BLENDER_PATH` env overrides) |
| Python | 3.15 (only for `scripts/propose_structures.py`) |
| OS | Windows 11. In PowerShell use `npm.cmd`, not `npm` (script execution is blocked) |

No UI framework, no TypeScript, no backend, no test runner (checks are plain Node + Playwright scripts). Vanilla JS factory modules.

**Commands**

```
npm.cmd install
npm.cmd start                 # vite --open, http://localhost:5173/
npm.cmd run build             # static site -> dist/ (~9 MB). vite base is './' for GitHub Pages
npm.cmd run preview           # serve dist/ to check the built site
npm.cmd run check             # Stage 2 viewer check (screenshots -> work/screens/, load time, fps)
npm.cmd run check:regions     # Stage 3, 34 checks
npm.cmd run check:select      # Stage 4, ~70 checks
npm.cmd run check:highlights  # Stage 5, 52 checks
npm.cmd run check:side        # Soft-tissue side switch, 26 checks
npm.cmd run check:polish      # Stage 7 polish & accessibility, 24 checks
npm.cmd run check:injuries    # 20 Common injury presets, 29 checks
npm.cmd run check:explore     # Muscle layer peeling & 3D cross-section slice, 13 checks
npm.cmd run build:models      # export -> compress -> data -> previews (~2 min)
npm.cmd run build:models -- --no-previews
npm.cmd run build:models -- --only export|compress|data|previews
```

`Start anatomy model.cmd` is the user's double-click launcher (installs if needed, then `npm.cmd start`).

**External asset/data dependencies**

- `Source/Z-Anatomy/Startup.blend` (294 MB, git-ignored, **never modified**) — the only geometry source. Folder is `Source` with a capital S on disk.
- `Source/Z-Biomechanics/Startup.blend` (133 MB) — rigged skeleton + attachment marks. Not used, and no longer needed now that movement is dropped.
- Licence: Z-Anatomy, CC BY-SA 4.0. Footer credit and disclaimer are mandatory.
- Hosting: GitHub Pages, live at **https://mbeeston92.github.io/anatomy-model/** (repo: **https://github.com/mbeeston92/anatomy-model**, auto-deployed via `.github/workflows/deploy.yml`). Real-network load measured at **2.30 s** to skeleton and **3.17 s** to all 817 structures.

---

## 2. Directory & File Architecture

```
CLAUDE.md                     Binding project brief for every agent, not only Claude. Read first. Joint movement is listed there as not in scope.
AGENTS.md                     Loaded automatically by Antigravity (and other agents): read CLAUDE.md, PROGRESS.md, HANDOFF.md first; handoff protocol; edit and verification guardrails.
.agents/skills/claude-handoff/SKILL.md   Antigravity skill: resume from HANDOFF.md, or rewrite it for the next agent.
PROGRESS.md                   Stage log: what was done, decisions, known issues, how to run.
HANDOFF.md                    This file. Keep it in the project root (AGENTS.md and the skill look for it there).
Start anatomy model.cmd       Double-click launcher for the user.
index.html                    All static markup: canvas, side panel, footer, dialogs (213 lines).
vite.config.js                base './', port 5173, target es2022, chunkSizeWarningLimit 900.
package.json                  Pinned versions and scripts.

Source/                       Git-ignored originals (Z-Anatomy, Z-Biomechanics). Never modify.

blender/
  inventory.py                Stage 1a: dumps every source object to data/inventory*.csv.
  export.py                   Stage 1b: CSV -> one mesh per structure id -> work/export/<system>.glb + data/export-report.json.
  preview.py                  Renders 30 preview PNGs of the exported models to data/previews/.

scripts/
  build-models.mjs            Orchestrates export/compress/data/previews; finds Blender; checks for the EXPORT_DONE / PREVIEW_DONE marker.
  compress.mjs                gltf-transform dedup + prune + weld + meshopt(level medium): work/export -> public/models.
  build-data.mjs              structures-approved.csv + export-report.json -> public/data/structures.json; fails if ids and meshes disagree either way.
  lib/common.mjs              PATHS, REGIONS, SYSTEM_LABELS, CSV parser, gltf IO, meshNodes().
  propose_structures.py       Generator of the structure list (still the source of both CSVs; see section 6).

data/
  structures-approved.csv     SOURCE OF TRUTH. 817 rows: id, source_object_names, plain_name_uk, medical_name, system, side, regions, notes.
  structures-proposed.csv     Generator output; currently identical to approved.
  structures-proposed-summary.md  Missing structures, naming doubts, size estimates.
  inventory.csv, inventory-other-objects.csv  Everything in the source file.
  export-report.json          Triangle counts, mirror map, non-mirror pairs, warnings.
  previews/                   Git-ignored renders.

public/
  models/{bones,cartilage,ligaments,tendons,muscles,nerves,bursae}.glb   Committed, meshopt-compressed, 7.85 MB total.
  data/structures.json        Generated. Keys: version, credit, units, upAxis, frontAxis, mirrorAxis, regions[13], systems[7], structures[818].
  data/presets.json           Hand-editable quick views (4).
  data/injuries.json          Hand-editable common injury demonstrations (20).

src/
  main.js        Entry: wires modules, render-on-demand frame loop, undo keys, window.__viewer debug handle.
  scene.js       Renderer, camera (FOV 28), env + camera-attached lights, pixel-ratio switch, render(), snapshot().
  materials.js   One MeshStandardMaterial per system; highlight/fade materials; pain-spot shader injection (withSpots).
  registry.js    id -> { data, system, mesh }. All lookups (bySystem, byRegion, fromMesh) go through it.
  loader.js      Fetch with progress, GLTFLoader + meshopt, builds the mirrored left side, retry of failed systems.
  camera.js      createCameraRig: orbit, presets, goTo/frame transitions, smooth wheel zoom, double-click centre.
  visibility.js  THE state store: regions hidden/isolated, systems off, single structures, highlights, pain spots; undo/redo; ghost; applies materials/visibility to meshes.
  panel.js       Side panel: systems, muscle layers, cross-section slice, region rows, quick views, common injuries, options.
  layers.js      Anatomical 3-layer muscle depth classification (superficial / intermediate / deep) for 113 unique muscles.
  slice.js       3D cross-section clipping plane (Horizontal / Front–back / Side–side, Flip side, cut-frame guide).
  picking.js     three-mesh-bvh raycast picking; index built in 6 ms slices.
  outline.js     Selection/hover outline (mask pass) and highlight glow pass.
  selection.js   Hover tooltip, click select, info card, Hide/Isolate/Zoom this.
  search.js      Fuzzy word matching.           searchbox.js   Search UI.
  labels.js      Floating labels with leader lines for the isolated region.
  names.js       Label wording (name, side, region).
  palette.js     Four highlight colours and their (editable, in-memory) meanings.
  highlights.js  Highlight UI, right-click menu, highlight list, fade option, pain-area tool.
  present.js     Presentation view, colour key, Save image (PNG at 2x).
  ui.js          Loading bar, error box, view buttons.
  styles.css     All styling.

tests/
  check-viewer.mjs, check-regions.mjs, check-select.mjs, check-highlights.mjs
                 Each starts its own Vite server (port 5199), drives real UI with Playwright (ANGLE d3d11), prints pass/fail, writes screenshots to work/screens/.

work/                         Git-ignored scratch: export/ (raw .glb), screens/ (check screenshots 00–43), export.log, preview.log.
dist/                         Git-ignored build output.
```

---

## 3. Completed & Working Features (verified; do not touch unless required)

All eight check scripts (`check`, `check:regions`, `check:select`, `check:highlights`, `check:side`, `check:polish`, `check:injuries`, `check:explore`), Chrome/Edge cross-browser tests, and `npm.cmd run build` pass with zero console errors or warnings.

- **Stage 1a/1b — data and models.** 818 structures (bone 208, cartilage 88, ligament 117 incl. linea alba, tendon 52, muscle 225, nerve 64, bursa 64). 538 exported meshes; 280 left soft-tissue structures are mirrored from the right in the app. 1.73 M triangles shown with both sides; 7.86 MB total models. No export warnings; ids match both ways.
- **Stage 2 — viewer.** Progressive load (bones first), progress bar, partial-failure message with retry, lights that follow the camera, depth-bias ordering, render-on-demand, camera presets, smooth wheel zoom to pointer (`WHEEL_ZOOM_RATE = 0.00154`, user-approved), double-click to centre. 60 fps on Radeon 780M integrated graphics at 1440x810.
- **Stage 3 — regions.** Hide/Show/Isolate per region and side, system tick boxes, quick views from `presets.json`, Show everything, Undo/Redo (100 steps, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y), ghost outlines of hidden regions (60 fps verified), zoom-on-isolate option.
- **Stage 4 — names.** Hover label + outline, click select, info card (Hide this / Isolate this / Zoom to this), search with fuzzy matching and Left/Right buttons, medical-name option, labels mode.
- **Stage 5 — highlights.** Four colours (red #F0123C, amber #FF8A00, green #12A84A, blue #3554F2) with editable meanings, right-click menu, highlight list, fade-everything-else, pain-area spots (max 6), presentation view (`P`), Save image (`S`, PNG 2x), all inside the undo history. Privacy check: no cookies, no storage, no third-party requests.
- **Stage 7 + Follow-ups — soft-tissue side switch, polish, shortcuts, accessibility, performance, muscle layer peeling, 3D cross-section slice & 20 common injuries.** Whole-body Soft-tissue side switch (`Left / Right / Both`; keeps bones and midline structures; hides `muscle_diaphragm` on single side per user decision; syncs region, quick-view and injury side choosers; undoable). Collapsible Highlights, Quick views & Common injuries (20 clinical presets in `public/data/injuries.json` with `extraRegions`, Red/Amber highlights, and plain-English notes); anatomical 3-layer muscle peeling (`src/layers.js`: Peel a layer + slider, undoable); 3D cross-section slice plane (`src/slice.js`: Horizontal / Front–back / Side–side, Flip side, clip-aware picking); quick views sync isolated region row chooser; larger trackpad targets; saved PNG includes visible floating labels; keyboard shortcuts (`1`–`5`, `R`, `A`, `C`, `P`, `S`, `Ctrl+Z`, `?`) + `?` help overlay with 30-second guide; distinct colour-blind patterns (solid/dashed/dotted/double) in 3D glow shader, UI swatches and saved PNG; improved contrast and ARIA labels; WebGL fallback hides loading bar immediately; preloads, overlapped loading, pause-BVH-while-moving, and `three` vendor chunk split; `USER-GUIDE.md` and `.github/workflows/deploy.yml` added.

**User-agreed behaviours that look like bugs but are not** (do not "fix"):
- Soft tissue hides if ANY of its regions is hidden; a bone hides only when ALL its regions are hidden.
- Isolate shows the full length of structures crossing the region but frames the camera on region-only structures.
- "Show everything" and quick views keep highlights; only "Clear all highlights" removes them.
- Ghost outlines apply to region-hidden structures only, never to system-filtered or soft-side-filtered ones.
- `muscle_diaphragm` hides when a single soft-tissue side (`Left` or `Right`) is picked (user decision, 19 Nov 2026); all other structure names kept as-is.
- No ambient occlusion (deliberate, for integrated graphics).
- Nucleus pulposus rows removed; merged muscles not split; quadriceps + patellar tendon is one structure (continuous in source).

---

## 4. Current Work-in-Progress & Unfinished State

**Nothing is in progress.** All brief requirements and Stage 7 (Part A and Part B) are complete, verified locally and on the live GitHub Pages URL (https://mbeeston92.github.io/anatomy-model/), and pushed to `main`.

### Joint movement: dropped (user decision, 2026-11-17)

- A Stage 6 attempt was removed completely by the user and taken out of the brief. **Do not restart it unless the user asks.**

---

## 5. Known Bugs, Edge Cases & Gotchas

### Pipeline

- **Blender exits 0 even when a script throws.** `build-models.mjs` detects success by the last-line markers `EXPORT_DONE` / `PREVIEW_DONE`. Any new Blender script must print its own marker.
- Always pass `--factory-startup --disable-autoexec` when opening Z-Anatomy (it embeds an autoexec script). Never save it.
- Relative output paths inside Blender resolve against the drive root. A stray `C:\data\previews` folder still exists from that bug (30 PNGs, safe for the user to delete by hand). Always use `os.path.abspath()`.
- Tendons and articular cartilage are **not** separate source objects; they are cut by material (`Name#Tendon`, `#Cartilage`) with piece selectors `^upper`, `^lower`, `^largest`, and `#rest`. Nerves are curves converted to 6-sided tubes.
- Mirror test tolerance is 0.01 mm on every vertex. Eight pairs fail and are exported both sides: superficial MCL, sacrotuberous, sacrospinous, transverse humeral, costoclavicular, annular ligament of radius, bursa under trapezius, intermuscular gluteal bursae.
- Decimation never touches ligaments, cartilage, bursae, rotator cuff, Achilles, quadriceps/patellar tendon; boundary (cut) vertices are pinned so tendons still meet muscles. To reduce triangles further, lower `DECIMATE_SLOPE` in `blender/export.py`.
- Source quirks handled in `propose_structures.py`: lateral TMJ ligament left/right labels swapped in the source; left "Iliocostalis colli muscle" and right "Common plantar digital branches of medial plantar nerve" lack side suffixes.

### App

- Mirroring is done by a parent `Group` with `scale.x = -1` per system (`<system>_mirrored`), because meshopt quantisation gives each mesh node its own dequantisation transform. **Do not** overwrite a mesh node's own matrix. Mirrored left meshes share geometry with their right partner.
- Materials are `DoubleSide`, so the negative-scale mirror does not need a winding flip.
- Rendering is on demand: anything that changes the picture must call `requestRender()` (or go through the `visibility` `onChange`). Otherwise the view appears frozen.
- Pixel ratio drops to 1 while the camera moves and returns to up to 2 after 400 ms (`SETTLE_MS` in `main.js`).
- `materials.js` `withSpots` sets `customProgramCacheKey = () => 'spots'` for every material it wraps; any new shader variant needs its own key.
- Search only matches words in the names (no synonyms; agreed with user). "Slipped disc" and "funny bone" find nothing.
- Labels are not included in a saved image (they are DOM/SVG, not canvas); they do show in presentation view.
- Highlight outlines show through everything by design; overlap order is creation order.
- A pain area is a sphere: it tints deeper structures too, and blue on red muscle looks purple.
- Ghost-mode frame rate was never measured. 4K screens and older Intel graphics never measured.
- Quick view does not update a region row's own Left/Right/Both chooser.
- Labels mode is crowded (~40 labels) on a whole knee with every system on.
- On a phone-width screen the view buttons cover the feet (phones are not a target).
- Bundle is one ~789 KB JS file (207 KB gzip).
- Model-level issues recorded in PROGRESS (not to be "fixed" by inventing geometry): jagged tendon cut edges when muscles are hidden, flat-strap ligaments, interspinous sheet, sacrococcygeal gap, no linea alba.

### Do not try again

- Joint movement, unless the user asks for it again.
- three's built-in OrbitControls wheel zoom (5% jumps, felt clunky; replaced by the custom glide in `camera.js`).
- Plain `THREE.Raycaster` without BVH for hover (too slow on 1.7 M triangles).
- Ambient occlusion pass.
- Shading a skin "region" for pain: there is no skin mesh. The pain-spot tint was the agreed substitute.
- Separating quadriceps tendon from patellar tendon, or splitting merged muscles: not possible without hand-cutting geometry, which is forbidden.
- Using plain `npm` in PowerShell on this machine.
- Regenerating `structures-approved.csv` from the script if the user has hand-edited it (see section 6).

---

## 6. Architectural Rules & Constraints

**Hard boundaries (from `CLAUDE.md`)**

- Geometry only from Z-Anatomy. If something is missing, say so; never fake it.
- Never modify anything in `Source/`. Working copies go in `work/` (git-ignored).
- Blender runs headless from scripts in `blender/` only. Never ask the user to click in Blender.
- Static site only. No backend, no login, no analytics, no cookies, no `localStorage`/`sessionStorage`, no third-party requests. All state is in memory and resets on refresh. `tests/check-highlights.mjs` asserts this.
- Out of scope unless asked: organs, vessels, skin, female model, patient data, and now joint movement.
- Do not change pinned versions or the tech stack without asking the user.
- Any decision touching clinical accuracy or the user's workflow: stop and ask.
- UK spelling in UI and in code identifiers (`colour`, `centre`, `grey`, `serialise`). Plain English for patient-facing text.
- Budgets: ~60 fps on integrated graphics, first view within ~10 s, models under ~40 MB (currently 7.85 MB).
- Publishing (creating a GitHub repo, pushing, enabling Pages) is outward-facing: get the user's explicit go-ahead first.

**Data conventions**

- Structure id: `system_name[_l|_r]`, regex `^[a-z0-9_]+$`; no suffix for midline. `side` is `left|right|midline` and must agree with the suffix.
- Systems (ids): `bone, cartilage, ligament, tendon, muscle, nerve, bursa`. Files: `bones, cartilage, ligaments, tendons, muscles, nerves, bursae`.`glb`. Materials: `mat_<system>`.
- Regions: the 13 strings in `scripts/lib/common.mjs` `REGIONS`, spelt exactly (two carry bracketed suffixes: `chest and upper back (thoracic)`, `abdomen and lower back (lumbar)`). Multiple regions in the CSV are `|`-separated.
- `data/structures-approved.csv` is the source of truth; `public/data/structures.json` is generated — never edit it by hand. Every mesh node name in a `.glb` equals a CSV id; `build-data.mjs` fails otherwise. Adding/removing a structure requires updating the CSV and telling the user.
- `scripts/propose_structures.py` still generates both CSVs and they are identical. The moment the user hand-edits the approved CSV, stop regenerating it.
- All names shown in the UI come from `structures.json`; nothing is hard-coded in the interface.
- Coordinates in the app: metres, Y up, front +Z, body's left +X. In Blender: Z up, front −Y, left +X.
- Colours by system are defined once in `blender/export.py` `SYSTEMS`, copied into `structures.json`, read by `materials.js`. Highlight colours live in `src/palette.js`. Selection outline #0077A8; UI accent #1F6F78.

**Code patterns**

- Every `src/` module exports a `createX({...deps})` factory returning a plain object of methods/getters. Dependencies are injected from `main.js`; modules do not import each other's instances. No classes (except `LoadError`), no global store, no framework.
- `visibility.js` is the single state store for anything undoable. State is a plain object (`hidden`, `isolated`, `systemsOff`, `structuresOff`, `only`, `preset`, `marks`, `spots`), serialised to JSON for the history. Mutate only through `commit()`; `apply()` is the one place that writes `mesh.visible` / `mesh.material`; `statusOf()` holds the show/hide rule. Display options (ghost, emphasis) are deliberately outside the history.
- Meshes are reached through the `registry`, never by walking the scene. `mesh.userData.structureId` links back.
- One shared material per system; per-structure looks are done by swapping the mesh's material reference, not by cloning materials.
- No meshes are merged (each structure must stay individually pickable and hideable).
- Render on demand; hover does at most one hit test per frame.
- `window.__viewer` exposes module handles for the check scripts; keep it in step when adding modules.
- Each stage adds a `tests/check-*.mjs` with numbered screenshots (next free number: 44) and an npm script. Earlier checks must still pass before a stage is called done.
- Comments and commit messages are plain-English and explain why. Commit format: `Stage N: short description`. The next stage number is 6.

---

## 7. Immediate Next Steps (Ordered)

Project is live and complete. Optional follow-ups only if requested by the user:
1. Measure frame rate on a 4K screen and on older Intel integrated graphics, and test on Safari (macOS/iPadOS).
2. Any future clinical naming or quick-view adjustments (see `USER-GUIDE.md`).
