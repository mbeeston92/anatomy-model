// Turn data/structures-approved.csv into public/data/structures.json and
// check it against the compressed models. Stops with an error if the list and
// the models disagree in any way.
//
//   node scripts/build-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PATHS, REGIONS, SYSTEM_LABELS, gltfIO, mb, meshNodes, readStructuresCsv } from './lib/common.mjs';

const errors = [];
const warnings = [];
const rows = readStructuresCsv();
if (!fs.existsSync(PATHS.report)) {
  console.error(`Missing ${PATHS.report}. Run the export step first.`);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(PATHS.report, 'utf8'));

// ---------------------------------------------------------------- CSV checks
const SIDES = ['left', 'right', 'midline'];
const byId = new Map();
for (const r of rows) {
  if (!/^[a-z0-9_]+$/.test(r.id)) errors.push(`CSV: id "${r.id}" must be lowercase letters, digits and underscores only.`);
  if (byId.has(r.id)) errors.push(`CSV: id "${r.id}" appears more than once.`);
  byId.set(r.id, r);
  if (!SYSTEM_LABELS[r.system]) errors.push(`CSV: ${r.id} has unknown system "${r.system}".`);
  if (!SIDES.includes(r.side)) errors.push(`CSV: ${r.id} has unknown side "${r.side}".`);
  if (r.side === 'left' && !r.id.endsWith('_l')) errors.push(`CSV: ${r.id} is marked left but its id does not end in _l.`);
  if (r.side === 'right' && !r.id.endsWith('_r')) errors.push(`CSV: ${r.id} is marked right but its id does not end in _r.`);
  if (!r.plain_name_uk) errors.push(`CSV: ${r.id} has no plain name.`);
  const regions = r.regions.split('|').map((s) => s.trim()).filter(Boolean);
  if (!regions.length) errors.push(`CSV: ${r.id} has no region.`);
  for (const g of regions) if (!REGIONS.includes(g)) errors.push(`CSV: ${r.id} has unknown region "${g}".`);
  r._regions = regions;
}

// ------------------------------------------------------------- model checks
const io = await gltfIO();
const systems = [];
const nodeSystem = new Map();   // mesh name -> system
const nodeTris = new Map();
for (const [system, info] of Object.entries(report.systems)) {
  const file = path.join(PATHS.models, info.file);
  const wanted = rows.some((r) => r.system === system);
  if (!fs.existsSync(file)) {
    if (wanted) errors.push(`Model file missing: public/models/${info.file}`);
    continue;
  }
  const doc = await io.read(file);
  const nodes = meshNodes(doc);
  for (const [name, tris] of nodes) {
    if (nodeSystem.has(name)) errors.push(`Mesh "${name}" is in two model files.`);
    nodeSystem.set(name, system);
    nodeTris.set(name, tris);
  }
  systems.push({
    id: system, label: SYSTEM_LABELS[system], file: `models/${info.file}`,
    bytes: fs.statSync(file).size, colour: info.colour, opacity: info.opacity,
    material: info.material, meshes: nodes.size,
    triangles: [...nodes.values()].reduce((a, b) => a + b, 0),
  });
}

// Every id in the CSV must have a mesh, or be the mirror image of one.
const structures = [];
for (const r of rows) {
  const rep = report.structures[r.id];
  if (!rep) { errors.push(`${r.id}: in the CSV but not in the export report. Re-run the export.`); continue; }
  let mirrorOf = null;
  if (rep.mirror_of) {
    mirrorOf = rep.mirror_of;
    const partner = byId.get(mirrorOf);
    if (!partner) errors.push(`${r.id}: mirrors "${mirrorOf}", which is not in the CSV.`);
    else if (partner.system !== r.system) errors.push(`${r.id}: mirrors "${mirrorOf}", which is in a different system.`);
    if (nodeSystem.get(mirrorOf) !== r.system) errors.push(`${r.id}: mirrors "${mirrorOf}", but that mesh is not in the ${r.system} model file.`);
    if (nodeSystem.has(r.id)) errors.push(`${r.id}: marked as mirrored but also has its own mesh.`);
  } else if (!nodeSystem.has(r.id)) {
    errors.push(`${r.id}: in the CSV but has no mesh in the models.`);
  } else if (nodeSystem.get(r.id) !== r.system) {
    errors.push(`${r.id}: CSV says system "${r.system}" but the mesh is in the ${nodeSystem.get(r.id)} file.`);
  } else if (nodeTris.get(r.id) === 0) {
    errors.push(`${r.id}: mesh is empty.`);
  } else if (Math.abs(nodeTris.get(r.id) - rep.triangles_export) > Math.max(8, rep.triangles_export * 0.01)) {
    // (Compression removes the odd zero-area triangle, so tiny differences are normal.)
    warnings.push(`${r.id}: ${nodeTris.get(r.id)} triangles in the model, ${rep.triangles_export} in the export report.`);
  }
  structures.push({
    id: r.id,
    name: r.plain_name_uk,
    medicalName: r.medical_name,
    system: r.system,
    side: r.side,
    regions: r._regions,
    mirrorOf,
  });
}
// ...and every mesh in the models must be in the CSV.
for (const name of nodeSystem.keys()) {
  if (!byId.has(name)) errors.push(`Mesh "${name}" is in the ${nodeSystem.get(name)} model file but not in the CSV.`);
}

if (warnings.length) {
  console.warn(`\n${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 30)) console.warn('  ' + w);
}
if (errors.length) {
  console.error(`\nFAILED: ${errors.length} problem(s) between structures-approved.csv and the models:\n`);
  for (const e of errors) console.error('  ' + e);
  console.error('\nstructures.json was NOT written.');
  process.exit(1);
}

const out = {
  version: 1,
  credit: 'Anatomy models: Z-Anatomy (CC BY-SA 4.0)',
  units: 'metres',
  upAxis: '+Y',
  frontAxis: '+Z',
  // Left-side soft tissue with "mirrorOf" has no mesh of its own: the app
  // shows a copy of the named right-side mesh flipped across the X axis.
  mirrorAxis: 'x',
  regions: REGIONS,
  systems,
  structures,
};
fs.mkdirSync(path.dirname(PATHS.json), { recursive: true });
fs.writeFileSync(PATHS.json, JSON.stringify(out, null, 1) + '\n');

const total = systems.reduce((a, s) => a + s.bytes, 0);
const mirrored = structures.filter((s) => s.mirrorOf).length;
console.log(`structures.json written: ${structures.length} structures ` +
  `(${structures.length - mirrored} with their own mesh, ${mirrored} mirrored).`);
console.log(`All ids match between the CSV and the models. Total model download: ${mb(total)}.`);
