import { readFileSync } from "node:fs";
import { Catalog } from "../src/lib/cards/catalog.ts";
import type { CardSnapshot } from "../src/lib/cards/types.ts";

let cached: Catalog | undefined;
/** The real generated snapshot (run `npm run sync-data` first). */
export function catalog(): Catalog {
  cached ??= new Catalog(JSON.parse(readFileSync("public/data/cards.v1.json", "utf8")) as CardSnapshot);
  return cached;
}
