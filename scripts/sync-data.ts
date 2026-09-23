/**
 * Build public/data/cards.v1.json + meta.json from:
 *   - the flibustier database (npm `pokemon-tcg-pocket-database`, pinned): identity, entity IDs, sets, packs
 *   - data/upstream/gameplay.json: gameplay fields (TCGdex + Limitless), trimmed by import-gameplay.mjs
 *   - data/overrides.json (reviewed fixes) and data/known-gaps.json (prints with no gameplay yet)
 *
 * Fails loudly (exit 1) on anything ambiguous or regressive. See docs/data-sources.md.
 * Run: npm run sync-data
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import type { CardSnapshot, Entity, PrintTuple, RarityInfo, SetInfo, SnapshotMeta } from "../src/lib/cards/types.ts";
import { cleanName, nameKey, normaliseStage, padNumber } from "../src/lib/cards/normalize.ts";
import { EXCHANGE_BASE, EXCHANGE_COMMIT, TCGDEX_BASE } from "../src/lib/cards/images.ts";

const DB_DIR = "node_modules/pokemon-tcg-pocket-database";
const OUT_DIR = "public/data";
const SNAPSHOT = `${OUT_DIR}/cards.v1.json`;
const META = `${OUT_DIR}/meta.json`;
const GZIP_BUDGET = 300 * 1024;
const TRAINER_OFFSET = 10_000_000;

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// ---------- inputs ----------
const readText = (p: string) => readFileSync(p, "utf8");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const dbPkg = JSON.parse(readText(`${DB_DIR}/package.json`)) as { version: string };
const dbCardsText = readText(`${DB_DIR}/dist/cards.json`);
const dbCards = JSON.parse(dbCardsText) as Array<{ set: string; number: number; rarity: string; name: string; image?: string; packs?: string[] }>;
const dbSets = JSON.parse(readText(`${DB_DIR}/dist/sets.json`)) as Record<string, Array<{ code: string; releaseDate: string; name: Record<string, string>; packs?: string[] }>>;
const dbRarities = JSON.parse(readText(`${DB_DIR}/dist/rarities.json`)) as Record<string, { label: string; group: string; count: number }>;
const gameplayText = readText("data/upstream/gameplay.json");
type Gameplay = {
  name: string; category: string; rarity: string; from: "tcgdex" | "limitless"; tcgdexImage: boolean;
  hp?: number | null; types?: string[]; stage?: string | null; evolveFrom?: string | null; suffix?: string | null;
  retreat?: number | null; weaknesses?: Array<{ type: string }>; abilities?: Array<{ name: string; effect: string }>;
  attacks?: Array<{ name: string; cost: string[]; damage: string | number | null; effect: string }>;
  trainerType?: string | null; effect?: string;
};
const gameplay = JSON.parse(gameplayText) as Record<string, Gameplay>;
const overrides = (JSON.parse(readText("data/overrides.json")) as { cards: Record<string, { set: Partial<Gameplay> }> }).cards;
const knownGaps = new Set((JSON.parse(readText("data/known-gaps.json")) as { noGameplay: string[] }).noGameplay);
const fixtures = JSON.parse(readText("tests/fixtures/payloads.json")) as Record<string, { trainers: number[]; pokemon: number[] }>;

// ---------- sets & rarities ----------
const SET_ALIAS: Record<string, string> = { "PROMO-A": "P-A", "PROMO-B": "P-B" };
const alias = (code: string) => SET_ALIAS[code] ?? code;

const sets: SetInfo[] = [];
for (const [series, list] of Object.entries(dbSets)) {
  for (const s of list) {
    sets.push({
      code: alias(s.code), sourceCode: s.code, series, releaseDate: s.releaseDate,
      name: s.name.en ?? s.code, packs: s.packs ?? [],
    });
  }
}
const setBySource = new Map(sets.map((s) => [s.sourceCode, s]));
const rarities: RarityInfo[] = Object.entries(dbRarities).map(([code, r]) => ({ code, label: r.label, group: r.group, count: r.count }));
const rarityRank = new Map(rarities.map((r, i) => [r.code, i]));

// ---------- overrides (must still change something) ----------
for (const [id, o] of Object.entries(overrides)) {
  const g = gameplay[id];
  if (!g) { fail(`override for ${id}: no such card in gameplay.json`); continue; }
  const changes = Object.entries(o.set).filter(([k, v]) => JSON.stringify((g as Record<string, unknown>)[k]) !== JSON.stringify(v));
  if (!changes.length) fail(`override for ${id} no longer changes anything (upstream fixed?): remove it`);
  Object.assign(g, o.set);
}

// ---------- prints → entities ----------
const ENTITY_RE = /^c(PK|TR)_\d+_(\d{6})_/;
type PrintRec = { cardId: string; rarity: string; packs: string[]; g: Gameplay | undefined; set: SetInfo };
const byEntity = new Map<string, { kind: "pokemon" | "trainer"; id: number; prints: PrintRec[] }>();

for (const r of dbCards) {
  const set = setBySource.get(r.set);
  if (!set) { fail(`card ${r.set}-${r.number}: unknown set ${r.set}`); continue; }
  const cardId = `${set.code}-${padNumber(r.number)}`;
  const m = ENTITY_RE.exec(r.image ?? "");
  if (!m) { fail(`${cardId}: no entity ID in image name ${JSON.stringify(r.image)}`); continue; }
  const kind = m[1] === "PK" ? "pokemon" : "trainer";
  const id = Number(m[2]);
  const g = gameplay[cardId];
  if (!g && !knownGaps.has(cardId)) fail(`${cardId} (${r.name}) has no gameplay data and is not in data/known-gaps.json`);
  if (g && knownGaps.has(cardId)) fail(`${cardId} now has gameplay data: remove it from data/known-gaps.json`);
  if (g) {
    const isTrainer = g.category === "Trainer";
    if (isTrainer !== (kind === "trainer")) fail(`${cardId}: flibustier says ${kind}, gameplay says ${g.category}`);
  }
  const key = `${kind}:${id}`;
  const bucket = byEntity.get(key) ?? { kind, id, prints: [] };
  bucket.prints.push({ cardId, rarity: r.rarity, packs: r.packs ?? [], g, set });
  byEntity.set(key, bucket);
}
const dbIds = new Set(dbCards.map((r) => `${alias(r.set)}-${padNumber(r.number)}`));
for (const id of Object.keys(gameplay)) if (!dbIds.has(id)) fail(`gameplay card ${id} is not in the flibustier database`);

// ---------- build entities ----------
const entities: Entity[] = [];
const prints: PrintTuple[] = [];
const sortedBuckets = [...byEntity.values()].sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind === "pokemon" ? -1 : 1));

for (const b of sortedBuckets) {
  const withData = b.prints.filter((p) => p.g);
  // consistency across prints of one entity
  const names = new Set(withData.map((p) => nameKey(p.g!.name)));
  const hps = new Set(withData.map((p) => p.g!.hp ?? null));
  const stages = new Set(withData.map((p) => normaliseStage(p.g!.stage) ?? null));
  if (names.size > 1) fail(`entity ${b.kind} ${b.id} has several names: ${[...names].join(" / ")} (${withData.map((p) => p.cardId).join(", ")})`);
  if (hps.size > 1) fail(`entity ${b.kind} ${b.id} has several HP values: ${[...hps].join(" / ")} (${withData.map((p) => p.cardId).join(", ")})`);
  if (stages.size > 1) fail(`entity ${b.kind} ${b.id} has several stages: ${[...stages].join(" / ")}`);

  // base print: lowest rarity, then earliest card ID
  const base = [...withData].sort((x, y) => (rarityRank.get(x.rarity) ?? 99) - (rarityRank.get(y.rarity) ?? 99) || x.cardId.localeCompare(y.cardId, "en", { numeric: true }))[0];
  const dbName = dbCards.find((r) => `${alias(r.set)}-${padNumber(r.number)}` === b.prints[0]!.cardId)?.name ?? "?";
  const name = cleanName(base ? base.g!.name : dbName);
  const e: Entity = { kind: b.kind, id: b.id, name, nameKey: nameKey(name) };
  if (!base) {
    e.partial = true;
  } else {
    const g = base.g!;
    e.source = g.from;
    if (b.kind === "pokemon") {
      if (g.hp != null) e.hp = g.hp;
      if (g.types?.length) e.types = g.types;
      const st = normaliseStage(g.stage);
      if (st) e.stage = st; else fail(`${base.cardId}: unknown stage ${JSON.stringify(g.stage)}`);
      if (g.evolveFrom) e.evolvesFrom = cleanName(g.evolveFrom);
      if (g.retreat != null) e.retreat = g.retreat;
      if (g.weaknesses?.[0]?.type) e.weakness = g.weaknesses[0].type;
      if (/ ex$/i.test(name)) e.isEx = true;
      if (/^Mega /.test(name)) e.isMega = true;
      if (g.abilities?.length) e.abilities = g.abilities.map((a) => ({ name: a.name, effect: a.effect }));
      e.attacks = (g.attacks ?? []).map((a) => ({ name: a.name, cost: a.cost, damage: a.damage == null || a.damage === "" ? null : String(a.damage), effect: a.effect }));
    } else {
      if (g.trainerType) e.trainerType = g.trainerType;
      if (g.effect) e.effect = g.effect;
    }
  }
  const idx = entities.push(e) - 1;
  for (const p of b.prints) prints.push([p.cardId, p.rarity, idx, p.packs, p.g?.tcgdexImage ? 1 : 0]);
}
prints.sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }));

// ---------- regression checks ----------
const have = new Set(entities.map((e) => `${e.kind}:${e.id}`));
for (const [name, fx] of Object.entries(fixtures)) {
  for (const t of fx.trainers) if (!have.has(`trainer:${t}`)) fail(`fixture ${name}: trainer entity ${t} missing`);
  for (const p of fx.pokemon) if (!have.has(`pokemon:${p}`)) fail(`fixture ${name}: Pokémon entity ${p} missing`);
}
let previous: CardSnapshot | undefined;
if (existsSync(SNAPSHOT)) {
  previous = JSON.parse(readText(SNAPSHOT)) as CardSnapshot;
  for (const e of previous.entities) {
    if (!have.has(`${e.kind}:${e.id}`)) fail(`entity ${e.kind} ${e.id} (${e.name}) disappeared since the last snapshot`);
  }
}
for (const t of entities.filter((e) => e.kind === "trainer")) {
  if (t.id + TRAINER_OFFSET > 0xffffff) fail(`trainer ${t.id} does not fit the deck-code format`);
}

if (errors.length) {
  console.error(`sync-data FAILED with ${errors.length} problem(s):\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}

// ---------- write ----------
const generatedAt = new Date().toISOString();
const snapshot: CardSnapshot = { version: 1, generatedAt, sets, rarities, entities, prints };
const body = JSON.stringify(snapshot);
const gz = gzipSync(body).length;
if (gz > GZIP_BUDGET) {
  console.error(`sync-data FAILED: snapshot is ${(gz / 1024).toFixed(0)} KB gzipped, budget ${GZIP_BUDGET / 1024} KB`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(SNAPSHOT, body);

const partial = entities.filter((e) => e.partial).length;
const meta: SnapshotMeta = {
  version: 1,
  generatedAt,
  counts: { sets: sets.length, entities: entities.length, prints: prints.length, partialEntities: partial },
  sources: [
    { name: "flibustier/pokemon-tcg-pocket-database", url: "https://github.com/flibustier/pokemon-tcg-pocket-database", licence: "MIT", version: dbPkg.version, sha256: sha256(dbCardsText), note: "identity, entity IDs, sets, packs, rarities" },
    { name: "TCGdex", url: "https://tcgdex.dev", licence: "MIT", note: "gameplay fields for sets it covers" },
    { name: "Limitless TCG Pocket card database", url: "https://pocket.limitlesstcg.com/cards", licence: "none published", note: "gameplay fields for sets TCGdex lacks (see docs/data-sources.md)" },
    { name: "data/upstream/gameplay.json", url: "data/upstream/gameplay.json", licence: "see above", sha256: sha256(gameplayText) },
  ],
  images: { tcgdex: TCGDEX_BASE, exchange: EXCHANGE_BASE, exchangeCommit: EXCHANGE_COMMIT },
  transforms: [
    "set codes PROMO-A/PROMO-B aliased to P-A/P-B; collector numbers zero-padded to 3 digits",
    "entity ID parsed from the flibustier image name (cPK_/cTR_ prefix → kind)",
    "prints grouped by entity; gameplay taken from the lowest-rarity print; names/HP/stage must agree across prints",
    `${Object.keys(overrides).length} reviewed overrides applied (data/overrides.json)`,
    "text normalised: NFKC, straight apostrophes, 'Stage 1' spelling",
  ],
};
writeFileSync(META, JSON.stringify(meta, null, 2) + "\n");

// ---------- summary ----------
console.log(`sync-data OK: ${sets.length} sets, ${entities.length} entities (${partial} partial), ${prints.length} prints`);
console.log(`  ${SNAPSHOT}: ${(body.length / 1024).toFixed(0)} KB raw, ${(gz / 1024).toFixed(0)} KB gzipped (budget ${GZIP_BUDGET / 1024} KB)`);
if (previous) {
  const prevPrints = new Set(previous.prints.map((p) => p[0]));
  const added = prints.filter((p) => !prevPrints.has(p[0])).map((p) => p[0]);
  console.log(`  vs previous snapshot: +${added.length} prints${added.length ? ` (${added.slice(0, 12).join(", ")}${added.length > 12 ? ", …" : ""})` : ""}, entities ${previous.entities.length} → ${entities.length}`);
}
