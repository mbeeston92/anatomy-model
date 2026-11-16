// Check for the Stage 3 region, system, ghost, undo and quick-view controls.
//   npm run check:regions
// Drives the real panel, takes screenshots into work/screens/ and prints PASS / FAIL lines.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'work', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5198, strictPort: false } });
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
  const wait = () => (window.__viewer.rig.isTransitioning ? requestAnimationFrame(wait) : setTimeout(resolve, 500));
  wait();
}));
/** Status of structures by id: 'shown', 'hidden' or 'filtered'. */
const status = (ids) => page.evaluate((list) => {
  const { registry, visibility } = window.__viewer;
  return Object.fromEntries(list.map((id) => [id, visibility.statusOf(registry.get(id))]));
}, ids);
const counts = () => page.evaluate(() => {
  const { registry } = window.__viewer;
  let shown = 0, ghost = 0;
  for (const m of registry.meshes()) { if (m.visible && !m.userData.ghost) shown++; else if (m.visible) ghost++; }
  return { shown, ghost };
});
const region = (name) => `[data-region="${name}"]`;
const act = async (name, side, action) => {
  if (side) await page.click(`${region(name)} [data-side="${side}"]`);
  await page.click(`${region(name)} [data-action="${action}"]`);
  await settle();
};
const showAll = async () => { await page.click('#show-everything'); await page.click('[data-view="reset"]'); await settle(); };
const distance = () => page.evaluate(() => {
  const { rig, stage } = window.__viewer;
  return stage.camera.position.distanceTo(rig.controls.target);
});

await page.goto(url);
await page.waitForFunction(() => window.__viewer?.stats.allLoadedAt, null, { timeout: 120000 });
await settle();
const total = (await counts()).shown;
check('everything shown at the start', total === 817, `${total} structures`);
await shot('10-panel-start');

// ----- Isolate left knee -----
const far = await distance();
await act('knee', 'left', 'isolate');
let s = await status(['bone_patella_l', 'bone_femur_l', 'ligament_acl_l', 'muscle_vastus_lateralis_l',
  'bone_patella_r', 'bone_femur_r', 'bone_sacrum', 'muscle_deltoid_l']);
check('isolate left knee: left knee structures shown',
  ['bone_patella_l', 'bone_femur_l', 'ligament_acl_l', 'muscle_vastus_lateralis_l'].every((id) => s[id] === 'shown'));
check('isolate left knee: everything else hidden',
  ['bone_patella_r', 'bone_femur_r', 'bone_sacrum', 'muscle_deltoid_l'].every((id) => s[id] === 'hidden'));
check('isolate frames the camera on the knee', (await distance()) < far / 3, `${far.toFixed(2)} m -> ${(await distance()).toFixed(2)} m`);
check('knee row marked as isolated', await page.locator(`${region('knee')}.is-only`).count() === 1);
const overflow = await page.evaluate(() => { const p = document.querySelector('.panel__inner'); return p.scrollWidth - p.clientWidth; });
check('panel controls fit the panel width', overflow <= 0, `${overflow}px over`);
check('other rows marked as hidden', await page.locator('.region.is-hidden').count() === 12);
await shot('11-isolate-left-knee');

// ----- ... with muscles hidden -----
await page.uncheck('[data-system="muscle"]');
await settle();
s = await status(['ligament_acl_l', 'ligament_pcl_l', 'cartilage_meniscus_medial_l', 'cartilage_meniscus_lateral_l',
  'muscle_vastus_lateralis_l', 'tendon_quadriceps_patellar_l', 'nerve_tibial_l']);
check('muscles unticked: cruciates and menisci shown',
  ['ligament_acl_l', 'ligament_pcl_l', 'cartilage_meniscus_medial_l', 'cartilage_meniscus_lateral_l'].every((id) => s[id] === 'shown'),
  JSON.stringify(s));
check('muscles unticked: muscle gone, tendon and nerve stay',
  s.muscle_vastus_lateralis_l === 'filtered' && s.tendon_quadriceps_patellar_l === 'shown' && s.nerve_tibial_l === 'shown');
await shot('12-isolate-left-knee-no-muscles');
await page.uncheck('[data-system="bursa"]');
await page.evaluate(() => {
  const { rig, visibility } = window.__viewer;
  rig.frame(visibility.frameBox('knee', ['left']), { view: 'back' });
});
await settle();
await shot('12b-left-knee-from-behind-close');

// ----- Undo / redo with the keyboard -----
const beforeUndo = (await counts()).shown;
await page.keyboard.press('Control+z');   // bursae back
await page.keyboard.press('Control+z');   // muscles back
const afterUndo = (await counts()).shown;
check('Ctrl+Z twice brings muscles and bursae back', afterUndo > beforeUndo
  && await page.isChecked('[data-system="muscle"]') && await page.isChecked('[data-system="bursa"]'), `${beforeUndo} -> ${afterUndo}`);
await page.keyboard.press('Control+Shift+z');
check('Ctrl+Shift+Z redoes one step', !(await page.isChecked('[data-system="muscle"]')) && await page.isChecked('[data-system="bursa"]'));
await page.click('#undo');
await page.click('#undo');
check('Undo button: back to everything shown', (await counts()).shown === total);
check('Redo button enabled after undo', await page.isEnabled('#redo'));

// ----- Hide right shoulder -----
await showAll();
await act('shoulder', 'right', 'hide');
s = await status(['bone_clavicle_r', 'muscle_supraspinatus_r', 'muscle_deltoid_r', 'bone_humerus_r', 'bone_scapula_r',
  'muscle_deltoid_l', 'bone_clavicle_l']);
check('hide right shoulder: soft tissue and shoulder-only bones hidden',
  ['bone_clavicle_r', 'muscle_supraspinatus_r', 'muscle_deltoid_r'].every((id) => s[id] === 'hidden'));
check('hide right shoulder: humerus and shoulder blade stay (they belong to other regions too)',
  s.bone_humerus_r === 'shown' && s.bone_scapula_r === 'shown');
check('hide right shoulder: left side untouched', s.muscle_deltoid_l === 'shown' && s.bone_clavicle_l === 'shown');
check('shoulder row says "Right hidden"', (await page.locator(`${region('shoulder')} .region__state`).innerText()) === 'Right hidden');
await shot('13-hide-right-shoulder');

// ----- The overlap rule: hide thigh -----
await showAll();
await act('thigh', 'both', 'hide');
s = await status(['bone_femur_r', 'muscle_vastus_lateralis_r', 'tendon_quadriceps_patellar_r', 'muscle_biceps_femoris_r', 'bone_patella_r']);
check('hide thigh: femur stays, thigh soft tissue goes',
  s.bone_femur_r === 'shown' && s.bone_patella_r === 'shown'
  && ['muscle_vastus_lateralis_r', 'tendon_quadriceps_patellar_r', 'muscle_biceps_femoris_r'].every((id) => s[id] === 'hidden'), JSON.stringify(s));
await shot('14-hide-thigh');
await act('thigh', null, 'show');
check('Show restores the thigh', (await counts()).shown === total);

// ----- Ghost mode -----
await showAll();
await page.uncheck('#option-frame');
await act('knee', 'left', 'isolate');
check('with zoom switched off, isolating does not move the camera', Math.abs((await distance()) - far) < 0.01);
await shot('15-isolate-left-knee-no-zoom');
await page.check('#option-ghost');
await settle();
const ghosted = await counts();
check('ghost mode: hidden structures drawn as outlines', ghosted.ghost > 500 && ghosted.shown + ghosted.ghost === total, JSON.stringify(ghosted));
await shot('16-ghost-isolate-left-knee');
await page.check('#option-frame');
await act('knee', null, 'isolate');          // end the isolation
await act('knee', 'left', 'isolate');        // and isolate again, this time with zoom
await shot('16b-ghost-isolate-left-knee-zoomed');
await showAll();
await act('shoulder', 'right', 'hide');
await shot('16c-ghost-hide-right-shoulder');
await page.uncheck('#option-ghost');
check('ghost off: outlines gone', (await counts()).ghost === 0);

// ----- Quick views -----
await showAll();
const presets = await page.locator('.preset').allInnerTexts();
check('four quick views listed', presets.length === 4, presets.join(' | '));
for (const [i, label] of presets.entries()) {
  await page.locator('.preset').nth(i).click();
  await settle();
  await shot(`17-preset-${i + 1}-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`);
  check(`quick view "${label}" is marked as current`, await page.locator('.preset.is-current').count() === 1);
}
await page.locator('.preset').nth(1).click();
await settle();
s = await status(['muscle_deltoid_r', 'muscle_trapezius_upper_r', 'muscle_supraspinatus_r', 'muscle_infraspinatus_r',
  'muscle_subscapularis_r', 'muscle_teres_minor_r', 'tendon_infraspinatus_r', 'muscle_supraspinatus_l']);
check('rotator cuff view: deltoid and trapezius off, cuff shown, left side hidden',
  s.muscle_deltoid_r === 'filtered' && s.muscle_trapezius_upper_r === 'filtered'
  && ['muscle_supraspinatus_r', 'muscle_infraspinatus_r', 'muscle_subscapularis_r', 'muscle_teres_minor_r', 'tendon_infraspinatus_r'].every((id) => s[id] === 'shown')
  && s.muscle_supraspinatus_l === 'hidden', JSON.stringify(s));
check('note about single hidden structures is shown', await page.isVisible('#structures-note'));
await page.click('#preset-side [data-side="left"]');
await page.locator('.preset').nth(0).click();
await settle();
s = await status(['ligament_acl_l', 'ligament_acl_r']);
check('quick view on the left side', s.ligament_acl_l === 'shown' && s.ligament_acl_r === 'hidden');
await shot('18-preset-knee-left');
await page.click('#undo');
s = await status(['muscle_supraspinatus_r']);
check('one Undo steps back from a quick view to the one before', s.muscle_supraspinatus_r === 'shown');

// ----- Show everything -----
await page.click('#show-everything');
await settle();
check('Show everything restores all structures and tick boxes',
  (await counts()).shown === total && await page.isChecked('[data-system="muscle"]') && !(await page.isVisible('#structures-note')));

// ----- Stage 2 still works -----
await page.click('[data-view="back"]');
await settle();
check('view buttons still work', await page.locator('[data-view="back"].is-current').count() === 1);
await page.click('[data-view="reset"]');
await settle();
const before = await page.evaluate(() => window.__viewer.rig.controls.target.toArray());
const box = await page.locator('#canvas').boundingBox();
await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.22);
await settle();
const after = await page.evaluate(() => window.__viewer.rig.controls.target.toArray());
check('double-click still centres the orbit', Math.abs(after[1] - before[1]) > 0.2);
await page.click('[data-view="reset"]');
await settle();
await shot('19-everything-restored');

console.log(problems.length ? `Console problems:\n  ${problems.join('\n  ')}` : 'No console errors or warnings.');
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed.');
console.log(`Screenshots: ${OUT}`);
await browser.close();
await server.close();
process.exit(failures || problems.length ? 1 : 0);
