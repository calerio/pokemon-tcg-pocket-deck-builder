/**
 * Deck validation. Produces the problems plus the single "next useful message" the builder shows,
 * e.g. "Add 4 more cards", "Choose an energy", "Ready to generate".
 */
import type { Catalog, EntityKey } from "../cards/catalog.ts";
import { MAX_ENERGIES } from "../codec/energy.ts";
import { DECK_SIZE, MAX_COPIES, deckSize, type Deck } from "./model.ts";

export type IssueCode =
  | "too-few-cards"
  | "too-many-cards"
  | "no-basic"
  | "no-energy"
  | "too-many-energies"
  | "copy-limit"
  | "unknown-card"
  | "missing-pre-evolution"
  | "limited-data";

export interface Issue {
  code: IssueCode;
  severity: "error" | "warning";
  message: string;
  /** Where to send keyboard focus: "cards", "energy", or a specific card. */
  focus: "cards" | "energy" | EntityKey;
}

export interface Validation {
  valid: boolean;
  size: number;
  issues: Issue[];
  /** The one thing to tell the user next. */
  next: { tone: "todo" | "ready" | "problem"; text: string; focus?: Issue["focus"] };
}

export function validateDeck(d: Deck, catalog: Catalog): Validation {
  const issues: Issue[] = [];
  const size = deckSize(d);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  if (size < DECK_SIZE) issues.push({ code: "too-few-cards", severity: "error", message: `Add ${plural(DECK_SIZE - size, "more card")}`, focus: "cards" });
  if (size > DECK_SIZE) issues.push({ code: "too-many-cards", severity: "error", message: `Remove ${plural(size - DECK_SIZE, "card")}`, focus: "cards" });

  const byName = new Map<string, { name: string; n: number; key: EntityKey }>();
  let basics = 0;
  let unknownBasic = false;
  const names = new Set<string>();
  for (const c of d.cards) {
    const e = catalog.entity(c.key);
    if (!e) {
      issues.push({ code: "unknown-card", severity: "error", message: `Unknown card ${c.key}: remove it`, focus: c.key });
      continue;
    }
    names.add(e.nameKey);
    const cur = byName.get(e.nameKey) ?? { name: e.name, n: 0, key: c.key };
    cur.n += c.count;
    byName.set(e.nameKey, cur);
    if (e.kind === "pokemon") {
      if (e.stage === "Basic") basics += c.count;
      if (e.partial) unknownBasic = true;
    }
  }
  for (const { name, n, key } of byName.values()) {
    if (n > MAX_COPIES) issues.push({ code: "copy-limit", severity: "error", message: `Only ${MAX_COPIES} ${name} allowed`, focus: key });
  }
  if (size > 0 && basics === 0 && !unknownBasic) {
    issues.push({ code: "no-basic", severity: "error", message: "Add a Basic Pokémon", focus: "cards" });
  }
  if (d.energy.length === 0) issues.push({ code: "no-energy", severity: "error", message: "Choose an energy", focus: "energy" });
  if (d.energy.length > MAX_ENERGIES) issues.push({ code: "too-many-energies", severity: "error", message: `Pick at most ${MAX_ENERGIES} energies`, focus: "energy" });

  for (const c of d.cards) {
    const e = catalog.entity(c.key);
    if (!e) continue;
    if (e.partial) issues.push({ code: "limited-data", severity: "warning", message: `${e.name}: limited card data`, focus: c.key });
    if (e.kind === "pokemon" && e.evolvesFrom && !names.has(e.evolvesFrom.toLowerCase())) {
      issues.push({ code: "missing-pre-evolution", severity: "warning", message: `${e.name} evolves from ${e.evolvesFrom}, which isn't in the deck`, focus: c.key });
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  // Priority for the single next message: fix problems first, then fill the deck, then energy.
  const order: IssueCode[] = ["unknown-card", "copy-limit", "too-many-cards", "too-many-energies", "too-few-cards", "no-basic", "no-energy"];
  const first = [...errors].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))[0];
  const next: Validation["next"] = first
    ? { tone: ["too-few-cards", "no-energy"].includes(first.code) ? "todo" : "problem", text: first.message, focus: first.focus }
    : { tone: "ready", text: "Ready to generate" };
  return { valid: errors.length === 0, size, issues, next };
}
