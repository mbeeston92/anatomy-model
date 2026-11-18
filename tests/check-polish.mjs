// Check for Stage 7: workflow polish, keyboard shortcuts, help overlay,
// colour-blind highlight patterns, saved labels, accessibility and WebGL fallback.
//   npm.cmd run check:polish
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
const context = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
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
const frames = (n = 3) => page.evaluate((count) => new Promise((resolve) => {
  const step = () => (count-- > 0 ? requestAnimationFrame(step) : resolve());
  step();
}), n);
const pngSize = (file) => {
  const data = fs.readFileSync(file);
  return { isPng: data.subarray(1, 4).toString() === 'PNG', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
};

await page.goto(url);
await page.waitForFunction(() => window.__viewer?.stats.allLoadedAt, null, { timeout: 120000 });
await settle();

// ----- Panel layout & accessibility labels -----
const overflow = await page.evaluate(() => { const p = document.querySelector('.panel__inner'); return p.scrollWidth - p.clientWidth; });
check('panel controls fit the panel width with larger trackpad targets', overflow <= 0, `${overflow}px over`);

const unlabelled = await page.evaluate(() => {
  const bad = [];
  for (const node of document.querySelectorAll('button, input')) {
    if (node.closest('[hidden]')) continue;
    const text = (node.textContent || '').trim();
    const aria = node.getAttribute('aria-label') || node.getAttribute('aria-labelledby');
    const wrapped = node.closest('label');
    const byId = node.id ? document.querySelector(`label[for="${node.id}"]`) : null;
    if (!text && !aria && !wrapped && !byId) bad.push(node.outerHTML.slice(0, 80));
  }
  return bad;
});
check('every visible button and input has an accessible label', unlabelled.length === 0, unlabelled.join(' | '));

// ----- Collapsible panel sections -----
await page.click('#highlights-heading .section__toggle');
check('Highlights section collapses cleanly', await page.locator('#highlights-body').isHidden());
await page.click('#highlights-heading .section__toggle');
check('Highlights section expands back', await page.locator('#highlights-body').isVisible());
await page.click('#quick-views-heading .section__toggle');
check('Quick views section collapses cleanly', await page.locator('#presets').isHidden());
await page.click('#quick-views-heading .section__toggle');
check('Quick views section expands back', await page.locator('#presets').isVisible());

// ----- Quick view syncs the isolated region row -----
await page.click('#preset-side [data-side="left"]');
await page.locator('.preset').nth(0).click();   // Knee - ligaments, left
await settle();
check('Quick view syncs the isolated region row chooser to Left and marks Isolate as pressed',
  await page.getAttribute('[data-region="knee"] [data-side="left"]', 'aria-checked') === 'true'
  && await page.getAttribute('[data-region="knee"] [data-action="isolate"]', 'aria-pressed') === 'true');

// ----- Keyboard shortcuts: 1-5, R, A, C, ? -----
const viewTests = [['2', 'back'], ['3', 'left'], ['4', 'right'], ['5', 'top'], ['1', 'front']];
for (const [key, expected] of viewTests) {
  await page.keyboard.press(key);
  await settle();
  check(`key "${key}" switches to ${expected} view`,
    await page.evaluate(() => window.__viewer.rig.currentView) === expected);
}
await page.keyboard.press('r');
await settle();
check('key "R" resets to front whole-body view',
  await page.evaluate(() => window.__viewer.rig.currentView) === 'front');

await page.keyboard.press('a');
await settle();
check('key "A" shows everything',
  await page.evaluate(() => window.__viewer.visibility.isDefault));

// Shortcuts do not fire while typing in search.
await page.fill('#search', 'r');
check('typing "r" in search does not clear the input or break typing',
  (await page.inputValue('#search')) === 'r');
await page.keyboard.press('Escape');

// ----- Help overlay (?) -----
await page.click('#help-open');
check('clicking "?" opens the help overlay with the 30-second guide',
  await page.isVisible('#help-dialog') && (await page.locator('.guide li').count()) === 4);
await shot('48-help-overlay');
await page.keyboard.press('Escape');
check('Esc closes the help overlay', !(await page.isVisible('#help-dialog')));
await page.keyboard.press('Shift+?');
check('pressing "?" opens the help overlay', await page.isVisible('#help-dialog'));
await page.keyboard.press('Shift+?');
check('pressing "?" again closes the help overlay', !(await page.isVisible('#help-dialog')));

// ----- Colour-blind patterns (4 distinct highlights in the knee) -----
await page.click('#preset-side [data-side="left"]');
await page.locator('.preset').nth(0).click();   // Knee - ligaments, left
await settle();
await page.evaluate(() => {
  const { visibility, rig } = window.__viewer;
  visibility.setHighlight('ligament_acl_l', 'red');
  visibility.setHighlight('ligament_mcl_l', 'amber');
  visibility.setHighlight('cartilage_meniscus_medial_l', 'green');
  visibility.setHighlight('ligament_lcl_l', 'blue');
  rig.frame(visibility.frameBox('knee', ['left']), { view: 'front' });
});
await settle();
const patterns = await page.locator('#palette .swatch').evaluateAll((nodes) => nodes.map((n) => n.dataset.pattern));
check('four distinct highlight patterns for colour-blind accessibility',
  patterns.join(',') === 'solid,dashed,dotted,double', patterns.join(','));
await shot('49-colourblind-patterns');

// Clear highlights with C shortcut.
await page.keyboard.press('c');
await frames();
check('key "C" clears all highlights',
  (await page.evaluate(() => window.__viewer.visibility.highlights().length)) === 0);

// ----- Save image includes visible floating labels -----
await page.check('#option-labels');
await frames(4);
const labelCount = await page.evaluate(() => window.__viewer.labels.count);
check('labels mode shows floating labels on the isolated knee', labelCount > 5, `${labelCount} labels`);
const savedLabels = path.join(OUT, '50-saved-image-with-labels.png');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save-image')]);
await download.saveAs(savedLabels);
const size = pngSize(savedLabels);
check('Save image with labels mode produces a valid 2x PNG', size.isPng && size.width > 1500, `${size.width} x ${size.height}`);
await page.uncheck('#option-labels');

// ----- Selecting a structure keeps search box in sight when scrolled down -----
await page.evaluate(() => { document.querySelector('.panel__inner').scrollTop = 400; });
await page.evaluate(() => window.__viewer.selection.select('ligament_acl_l'));
await frames();
const scrollAfter = await page.evaluate(() => document.querySelector('.panel__inner').scrollTop);
check('selecting a structure brings the search box and info card back into view', scrollAfter === 0, `scrollTop=${scrollAfter}`);

// ----- WebGL unavailable friendly fallback -----
const noGlPage = await context.newPage();
await noGlPage.addInitScript(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (/webgl/i.test(type)) return null;
    return orig.call(this, type, ...args);
  };
});
await noGlPage.goto(url);
await noGlPage.waitForSelector('#error:not([hidden])', { timeout: 15000 });
const fallbackTitle = await noGlPage.innerText('#error-title');
const retryHidden = await noGlPage.locator('#error-retry').isHidden();
check('WebGL unavailable shows a friendly message and hides Retry',
  /cannot show the 3D model/i.test(fallbackTitle) && retryHidden, fallbackTitle);
await noGlPage.screenshot({ path: path.join(OUT, '51-webgl-fallback.png') });
await noGlPage.close();

console.log(problems.length ? `Console problems:\n  ${problems.join('\n  ')}` : 'No console errors or warnings.');
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed.');
console.log(`Screenshots: ${OUT}`);
await browser.close();
await server.close();
process.exit(failures || problems.length ? 1 : 0);
