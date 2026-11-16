// Check for Stage 4: hover names, click to select, the info card, search,
// medical names and labels mode.
//   npm run check:select
// Drives the real page, takes screenshots into work/screens/ and prints PASS / FAIL lines.
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
const frames = (n = 3) => page.evaluate((count) => new Promise((resolve) => {
  const step = () => (count-- > 0 ? requestAnimationFrame(step) : resolve());
  step();
}), n);
const status = (id) => page.evaluate((x) => {
  const { registry, visibility } = window.__viewer;
  return visibility.statusOf(registry.get(x));
}, id);
const counts = () => page.evaluate(() => {
  let shown = 0, ghost = 0;
  for (const m of window.__viewer.registry.meshes()) { if (m.visible && !m.userData.ghost) shown++; else if (m.visible) ghost++; }
  return { shown, ghost };
});
const region = (name) => `[data-region="${name}"]`;
const act = async (name, side, action) => {
  if (side) await page.click(`${region(name)} [data-side="${side}"]`);
  await page.click(`${region(name)} [data-action="${action}"]`);
  await settle();
};
const showAll = async () => {
  await page.keyboard.press('Escape');
  await page.click('#show-everything');
  await page.click('[data-view="reset"]');
  await settle();
};
const view = async (name) => { await page.click(`[data-view="${name}"]`); await settle(); };
const distance = () => page.evaluate(() => {
  const { rig, stage } = window.__viewer;
  return stage.camera.position.distanceTo(rig.controls.target);
});
/** A point of the page where this structure is the one under the pointer, or null. */
const pointOn = (id) => page.evaluate((x) => {
  const { registry, stage, picker } = window.__viewer;
  const mesh = registry.get(x).mesh;
  const rect = document.getElementById('canvas').getBoundingClientRect();
  const position = mesh.geometry.attributes.position;
  const v = mesh.position.clone();
  const step = Math.max(1, Math.floor(position.count / 600));
  for (let i = 0; i < position.count; i += step) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(stage.camera);
    if (Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.9 || v.z > 1) continue;
    const px = rect.left + (v.x + 1) / 2 * rect.width;
    const py = rect.top + (1 - v.y) / 2 * rect.height;
    if (picker.pick(px, py)?.entry.id === x && picker.pick(px + 2, py)?.entry.id === x) return { x: px, y: py };
  }
  return null;
}, id);
const hoverText = async () => (await page.isVisible('#hover-label') ? (await page.innerText('#hover-name')).trim() : null);
const cardName = async () => (await page.isVisible('#info-card') ? (await page.innerText('#info-name')).trim() : null);
const selectedId = () => page.evaluate(() => window.__viewer.selection.selectedId);
const nameOf = (id) => page.evaluate((x) => window.__viewer.registry.get(x).data.name, id);

/** Hover then click one structure and check the label and the card. */
async function hoverAndClick(id, expectedLabel, file) {
  const at = await pointOn(id);
  check(`${id}: can be pointed at in this view`, !!at);
  if (!at) return;
  await page.mouse.move(at.x - 3, at.y - 3);
  await page.mouse.move(at.x, at.y);
  await frames();
  const label = await hoverText();
  check(`${id}: hover label reads "${expectedLabel}"`, label === expectedLabel, `got "${label}"`);
  check(`${id}: hover outline is on`, await page.evaluate(() => window.__viewer.selection.hoverId) === id);
  await shot(`${file}-hover`);
  await page.mouse.click(at.x, at.y);
  await frames();
  check(`${id}: click selects it and the card shows its name`, await selectedId() === id && await cardName() === await nameOf(id),
    `card "${await cardName()}"`);
  await page.mouse.move(at.x + 140, at.y + 60);
  await frames();
  await shot(`${file}-selected`);
}

await page.goto(url);
await page.waitForFunction(() => window.__viewer?.stats.allLoadedAt, null, { timeout: 120000 });
await settle();
await page.waitForFunction(() => window.__viewer.picker.pending === 0, null, { timeout: 60000 });
const total = (await counts()).shown;
check('everything shown at the start', total === 817, `${total} structures`);
check('nothing selected at the start', await cardName() === null && await page.isVisible('#info-empty'));

// ----- Speed of the hit test on the whole body -----
const pickMs = await page.evaluate(() => {
  const rect = document.getElementById('canvas').getBoundingClientRect();
  const { picker } = window.__viewer;
  const started = performance.now();
  let hits = 0;
  for (let i = 0; i < 200; i++) {
    const x = rect.left + rect.width * (0.4 + 0.2 * ((i * 37) % 100) / 100);
    const y = rect.top + rect.height * (0.1 + 0.8 * ((i * 53) % 100) / 100);
    if (picker.pick(x, y)) hits++;
  }
  return { ms: (performance.now() - started) / 200, hits };
});
check('hit test on the whole body is fast', pickMs.ms < 4 && pickMs.hits > 20, `${pickMs.ms.toFixed(2)} ms each, ${pickMs.hits}/200 hit`);

// ----- Achilles tendon: whole body, from behind -----
await view('back');
await page.evaluate(() => {
  const { rig, visibility } = window.__viewer;
  rig.frame(visibility.frameBox('lower leg', ['left']), { view: 'back' });
});
await settle();
await hoverAndClick('tendon_achilles_l', 'Achilles tendon – left', '20-achilles');
check('card: side, system and regions', (await page.innerText('#info-side')) === 'Left'
  && (await page.innerText('#info-system')) === 'Tendons'
  && (await page.innerText('#info-regions')) === 'Lower leg, Ankle and foot',
  `${await page.innerText('#info-side')} | ${await page.innerText('#info-system')} | ${await page.innerText('#info-regions')}`);

// ----- Esc and empty space deselect -----
await page.keyboard.press('Escape');
check('Esc deselects', await selectedId() === null && await page.isVisible('#info-empty'));
let at = await pointOn('tendon_achilles_l');
await page.mouse.click(at.x, at.y);
check('click selects again', await selectedId() === 'tendon_achilles_l');
const box = await page.locator('#canvas').boundingBox();
await page.mouse.click(box.x + box.width - 30, box.y + 120);
check('click on empty space deselects', await selectedId() === null);
await page.mouse.move(at.x, at.y);
await page.mouse.down();
await page.mouse.move(at.x + 60, at.y + 10, { steps: 4 });
await page.mouse.up();
check('dragging to rotate does not select', await selectedId() === null);

// ----- ACL: left knee isolated, muscles and bursae off, from behind -----
await showAll();
await act('knee', 'left', 'isolate');
await page.uncheck('[data-system="muscle"]');
await page.uncheck('[data-system="bursa"]');
await page.evaluate(() => {
  const { rig, visibility } = window.__viewer;
  rig.frame(visibility.frameBox('knee', ['left']), { view: 'back' });
});
await settle();
await hoverAndClick('ligament_acl_l', 'Anterior cruciate ligament (ACL) – left knee', '21-acl');

// ----- Hover ignores hidden structures and ghosts -----
await page.check('#option-ghost');
await frames();
const ghostHit = await page.evaluate(() => {
  // Sweep the right leg (ghosted): nothing there may answer.
  const { registry, stage, picker } = window.__viewer;
  const rect = document.getElementById('canvas').getBoundingClientRect();
  const mesh = registry.get('bone_femur_r').mesh;
  const v = mesh.position.clone();
  const position = mesh.geometry.attributes.position;
  let tested = 0, hit = 0;
  for (let i = 0; i < position.count; i += Math.ceil(position.count / 300)) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(stage.camera);
    if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
    tested++;
    const found = picker.pick(rect.left + (v.x + 1) / 2 * rect.width, rect.top + (1 - v.y) / 2 * rect.height);
    if (found && found.entry.data.side === 'right') hit++;
  }
  return { tested, hit, ghost: mesh.userData.ghost === true };
});
check('ghosted structures are ignored by hover and click', ghostHit.ghost && ghostHit.hit === 0, JSON.stringify(ghostHit));
await page.uncheck('#option-ghost');
check('hidden structures are ignored (muscles unticked)', await pointOn('muscle_vastus_lateralis_l') === null);

// ----- Hide this, with Undo -----
await page.click('#info-hide');
check('"Hide this" hides the one structure', await status('ligament_acl_l') === 'filtered' && await status('ligament_pcl_l') === 'shown');
check('card offers "Show this" and says it is hidden',
  (await page.innerText('#info-hide')) === 'Show this' && await page.isVisible('#info-state'));
await page.keyboard.press('Control+z');
check('Undo brings it back', await status('ligament_acl_l') === 'shown' && (await page.innerText('#info-hide')) === 'Hide this');
await page.keyboard.press('Control+Shift+z');
check('Redo hides it again', await status('ligament_acl_l') === 'filtered');
await page.click('#info-hide');
check('"Show this" shows it again', await status('ligament_acl_l') === 'shown');

// ----- Isolate this -----
await page.click('#info-isolate');
await settle();
let c = await counts();
check('"Isolate this" shows only that structure, the rest as faint outlines', c.shown === 1 && c.ghost === total - 1, JSON.stringify(c));
check('the panel says what is showing', (await page.innerText('#only-name')).includes(await nameOf('ligament_acl_l')));
await shot('22-acl-isolated');
await page.click('#undo');
c = await counts();
check('Undo ends "Isolate this" and returns to the knee view', c.ghost === 0 && await status('ligament_acl_l') === 'shown'
  && await status('bone_humerus_l') === 'hidden', JSON.stringify(c));
await page.click('#redo');
await page.click('#info-isolate');
check('pressing "Isolate this" again ends it', (await counts()).ghost === 0 && !(await page.isVisible('#only-note')));
await page.click('#info-isolate');
await page.click('#show-everything');
check('"Show everything" ends it too', (await counts()).shown === total);

// ----- Zoom to this -----
await view('reset');
const far = await distance();
await page.click('#info-zoom');
await settle();
check('"Zoom to this" moves the camera to the structure', (await distance()) < far / 5, `${far.toFixed(2)} m -> ${(await distance()).toFixed(2)} m`);

// ----- Supraspinatus: rotator cuff quick view -----
await showAll();
await page.click('#preset-side [data-side="right"]');
await page.locator('.preset').nth(1).click();
await settle();
await hoverAndClick('muscle_supraspinatus_r', `${await nameOf('muscle_supraspinatus_r')} – right shoulder`, '23-supraspinatus');

// ----- Sciatic nerve: muscles off, from behind -----
await showAll();
await page.uncheck('[data-system="muscle"]');
await page.evaluate(() => {
  const { rig, visibility } = window.__viewer;
  rig.frame(visibility.frameBox('thigh', ['left']), { view: 'back' });
});
await settle();
await hoverAndClick('nerve_sciatic_l', 'Sciatic nerve – left', '24-sciatic');

// ----- Medical names -----
await page.check('#option-medical');
at = await pointOn('nerve_sciatic_l');
await page.mouse.move(at.x, at.y);
await frames();
check('medical names on: shown in the hover label and on the card',
  await page.isVisible('#hover-medical') && (await page.innerText('#hover-medical')).trim() === 'Nervus ischiadicus'
  && (await page.innerText('#info-medical')).trim() === 'Nervus ischiadicus');
await shot('25-medical-names');
await page.uncheck('#option-medical');
await page.mouse.move(at.x + 1, at.y);
await frames();
check('medical names off (the default): not shown', !(await page.isVisible('#hover-medical')) && !(await page.isVisible('#info-medical')));

// ----- Search -----
await showAll();
const results = async (query) => {
  await page.fill('#search', query);
  return page.locator('#search-results .search__name').allInnerTexts();
};
let found = await results('acl');
check('search "acl" finds the ACL first', found[0] === await nameOf('ligament_acl_l'), found.join(' | '));
await shot('26-search-acl');
found = await results('achillies');
check('search "achillies" (typo) finds the Achilles tendon', found[0] === 'Achilles tendon', found.join(' | '));
found = await results('rotator');
check('search "rotator" lists the rotator cuff', found.length >= 4 && found.every((n) => /rotator/i.test(n)), found.join(' | '));
await shot('27-search-rotator');
for (const [query, id] of [['mcl', 'ligament_mcl_l'], ['atfl', 'ligament_atfl_l'], ['itb', 'tendon_itb_l'], ['ischiadicus', 'nerve_sciatic_l']]) {
  found = await results(query);
  check(`search "${query}" finds ${id}`, found[0] === await nameOf(id), found.join(' | '));
}
found = await results('zzzz');
check('search with no match says so', found.length === 0 && await page.isVisible('.search__none'));

// Pick a result while the structure is hidden: it must come back, be selected and be zoomed to.
await act('knee', 'both', 'hide');
await page.uncheck('[data-system="ligament"]');
await view('reset');
check('before picking: the ACL is hidden', await status('ligament_acl_l') !== 'shown');
const before = await distance();
await page.fill('#search', 'acl');
await page.click('[data-result="ligament_acl_l"]');
await settle();
check('picking a search result selects it, shows it and zooms to it',
  await selectedId() === 'ligament_acl_l' && await status('ligament_acl_l') === 'shown' && (await distance()) < before / 5,
  `${before.toFixed(2)} m -> ${(await distance()).toFixed(2)} m`);
check('the search box is cleared after picking', (await page.inputValue('#search')) === '' && !(await page.isVisible('#search-results')));
await shot('28-search-pick-acl');
await page.fill('#search', 'achillies');
await page.keyboard.press('Enter');
await settle();
check('Enter picks the first result', (await selectedId())?.startsWith('tendon_achilles_'));
await page.fill('#search', 'acl');
await page.keyboard.press('Escape');
check('Esc in the search box clears the search but keeps the selection',
  (await page.inputValue('#search')) === '' && (await selectedId())?.startsWith('tendon_achilles_'));

// ----- Labels mode -----
await showAll();
await page.click('#preset-side [data-side="left"]');
await page.locator('.preset').nth(0).click();          // knee ligaments, left
await settle();
await page.check('#option-labels');
await frames(4);
let labelCount = await page.evaluate(() => window.__viewer.labels.count);
check('labels mode: labels shown for the isolated region', labelCount > 5, `${labelCount} labels`);
const overlaps = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.labels__label')].map((n) => n.getBoundingClientRect());
  let n = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.left < b.right && b.left < a.right && a.top < b.bottom - 1 && b.top < a.bottom - 1) n++;
  }
  return n;
});
check('labels do not overlap each other', overlaps === 0, `${overlaps} overlapping pairs`);
await shot('29-labels-knee');
await page.click('[data-label="ligament_pcl_l"]');
check('clicking a label selects that structure', await selectedId() === 'ligament_pcl_l');
await frames(4);
await shot('29b-labels-knee-selected');
await page.keyboard.press('Escape');
await page.click('#show-everything');
await act('knee', 'right', 'isolate');                 // every system on: the busiest case
await frames(4);
const busy = await page.evaluate(() => ({ count: window.__viewer.labels.count, note: document.getElementById('labels-note').hidden ? '' : document.getElementById('labels-note').textContent }));
check('labels mode, whole knee with muscles: capped, with a note if any are left out', busy.count > 10 && busy.count <= 60, JSON.stringify(busy));
await shot('29c-labels-knee-all-systems');
await page.keyboard.press('Escape');
await page.click('#show-everything');
await frames(4);
labelCount = await page.evaluate(() => window.__viewer.labels.count);
check('labels mode with nothing isolated: no labels, and a note says why', labelCount === 0 && await page.isVisible('#labels-note'));
await page.uncheck('#option-labels');

// ----- Frame rate with a selection outline, whole body -----
await showAll();
await page.fill('#search', 'achillies');
await page.keyboard.press('Enter');
await settle();
await view('reset');
const fps = await page.evaluate(() => new Promise((resolve) => {
  const { rig, requestRender } = window.__viewer;
  const times = [];
  let last = performance.now();
  const step = (now) => {
    times.push(now - last); last = now;
    rig.controls.rotateLeft?.(0.02);
    rig.controls.update(); requestRender();
    if (times.length < 150) requestAnimationFrame(step);
    else { times.sort((a, b) => a - b); resolve(1000 / times[Math.floor(times.length / 2)]); }
  };
  requestAnimationFrame(step);
}));
check('redrawing with a selection outline stays smooth', fps > 45, `${fps.toFixed(0)} frames per second`);
await shot('30-whole-body-selected');

console.log(problems.length ? `Console problems:\n  ${problems.join('\n  ')}` : 'No console errors or warnings.');
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed.');
console.log(`Screenshots: ${OUT}`);
await browser.close();
await server.close();
process.exit(failures || problems.length ? 1 : 0);
