// Visual and performance check for the viewer.
//   npm run check            (headless)
//   npm run check -- --headed  (a real browser window; best for frame-rate figures)
// Starts the app, takes screenshots into work/screens/ and prints load time and frame rate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'work', 'screens');
const headed = process.argv.includes('--headed');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync=false'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const settle = () => page.evaluate(() => new Promise((resolve) => {
  const wait = () => (window.__viewer.rig.isTransitioning ? requestAnimationFrame(wait) : setTimeout(resolve, 450));
  wait();
}));

await page.goto(url);
await page.waitForFunction(() => window.__viewer?.stats.firstModelAt, null, { timeout: 60000 });
await shot('00-bones-first');
await page.waitForFunction(() => window.__viewer.stats.allLoadedAt, null, { timeout: 120000 });
await settle();

const info = await page.evaluate(() => {
  const { stats, registry, stage } = window.__viewer;
  const gl = stage.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const meshes = registry.meshes();
  return {
    graphics: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
    bonesShownMs: Math.round(stats.firstModelAt - stats.startedAt),
    allLoadedMs: Math.round(stats.allLoadedAt - stats.startedAt),
    structures: registry.size,
    meshes: meshes.length,
    distinctMeshes: new Set(meshes).size,
    missing: registry.missing().length,
    triangles: stage.renderer.info.render.triangles,
    drawCalls: stage.renderer.info.render.calls,
  };
});

for (const view of ['front', 'back', 'left', 'right', 'top']) {
  await page.click(`[data-view="${view}"]`);
  await settle();
  await shot(`01-${view}`);
}

// Close zoom on the right knee, from the front and slightly to the outside.
await page.evaluate(async () => {
  const { rig, registry, stage } = window.__viewer;
  const patella = registry.all().find((e) => /patella/.test(e.id) && e.data.side === 'right' && e.data.system === 'bone');
  const geometry = patella.mesh.geometry;
  geometry.computeBoundingSphere();
  const c = geometry.boundingSphere.center.clone().applyMatrix4(patella.mesh.matrixWorld);
  c.z -= 0.03;
  rig.controls.target.copy(c);
  stage.camera.position.set(c.x - 0.18, c.y + 0.06, c.z + 0.62);
});
await settle();
await shot('02-knee-close');

// Same knee with muscles hidden, to check deep structures and depth sorting.
await page.evaluate(() => {
  const { registry, requestRender } = window.__viewer;
  for (const e of registry.bySystem('muscle')) e.mesh.visible = false;
  for (const e of registry.bySystem('bursa')) e.mesh.visible = false;
  requestRender();
});
await settle();
await shot('03-knee-close-no-muscle');
await page.evaluate(() => {
  const { registry, requestRender } = window.__viewer;
  for (const e of registry.all()) e.mesh.visible = true;
  requestRender();
});

// Double-click centres the orbit on the clicked point.
await page.click('[data-view="reset"]');
await settle();
const before = await page.evaluate(() => window.__viewer.rig.controls.target.toArray());
const box = await page.locator('#canvas').boundingBox();
await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.22);
await settle();
const after = await page.evaluate(() => window.__viewer.rig.controls.target.toArray());
await shot('04-after-double-click');

// Panel collapsed.
await page.click('#panel-toggle');
await page.waitForTimeout(600);
await page.click('[data-view="reset"]');
await settle();
await shot('05-panel-closed');
await page.click('#panel-toggle');
await page.waitForTimeout(600);

// Frame rate: spin the model continuously with every system visible.
async function measure(label, setup) {
  await page.click(`[data-view="reset"]`);
  await settle();
  if (setup) await page.evaluate(setup);
  const result = await page.evaluate(() => new Promise((resolve) => {
    const { rig, stage, stats } = window.__viewer;
    const camera = stage.camera, target = rig.controls.target;
    const times = [];
    const framesBefore = stats.frames;
    let last = performance.now();
    const begin = last;
    function step(now) {
      times.push(now - last); last = now;
      const dx = camera.position.x - target.x, dz = camera.position.z - target.z, a = 0.02;
      camera.position.x = target.x + dx * Math.cos(a) - dz * Math.sin(a);
      camera.position.z = target.z + dx * Math.sin(a) + dz * Math.cos(a);
      if (now - begin < 5000) requestAnimationFrame(step);
      else {
        times.shift(); times.sort((p, q) => p - q);
        const mean = times.reduce((s, t) => s + t, 0) / times.length;
        resolve({
          fps: +(1000 / mean).toFixed(1),
          slowest1pcFps: +(1000 / times[Math.floor(times.length * 0.99)]).toFixed(1),
          drawn: stats.frames - framesBefore,
          triangles: stage.renderer.info.render.triangles,
        });
      }
    }
    requestAnimationFrame(step);
  }));
  console.log(`Frame rate, ${label}:`, result);
  return result;
}
await measure('whole body, all systems');
await measure('zoomed in on the trunk', () => {
  const { rig, stage } = window.__viewer;
  stage.camera.position.lerp(rig.controls.target, 0.6);
});

// Friendly message when a file fails to load.
const failing = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await failing.route('**/muscles.glb', (route) => route.abort());
await failing.goto(url);
await failing.waitForSelector('#error:not([hidden])', { timeout: 60000 });
await failing.screenshot({ path: path.join(OUT, '06-load-failure.png') });
const errorText = await failing.locator('#error').innerText();
await failing.unroute('**/muscles.glb');
await failing.click('#error-retry');
await failing.waitForFunction(() => window.__viewer.stats.allLoadedAt, null, { timeout: 60000 });
const recovered = await failing.evaluate(() => window.__viewer.registry.missing().length === 0);

// Narrow screen layout.
const small = await browser.newPage({ viewport: { width: 390, height: 780 } });
await small.goto(url);
await small.waitForFunction(() => window.__viewer?.stats.allLoadedAt, null, { timeout: 60000 });
await small.waitForTimeout(1200);
await small.screenshot({ path: path.join(OUT, '07-narrow-screen.png') });

console.log(info);
console.log('Double-click moved orbit centre:', before.map((n) => +n.toFixed(3)), '->', after.map((n) => +n.toFixed(3)));
console.log('Load failure message:', JSON.stringify(errorText));
console.log('Recovered after "Try again":', recovered);
console.log(problems.length ? `Console problems:\n  ${problems.join('\n  ')}` : 'No console errors or warnings.');
console.log(`Screenshots: ${OUT}`);

await browser.close();
await server.close();
