# Instructions for AI coding agents (Antigravity and others)

## 1. Read first, every session

1. `CLAUDE.md` — the project brief. Despite its name it is binding for **every** agent, not only Claude: purpose, scope, clinical-accuracy rules, technical decisions, privacy, and how to work in each stage. If anything in this file conflicts with it, `CLAUDE.md` wins.
2. `PROGRESS.md` — what each stage did, decisions made, known issues, how to run.
3. `HANDOFF.md` (project root) — read it completely: current state, completed features, gotchas, immediate next steps.

The user is a physiotherapist, not a developer: report in plain English and ask clinical questions rather than guessing (see `CLAUDE.md`).

## 2. Handoff & context protocol

- Before making any code changes in a new session, check `HANDOFF.md` in the project root.
- When completing a task from `HANDOFF.md`, update the file in place: move finished items to "Completed & Working Features" and keep "Current Work-in-Progress" accurate.
- At the end of a stage, also update `PROGRESS.md` and commit, as `CLAUDE.md` requires.
- The skill in `.agents/skills/claude-handoff/` resumes from, and writes back to, `HANDOFF.md`.

## 3. Tech stack & environment constraints

- **Core stack:** vanilla JavaScript (ES modules), Three.js 0.187.0, three-mesh-bvh 0.9.18, Vite 8.3.8. Node scripts and Blender 5.3 (headless, scripts in `blender/`) build the models; Playwright runs the checks. Versions are pinned in `package.json`.
- **Windows:** in PowerShell type `npm.cmd`, not `npm` (plain `npm` is blocked on this machine).
- **Asset and data paths:** never hard-code absolute local paths (`C:\...`). Use paths relative to the project and keep the existing folders for models and data (`public/models/*.glb`, `public/data/*.json`).
- **Dependencies:** do not install new npm/pip packages or swap out core libraries without the user's explicit permission.

## 4. Code modification guardrails

- **Surgical edits only:** change only the functions, modules or files the current step needs. Do not reformat unrelated code, rename working variables or strip existing comments.
- **Preserve working pipelines:** anything under "Completed & Working Features" in `HANDOFF.md` is locked unless a bug directly requires touching it.
- **State and performance:** keep state management clean and modular (`src/visibility.js` is the single state store). In the 3D scene and the `requestAnimationFrame` loop, do not create new objects, materials or geometries per frame. The picture is redrawn only on request: anything that changes it must call `requestRender()`.

## 5. Verification loop

- After editing files, check syntax, imports and terminal/console output before moving to the next task.
- Check visual changes with screenshots, as `CLAUDE.md` requires; the `npm.cmd run check*` scripts take them into `work/screens/`.
- Stop after completing one logical step from `HANDOFF.md` and summarise the diff before going on to the next.
