// Check for Common injuries demonstrations (public/data/injuries.json).
//   npm.cmd run check:injuries
// Clicks every injury preset, verifies every highlighted structure is actually shown
// with zero console warnings, checks Left/Right switching and Undo/Redo, and takes screenshots.
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

await page.goto(url);
await page.waitForFunction(() => window.__viewer?.stats.allLoadedAt, null, { timeout: 120000 });
await settle();

const injuryIds = await page.locator('#injuries .injury').evaluateAll((nodes) => nodes.map((n) => n.dataset.injury));
check('12 common injuries listed', injuryIds.length === 12, injuryIds.join(', '));
const overflow = await page.evaluate(() => { const p = document.querySelector('.panel__inner'); return p.scrollWidth - p.clientWidth; });
check('panel controls fit the panel width', overflow <= 0, `${overflow}px over`);

// ----- Test every injury preset on the Right side -----
const SHOTS = {
  'disc-herniation': '56-injury-disc-herniation',
  'rotator-cuff': '57-injury-rotator-cuff',
  'hamstring-strain': '58-injury-hamstring-strain',
  'calf-strain': '59-injury-calf-strain',
};

for (const id of injuryIds) {
  await page.click(`[data-injury="${id}"]`);
  await settle();
  const state = await page.evaluate(() => {
    const { registry, visibility } = window.__viewer;
    const marks = visibility.highlights();
    const statuses = marks.map(({ id: sid, colour }) => ({
      id: sid,
      colour,
      status: visibility.statusOf(registry.get(sid)),
    }));
    return {
      count: marks.length,
      hasRed: marks.some((m) => m.colour === 'red'),
      hasAmber: marks.some((m) => m.colour === 'amber'),
      allShown: statuses.every((s) => s.status === 'shown'),
      hiddenMarks: statuses.filter((s) => s.status !== 'shown'),
      note: document.getElementById('injury-note').hidden ? '' : document.getElementById('injury-note').textContent.trim(),
    };
  });
  const active = await page.getAttribute(`[data-injury="${id}"]`, 'aria-pressed') === 'true';
  check(`injury "${id}" (right): active, all ${state.count} highlights shown, note displayed`,
    active && state.hasRed && state.hasAmber && state.allShown && state.note.length > 20,
    state.hiddenMarks.length ? `hidden: ${JSON.stringify(state.hiddenMarks)}` : `${state.count} highlights`);
  if (SHOTS[id]) await shot(SHOTS[id]);
}

// ----- Left side check (ACL tear & Achilles tendinopathy) -----
await page.click('#injury-side [data-side="left"]');
await page.click('[data-injury="acl-tear"]');
await settle();
let leftMarks = await page.evaluate(() => window.__viewer.visibility.highlights().map((h) => `${h.id}:${h.colour}`));
check('ACL tear on Left highlights left ACL (red) and left menisci (amber)',
  leftMarks.includes('ligament_acl_l:red')
  && leftMarks.includes('cartilage_meniscus_medial_l:amber')
  && leftMarks.includes('cartilage_meniscus_lateral_l:amber'), leftMarks.join(', '));
await shot('55-injury-acl-tear');

await page.click('[data-injury="achilles-tendinopathy"]');
await settle();
leftMarks = await page.evaluate(() => window.__viewer.visibility.highlights().map((h) => `${h.id}:${h.colour}`));
check('Achilles tendinopathy on Left highlights left Achilles (red) and left calf (amber)',
  leftMarks.includes('tendon_achilles_l:red')
  && leftMarks.includes('muscle_gastrocnemius_medial_l:amber')
  && leftMarks.includes('muscle_soleus_l:amber'), leftMarks.join(', '));
await shot('60-injury-achilles-tendinopathy');

// ----- Undo / Redo -----
await page.keyboard.press('Control+z');
await settle();
const afterUndo = await page.evaluate(() => window.__viewer.visibility.highlights().map((h) => h.id));
check('one Undo steps back to the previous injury (ACL tear)', afterUndo.includes('ligament_acl_l'), afterUndo.join(', '));
await page.keyboard.press('Control+Shift+z');
await settle();
const afterRedo = await page.evaluate(() => window.__viewer.visibility.highlights().map((h) => h.id));
check('Redo restores Achilles tendinopathy', afterRedo.includes('tendon_achilles_l'), afterRedo.join(', '));

// ----- Soft-tissue side sync & collapse -----
await page.click('#show-everything');
await page.click('#soft-side [data-side="right"]');
check('switching Soft-tissue side to Right moves injury side chooser to Right',
  await page.getAttribute('#injury-side [data-side="right"]', 'aria-checked') === 'true');
await page.click('#injuries-heading .section__toggle');
check('Common injuries section collapses cleanly', await page.locator('#injuries-body').isHidden());
await page.click('#injuries-heading .section__toggle');
check('Common injuries section expands back', await page.locator('#injuries-body').isVisible());

console.log(problems.length ? `Console problems:\n  ${problems.join('\n  ')}` : 'No console errors or warnings.');
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed.');
console.log(`Screenshots: ${OUT}`);
await browser.close();
await server.close();
process.exit(failures || problems.length ? 1 : 0);
