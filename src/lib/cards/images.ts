/**
 * Card-image URL adapter. Card artwork is © The Pokémon Company et al. and is NEVER re-hosted by this
 * project: images are hotlinked from community hosts, and the UI falls back to a text tile when
 * every candidate fails. Swap hosts here and nowhere else.
 */
import { padNumber } from "./normalize.ts";

/**
 * Pinned commit of flibustier/pokemon-tcg-exchange whose card images are served through jsDelivr.
 * Pinning keeps images stable; `npm run sync-data` records it in meta.json. Update deliberately.
 */
export const EXCHANGE_COMMIT = "613d6a038e4a68c7014af2d4538c1f6a9ebe8d8b";

export const TCGDEX_BASE = "https://assets.tcgdex.net/en/tcgp";
export const EXCHANGE_BASE = `https://cdn.jsdelivr.net/gh/flibustier/pokemon-tcg-exchange@${EXCHANGE_COMMIT}/public/images/cards-by-set`;

export interface ImageSource {
  /** Card ID, e.g. "B3-081" or "P-A-007". */
  cardId: string;
  /** Set code as used by the flibustier database (e.g. "PROMO-A"). */
  sourceSetCode: string;
  hasTcgdexImage: boolean;
}

function splitCardId(cardId: string): { set: string; number: string } {
  const i = cardId.lastIndexOf("-");
  return { set: cardId.slice(0, i), number: cardId.slice(i + 1) };
}

/** Ordered image URLs to try for a print (small thumbnails). Empty → render the text tile. */
export function imageCandidates(src: ImageSource): string[] {
  const { set, number } = splitCardId(src.cardId);
  const urls: string[] = [];
  if (src.hasTcgdexImage) urls.push(`${TCGDEX_BASE}/${set}/${padNumber(number)}/low.webp`);
  urls.push(`${EXCHANGE_BASE}/${src.sourceSetCode}/${Number(number)}.webp`);
  return urls;
}
