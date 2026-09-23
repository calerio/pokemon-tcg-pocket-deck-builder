/**
 * Shape of public/data/cards.v1.json, the only card data the site loads.
 * Produced by scripts/sync-data.ts. Bump SNAPSHOT_VERSION (and the file name) on breaking changes.
 */
export const SNAPSHOT_VERSION = 1;

export type EntityKind = "pokemon" | "trainer";

export interface Attack {
  name: string;
  /** Energy symbols, e.g. ["Fighting", "Colorless"]. */
  cost: string[];
  /** As printed: "90", "90+", "30x", or null for effect-only attacks. */
  damage: string | null;
  effect: string;
}

export interface Ability {
  name: string;
  effect: string;
}

/** One playable card. Every print (alt art, rarity) of it shares the entity ID used in deck codes. */
export interface Entity {
  kind: EntityKind;
  /** Entity ID as used in deck codes (trainers WITHOUT the 10,000,000 offset). */
  id: number;
  name: string;
  /** Normalised name used for the 2-copies-per-name rule and search. */
  nameKey: string;
  /** True when no print of this card has gameplay data yet (only identity is known). */
  partial?: true;
  /** Where the gameplay fields came from. */
  source?: "tcgdex" | "limitless";
  // Pokémon
  hp?: number;
  types?: string[];
  stage?: "Basic" | "Stage 1" | "Stage 2";
  evolvesFrom?: string;
  retreat?: number;
  weakness?: string;
  isEx?: boolean;
  isMega?: boolean;
  abilities?: Ability[];
  attacks?: Attack[];
  // Trainer
  trainerType?: string;
  effect?: string;
}

/**
 * A printed card, as a compact tuple:
 * [cardId e.g. "B3-081", rarityCode e.g. "RR", entityIndex into entities[], packs[], hasTcgdexImage 0|1]
 */
export type PrintTuple = [string, string, number, string[], 0 | 1];

export interface SetInfo {
  /** Code used in card IDs and by the game/TCGdex, e.g. "A1", "P-A". */
  code: string;
  /** Code used by the flibustier database and its image paths, e.g. "PROMO-A". */
  sourceCode: string;
  name: string;
  series: string;
  releaseDate: string;
  packs: string[];
}

export interface RarityInfo {
  code: string;
  label: string;
  /** Symbol family shown in game: Diamond, Star, Shiny, Crown. */
  group: string;
  /** Number of symbols (◊◊◊ = 3). */
  count: number;
}

export interface CardSnapshot {
  version: typeof SNAPSHOT_VERSION;
  generatedAt: string;
  sets: SetInfo[];
  rarities: RarityInfo[];
  entities: Entity[];
  prints: PrintTuple[];
}

export interface SnapshotMeta {
  version: typeof SNAPSHOT_VERSION;
  generatedAt: string;
  counts: { sets: number; entities: number; prints: number; partialEntities: number };
  sources: Array<{ name: string; url: string; licence: string; version?: string; sha256?: string; note?: string }>;
  images: { tcgdex: string; exchange: string; exchangeCommit: string };
  transforms: string[];
}
