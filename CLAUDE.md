# Project brief: Interactive 3D anatomy model for physiotherapy patient education

Read this whole file before doing anything in this project. Then read `PROGRESS.md` (create it if it doesn't exist) to see which stages are done.

## Purpose

A browser-based, interactive 3D model of the adult male body. A UK physiotherapist uses it on a laptop during appointments to show patients:
- where their injury is
- which structures are involved
- how a joint moves

The physiotherapist drives the app; the patient watches. The physiotherapist takes their own screenshots for patient handouts.

**Clinical credibility is the top priority.** Anatomical position, proportions and naming must be correct. Never invent, sculpt or approximate anatomical geometry. All geometry comes from the Z-Anatomy source file. If something is missing from the source, say so; don't fake it.

## The user

A physiotherapist, not a software developer. When you report back:
- use plain English
- give exact steps for anything they need to do (commands to type, links to open, files to edit)
- explain what you did and why in a few sentences, not a technical log
- ask clinical questions (names, which structures, how a movement should look) instead of guessing

## Scope

**Structures (main ones only, not every named structure):**
- bones
- muscles
- tendons
- ligaments
- cartilage (articular cartilage, menisci, labra, intervertebral discs)
- nerves

The exact list is set by the user in `data/structures-approved.csv` (produced in Stage 1). That file is the source of truth for what's in the app, plus each structure's name, region and system. Don't add or remove structures without updating it and telling the user.

**Model:** one adult male, standing in the standard anatomical position.

**Not in scope** (don't build these unless asked):
- organs, blood vessels, skin
- a female model
- login or accounts
- saving patient data
- a backend server

## Core features

1. **3D view.** Rotate, pan, zoom; preset camera views (front, back, left, right, top); reset view.
2. **Hide/restore by region** (the main control). Body regions, left and right where relevant:
   - head and neck
   - shoulder
   - upper arm
   - elbow
   - forearm
   - wrist and hand
   - chest and upper back (thoracic)
   - abdomen and lower back (lumbar)
   - pelvis and hip
   - thigh
   - knee
   - lower leg
   - ankle and foot

   The user can hide or restore any region, or isolate one (show only that region).

   Secondary control: show or hide each system (bones, cartilage, ligaments, tendons, muscles, nerves). This lets them reveal deep structures, e.g. hide muscles around the knee to show the cruciate ligaments.
3. **Selection.** Click a structure to see its plain-English name in UK spelling, plus which side (left/right). Hovering shows the name too. A search box finds structures by name. A setting can show the medical name as well (off by default).
4. **Coloured injury highlights.** Mark one or more structures in a chosen colour, e.g. red for the injured structure and amber for structures affected or under strain. Highlights can be cleared one at a time or all at once. A clean presentation view hides the interface for screenshots.
5. **Joint movement.** Knee, ankle and shoulder move through physiological ranges using sliders. Soft tissues (muscles, tendons, ligaments, nerves) follow the bones believably.

## Technical decisions (already made; don't change without asking)

- **Rendering:** Three.js, installed through npm, with the version pinned in `package.json`.
- **Build tool:** Vite. Plain JavaScript or TypeScript. No heavy UI framework unless clearly needed; vanilla JS or a light library is preferred.
- **3D format:** `.glb`, compressed with meshopt (or Draco) using `gltf-transform`. Split it into several files (e.g. one per system) so loading is progressive and quick.
- **Blender:**
  - Run headless from scripts only: `blender --background <file> --python <script>`. Never ask the user to click through Blender. All Blender steps must be reproducible scripts in `blender/`.
  - Find the Blender executable on this machine. If you can't, ask the user for its path once and record it in `PROGRESS.md`.
  - Never modify the original file in `source/`. Save any working copies elsewhere.
- **Structure data:**
  - `data/structures-approved.csv` is the human-edited source of truth.
  - A build script turns it into `public/data/structures.json`, which the app loads.
  - Each mesh in the `.glb` has a stable ID that matches the CSV.
- **Hosting:** GitHub Pages, a static site. The app must work as static files with no server code.
- **Target device:** a typical laptop browser (Chrome, Edge or Safari) with integrated graphics.
  - Aim for smooth interaction (around 60 fps) and first view within about 10 seconds on normal broadband.
  - Keep the total compressed model download under about 40 MB if possible.
  - Show a loading progress bar.

## Project layout

```
source/               Original Z-Anatomy .blend. Never modified; git-ignored (too large).
blender/              Python scripts run headless in Blender
data/                 structures-proposed.csv, structures-approved.csv, notes
scripts/              Node build scripts (CSV → JSON, glTF compression)
public/models/        Exported, compressed .glb files
public/data/          structures.json
src/                  App source code
PROGRESS.md           Stage log: what's done, decisions made, known issues
```

## Interface and style

- Calm, clinical and uncluttered. It should look like a professional clinical tool, not a game.
- Light neutral background, which also works for screenshots.
- Large, clear controls that are easy to use while talking to a patient. The 3D model takes up most of the screen.
- Realistic but clear colours by system:
  - bone: off-white
  - cartilage: pale blue-grey
  - ligaments and tendons: pale silver-cream
  - muscles: muted red
  - nerves: yellow

  Highlight colours must stand out clearly from all of these.
- UK spelling everywhere in the interface (e.g. "colour", "centre", "anaesthetic", "grey").
- Plain English for patient-facing text.
- Footer shows:
  - credit: "Anatomy models: Z-Anatomy (CC BY-SA 4.0)", with a link to the license
  - a short disclaimer: "For patient education only. Not a diagnostic tool."

## Privacy

Store nothing:
- no patient names or details
- no cookies
- no analytics
- no localStorage of clinical information

Highlights reset when the page is refreshed.

## How to work in every stage

1. Read this file and `PROGRESS.md`.
2. Present a short plan (a few bullet points) and wait for approval before starting major work.
3. Build in small steps. Run the app and **check your own work visually.** Use a headless browser (Playwright) to take screenshots and look at them before saying something works.
4. Don't break features from earlier stages. Re-check them before finishing.
5. At the end of the stage:
   - update `PROGRESS.md` (what was done, decisions, known issues, how to run)
   - commit to Git with a clear message
   - give the user a short summary and tell them to run the stage checklist
6. If you hit a decision that affects clinical accuracy or the user's workflow, stop and ask. Don't guess.
