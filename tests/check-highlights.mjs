// Check for Stage 5: injury highlights, the highlight list, fading everything
// else, shaded pain areas, presentation view and Save image.
//   npm run check:highlights
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
const VIEW = { width: 1440, height: 810 };
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
const problems = [];
const requests = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));

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
const marks = () => page.evaluate(() => Object.fromEntries(window.__viewer.visibility.highlights().map((h) => [h.id, h.colour])));
const materialOf = (id) => page.evaluate((x) => window.__viewer.registry.get(x).mesh.material.name, id);
const selectedId = () => page.evaluate(() => window.__viewer.selection.selectedId);
const listRows = () => page.locator('#highlight-list .marks__row').count();
const pick = async (query, id) => {
  await page.fill('#search', query);
  await page.click(`[data-result="${id}"]`);
  await settle();
};
const frameKnee = async (view) => {
  await page.evaluate((v) => {
    const { rig, visibility } = window.__viewer;
    rig.frame(visibility.frameBox('knee', ['left']), { view: v });
  }, view);
  await settle();
};
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
    if (Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.8 || v.z > 1) continue;
    const px = rect.left + (v.x + 1) / 2 * rect.width;
    const py = rect.top + (1 - v.y) / 2 * rect.height;
    if (picker.pick(px, py)?.entry.id === x && picker.pick(px + 2, py)?.entry.id === x) return { x: px, y: py };
  }
  return null;
}, id);
/** Size of a PNG file, read from its header. */
const pngSize = (file) => {
  const data = fs.readFileSync(file);
  const isPng = data.subarray(1, 4).toString() === 'PNG';
  return { isPng, width: data.readUInt32BE(16), height: data.readUInt32BE(20), bytes: data.length };
};

const ACL = 'ligament_acl_l';
const MCL = 'ligament_mcl_l';
const MENISCUS = 'cartilage_meniscus_medial_l';

await page.goto(url);
await page.waitForFunction(() => window.__viewer?.stats.allLoadedAt, null, { timeout: 120000 });
await settle();
await page.waitForFunction(() => window.__viewer.picker.pending === 0, null, { timeout: 60000 });

check('no highlights at the start; "Clear all highlights" is greyed out',
  Object.keys(await marks()).length === 0 && await page.isDisabled('#highlights-clear'));
const names = await page.locator('.palette__name').evaluateAll((nodes) => nodes.map((n) => n.value));
check('palette: four colours with plain-English meanings', names.length === 4 && names[0] === 'Injured', names.join(' | '));

// ----- Left knee, ligaments view -----
await page.click('#preset-side [data-side="left"]');
await page.locator('.preset').nth(0).click();
await settle();

// ACL red, from the info card.
await pick('acl', ACL);
await page.click('#info-swatches [data-colour="red"]');
check('info card: one click marks the ACL red', (await marks())[ACL] === 'red' && await materialOf(ACL) === 'mat_highlight_red');
check('the knee view is kept when a highlight is added',
  await page.evaluate(() => window.__viewer.visibility.isolated?.region) === 'knee');

// MCL amber, from the right-click menu.
await frameKnee('front');
let at = await pointOn(MCL);
check('MCL can be pointed at from the front', !!at);
await page.mouse.click(at.x, at.y, { button: 'right' });
check('right-click opens a menu for that structure and selects it',
  await page.isVisible('#menu') && (await page.innerText('.menu__title')).includes('MCL') && await selectedId() === MCL,
  await page.isVisible('#menu') ? await page.innerText('.menu__title') : 'no menu');
await shot('31-right-click-menu');
await page.click('#menu [data-menu-colour="amber"]');
check('menu: marks the MCL amber and closes', (await marks())[MCL] === 'amber' && !(await page.isVisible('#menu')));

// Right-drag still moves the model and opens no menu.
const targetBefore = await page.evaluate(() => window.__viewer.rig.controls.target.toArray());
await page.mouse.move(at.x, at.y);
await page.mouse.down({ button: 'right' });
await page.mouse.move(at.x + 80, at.y + 30, { steps: 5 });
await page.mouse.up({ button: 'right' });
await frames(4);
const targetAfter = await page.evaluate(() => window.__viewer.rig.controls.target.toArray());
check('right-drag still moves the model and opens no menu',
  !(await page.isVisible('#menu')) && targetBefore.some((v, i) => Math.abs(v - targetAfter[i]) > 1e-4));

// Medial meniscus amber, from the palette in the panel.
await pick('medial meniscus', MENISCUS);
await page.click('#palette [data-colour="amber"]');
check('palette: marks the medial meniscus amber', (await marks())[MENISCUS] === 'amber');
check('three structures highlighted in two colours at once',
  JSON.stringify(await marks()) === JSON.stringify({ [ACL]: 'red', [MCL]: 'amber', [MENISCUS]: 'amber' }), JSON.stringify(await marks()));

// The list.
check('highlight list shows three rows', await listRows() === 3);
const rowText = await page.locator('#highlight-list .marks__row').first().innerText();
check('a row gives the name, side and meaning', /ACL/.test(rowText) && /left knee/.test(rowText) && /Injured/.test(rowText), rowText.replace(/\n/g, ' / '));

await page.keyboard.press('Escape');
await frameKnee('front');
await shot('32-knee-front-highlights');
await frameKnee('back');
await shot('33-knee-back-highlights');

// ----- Emphasis: fade everything else -----
await page.check('#option-emphasis');
await frames();
check('emphasis on: other structures are faded, highlighted ones keep their colour',
  await materialOf('bone_femur_l') === 'mat_fade' && await materialOf(ACL) === 'mat_highlight_red' && await materialOf(MCL) === 'mat_highlight_amber');
await shot('34-knee-back-emphasis');
await frameKnee('front');
await shot('35-knee-front-emphasis');
at = await pointOn(MCL);
check('faded view: structures can still be pointed at', !!at);

// Whole leg with muscles, to see highlights through what lies in front.
await page.click('#show-everything');
check('"Show everything" keeps the highlights', Object.keys(await marks()).length === 3);
await frameKnee('front');
await shot('36-knee-muscles-on-emphasis');
await page.uncheck('#option-emphasis');
await frames();
check('emphasis off: normal colours return', await materialOf('bone_femur_l') === 'mat_bone');
await shot('37-knee-muscles-on-highlights');
await page.click('[data-view="reset"]');
await settle();
await shot('38-whole-body-highlights');

// ----- Same colour again removes; Undo / Redo -----
await pick('acl', ACL);
check('the ACL\'s red button shows as pressed', await page.getAttribute('#info-swatches [data-colour="red"]', 'aria-pressed') === 'true');
await page.click('#info-swatches [data-colour="red"]');
check('same colour again removes the highlight', !(ACL in await marks()) && await listRows() === 2);
await page.keyboard.press('Control+z');
check('Undo brings the highlight back', (await marks())[ACL] === 'red');
await page.keyboard.press('Control+Shift+z');
check('Redo removes it again', !(ACL in await marks()));
await page.click('#undo');
await page.click('#info-swatches [data-colour="green"]');
check('a different colour replaces the first', (await marks())[ACL] === 'green' && await listRows() === 3);
await page.click('#undo');
check('Undo returns it to red', (await marks())[ACL] === 'red');

// ----- The list: jump and remove -----
await page.keyboard.press('Escape');
await page.click(`[data-jump="${MCL}"]`);
await settle();
check('clicking a row selects that structure and goes to it', await selectedId() === MCL);
await page.click(`[data-remove="${MENISCUS}"]`);
check('× removes one highlight', !(MENISCUS in await marks()) && await listRows() === 2);
await page.click('#undo');

// Hidden structure stays in the list and comes back when clicked.
await page.uncheck('[data-system="ligament"]');
check('a hidden highlighted structure stays listed and says it is hidden',
  await listRows() === 3 && /hidden/.test(await page.locator(`[data-jump="${ACL}"]`).innerText()));
await page.click(`[data-jump="${ACL}"]`);
await settle();
check('clicking it brings the structure back', await page.evaluate((x) => {
  const { registry, visibility } = window.__viewer;
  return visibility.statusOf(registry.get(x));
}, ACL) === 'shown');

// ----- Clear all -----
await page.click('#highlights-clear');
check('"Clear all highlights" removes every highlight', Object.keys(await marks()).length === 0 && await listRows() === 0
  && await materialOf(ACL) === 'mat_ligament');
await page.click('#undo');
check('Undo brings them all back', Object.keys(await marks()).length === 3);

// ----- Editable meanings -----
await page.fill('[data-colour-name="amber"]', 'Under strain');
check('renaming a colour updates the list', /Under strain/.test(await page.locator(`[data-jump="${MCL}"]`).innerText()));

// ----- Shaded pain area -----
await page.keyboard.press('Escape');
await page.click('#show-everything');
await frameKnee('left');
await page.click('#spot-colours [data-colour="blue"]');
await page.click('#spot-add');
check('pain area: the panel says what to do next', await page.isVisible('#spot-hint'));
at = await pointOn('muscle_vastus_lateralis_l') ?? await pointOn('tendon_itb_l');
const selectedBefore = await selectedId();
await page.mouse.click(at.x, at.y);
await frames();
let spots = await page.evaluate(() => window.__viewer.visibility.spots());
check('clicking the model places one pain area and does not change the selection',
  spots.length === 1 && spots[0].colour === 'blue' && Math.abs(spots[0].r - 0.05) < 1e-6 && await selectedId() === selectedBefore, JSON.stringify(spots));
check('it is listed with the highlights', await listRows() === 4);
await page.mouse.move(at.x + 300, at.y);
await shot('39-pain-area');
await page.click('#undo');
check('Undo removes the pain area', (await page.evaluate(() => window.__viewer.visibility.spots())).length === 0);
await page.click('#redo');
await page.click('#spot-add');
await page.keyboard.press('Escape');
check('Esc cancels placing a pain area', !(await page.isVisible('#spot-hint')));
await page.click('[data-remove-spot="0"]');
check('× removes the pain area', (await page.evaluate(() => window.__viewer.visibility.spots())).length === 0);

// ----- Presentation view -----
await page.locator('.preset').nth(0).click();          // knee ligaments, left
await settle();
await frameKnee('front');
await pick('acl', ACL);
await frameKnee('front');
await page.keyboard.press('p');
await settle();
const hiddenInPresentation = async () => page.evaluate(() => {
  const gone = (sel) => { const n = document.querySelector(sel); const r = n.getBoundingClientRect(); return getComputedStyle(n).display === 'none' || getComputedStyle(n).visibility === 'hidden' || r.width === 0; };
  return ['#panel', '#panel-toggle', '.views', '.tools'].map(gone);
});
check('P: panels and buttons are hidden', (await hiddenInPresentation()).every(Boolean), JSON.stringify(await hiddenInPresentation()));
const keyText = (await page.locator('#key-list li').allInnerTexts()).join(' | ');
check('the colour key lists only the colours in use, with their current meanings',
  await page.isVisible('#key') && keyText === 'Injured | Under strain', keyText);
check('the credit line is still shown', await page.isVisible('.footer') && /Z-Anatomy/.test(await page.innerText('.footer')));
check('the model fills the width', (await page.locator('#canvas').boundingBox()).width === VIEW.width);
await page.waitForTimeout(3300);
check('the "press P or Esc" note fades away', !(await page.isVisible('#present-hint')));
await shot('40-presentation');

// Save image (S in presentation view).
const saved = path.join(OUT, '41-saved-image-presentation.png');
let [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('s')]);
await download.saveAs(saved);
let size = pngSize(saved);
const canvasBox = await page.locator('#canvas').boundingBox();
check('Save image downloads a PNG at twice the on-screen size',
  size.isPng && size.width === Math.round(canvasBox.width) * 2 && size.height === Math.round(canvasBox.height) * 2 && /^anatomy-model-.*\.png$/.test(download.suggestedFilename()),
  `${size.width} x ${size.height}, ${(size.bytes / 1024).toFixed(0)} KB, ${download.suggestedFilename()}`);
check('the view on screen is unchanged after saving',
  await page.evaluate(() => window.__viewer.stage.renderer.getPixelRatio()) === 1 && await page.evaluate(() => window.__viewer.presentation.presenting));

await page.keyboard.press('Escape');
await settle();
check('Esc leaves presentation view and keeps the selection',
  !(await page.evaluate(() => window.__viewer.presentation.presenting)) && await page.isVisible('#panel') && await selectedId() === ACL);
await page.click('#present');
check('the button enters presentation view too', await page.evaluate(() => window.__viewer.presentation.presenting));
await page.keyboard.press('p');
check('P returns', !(await page.evaluate(() => window.__viewer.presentation.presenting)));
await page.fill('#search', 'p');
check('typing "p" in the search box does not start presentation view', !(await page.evaluate(() => window.__viewer.presentation.presenting)));
await page.fill('#search', '');
await settle();

// Save image from the normal view, with emphasis on and the key switched off.
await page.keyboard.press('Escape');
await page.check('#option-emphasis');
await page.uncheck('#option-key');
await frames();
const savedPlain = path.join(OUT, '42-saved-image-emphasis-no-key.png');
[download] = await Promise.all([page.waitForEvent('download'), page.click('#save-image')]);
await download.saveAs(savedPlain);
size = pngSize(savedPlain);
const box2 = await page.locator('#canvas').boundingBox();
check('Save image works from the normal view (model area only, twice the size)',
  size.isPng && size.width === Math.round(box2.width) * 2 && size.height === Math.round(box2.height) * 2, `${size.width} x ${size.height}`);
await page.check('#option-key');
await page.uncheck('#option-emphasis');

// ----- Frame rate with highlights and emphasis, whole body -----
await page.click('#show-everything');
await page.click('[data-view="reset"]');
await settle();
const measure = () => page.evaluate(() => new Promise((resolve) => {
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
let fps = await measure();
check('whole body with three highlights stays smooth', fps > 45, `${fps.toFixed(0)} frames per second`);
await page.check('#option-emphasis');
fps = await measure();
check('whole body with everything else faded stays smooth', fps > 30, `${fps.toFixed(0)} frames per second`);
await shot('43-whole-body-emphasis');
await page.uncheck('#option-emphasis');

// ----- Privacy -----
const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }));
check('nothing is stored: no localStorage, sessionStorage or cookies',
  stored.local === 0 && stored.session === 0 && stored.cookies === '' && (await context.cookies()).length === 0, JSON.stringify(stored));
const origin = new URL(url).origin;
const outside = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
const sent = requests.filter((r) => r.method !== 'GET');
check('nothing is sent anywhere: no requests to other sites and no uploads', outside.length === 0 && sent.length === 0,
  [...outside, ...sent].map((r) => `${r.method} ${r.url}`).join(', '));
await page.reload();
await page.waitForFunction(() => window.__viewer?.stats.allLoadedAt, null, { timeout: 120000 });
check('highlights and reworded meanings are gone after a refresh',
  Object.keys(await marks()).length === 0 && (await page.inputValue('[data-colour-name="amber"]')) === 'Affected / under strain');

console.log(problems.length ? `Console problems:\n  ${problems.join('\n  ')}` : 'No console errors or warnings.');
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed.');
console.log(`Screenshots: ${OUT}`);
await browser.close();
await server.close();
process.exit(failures || problems.length ? 1 : 0);
