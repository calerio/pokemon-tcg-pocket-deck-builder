/**
 * Instant card search. The index is built once; each query is a linear scan over ~2.3k entities with
 * cheap string checks, well under a millisecond per keystroke.
 */
import type { Catalog, EntityKey, Print } from "./catalog.ts";
import { entityKey } from "./catalog.ts";
import type { Entity } from "./types.ts";
import { nameKey } from "./normalize.ts";

export interface Filters {
  types?: string[]; // energy types, e.g. ["Fighting"]
  kinds?: Array<"pokemon" | "trainer">;
  stages?: Array<"Basic" | "Stage 1" | "Stage 2">;
  trainerTypes?: string[]; // Supporter, Item, Tool, Stadium
  sets?: string[];
  rarityGroups?: string[]; // Diamond, Star, Shiny, Crown
  ex?: boolean;
}

export interface SearchHit {
  key: EntityKey;
  entity: Entity;
  print: Print;
  score: number;
}

interface Row {
  key: EntityKey;
  entity: Entity;
  print: Print;
  name: string; // nameKey
  words: string[];
  text: string; // name + attack/ability names + card ids, for secondary matches
  sets: Set<string>;
  rarityGroups: Set<string>;
  newest: string; // latest release date among prints, for default ordering
}

export class SearchIndex {
  private readonly rows: Row[];

  constructor(private readonly catalog: Catalog) {
    this.rows = catalog.entities.map((entity) => {
      const key = entityKey(entity);
      const prints = catalog.printsOf(key);
      const print = prints[0]!;
      const extra = [
        ...(entity.attacks ?? []).map((a) => a.name),
        ...(entity.abilities ?? []).map((a) => a.name),
        entity.trainerType ?? "",
        ...(entity.types ?? []),
        ...prints.map((p) => `${p.cardId} ${p.set} ${p.number}`),
      ];
      return {
        key, entity, print,
        name: entity.nameKey,
        words: entity.nameKey.split(/[\s-]+/),
        text: nameKey(extra.join(" ")),
        sets: new Set(prints.map((p) => p.set)),
        rarityGroups: new Set(prints.map((p) => catalog.rarity(p.rarity)?.group ?? "")),
        newest: prints.map((p) => catalog.set(p.set)?.releaseDate ?? "").sort().at(-1) ?? "",
      };
    });
  }

  search(query: string, filters: Filters = {}, limit = Infinity): SearchHit[] {
    const q = nameKey(query);
    const terms = q ? q.split(" ") : [];
    // A card number ("B3 81", "B3-081") pins that exact card to the top.
    const exactPrint = q ? this.catalog.printById(query) : undefined;
    const hits: SearchHit[] = [];
    for (const r of this.rows) {
      if (!matchesFilters(r, filters)) continue;
      let score = 0;
      if (terms.length) {
        if (exactPrint && exactPrint.entity === r.entity) score = 2000;
        else if (r.name === q) score = 1000;
        else if (r.name.startsWith(q)) score = 800;
        else if (r.words.some((w) => w.startsWith(q))) score = 600;
        else if (terms.every((t) => r.name.includes(t))) score = 400;
        else if (terms.every((t) => r.name.includes(t) || r.text.includes(t))) score = 100;
        else continue;
        score -= r.name.length * 0.5; // shorter names first among equals
      }
      hits.push({ key: r.key, entity: r.entity, print: r.print, score });
    }
    // With no query, newest cards first (what people build with); otherwise by relevance, then newest.
    const byNewest = new Map(this.rows.map((r) => [r.key, r.newest]));
    hits.sort((a, b) => b.score - a.score || (byNewest.get(b.key)! < byNewest.get(a.key)! ? -1 : byNewest.get(b.key)! > byNewest.get(a.key)! ? 1 : a.entity.name.localeCompare(b.entity.name)));
    return hits.slice(0, limit);
  }

  get size(): number {
    return this.rows.length;
  }

  get catalogRef(): Catalog {
    return this.catalog;
  }
}

function matchesFilters(r: Row, f: Filters): boolean {
  const e = r.entity;
  if (f.kinds?.length && !f.kinds.includes(e.kind)) return false;
  if (f.types?.length && !(e.types ?? []).some((t) => f.types!.includes(t))) return false;
  if (f.stages?.length && !(e.stage && f.stages.includes(e.stage))) return false;
  if (f.trainerTypes?.length && !(e.trainerType && f.trainerTypes.includes(e.trainerType))) return false;
  if (f.sets?.length && !f.sets.some((s) => r.sets.has(s))) return false;
  if (f.rarityGroups?.length && !f.rarityGroups.some((g) => r.rarityGroups.has(g))) return false;
  if (f.ex !== undefined && Boolean(e.isEx) !== f.ex) return false;
  return true;
}

export function activeFilterCount(f: Filters): number {
  return (
    (f.types?.length ?? 0) + (f.kinds?.length ?? 0) + (f.stages?.length ?? 0) + (f.trainerTypes?.length ?? 0) +
    (f.sets?.length ?? 0) + (f.rarityGroups?.length ?? 0) + (f.ex !== undefined ? 1 : 0)
  );
}
