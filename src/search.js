// Search over the structure list: plain-English names, medical names and the
// abbreviations written in the names (e.g. "(ACL)"). Forgiving of small typos.
// Pure logic, no interface: see searchbox.js for the box itself.

const SIDE_WORDS = new Set(['left', 'right']);

/** Lower case, no accents, punctuation to spaces, split into words. */
export function words(text) {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Edit distance counting a swap of two neighbouring letters as one change. */
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = null;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2] + 1);
      }
      current.push(value);
      if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
    before = previous;
    previous = current;
  }
  return previous[b.length];
}

/** How well one typed word matches one word of a name: 0 (no match) to 100 (exact). */
function wordScore(typed, word) {
  if (word === typed) return 100;
  if (word.startsWith(typed)) return 85 - Math.min(10, word.length - typed.length);
  if (typed.length >= 3 && word.includes(typed)) return 60;
  if (typed.length < 4) return 0;
  const limit = typed.length >= 8 ? 2 : 1;
  const whole = distance(typed, word, limit);
  if (whole <= limit) return 50 - whole * 10;
  // Still typing a long word, with a slip in it.
  if (word.length > typed.length && distance(typed, word.slice(0, typed.length), 1) <= 1) return 28;
  return 0;
}

const bestScore = (typed, list) => list.reduce((best, word) => Math.max(best, wordScore(typed, word)), 0);

/**
 * @param {Array<{id:string, name:string, medicalName:string, system:string, side:string}>} structures
 * @returns {(query:string, limit?:number) => Array<{key:string, name:string, medicalName:string,
 *   system:string, score:number, left:string|null, right:string|null, midline:string|null}>}
 *   Results are grouped so a left/right pair is one result.
 */
export function createSearch(structures) {
  const index = structures.map((s) => ({ s, name: words(s.name), medical: words(s.medicalName) }));

  return function search(query, limit = 8) {
    let typed = words(query);
    const sides = typed.filter((w) => SIDE_WORDS.has(w));
    if (sides.length && typed.length > sides.length) typed = typed.filter((w) => !SIDE_WORDS.has(w));
    else sides.length = 0;
    if (!typed.length) return [];

    const groups = new Map();
    for (const { s, name, medical } of index) {
      if (sides.length && !sides.includes(s.side)) continue;
      let total = 0;
      for (const word of typed) {
        const score = Math.max(bestScore(word, name), bestScore(word, medical) * 0.9);
        if (score === 0) { total = 0; break; }
        total += score;
      }
      if (total === 0) continue;
      total = total / typed.length - name.length * 0.2;      // shorter names first on a tie

      const key = `${s.id.replace(/_(l|r)$/, '')}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, name: s.name, medicalName: s.medicalName, system: s.system, score: total, left: null, right: null, midline: null };
        groups.set(key, group);
      }
      group.score = Math.max(group.score, total);
      group[s.side] = s.id;
    }
    return [...groups.values()]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, limit);
  };
}
