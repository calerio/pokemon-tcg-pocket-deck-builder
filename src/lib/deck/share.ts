/**
 * Share links: the deck code goes in the URL *hash* (#d=…&n=…), so it never reaches any server or log.
 * The payload is URL-safe Base64 (RFC 4648 §5); a full deck makes a ~100-character hash.
 */
import { decodeDeckCode, type DeckCodeParts } from "../codec/payload.ts";

export function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return b64 + "=".repeat((4 - (b64.length % 4)) % 4);
}

export function shareHash(payload: string, name: string): string {
  const p = new URLSearchParams({ d: toBase64Url(payload) });
  if (name.trim()) p.set("n", name.trim().slice(0, 80));
  return `#${p.toString()}`;
}

export interface SharedDeck {
  payload: string;
  parts: DeckCodeParts;
  name?: string;
}

/** Parse a location hash. Returns null when there's no deck in it; throws DeckCodeError when it's malformed. */
export function parseShareHash(hash: string): SharedDeck | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const d = p.get("d");
  if (!d) return null;
  const payload = fromBase64Url(d);
  const name = p.get("n") ?? undefined;
  return name ? { payload, parts: decodeDeckCode(payload), name } : { payload, parts: decodeDeckCode(payload) };
}
