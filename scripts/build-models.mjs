// Runs the whole model pipeline:
//   1. export    Blender, headless: Z-Anatomy -> work/export/*.glb
//   2. compress  gltf-transform:    work/export -> public/models
//   3. data      CSV -> public/data/structures.json, checked against the models
//   4. previews  Blender, headless: renders data/previews/*.png
//
//   npm run build:models                 everything
//   npm run build:models -- --no-previews
//   npm run build:models -- --only export|compress|data|previews
//
// Blender is found automatically. To use a different one, set the
// BLENDER_PATH environment variable to the full path of blender.exe.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PATHS, ROOT } from './lib/common.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const want = (step) => (only ? only === step : !(step === 'previews' && args.includes('--no-previews')));

function findBlender() {
  if (process.env.BLENDER_PATH) return process.env.BLENDER_PATH;
  const base = 'C:\\Program Files\\Blender Foundation';
  if (fs.existsSync(base)) {
    const versions = fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'blender.exe')))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    if (versions.length) return path.join(base, versions[0], 'blender.exe');
  }
  for (const p of ['/Applications/Blender.app/Contents/MacOS/Blender', '/usr/bin/blender']) {
    if (fs.existsSync(p)) return p;
  }
  return 'blender';
}

function findSource() {
  for (const dir of ['source', 'Source']) {
    const p = path.join(ROOT, dir, 'Z-Anatomy', 'Startup.blend');
    if (fs.existsSync(p)) return p;
  }
  console.error('Cannot find the Z-Anatomy file. Expected source/Z-Anatomy/Startup.blend');
  process.exit(1);
}

function runBlender(label, blenderArgs, doneMarker, logName) {
  const blender = findBlender();
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(blender, blenderArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const output = (res.stdout ?? '') + (res.stderr ?? '');
  fs.mkdirSync(PATHS.logs, { recursive: true });
  fs.writeFileSync(path.join(PATHS.logs, logName), output);
  for (const line of output.split(/\r?\n/)) {
    if (/^\[export|^RENDERED|^PREVIEW/.test(line)) console.log(line);
  }
  // Blender exits with code 0 even when a script fails, so look for the
  // marker the script prints on its last line.
  if (res.error || !output.includes(doneMarker)) {
    const tail = output.split(/\r?\n/).slice(-25).join('\n');
    console.error(`\n${label} FAILED. Full log: work/${logName}\n${res.error ?? ''}\n${tail}`);
    process.exit(1);
  }
}

function runNode(label, script) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script)], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`\n${label} FAILED.`);
    process.exit(1);
  }
}

if (want('export')) {
  fs.rmSync(PATHS.rawModels, { recursive: true, force: true });
  runBlender('1/4 Export from Z-Anatomy (Blender)', [
    '--background', '--factory-startup', '--disable-autoexec', findSource(),
    '--python', path.join(ROOT, 'blender', 'export.py'), '--',
    PATHS.csv, PATHS.rawModels, PATHS.report,
  ], 'EXPORT_DONE', 'export.log');
}
if (want('compress')) runNode('2/4 Compress models', 'compress.mjs');
if (want('data')) runNode('3/4 Build structures.json and check ids', 'build-data.mjs');
if (want('previews')) {
  runBlender('4/4 Render previews (Blender)', [
    '--background', '--factory-startup',
    '--python', path.join(ROOT, 'blender', 'preview.py'), '--',
    PATHS.rawModels, PATHS.report, PATHS.previews,
  ], 'PREVIEW_DONE', 'preview.log');
  console.log(`Previews are in ${path.relative(ROOT, PATHS.previews)}`);
}
console.log('\nDone.');
