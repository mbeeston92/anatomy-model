// Check for Muscle layer peeling ("Peel a layer") and 3D Cross-section slice plane.
//   npm.cmd run check:explore
// Drives the real panel, verifies layer filtering, clipping, picking, Undo/Redo, and screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'work', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  headless: !process.argv.includes('--headed'),
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const settle = () => page.evaluate(() => new Promise((resolve) => {
  const wait = () => (window.__viewer.rig.isTransitioning ? requestAnimationFrame(wait) : setTimeout(resolve, 450));
  wait();
}));
const status = (ids) => page.evaluate((list) => {
  const { registry, visibility } = window.__viewer;
  return Object.fromEntries(list.map((id) => [id, visibility.statusOf(registry.get(id))]));
}, ids);

await page.goto(url);
await page.waitForFunction(() => window.__viewer?.stats.allLoadedAt, null, { timeout: 120000 });
await settle();
await page.waitForFunction(() => window.__viewer.picker.pending === 0, null, { timeout: 60000 });

const overflow = await page.evaluate(() => { const p = document.querySelector('.panel__inner'); return p.scrollWidth - p.clientWidth; });
check('panel controls fit the panel width', overflow <= 0, `${overflow}px over`);

// ----- Muscle layer peeling -----
check('muscle peel starts at 0 ("All muscles")',
  await page.evaluate(() => window.__viewer.visibility.musclePeel === 0)
  && (await page.innerText('#peel-text')) === 'All muscles'
  && await page.isDisabled('#peel-reset'));

// Peel 1: Superficial peeled off
await page.click('#peel-down');
await settle();
let s = await status([
  'muscle_deltoid_r', 'muscle_pectoralis_major_r', 'muscle_gluteus_maximus_r', 'muscle_rectus_abdominis_r',
  'muscle_gluteus_medius_r', 'muscle_soleus_r', 'muscle_supraspinatus_r', 'muscle_multifidus_lumbar_r',
]);
check('Peel 1 hides superficial muscles and keeps intermediate & deep muscles',
  ['muscle_deltoid_r', 'muscle_pectoralis_major_r', 'muscle_gluteus_maximus_r', 'muscle_rectus_abdominis_r'].every((id) => s[id] === 'filtered')
  && ['muscle_gluteus_medius_r', 'muscle_soleus_r', 'muscle_supraspinatus_r', 'muscle_multifidus_lumbar_r'].every((id) => s[id] === 'shown')
  && (await page.innerText('#peel-text')) === 'Intermediate & deep', JSON.stringify(s));
await shot('61-peel-layer-1');

// Peel 2: Deep only
await page.click('#peel-down');
await settle();
s = await status([
  'muscle_gluteus_medius_r', 'muscle_soleus_r', 'muscle_rhomboid_major_r', 'muscle_iliocostalis_r',
  'muscle_supraspinatus_r', 'muscle_multifidus_lumbar_r', 'muscle_quadratus_lumborum_r', 'muscle_piriformis_r', 'muscle_popliteus_r',
]);
check('Peel 2 hides intermediate muscles and keeps deep stabilisers',
  ['muscle_gluteus_medius_r', 'muscle_soleus_r', 'muscle_rhomboid_major_r', 'muscle_iliocostalis_r'].every((id) => s[id] === 'filtered')
  && ['muscle_supraspinatus_r', 'muscle_multifidus_lumbar_r', 'muscle_quadratus_lumborum_r', 'muscle_piriformis_r', 'muscle_popliteus_r'].every((id) => s[id] === 'shown')
  && (await page.innerText('#peel-text')) === 'Deep only', JSON.stringify(s));
await shot('62-peel-layer-2-deep');

// Peel 3: No muscles
await page.click('#peel-down');
await settle();
s = await status(['muscle_supraspinatus_r', 'muscle_multifidus_lumbar_r', 'ligament_acl_r', 'bone_femur_r']);
check('Peel 3 hides all muscles while keeping bones and ligaments',
  s.muscle_supraspinatus_r === 'filtered' && s.muscle_multifidus_lumbar_r === 'filtered'
  && s.ligament_acl_r === 'shown' && s.bone_femur_r === 'shown'
  && await page.isDisabled('#peel-down'));

// Undo & Restore
await page.keyboard.press('Control+z');
check('Undo steps back from Peel 3 to Deep only',
  await page.evaluate(() => window.__viewer.visibility.musclePeel === 2));
await page.click('#peel-reset');
check('Restore button brings all muscles back',
  await page.evaluate(() => window.__viewer.visibility.musclePeel === 0)
  && (await status(['muscle_deltoid_r'])).muscle_deltoid_r === 'shown');

// Search reveals a peeled-off superficial muscle
await page.click('#peel-down');
await page.fill('#search', 'deltoid');
await page.click('[data-result="muscle_deltoid_r"]');
await settle();
check('picking a peeled-off muscle from search brings its layer back',
  (await status(['muscle_deltoid_r'])).muscle_deltoid_r === 'shown'
  && await page.evaluate(() => window.__viewer.visibility.musclePeel === 0));

// ----- 3D Cross-section slice plane -----
await page.keyboard.press('Escape');
await page.click('#show-everything');
await page.click('[data-view="reset"]');
await settle();
check('slice starts Off with no clipping planes',
  await page.evaluate(() => !window.__viewer.slice.active && window.__viewer.stage.renderer.clippingPlanes.length === 0));

// Horizontal slice at 50% (cuts top half off)
await page.click('#slice-axis [data-slice="y"]');
await settle();
check('Horizontal slice activates renderer clipping plane and reveals slider + Flip side',
  await page.evaluate(() => window.__viewer.slice.axis === 'y' && window.__viewer.stage.renderer.clippingPlanes.length === 1)
  && await page.isVisible('#slice-controls') && await page.isVisible('#slice-flip'));

// Hover/picking ignores the clipped-away upper half (head is clipped away at 50% horizontal slice)
const headHitClipped = await page.evaluate(() => {
  const { registry, stage, picker } = window.__viewer;
  const mesh = registry.get('bone_frontal').mesh;
  const rect = document.getElementById('canvas').getBoundingClientRect();
  const box = mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox);
  const c = box.getCenter(mesh.position.clone()).applyMatrix4(mesh.matrixWorld).project(stage.camera);
  const px = rect.left + (c.x + 1) / 2 * rect.width;
  const py = rect.top + (1 - c.y) / 2 * rect.height;
  return picker.pick(px, py)?.entry.id ?? null;
});
check('picking ignores the clipped-away upper half (head cannot be picked)', headHitClipped === null, `got ${headHitClipped}`);
await shot('63-slice-horizontal');

// Flip side keeps the upper half instead
await page.click('#slice-flip');
await settle();
const headHitFlipped = await page.evaluate(() => {
  const { registry, stage, picker } = window.__viewer;
  const mesh = registry.get('bone_frontal').mesh;
  const rect = document.getElementById('canvas').getBoundingClientRect();
  const box = mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox);
  const c = box.getCenter(mesh.position.clone()).applyMatrix4(mesh.matrixWorld).project(stage.camera);
  const px = rect.left + (c.x + 1) / 2 * rect.width;
  const py = rect.top + (1 - c.y) / 2 * rect.height;
  return picker.pick(px, py)?.entry.id ?? null;
});
check('Flip side keeps the opposite half (head can now be picked)', headHitFlipped === 'bone_frontal', `got ${headHitFlipped}`);

// Sagittal slice right through the lumbar spine (showing spinal canal and discs!)
await page.click('#slice-axis [data-slice="off"]');
await page.click('[data-region="abdomen and lower back (lumbar)"] [data-action="isolate"]');
await page.uncheck('[data-system="muscle"]');
await page.evaluate(() => {
  const { rig, visibility } = window.__viewer;
  rig.frame(visibility.frameBox('abdomen and lower back (lumbar)', ['left', 'right']), { view: 'left' });
});
await settle();
await page.click('#slice-axis [data-slice="x"]');
await settle();
await shot('64-slice-sagittal-spine');

// Front-to-back (coronal) slice through an isolated knee
await page.click('#show-everything');
await page.click('[data-region="knee"] [data-side="left"]');
await page.click('[data-region="knee"] [data-action="isolate"]');
await page.uncheck('[data-system="muscle"]');
await page.evaluate(() => {
  const { rig, visibility } = window.__viewer;
  rig.frame(visibility.frameBox('knee', ['left']), { view: 'front' });
});
await settle();
await page.click('#slice-axis [data-slice="z"]');
await settle();
await shot('65-slice-coronal-knee');

// Show everything clears the slice plane too
await page.click('#show-everything');
await settle();
check('"Show everything" turns the cross-section slice Off',
  await page.evaluate(() => !window.__viewer.slice.active && window.__viewer.stage.renderer.clippingPlanes.length === 0));

console.log(problems.length ? `Console problems:\n  ${problems.join('\n  ')}` : 'No console errors or warnings.');
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed.');
console.log(`Screenshots: ${OUT}`);
await browser.close();
await server.close();
process.exit(failures || problems.length ? 1 : 0);
