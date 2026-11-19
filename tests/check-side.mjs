// Check for the whole-body soft-tissue side switch (Left / Right / Both).
//   npm.cmd run check:side
// Drives the real panel, takes screenshots into work/screens/ and prints PASS / FAIL lines.
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
  const wait = () => (window.__viewer.rig.isTransitioning ? requestAnimationFrame(wait) : setTimeout(resolve, 500));
  wait();
}));
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
const regionChoosersOn = (side) => page.locator(`#regions .seg__option.is-selected[data-side="${side}"]`).count();

const LEFT_SOFT = [
  'muscle_deltoid_l', 'ligament_acl_l', 'tendon_achilles_l',
  'cartilage_meniscus_medial_l', 'nerve_sciatic_l', 'bursa_subacromial_l',
];
const RIGHT_SOFT = [
  'muscle_deltoid_r', 'ligament_acl_r', 'tendon_achilles_r',
  'cartilage_meniscus_medial_r', 'nerve_sciatic_r', 'bursa_subacromial_r',
];
const BONES = [
  'bone_femur_l', 'bone_femur_r', 'bone_humerus_l', 'bone_humerus_r',
  'bone_clavicle_l', 'bone_clavicle_r', 'bone_sacrum', 'bone_frontal',
];
const MIDLINE_SOFT = [
  'cartilage_disc_l4_l5', 'cartilage_pubic_symphysis', 'ligament_linea_alba',
];
const BILATERAL_MIDLINE = ['muscle_diaphragm'];

await page.goto(url);
await page.waitForFunction(() => window.__viewer?.stats.allLoadedAt, null, { timeout: 120000 });
await settle();

const total = (await counts()).shown;
check('everything shown at the start', total === 818, `${total} structures`);
check('soft-tissue side starts on Both',
  await page.getAttribute('#soft-side [data-side="both"]', 'aria-checked') === 'true'
  && await page.evaluate(() => window.__viewer.visibility.softSide === null));
check('all 10 paired region choosers start on Both', await regionChoosersOn('both') === 10);
const overflow = await page.evaluate(() => { const p = document.querySelector('.panel__inner'); return p.scrollWidth - p.clientWidth; });
check('panel controls fit the panel width', overflow <= 0, `${overflow}px over`);

// ----- Switch soft tissue to Left -----
await page.click('#soft-side [data-side="left"]');
await settle();
let s = await status([...LEFT_SOFT, ...RIGHT_SOFT, ...BONES, ...MIDLINE_SOFT, ...BILATERAL_MIDLINE]);
check('Left: soft-tissue side button is selected',
  await page.getAttribute('#soft-side [data-side="left"]', 'aria-checked') === 'true'
  && await page.evaluate(() => window.__viewer.visibility.softSide === 'left'));
check('Left: left soft tissue is shown across all systems',
  LEFT_SOFT.every((id) => s[id] === 'shown'), JSON.stringify(s));
check('Left: right soft tissue is filtered out across all systems',
  RIGHT_SOFT.every((id) => s[id] === 'filtered'), JSON.stringify(s));
check('Left: bones on both sides and midline stay shown',
  BONES.every((id) => s[id] === 'shown'), JSON.stringify(s));
check('Left: midline soft tissue stays shown, diaphragm hidden',
  MIDLINE_SOFT.every((id) => s[id] === 'shown') && BILATERAL_MIDLINE.every((id) => s[id] === 'filtered'), JSON.stringify(s));
check('Left: all 10 paired region choosers moved to match (Left)',
  await regionChoosersOn('left') === 10);
check('Left: quick-views side selector moved to match (Left)',
  await page.getAttribute('#preset-side [data-side="left"]', 'aria-checked') === 'true');
await shot('44-soft-tissue-left');

// Ghost outlines do not apply to filtered soft tissue.
await page.check('#option-ghost');
await settle();
check('Left with ghost mode on: filtered right soft tissue is not ghosted',
  (await counts()).ghost === 0);
await page.uncheck('#option-ghost');

// Back view with soft tissue on Left.
await page.click('[data-view="back"]');
await settle();
await shot('46-soft-tissue-left-back');
await page.click('[data-view="reset"]');
await settle();

// ----- Switch soft tissue to Right -----
await page.click('#soft-side [data-side="right"]');
await settle();
s = await status([...LEFT_SOFT, ...RIGHT_SOFT, ...BONES, ...MIDLINE_SOFT, ...BILATERAL_MIDLINE]);
check('Right: soft-tissue side button is selected',
  await page.getAttribute('#soft-side [data-side="right"]', 'aria-checked') === 'true'
  && await page.evaluate(() => window.__viewer.visibility.softSide === 'right'));
check('Right: right soft tissue is shown across all systems',
  RIGHT_SOFT.every((id) => s[id] === 'shown'), JSON.stringify(s));
check('Right: left soft tissue is filtered out across all systems',
  LEFT_SOFT.every((id) => s[id] === 'filtered'), JSON.stringify(s));
check('Right: bones on both sides and midline stay shown',
  BONES.every((id) => s[id] === 'shown'), JSON.stringify(s));
check('Right: midline soft tissue stays shown, diaphragm hidden',
  MIDLINE_SOFT.every((id) => s[id] === 'shown') && BILATERAL_MIDLINE.every((id) => s[id] === 'filtered'), JSON.stringify(s));
check('Right: all 10 paired region choosers moved to match (Right)',
  await regionChoosersOn('right') === 10);
check('Right: quick-views side selector moved to match (Right)',
  await page.getAttribute('#preset-side [data-side="right"]', 'aria-checked') === 'true');
await shot('45-soft-tissue-right');

// ----- Undo and Redo -----
await page.keyboard.press('Control+z');
await settle();
check('Undo (Ctrl+Z) steps back to Left and moves region choosers to Left',
  await page.evaluate(() => window.__viewer.visibility.softSide === 'left')
  && await page.getAttribute('#soft-side [data-side="left"]', 'aria-checked') === 'true'
  && await regionChoosersOn('left') === 10);

await page.keyboard.press('Control+z');
await settle();
check('Undo again steps back to Both and restores all 818 structures',
  await page.evaluate(() => window.__viewer.visibility.softSide === null)
  && (await counts()).shown === total
  && await regionChoosersOn('both') === 10);

await page.keyboard.press('Control+Shift+z');
await settle();
check('Redo (Ctrl+Shift+Z) steps forward to Left',
  await page.evaluate(() => window.__viewer.visibility.softSide === 'left')
  && await regionChoosersOn('left') === 10);

// ----- Region Isolate uses the matched region chooser -----
await page.click('[data-region="knee"] [data-action="isolate"]');
await settle();
s = await status(['ligament_acl_l', 'ligament_acl_r', 'bone_femur_l', 'bone_femur_r']);
check('Isolating knee after switching to Left isolates the left knee',
  s.ligament_acl_l === 'shown' && s.bone_femur_l === 'shown'
  && s.ligament_acl_r === 'filtered' && s.bone_femur_r === 'hidden', JSON.stringify(s));

// ----- Show everything resets soft-tissue side to Both -----
await page.click('#show-everything');
await page.click('[data-view="reset"]');
await settle();
check('"Show everything" resets soft-tissue side to Both and region choosers to Both',
  await page.evaluate(() => window.__viewer.visibility.softSide === null)
  && (await counts()).shown === total
  && await regionChoosersOn('both') === 10);
await shot('47-soft-tissue-both');

// ----- Picking a hidden side structure from search reveals it -----
await page.click('#soft-side [data-side="right"]');
await settle();
check('before search pick: left ACL is filtered out', (await status(['ligament_acl_l'])).ligament_acl_l === 'filtered');
await page.fill('#search', 'acl');
await page.click('[data-result="ligament_acl_l"]');
await settle();
check('picking left ACL from search brings it back and resets soft-tissue side to Both',
  (await status(['ligament_acl_l'])).ligament_acl_l === 'shown'
  && await page.evaluate(() => window.__viewer.visibility.softSide === null)
  && await regionChoosersOn('both') === 10);

console.log(problems.length ? `Console problems:\n  ${problems.join('\n  ')}` : 'No console errors or warnings.');
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed.');
console.log(`Screenshots: ${OUT}`);
await browser.close();
await server.close();
process.exit(failures || problems.length ? 1 : 0);
