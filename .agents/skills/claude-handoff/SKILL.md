---
name: claude-handoff
description: Seamlessly resume development from a Claude HANDOFF.md checkpoint, or package current progress back into HANDOFF.md for Claude.
---

# Claude <-> Antigravity Handoff Skill

## When Taking Over from Claude ("Resume Handoff")
1. Read `CLAUDE.md` (the binding project brief), `PROGRESS.md`, then `HANDOFF.md` in the workspace root.
2. Run `git status` and `git diff --stat` to inspect any uncommitted local changes left mid-session.
3. Cross-reference the files listed in **Section 4 (Current Work-in-Progress)** and **Section 7 (Immediate Next Steps)** of `HANDOFF.md`.
4. Output a brief 4-bullet readiness check:
   - Current state of the half-finished file/function
   - Any uncommitted git changes detected
   - Constraints from Section 6 being enforced
   - Exact plan for **Step 1** of Immediate Next Steps
5. Wait for user confirmation (or execute Step 1 immediately if instructed), modifying only the target files.

## When Handing Back to Claude ("Prepare Handoff")
When the user says their Claude limit has reset or asks to update the handoff file:
1. Inspect `git status` and `git diff` across the workspace.
2. Rewrite `HANDOFF.md` in the root directory using the exact 7-section format:
   1. Project Overview & Tech Stack
   2. Directory & File Architecture
   3. Completed & Working Features (include everything finished in Antigravity)
   4. Current Work-in-Progress & Unfinished State
   5. Known Bugs, Edge Cases & Gotchas
   6. Architectural Rules & Constraints
   7. Immediate Next Steps (Ordered)