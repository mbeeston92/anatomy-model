// Shared helpers for the model build scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PATHS = {
  csv: path.join(ROOT, 'data', 'structures-approved.csv'),
  report: path.join(ROOT, 'data', 'export-report.json'),
  rawModels: path.join(ROOT, 'work', 'export'),
  models: path.join(ROOT, 'public', 'models'),
  json: path.join(ROOT, 'public', 'data', 'structures.json'),
  previews: path.join(ROOT, 'data', 'previews'),
  logs: path.join(ROOT, 'work'),
};

// Region names exactly as in CLAUDE.md, in display order.
export const REGIONS = [
  'head and neck', 'shoulder', 'upper arm', 'elbow', 'forearm', 'wrist and hand',
  'chest and upper back (thoracic)', 'abdomen and lower back (lumbar)',
  'pelvis and hip', 'thigh', 'knee', 'lower leg', 'ankle and foot',
];

export const SYSTEM_LABELS = {
  bone: 'Bones', cartilage: 'Cartilage', ligament: 'Ligaments', tendon: 'Tendons',
  muscle: 'Muscles', nerve: 'Nerves', bursa: 'Bursae',
};

/** Minimal CSV reader: handles quotes, commas and line breaks inside quotes. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((v) => v !== '')) rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function readStructuresCsv() {
  return parseCsv(fs.readFileSync(PATHS.csv, 'utf8'));
}

export async function gltfIO() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

/** Names and triangle counts of every mesh node in a glTF document. */
export function meshNodes(doc) {
  const out = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    let tris = 0;
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : prim.getAttribute('POSITION').getCount();
      tris += count / 3;
    }
    out.set(node.getName(), (out.get(node.getName()) ?? 0) + tris);
  }
  return out;
}

export const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
