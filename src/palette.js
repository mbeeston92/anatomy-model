// The highlight colours and what each one means. The meanings can be reworded
// in the panel; that lasts until the page is refreshed and is stored nowhere.
//
// The shades are chosen to stand clear of every tissue colour: the red is a
// vivid crimson well away from the muted muscle red, the amber is a strong
// orange so it cannot be taken for the yellow nerves, and the blue is a deep
// royal blue, darker than cartilage and bursae and unlike the selection outline.

const COLOURS = [
  { id: 'red', colour: '#F0123C', name: 'Injured' },
  { id: 'amber', colour: '#FF8A00', name: 'Affected / under strain' },
  { id: 'green', colour: '#12A84A', name: 'Healing' },
  { id: 'blue', colour: '#3554F2', name: 'Area to strengthen' },
];

export function createPalette() {
  const colours = COLOURS.map((c) => ({ ...c }));
  const byId = new Map(colours.map((c) => [c.id, c]));
  return {
    colours,
    get: (id) => byId.get(id) ?? null,
    /** Reword a colour's meaning (this session only). An empty name goes back to the original. */
    rename(id, name) {
      const colour = byId.get(id);
      if (!colour) return;
      const text = name.trim().slice(0, 40);
      colour.name = text || COLOURS.find((c) => c.id === id).name;
    },
  };
}
