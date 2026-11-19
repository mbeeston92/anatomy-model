# Anatomy Model — User Guide

An interactive 3D model of the adult male body for physiotherapy appointments. Nothing you do is saved or uploaded: highlights, pain areas and reworded labels clear automatically when you refresh the page.

---

## 1. Everyday use in an appointment

### Opening the app
- **Online (any laptop or tablet):** open **https://mbeeston92.github.io/anatomy-model/** in Chrome, Edge or Safari.
- **Offline on this laptop:** double-click **Start anatomy model.cmd** in the project folder. Close the black window when you finish.

### Moving the model
- **Rotate:** click and drag.
- **Move (pan):** right-drag, or drag with two fingers on a trackpad.
- **Zoom:** scroll or pinch (zooms towards your pointer).
- **Centre on a structure:** double-click anywhere on the model.
- **Preset angles:** click **Front, Back, Left, Right, Top** or **Reset view** at the bottom — or press **`1`–`5`** and **`R`**.

### Focusing on the injured area
1. **Quick views** (e.g. *Knee – ligaments*, *Shoulder – rotator cuff*): pick **Left**, **Right** or **Both**, then click a view.
2. **Common injuries** (20 one-click demonstrations including *ACL tear*, *MCL sprain / tear*, *Meniscal tear*, *Patellar tendon overload*, *ITB syndrome*, *Lumbar disc herniation*, *Cervical radiculopathy*, *SI joint pain*, *Rotator cuff injury*, *Tennis elbow*, *Golfer's elbow*, *Carpal tunnel syndrome*, *De Quervain's*, *Gluteal tendinopathy*, *Hamstring strain*, *Calf strain*, *Achilles tendinopathy*, *Lateral ankle sprain*, *High ankle sprain* and *Plantar fasciopathy*): choose **Left** or **Right** and click an injury to isolate the area, hide overlying muscle layers, frame the best angle, highlight the injured (Red) and strained/affected (Amber) structures, and show a short plain-English summary. Press **`Ctrl+Z`** to step back at any time.
3. **Soft-tissue side:** switch to **Left** or **Right** to show muscles, tendons, ligaments, cartilage, nerves and bursae on the injured side only while keeping the full skeleton on both sides. The region, quick-view and injury side selectors move to match automatically.
4. **Systems & Muscle layers ("Peel a layer"):** untick any system to remove it everywhere, or use **Peel a layer** / the **Muscle layers** slider (*All muscles* → *Intermediate & deep* → *Deep only* → *No muscles*) to peel away superficial muscles (deltoid, gluteus maximus, gastrocnemius, traps, pec major) before deeper stabilisers (rotator cuff, multifidus, piriformis, deep neck flexors).
5. **Cross-section slice:** choose **Horizontal**, **Front–back** or **Side–side** to slide a clean 3D cut plane through the whole body or an isolated joint (such as the lumbar spine and discs, hip socket or knee). Click **Flip side** to view the opposite half, and click **Off** or **Show everything** (`A`) to clear it.
6. **Body regions:** choose **Left**, **Right** or **Both**, then press **Hide**, **Show** or **Isolate**.
7. **Show everything / Undo / Redo:** press **Show everything** (or **`A`**) to bring all regions, systems, muscle layers and sides back (and clear any slice plane) while keeping your highlights. **`Ctrl+Z`** and **`Ctrl+Shift+Z`** undo and redo visibility, muscle-layer and highlight changes.

### Naming and selecting structures
- **Point** at any structure to see its plain-English name and side.
- **Click** a structure to open its info card (**Hide this**, **Isolate this**, **Zoom to this**, or highlight it). Click empty space or press **`Esc`** to deselect.
- **Search:** type at the top of the panel (for example `ACL`, `achillies` or `rotator`) and pick **Left** or **Right** — it brings the structure back if it was hidden and zooms straight to it.
- **Options** (bottom of the panel): tick *Show medical names as well*, *Show hidden regions as a faint outline*, or *Label the structures in the isolated region*.

### Highlighting an injury and making a patient handout
- Select a structure and click a highlight colour — or **right-click** the structure directly on the model.
- Each colour also has its own outline pattern so colour-blind patients can tell them apart:
  - **Red (solid outline):** Injured
  - **Amber (dashed outline):** Affected / under strain
  - **Green (dotted outline):** Healing
  - **Blue (double outline):** Area to strengthen
- Click any wording next to a colour to rename it for this appointment.
- Tick **Fade everything that is not highlighted** so the highlighted structures stand out clearly.
- For vaguer pain, click **Shade a pain area**, pick a colour and size, and click the model.
- Press **`P`** (or click **Presentation view**) to hide all controls for the patient. Press **`S`** (or click **Save image**) to save a crisp, high-resolution PNG — including the colour key, any visible floating labels, and the credit line — straight to your Downloads folder.

### Keyboard shortcuts (press `?` anytime to view in the app)

| Key | Action |
|---|---|
| `1` – `5` | Front, Back, Left, Right, Top camera views |
| `R` | Reset view (whole body, front) |
| `P` | Toggle presentation view |
| `S` | Save image (while in presentation view) |
| `A` | Show everything (keeps highlights) |
| `C` | Clear all highlights and pain areas |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo (`Cmd` on a Mac) |
| `Esc` | Close help / menu, leave presentation view, or deselect |
| `?` | Open or close the on-screen help and shortcuts window |

---

## 2. How to rename, add or remove structures

All structure names, sides and regions come from one spreadsheet: **`data/structures-approved.csv`**.

1. Open **`data/structures-approved.csv`** in Excel or a text editor (keep it saved as UTF-8 CSV).
   - **To rename a structure or change its region:** edit the `plain_name_uk`, `medical_name` or `regions` column.
   - **To remove a structure:** delete its row (or both its `_l` and `_r` rows).
   - **To add a structure:** check its exact Z-Anatomy object name in `data/inventory.csv` (or `data/inventory-other-objects.csv` for nerves) and add a new row following the same `system_name_l` / `system_name_r` format.
   - *(Note: once you edit `structures-approved.csv` by hand, do not re-run `scripts/propose_structures.py`, as it would overwrite your edits.)*
2. Open **PowerShell** in the project folder:
   ```powershell
   cd "C:\Users\Mbees\Desktop\anatomy-model"
   ```
3. Rebuild the data (or the 3D models if you added/removed rows):
   - **If you only renamed structures or changed regions** (takes 2 seconds):
     ```powershell
     npm.cmd run build:models -- --only data
     ```
   - **If you added or removed structures** (re-exports from Z-Anatomy in Blender, takes about 2 minutes):
     ```powershell
     npm.cmd run build:models -- --no-previews
     ```
4. Check it looks right locally (`npm.cmd start`), then publish the update (Section 4 below).

---

## 3. How to add or edit Quick views (presets)

1. Open **`public/data/presets.json`** in Notepad or any text editor.
2. Copy one block between `{` and `}` (keeping the comma between blocks) and edit:
   - `id`: a short unique name with no spaces (e.g. `"hip-glutes"`).
   - `label`: the words shown on the button (e.g. `"Hip – gluteal tendons"`).
   - `isolate`: the body region, spelt exactly as in `public/data/structures.json` under `"regions"` (for example `"pelvis and hip"` or `"abdomen and lower back (lumbar)"`). Omit this line to keep the whole body visible.
   - `hideSystems`: any of `"bone"`, `"cartilage"`, `"ligament"`, `"tendon"`, `"muscle"`, `"nerve"`, `"bursa"`.
   - `hideStructures`: single structure IDs from `data/structures-approved.csv` **without** `_l` or `_r` (for example `"muscle_gluteus_maximus"`).
   - `view`: `"front"`, `"back"`, `"left"`, `"right"`, `"top"`, `"outer"`, or `"inner"`.
3. Save the file and refresh the browser to test it. A mistyped name is skipped safely and noted in the browser console (`F12`).

To add or edit **Common injuries**, open **`public/data/injuries.json`** and follow the same format, adding `"extraRegions"` (optional) for multi-region conditions, `"highlights": { "red": [...], "amber": [...] }` (structure IDs without `_l` / `_r`), and `"summary"` for the plain-English note.

---

## 4. How to update the live website

Whenever you edit `structures-approved.csv`, `presets.json`, or any app file, pushing to GitHub automatically rebuilds and updates the live GitHub Pages site within 1–2 minutes:

```powershell
cd "C:\Users\Mbees\Desktop\anatomy-model"
npm.cmd run build
git add -A
git commit -m "Describe your change in plain English"
git push
```

*(Wait about 1–2 minutes, then refresh the live link — press `Ctrl+Shift+R` if your browser still shows the older cached page.)*
