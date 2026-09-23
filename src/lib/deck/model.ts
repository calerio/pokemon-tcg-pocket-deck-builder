/**
 * Deck model and pure operations. The UI keeps a Deck in state and replaces it on every change,
 * which makes undo/redo and autosave trivial.
 */
import type { Catalog, EntityKey } from "../cards/catalog.ts";
import { entityKey } from "../cards/catalog.ts";
import type { Entity } from "../cards/types.ts";
import type { EnergyType } from "../codec/energy.ts";
import { MAX_ENERGIES } from "../codec/energy.ts";
import type { DeckCodeParts } from "../codec/payload.ts";

export const DECK_SIZE = 20;
export const MAX_COPIES = 2;

export interface DeckCard {
  key: EntityKey;
  count: number;
  /** Preferred print for display only (deck codes can't carry artwork). */
  printId?: string;
}

export interface Deck {
  name: string;
  cards: DeckCard[];
  energy: EnergyType[];
}

export const emptyDeck = (name = "My deck"): Deck => ({ name, cards: [], energy: [] });

export const deckSize = (d: Deck): number => d.cards.reduce((n, c) => n + c.count, 0);

/** Copies in the deck of cards sharing this card's name (the game limits copies by name). */
export function copiesOfName(d: Deck, catalog: Catalog, entity: Entity): number {
  return d.cards.reduce((n, c) => n + (catalog.entity(c.key)?.nameKey === entity.nameKey ? c.count : 0), 0);
}

export const countOf = (d: Deck, key: EntityKey): number => d.cards.find((c) => c.key === key)?.count ?? 0;

export type AddResult =
  | { ok: true; deck: Deck }
  | { ok: false; reason: "copy-limit" | "deck-full" | "unknown"; message: string };

export function addCard(d: Deck, catalog: Catalog, key: EntityKey, printId?: string): AddResult {
  const e = catalog.entity(key);
  if (!e) return { ok: false, reason: "unknown", message: "That card isn't in the card list." };
  if (copiesOfName(d, catalog, e) >= MAX_COPIES) {
    return { ok: false, reason: "copy-limit", message: `Max ${MAX_COPIES} cards named ${e.name} per deck.` };
  }
  if (deckSize(d) >= DECK_SIZE) return { ok: false, reason: "deck-full", message: `Decks hold exactly ${DECK_SIZE} cards.` };
  const existing = d.cards.find((c) => c.key === key);
  const cards = existing
    ? d.cards.map((c) => (c.key === key ? { ...c, count: c.count + 1 } : c))
    : [...d.cards, printId ? { key, count: 1, printId } : { key, count: 1 }];
  return { ok: true, deck: { ...d, cards } };
}

export function removeCard(d: Deck, key: EntityKey): Deck {
  const cards = d.cards.flatMap((c) => (c.key !== key ? [c] : c.count > 1 ? [{ ...c, count: c.count - 1 }] : []));
  return { ...d, cards };
}

export function removeAll(d: Deck, key: EntityKey): Deck {
  return { ...d, cards: d.cards.filter((c) => c.key !== key) };
}

/** Move a card one place up/down in the deck's manual order. */
export function moveCard(d: Deck, key: EntityKey, delta: -1 | 1): Deck {
  const i = d.cards.findIndex((c) => c.key === key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= d.cards.length) return d;
  const cards = [...d.cards];
  [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  return { ...d, cards };
}

/** Toggle an energy. Returns the deck unchanged when adding a 4th (the UI explains why). */
export function toggleEnergy(d: Deck, e: EnergyType): Deck {
  if (d.energy.includes(e)) return { ...d, energy: d.energy.filter((x) => x !== e) };
  if (d.energy.length >= MAX_ENERGIES) return d;
  return { ...d, energy: [...d.energy, e] };
}

export const renameDeck = (d: Deck, name: string): Deck => ({ ...d, name });

/** Energy types the deck's Pokémon attack with, most common first, as suggestions. */
export function suggestedEnergy(d: Deck, catalog: Catalog): EnergyType[] {
  const tally = new Map<string, number>();
  for (const c of d.cards) {
    const e = catalog.entity(c.key);
    for (const a of e?.attacks ?? []) for (const t of a.cost) if (t !== "Colorless") tally.set(t, (tally.get(t) ?? 0) + c.count);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t as EnergyType).filter((t) => t !== ("Dragon" as EnergyType));
}

// ---------- display grouping ----------
export interface DeckGroup {
  id: string;
  label: string;
  cards: Array<DeckCard & { entity: Entity }>;
}

const TRAINER_ORDER = ["Supporter", "Item", "Tool", "Stadium"];

/**
 * Pokémon grouped by evolution line (Basic → Stage 1 → Stage 2, in manual order of each line's first card),
 * then Trainers grouped by type. Within a group, cards keep the deck's manual order.
 */
export function groupDeck(d: Deck, catalog: Catalog): DeckGroup[] {
  const rows = d.cards.flatMap((c) => {
    const entity = catalog.entity(c.key);
    return entity ? [{ ...c, entity }] : [];
  });
  const pokemon = rows.filter((r) => r.entity.kind === "pokemon");
  const trainers = rows.filter((r) => r.entity.kind === "trainer");

  // line root: follow evolvesFrom by name while the pre-evolution is in the deck
  const byName = new Map(pokemon.map((r) => [r.entity.nameKey, r]));
  const rootOf = (r: (typeof pokemon)[number]): string => {
    let cur = r;
    const seen = new Set<string>();
    while (cur.entity.evolvesFrom && !seen.has(cur.entity.nameKey)) {
      seen.add(cur.entity.nameKey);
      const prev = byName.get(cur.entity.evolvesFrom.toLowerCase());
      if (!prev) break;
      cur = prev;
    }
    return cur.entity.nameKey;
  };
  const stageRank = (s?: string) => (s === "Stage 2" ? 2 : s === "Stage 1" ? 1 : 0);
  const lines = new Map<string, typeof pokemon>();
  for (const r of pokemon) {
    const root = rootOf(r);
    lines.set(root, [...(lines.get(root) ?? []), r]);
  }
  const groups: DeckGroup[] = [];
  const singles: typeof pokemon = [];
  for (const [root, members] of lines) {
    if (members.length === 1) {
      singles.push(members[0]!); // lone Pokémon share one calm group instead of a heading each
      continue;
    }
    members.sort((a, b) => stageRank(a.entity.stage) - stageRank(b.entity.stage));
    groups.push({ id: `line:${root}`, label: `${members[0]!.entity.name} line`, cards: members });
  }
  if (singles.length) groups.push({ id: "line:*", label: groups.length ? "Other Pokémon" : "Pokémon", cards: singles });
  const tGroups = new Map<string, typeof trainers>();
  for (const r of trainers) {
    const t = r.entity.trainerType ?? "Trainer";
    tGroups.set(t, [...(tGroups.get(t) ?? []), r]);
  }
  [...tGroups.entries()]
    .sort(([a], [b]) => (TRAINER_ORDER.indexOf(a) + 99) % 99 - (TRAINER_ORDER.indexOf(b) + 99) % 99)
    .forEach(([t, cards]) => groups.push({ id: `trainer:${t}`, label: t === "Trainer" ? "Trainers" : `${t}s`, cards }));
  return groups;
}

// ---------- deck-code conversion ----------
/**
 * Deck → payload parts, in the deck's own card order (so an imported code re-exports byte for byte).
 * Unknown cards are skipped; validation reports them before a code is ever generated.
 */
export function toCodeParts(d: Deck, catalog: Catalog): DeckCodeParts {
  const trainers: number[] = [];
  const pokemon: number[] = [];
  for (const c of d.cards) {
    const e = catalog.entity(c.key);
    if (!e) continue;
    const target = e.kind === "trainer" ? trainers : pokemon;
    for (let i = 0; i < c.count; i++) target.push(e.id);
  }
  return { trainers, pokemon, energy: d.energy };
}

export interface FromCodeResult {
  deck: Deck;
  /** Entity IDs in the code that this card list doesn't know (new set?). */
  unknown: EntityKey[];
}

export function fromCodeParts(parts: DeckCodeParts, catalog: Catalog, name = "Imported deck"): FromCodeResult {
  const cards: DeckCard[] = [];
  const unknown: EntityKey[] = [];
  const add = (key: EntityKey) => {
    if (!catalog.entity(key)) {
      if (!unknown.includes(key)) unknown.push(key);
      return;
    }
    const c = cards.find((x) => x.key === key);
    if (c) c.count++;
    else cards.push({ key, count: 1 });
  };
  parts.pokemon.forEach((id) => add(entityKey({ kind: "pokemon", id })));
  parts.trainers.forEach((id) => add(entityKey({ kind: "trainer", id })));
  return { deck: { name, cards, energy: [...parts.energy] }, unknown };
}
