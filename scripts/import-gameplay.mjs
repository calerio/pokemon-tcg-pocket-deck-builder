// One-off importer: trims a TCGdex-shaped Pocket card catalogue down to the public gameplay fields
// this app needs, and writes data/upstream/gameplay.json (the checked-in input of sync-data.ts).
//
// Usage: node scripts/import-gameplay.mjs <path/to/cards.json>
//
// The source catalogue is keyed by card id ("A1-001") and was assembled from the TCGdex API
// (sets it covers) plus the Limitless Pocket card database (newer sets, marked with `source`).
// Only card facts are kept; no prices, images, or anything account-related.
import { readFileSync, writeFileSync } from "node:fs";

const [, , input] = process.argv;
if (!input) {
  console.error("usage: node scripts/import-gameplay.mjs <cards.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(input, "utf8"));
const out = {};
for (const [id, c] of Object.entries(raw)) {
  if (id !== c.id) throw new Error(`key ${id} != id ${c.id}`);
  const card = {
    name: c.name,
    category: c.category,
    rarity: c.rarity,
    illustrator: c.illustrator ?? null,
    from: c.source ? "limitless" : "tcgdex",
    tcgdexImage: Boolean(c.image),
  };
  if (c.category !== "Trainer") {
    Object.assign(card, {
      hp: c.hp ?? null,
      types: c.types ?? [],
      stage: c.stage ?? null,
      evolveFrom: c.evolveFrom ?? null,
      suffix: c.suffix ?? null,
      retreat: c.retreat ?? null,
      weaknesses: (c.weaknesses ?? []).map((w) => ({ type: w.type, value: w.value ?? null })),
      abilities: (c.abilities ?? []).map((a) => ({ name: a.name, effect: a.effect ?? "" })),
      attacks: (c.attacks ?? []).map((a) => ({
        name: a.name,
        cost: a.cost ?? [],
        damage: a.damage ?? null,
        effect: a.effect ?? "",
      })),
    });
  } else {
    Object.assign(card, { trainerType: c.trainerType ?? null, effect: c.effect ?? "" });
  }
  out[id] = card;
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
writeFileSync("data/upstream/gameplay.json", JSON.stringify(sorted, null, 0) + "\n");
console.log(`wrote ${Object.keys(sorted).length} cards to data/upstream/gameplay.json`);
