/**
 * Deck import/export: our JSON, tcgp-deck-qr JSON, plain text / Limitless "Copy" text, and raw deck codes.
 * Import never guesses. Unknown or ambiguous lines are reported and the rest of the deck still loads.
 */
import { z } from "zod";
import type { Catalog, EntityKey } from "../cards/catalog.ts";
import { entityKey } from "../cards/catalog.ts";
import { nameKey } from "../cards/normalize.ts";
import { ENERGY_TYPES, isEnergyType, type EnergyType } from "../codec/energy.ts";
import { decodeDeckCode, DeckCodeError } from "../codec/payload.ts";
import { fromCodeParts, groupDeck, type Deck, type DeckCard } from "./model.ts";

export interface ImportProblem {
  line?: number;
  text: string;
  reason: string;
  candidates?: string[];
}
export interface ImportResult {
  deck: Deck;
  problems: ImportProblem[];
  format: "deck-code" | "pocket-deck-lab-json" | "tcgp-deck-qr-json" | "text";
}

// ---------- our JSON ----------
const ourJson = z.object({
  format: z.literal("pocket-deck-lab"),
  version: z.literal(1),
  name: z.string().max(80),
  energy: z.array(z.enum(ENERGY_TYPES)).max(3),
  cards: z.array(z.object({ id: z.string(), name: z.string().optional(), count: z.number().int().min(1).max(4) })).max(40),
});

const theirJson = z.object({
  name: z.string().optional(),
  pokemon: z.array(z.object({ name: z.string().optional(), set: z.string().optional(), number: z.union([z.number(), z.string()]).optional(), id: z.number().optional(), count: z.number().int().min(1).max(4).optional() })),
  trainers: z.array(z.object({ name: z.string().optional(), set: z.string().optional(), number: z.union([z.number(), z.string()]).optional(), id: z.number().optional(), count: z.number().int().min(1).max(4).optional() })),
  energy: z.array(z.string()).max(3),
});

export function exportJson(d: Deck, catalog: Catalog): string {
  const cards = groupDeck(d, catalog).flatMap((g) =>
    g.cards.map((c) => ({ id: c.printId ?? catalog.basePrint(c.key)?.cardId ?? c.key, name: c.entity.name, count: c.count })),
  );
  return JSON.stringify({ format: "pocket-deck-lab", version: 1, name: d.name, energy: d.energy, cards }, null, 2);
}

/** Limitless-compatible text: Pokémon, blank line, Trainers, blank line, Energy. */
export function exportText(d: Deck, catalog: Catalog): string {
  const line = (c: DeckCard & { entity: { name: string } }) => {
    const p = (c.printId && catalog.printById(c.printId)) || catalog.basePrint(c.key);
    return p ? `${c.count} ${c.entity.name} ${p.set} ${p.number}` : `${c.count} ${c.entity.name}`;
  };
  const groups = groupDeck(d, catalog);
  const pk = groups.filter((g) => g.id.startsWith("line:")).flatMap((g) => g.cards.map(line));
  const tr = groups.filter((g) => g.id.startsWith("trainer:")).flatMap((g) => g.cards.map(line));
  return [pk.join("\n"), tr.join("\n"), `Energy: ${d.energy.join(", ")}`].join("\n\n") + "\n";
}

// ---------- import ----------
export function importDeck(input: string, catalog: Catalog, fallbackName = "Imported deck"): ImportResult {
  const text = input.trim();
  if (!text) throw new ImportError("Nothing to import.");

  // 1. a raw deck code (Base64, 88 chars for a full deck)
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(text) && text.length % 4 === 0 && text.length >= 12) {
    try {
      const { deck, unknown } = fromCodeParts(decodeDeckCode(text), catalog, fallbackName);
      return { deck, format: "deck-code", problems: unknown.map((k) => ({ text: k, reason: "This card isn't in our card list yet (newer set?)" })) };
    } catch (e) {
      if (!(e instanceof DeckCodeError)) throw e;
      throw new ImportError(`That looks like a deck code, but ${e.message}.`);
    }
  }

  // 2. JSON
  if (text.startsWith("{")) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ImportError("That JSON couldn't be read.");
    }
    const ours = ourJson.safeParse(data);
    if (ours.success) {
      const b = new Builder(catalog, ours.data.name || fallbackName);
      ours.data.cards.forEach((c, i) => b.addById(c.id, c.count, i + 1, c.name));
      ours.data.energy.forEach((e) => b.energy(e));
      return b.result("pocket-deck-lab-json");
    }
    const theirs = theirJson.safeParse(data);
    if (theirs.success) {
      const b = new Builder(catalog, theirs.data.name || fallbackName);
      const add = (kind: "pokemon" | "trainer", c: z.infer<typeof theirJson>["pokemon"][number], i: number) => {
        const count = c.count ?? 1;
        if (c.id !== undefined) b.addKey(entityKey({ kind, id: c.id }), count, i, String(c.id));
        else if (c.set && c.number !== undefined) b.addById(`${c.set} ${c.number}`, count, i, c.name);
        else if (c.name) b.addByName(c.name, count, i);
      };
      theirs.data.pokemon.forEach((c, i) => add("pokemon", c, i + 1));
      theirs.data.trainers.forEach((c, i) => add("trainer", c, i + 1));
      theirs.data.energy.forEach((e) => b.energyName(e));
      return b.result("tcgp-deck-qr-json");
    }
    throw new ImportError("That JSON isn't a deck format we recognise.");
  }

  // 3. text lines
  const b = new Builder(catalog, fallbackName);
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const n = idx + 1;
    const energy = /^energy\s*:\s*(.+)$/i.exec(line);
    if (energy) {
      energy[1]!.split(/[,/]| and /).map((s) => s.trim()).filter(Boolean).forEach((e) => b.energyName(e, n));
      return;
    }
    if (/^(pok[eé]mon|trainers?|energy)\s*[:(]?\s*\d*\)?\s*$/i.test(line)) return; // section headers
    const m = /^(\d+)\s*[x×]?\s+(.+?)\s*$/.exec(line);
    if (!m) return b.problem(n, line, "Expected a count and a card, e.g. \"2 Riolu A2 91\"");
    const count = Number(m[1]);
    const rest = m[2]!;
    const withId = /^(.*?)\s*\(?\b([A-Za-z0-9]+(?:-[A-Za-z])?)[\s-]0*(\d{1,3})\)?$/.exec(rest);
    if (withId && catalog.printById(`${withId[2]} ${withId[3]}`)) b.addById(`${withId[2]} ${withId[3]}`, count, n, withId[1] || undefined);
    else b.addByName(rest, count, n);
  });
  return b.result("text");
}

export class ImportError extends Error {
  override name = "ImportError";
}

class Builder {
  private cards: DeckCard[] = [];
  private energies: EnergyType[] = [];
  private problems: ImportProblem[] = [];
  constructor(private readonly catalog: Catalog, private readonly name: string) {}

  problem(line: number | undefined, text: string, reason: string, candidates?: string[]) {
    this.problems.push(candidates ? { line, text, reason, candidates } : { line, text, reason });
  }
  addKey(key: EntityKey, count: number, line: number | undefined, text: string, printId?: string) {
    if (!this.catalog.entity(key)) return this.problem(line, text, "This card isn't in our card list yet (newer set?)");
    const c = this.cards.find((x) => x.key === key);
    if (c) c.count += count;
    else this.cards.push(printId ? { key, count, printId } : { key, count });
  }
  addById(id: string, count: number, line: number | undefined, listedName?: string) {
    const p = this.catalog.printById(id);
    if (!p) return listedName ? this.addByName(listedName, count, line) : this.problem(line, id, "Unknown card number");
    // A typo'd number must not silently become a different card.
    if (listedName && nameKey(listedName) !== p.entity.nameKey) {
      return this.problem(line, `${listedName} ${id}`, `${p.cardId} is ${p.entity.name}, not ${listedName}`);
    }
    this.addKey(entityKey(p.entity), count, line, id, p.cardId);
  }
  addByName(name: string, count: number, line: number | undefined) {
    const r = this.catalog.resolveName(name);
    if (r.status === "found") return this.addKey(entityKey(r.entity), count, line, name);
    if (r.status === "ambiguous") {
      const ids = r.candidates.map((e) => this.catalog.basePrint(entityKey(e))?.cardId ?? String(e.id));
      return this.problem(line, name, `Several different cards are called ${name}; add the set and number`, ids);
    }
    this.problem(line, name, "No card with that name");
  }
  energy(e: EnergyType) {
    if (!this.energies.includes(e) && this.energies.length < 3) this.energies.push(e);
  }
  energyName(raw: string, line?: number) {
    const e = raw.trim().replace(/^\w/, (c) => c.toUpperCase());
    if (isEnergyType(e)) this.energy(e);
    else this.problem(line, raw, "Not an energy you can pick in the game");
  }
  result(format: ImportResult["format"]): ImportResult {
    return { deck: { name: this.name, cards: this.cards, energy: this.energies }, problems: this.problems, format };
  }
}
