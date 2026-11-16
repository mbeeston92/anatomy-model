// Compress each exported .glb (work/export) into public/models using
// gltf-transform: remove duplicates, drop unused data, then meshopt compression.
//
//   node scripts/compress.mjs
import fs from 'node:fs';
import path from 'node:path';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { PATHS, gltfIO, mb, meshNodes } from './lib/common.mjs';

const io = await gltfIO();
fs.mkdirSync(PATHS.models, { recursive: true });

const inputs = fs.readdirSync(PATHS.rawModels).filter((f) => f.endsWith('.glb')).sort();
if (!inputs.length) {
  console.error(`No .glb files in ${PATHS.rawModels}. Run the export step first.`);
  process.exit(1);
}

// Remove compressed files left over from an earlier run that no longer exist.
for (const f of fs.readdirSync(PATHS.models)) {
  if (f.endsWith('.glb') && !inputs.includes(f)) fs.rmSync(path.join(PATHS.models, f));
}

let totalIn = 0, totalOut = 0, totalTris = 0;
console.log('file             meshes  triangles   before      after');
for (const file of inputs) {
  const src = path.join(PATHS.rawModels, file);
  const dst = path.join(PATHS.models, file);
  const doc = await io.read(src);
  const before = meshNodes(doc);
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    // meshopt: reorders and quantises the data, then compresses it.
    // Positions keep about 0.1 mm precision.
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const after = meshNodes(doc);
  // Compression must never lose or rename a structure.
  for (const name of before.keys()) {
    if (!after.has(name)) {
      console.error(`ERROR: "${name}" disappeared from ${file} during compression.`);
      process.exit(1);
    }
  }
  await io.write(dst, doc);
  const a = fs.statSync(src).size, b = fs.statSync(dst).size;
  const tris = [...after.values()].reduce((x, y) => x + y, 0);
  totalIn += a; totalOut += b; totalTris += tris;
  console.log(`${file.padEnd(16)} ${String(after.size).padStart(6)} ${String(tris).padStart(10)} ${mb(a).padStart(10)} ${mb(b).padStart(10)}`);
}
console.log(`${'TOTAL'.padEnd(16)} ${''.padStart(6)} ${String(totalTris).padStart(10)} ${mb(totalIn).padStart(10)} ${mb(totalOut).padStart(10)}`);
