// Labels mode: small floating labels with leader lines for the structures in
// the isolated region (or the one structure shown on its own), plus the
// selected structure. Labels sit in a column either side of the model, ordered
// by height so the lines do not cross much. If there are more structures than
// fit, the less central ones are left out and a note says so.
import * as THREE from 'three';

const ROW = 24;          // pixels between label rows
const TOP = 70;          // keep clear of the panel button
const BOTTOM = 110;      // keep clear of the view buttons
const GAP = 34;          // between the model and a label column
const LABEL_WIDTH = 300;
const SYSTEM_ORDER = ['ligament', 'cartilage', 'tendon', 'bursa', 'nerve', 'bone', 'muscle'];
const SVG = 'http://www.w3.org/2000/svg';

export function createLabels({ registry, visibility, camera, viewport, getSelectedId, onPick, onHover }) {
  const box = document.getElementById('labels');
  const svg = document.getElementById('labels-lines');
  const note = document.getElementById('labels-note');
  const anchors = new Map();     // id -> world point on the structure
  const items = new Map();       // id -> { node, line }
  let enabled = false;
  let wanted = [];
  let stale = true;
  const point = new THREE.Vector3();

  /** A point on the structure's surface, near its middle (found once, then kept). */
  function anchorOf(entry) {
    let anchor = anchors.get(entry.id);
    if (anchor) return anchor;
    const geometry = entry.mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const middle = geometry.boundingBox.getCenter(new THREE.Vector3());
    const position = geometry.attributes.position;
    const step = Math.max(1, Math.floor(position.count / 3000));
    anchor = new THREE.Vector3();
    let best = Infinity;
    for (let i = 0; i < position.count; i += step) {
      point.fromBufferAttribute(position, i);
      const d = point.distanceToSquared(middle);
      if (d < best) { best = d; anchor.copy(point); }
    }
    anchor.applyMatrix4(entry.mesh.matrixWorld);
    anchors.set(entry.id, anchor);
    return anchor;
  }

  /** Which structures should have a label, most important first. */
  function choose() {
    const selectedId = getSelectedId();
    const list = [];
    const iso = visibility.isolated;
    if (visibility.only) {
      list.push(registry.get(visibility.only));
    } else if (iso) {
      for (const entry of registry.byRegion(iso.region)) {
        if (entry.data.side !== 'midline' && !iso.sides.includes(entry.data.side)) continue;
        list.push(entry);
      }
    }
    const selected = selectedId ? registry.get(selectedId) : null;
    if (selected && !list.includes(selected)) list.push(selected);
    const bothSides = new Set(list.map((e) => e.data.side).filter((s) => s !== 'midline')).size > 1;
    const rank = (e) => (e.id === selectedId ? -100 : 0)
      + (e.data.regions.length === 1 ? 0 : 10) + SYSTEM_ORDER.indexOf(e.data.system);
    return list
      .filter((e) => e?.mesh && visibility.statusOf(e) === 'shown')
      .sort((a, b) => rank(a) - rank(b))
      .map((entry) => ({
        entry,
        text: bothSides && entry.data.side !== 'midline' ? `${entry.data.name} – ${entry.data.side}` : entry.data.name,
      }));
  }

  function itemFor(entry, text) {
    let item = items.get(entry.id);
    if (!item) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'labels__label';
      node.dataset.label = entry.id;
      node.addEventListener('click', () => onPick(entry.id));
      node.addEventListener('pointerenter', () => onHover(entry.id));
      node.addEventListener('pointerleave', () => onHover(null));
      const line = document.createElementNS(SVG, 'line');
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('r', '2.5');
      item = { node, line, dot };
      items.set(entry.id, item);
    }
    if (item.node.textContent !== text) { item.node.textContent = text; item.node.title = text; }
    return item;
  }

  /** Spread rows so none overlap, keeping each as near its structure as possible. */
  function spread(rows, top, bottom) {
    rows.sort((a, b) => a.y - b.y);
    let last = top - ROW;
    for (const row of rows) { row.labelY = Math.max(row.y, last + ROW); last = row.labelY; }
    let limit = bottom;
    for (let i = rows.length - 1; i >= 0; i--) {
      rows[i].labelY = Math.min(rows[i].labelY, limit);
      limit = rows[i].labelY - ROW;
    }
  }

  /** Call after each redraw of the model. */
  function update() {
    if (!enabled) return;
    if (stale) { wanted = choose(); stale = false; }
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const selectedId = getSelectedId();

    // Where each structure is on screen.
    const rows = [];
    for (const { entry, text } of wanted) {
      point.copy(anchorOf(entry)).project(camera);
      if (point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
      rows.push({ entry, text, x: (point.x + 1) / 2 * width, y: (1 - point.y) / 2 * height });
    }

    // Two columns, as many rows as fit; the list is already in order of importance.
    const perColumn = Math.max(1, Math.floor((height - TOP - BOTTOM) / ROW));
    const middle = rows.length ? [...rows].sort((a, b) => a.x - b.x)[Math.floor(rows.length / 2)].x : 0;
    const left = [];
    const right = [];
    let leftOut = 0;
    for (const row of rows) {
      const column = row.x < middle ? left : right;
      const other = column === left ? right : left;
      if (column.length < perColumn) column.push(row);
      else if (other.length < perColumn) other.push(row);
      else leftOut++;
    }
    spread(left, TOP, height - BOTTOM);
    spread(right, TOP, height - BOTTOM);

    const xs = rows.map((r) => r.x);
    const leftEdge = THREE.MathUtils.clamp(Math.min(...xs) - GAP, LABEL_WIDTH + 12, Math.max(LABEL_WIDTH + 12, width / 2 - 40));
    const rightEdge = THREE.MathUtils.clamp(Math.max(...xs) + GAP, Math.min(width - LABEL_WIDTH - 12, width / 2 + 40), width - LABEL_WIDTH - 12);

    const used = new Set();
    const place = (row, isLeft) => {
      const item = itemFor(row.entry, row.text);
      used.add(row.entry.id);
      const x = isLeft ? leftEdge : rightEdge;
      item.node.classList.toggle('is-left', isLeft);
      item.node.classList.toggle('is-selected', row.entry.id === selectedId);
      item.node.style.left = isLeft ? '' : `${Math.round(x)}px`;
      item.node.style.right = isLeft ? `${Math.round(width - x)}px` : '';
      item.node.style.top = `${Math.round(row.labelY - ROW / 2)}px`;
      item.line.setAttribute('x1', x + (isLeft ? 3 : -3));
      item.line.setAttribute('y1', row.labelY);
      item.line.setAttribute('x2', row.x);
      item.line.setAttribute('y2', row.y);
      item.line.classList.toggle('is-selected', row.entry.id === selectedId);
      item.dot.setAttribute('cx', row.x);
      item.dot.setAttribute('cy', row.y);
      if (!item.node.isConnected) { box.append(item.node); svg.append(item.line, item.dot); }
    };
    for (const row of left) place(row, true);
    for (const row of right) place(row, false);
    for (const [id, item] of items) {
      if (!used.has(id) && item.node.isConnected) { item.node.remove(); item.line.remove(); item.dot.remove(); }
    }

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    if (!wanted.length) {
      note.textContent = 'Isolate a region, or select a structure, to see labels.';
    } else if (leftOut) {
      note.textContent = `${used.size} of ${used.size + leftOut} structures are labelled. Untick a system to see the others.`;
    }
    note.hidden = wanted.length > 0 && leftOut === 0;
  }

  return {
    update,
    /** Call when what is shown or selected changes. */
    invalidate() { stale = true; },
    get enabled() { return enabled; },
    get count() { return [...items.values()].filter((item) => item.node.isConnected).length; },
    setEnabled(on) {
      enabled = !!on;
      box.hidden = !enabled;
      stale = true;
    },
  };
}
