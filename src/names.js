// How a structure's name is worded on screen. Every word comes from
// structures.json (built from the approved CSV); nothing is hard-coded here.

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** "abdomen and lower back (lumbar)" -> "abdomen and lower back". */
export const regionShort = (region) => region.replace(/\s*\(.*\)\s*$/, '');

/** "abdomen and lower back (lumbar)" -> "Abdomen and lower back". */
export const regionLabel = (region) => capitalise(regionShort(region));

/** "left knee" for a one-region structure, "left" for several regions, "" for the midline. */
export function sideAndPlace(data) {
  if (data.side === 'midline') return '';
  return data.regions.length === 1 ? `${data.side} ${regionShort(data.regions[0])}` : data.side;
}

/** "Anterior cruciate ligament (ACL) – left knee". */
export function fullLabel(data) {
  const place = sideAndPlace(data);
  return place ? `${data.name} – ${place}` : data.name;
}

/** "Left", "Right" or "Midline". */
export const sideWord = (data) => capitalise(data.side);
