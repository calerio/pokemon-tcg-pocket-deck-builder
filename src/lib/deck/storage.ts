/**
 * Versioned local persistence. Everything stays in this browser's localStorage. The stored envelope
 * carries a version, and `migrate` upgrades older envelopes step by step (add a step per version).
 */
import { z } from "zod";
import { ENERGY_TYPES } from "../codec/energy.ts";
import type { Deck } from "./model.ts";
import { emptyDeck } from "./model.ts";

export const STORAGE_KEY = "pdl:v1";
export const STORAGE_VERSION = 1;

const deckSchema = z.object({
  name: z.string().max(80),
  cards: z.array(z.object({ key: z.string().regex(/^(pokemon|trainer):\d+$/), count: z.number().int().min(1).max(4), printId: z.string().optional() })).max(40),
  energy: z.array(z.enum(ENERGY_TYPES)).max(3),
});

const envelopeSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  draft: deckSchema,
  saved: z.array(deckSchema.extend({ savedAt: z.string() })).max(50).default([]),
});

export type SavedDeck = Deck & { savedAt: string };
export interface Envelope {
  version: typeof STORAGE_VERSION;
  draft: Deck;
  saved: SavedDeck[];
}

export const emptyEnvelope = (): Envelope => ({ version: STORAGE_VERSION, draft: emptyDeck(), saved: [] });

/** Upgrade any older stored shape to the current one. Unknown/corrupt data → a fresh envelope. */
export function migrate(raw: unknown): Envelope {
  let data = raw as Record<string, unknown> | null;
  // v0 (pre-release drafts): { name, cards, energy } stored directly
  if (data && typeof data === "object" && !("version" in data) && "cards" in data) {
    data = { version: 1, draft: data, saved: [] };
  }
  const parsed = envelopeSchema.safeParse(data);
  return parsed.success ? (parsed.data as Envelope) : emptyEnvelope();
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read the envelope; never throws (private mode, blocked storage and corrupt JSON all fall back). */
export function load(store: KeyValueStore | undefined): Envelope {
  try {
    const text = store?.getItem(STORAGE_KEY);
    return text ? migrate(JSON.parse(text)) : emptyEnvelope();
  } catch {
    return emptyEnvelope();
  }
}

/** Write the envelope; returns false when storage is unavailable or full. */
export function save(store: KeyValueStore | undefined, env: Envelope): boolean {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(env));
    return Boolean(store);
  } catch {
    return false;
  }
}
