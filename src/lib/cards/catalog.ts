/** In-memory card catalogue built from the snapshot, with the indexes the UI and importers need. */
import type { CardSnapshot, Entity, EntityKind, RarityInfo, SetInfo } from "./types.ts";
import { imageCandidates } from "./images.ts";
import { nameKey, padNumber } from "./normalize.ts";

export interface Print {
  cardId: string;
  set: string;
  number: number;
  rarity: string;
  entity: Entity;
  packs: string[];
  images: string[];
}

/** Stable key for a playable card: "pokemon:3720" / "trainer:40". */
export type EntityKey = `${EntityKind}:${number}`;
export const entityKey = (e: { kind: EntityKind; id: number }): EntityKey => `${e.kind}:${e.id}`;

export type NameMatch = { status: "found"; entity: Entity } | { status: "ambiguous"; candidates: Entity[] } | { status: "unknown" };

export class Catalog {
  readonly sets: SetInfo[];
  readonly rarities: RarityInfo[];
  readonly entities: Entity[];
  readonly prints: Print[];
  readonly generatedAt: string;
  private readonly byKey = new Map<EntityKey, Entity>();
  private readonly byCardId = new Map<string, Print>();
  private readonly printsByKey = new Map<EntityKey, Print[]>();
  private readonly byName = new Map<string, Entity[]>();
  private readonly setByCode = new Map<string, SetInfo>();
  private readonly rarityRank = new Map<string, number>();

  constructor(snap: CardSnapshot) {
    this.sets = snap.sets;
    this.rarities = snap.rarities;
    this.entities = snap.entities;
    this.generatedAt = snap.generatedAt;
    snap.sets.forEach((s) => this.setByCode.set(s.code, s));
    snap.rarities.forEach((r, i) => this.rarityRank.set(r.code, i));
    for (const e of snap.entities) {
      this.byKey.set(entityKey(e), e);
      const list = this.byName.get(e.nameKey) ?? [];
      list.push(e);
      this.byName.set(e.nameKey, list);
    }
    this.prints = snap.prints.map(([cardId, rarity, idx, packs, tcgdex]) => {
      const entity = snap.entities[idx];
      if (!entity) throw new Error(`print ${cardId} points at missing entity ${idx}`);
      const cut = cardId.lastIndexOf("-");
      const set = cardId.slice(0, cut);
      const p: Print = {
        cardId, set, number: Number(cardId.slice(cut + 1)), rarity, entity, packs,
        images: imageCandidates({ cardId, sourceSetCode: this.setByCode.get(set)?.sourceCode ?? set, hasTcgdexImage: tcgdex === 1 }),
      };
      this.byCardId.set(cardId, p);
      const k = entityKey(entity);
      const list = this.printsByKey.get(k) ?? [];
      list.push(p);
      this.printsByKey.set(k, list);
      return p;
    });
    for (const list of this.printsByKey.values()) list.sort((a, b) => this.rank(a) - this.rank(b) || a.cardId.localeCompare(b.cardId, "en", { numeric: true }));
  }

  private rank(p: Print): number {
    return this.rarityRank.get(p.rarity) ?? 99;
  }

  entity(key: EntityKey): Entity | undefined {
    return this.byKey.get(key);
  }

  /** All prints of a card, lowest rarity first (index 0 is the "base" print used for its tile). */
  printsOf(key: EntityKey): Print[] {
    return this.printsByKey.get(key) ?? [];
  }

  basePrint(key: EntityKey): Print | undefined {
    return this.printsOf(key)[0];
  }

  set(code: string): SetInfo | undefined {
    return this.setByCode.get(code);
  }

  rarity(code: string): RarityInfo | undefined {
    return this.rarities[this.rarityRank.get(code) ?? -1];
  }

  /** "B3-81", "B3-081", "B3 81", "P-A 7" → print. */
  printById(id: string): Print | undefined {
    const m = /^\s*([A-Za-z0-9]+(?:-[A-Za-z])?)[\s-]+0*(\d{1,3})\s*$/.exec(id);
    if (!m) return undefined;
    const set = this.setByCode.get(m[1]!) ?? this.sets.find((s) => s.code.toLowerCase() === m[1]!.toLowerCase() || s.sourceCode.toLowerCase() === m[1]!.toLowerCase());
    return set ? this.byCardId.get(`${set.code}-${padNumber(m[2]!)}`) : undefined;
  }

  /** Resolve a card name. Never guesses: several different cards with the name → ambiguous. */
  resolveName(name: string): NameMatch {
    const hits = this.byName.get(nameKey(name)) ?? [];
    if (hits.length === 1) return { status: "found", entity: hits[0]! };
    if (hits.length > 1) return { status: "ambiguous", candidates: hits };
    return { status: "unknown" };
  }
}

export async function loadCatalog(url: string, fetchImpl: typeof fetch = fetch): Promise<Catalog> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`could not load card data (${res.status})`);
  const snap = (await res.json()) as CardSnapshot;
  if (snap.version !== 1) throw new Error(`unsupported card data version ${String(snap.version)}`);
  return new Catalog(snap);
}
