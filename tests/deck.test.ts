import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/payloads.json";
import { catalog } from "./helpers.ts";
import { entityKey, type EntityKey } from "../src/lib/cards/catalog.ts";
import { SearchIndex } from "../src/lib/cards/search.ts";
import { decodeDeckCode, encodeDeckCode } from "../src/lib/codec/payload.ts";
import {
  addCard, deckSize, emptyDeck, fromCodeParts, groupDeck, moveCard, removeCard, toCodeParts, toggleEnergy, type Deck,
} from "../src/lib/deck/model.ts";
import { validateDeck } from "../src/lib/deck/validate.ts";
import { commit, initHistory, redo, undo } from "../src/lib/deck/history.ts";
import { exportJson, exportText, importDeck, ImportError } from "../src/lib/deck/io.ts";
import { load, migrate, save, STORAGE_KEY } from "../src/lib/deck/storage.ts";
import { parseShareHash, shareHash } from "../src/lib/deck/share.ts";

const cat = catalog();
const key = (id: string): EntityKey => entityKey(cat.printById(id)!.entity);
const lucario = (fixtures as Record<string, { payload: string }>).ingame_verified_mega_lucario_ex!.payload;

describe("catalog", () => {
  it("loads the full snapshot", () => {
    expect(cat.entities.length).toBeGreaterThan(2000);
    expect(cat.prints.length).toBeGreaterThan(3500);
  });
  it("resolves card IDs in several spellings", () => {
    for (const id of ["B3-081", "B3-81", "B3 81", "b3 081"]) expect(cat.printById(id)?.entity.name).toBe("Mega Lucario ex");
    expect(cat.printById("P-A 7")?.entity.name).toBe("Professor's Research");
    expect(cat.printById("PROMO-A 7")?.entity.name).toBe("Professor's Research");
    expect(cat.printById("ZZ-1")).toBeUndefined();
  });
  it("never guesses an ambiguous name", () => {
    const r = cat.resolveName("Bulbasaur");
    expect(r.status).toBe("ambiguous"); // Bulbasaur is entities 10 and 13070
    expect(cat.resolveName("Mega Lucario ex").status).toBe("found");
    expect(cat.resolveName("Definitely Not A Card").status).toBe("unknown");
  });
  it("gives each print image candidates, TCGdex first when available", () => {
    const a1 = cat.printById("A1-001")!;
    expect(a1.images[0]).toBe("https://assets.tcgdex.net/en/tcgp/A1/001/low.webp");
    const b3 = cat.printById("B3-081")!;
    expect(b3.images).toHaveLength(1);
    expect(b3.images[0]).toMatch(/pokemon-tcg-exchange@[0-9a-f]{40}\/public\/images\/cards-by-set\/B3\/81\.webp$/);
    expect(cat.printById("P-A-007")!.images.at(-1)).toMatch(/cards-by-set\/PROMO-A\/7\.webp$/);
  });
});

describe("search", () => {
  const idx = new SearchIndex(cat);
  it("finds a known card first", () => {
    expect(idx.search("mega lucario")[0]?.entity.name).toBe("Mega Lucario ex");
    expect(idx.search("Lucario", {}, 5).map((h) => h.entity.name)).toContain("Lucario");
  });
  it("matches card numbers and attack names", () => {
    expect(idx.search("B3 81")[0]?.entity.name).toBe("Mega Lucario ex");
    expect(idx.search("fighting pulse")[0]?.entity.name).toBe("Mega Lucario ex");
  });
  it("filters by kind, type and stage", () => {
    const r = idx.search("", { kinds: ["trainer"] });
    expect(r.every((h) => h.entity.kind === "trainer")).toBe(true);
    const f = idx.search("", { types: ["Fighting"], stages: ["Basic"] });
    expect(f.length).toBeGreaterThan(10);
    expect(f.every((h) => h.entity.types?.includes("Fighting") && h.entity.stage === "Basic")).toBe(true);
  });
  it("is fast enough for every keystroke", () => {
    const t = performance.now();
    for (const q of ["m", "me", "meg", "mega", "mega l", "mega lu"]) idx.search(q);
    expect(performance.now() - t).toBeLessThan(100);
  });
});

describe("deck model", () => {
  it("adds up to 2 copies per name, across different cards with the same name", () => {
    let d = emptyDeck();
    const [b1, b2] = cat.entities.filter((e) => e.nameKey === "bulbasaur").map(entityKey);
    for (const k of [b1!, b1!]) {
      const r = addCard(d, cat, k);
      expect(r.ok).toBe(true);
      if (r.ok) d = r.deck;
    }
    const third = addCard(d, cat, b2!);
    expect(third).toMatchObject({ ok: false, reason: "copy-limit" });
    expect(deckSize(d)).toBe(2);
  });
  it("stops at 20 cards", () => {
    let d = emptyDeck();
    const keys = cat.entities.filter((e) => e.kind === "pokemon" && e.stage === "Basic").slice(0, 11).map(entityKey);
    for (const k of keys) for (let i = 0; i < 2; i++) {
      const r = addCard(d, cat, k);
      if (r.ok) d = r.deck;
      else expect(r.reason).toBe("deck-full");
    }
    expect(deckSize(d)).toBe(20);
  });
  it("removes, reorders and toggles energy (max 3)", () => {
    let d = (addCard(emptyDeck(), cat, key("A2-091")) as { deck: Deck }).deck;
    d = (addCard(d, cat, key("A2-091")) as { deck: Deck }).deck;
    d = (addCard(d, cat, key("A1-154")) as { deck: Deck }).deck;
    expect(deckSize(removeCard(d, key("A2-091")))).toBe(2);
    expect(moveCard(d, key("A1-154"), -1).cards[0]!.key).toBe(key("A1-154"));
    let e = toggleEnergy(toggleEnergy(toggleEnergy(d, "Fire"), "Water"), "Grass");
    expect(toggleEnergy(e, "Metal").energy).toEqual(["Fire", "Water", "Grass"]);
    e = toggleEnergy(e, "Water");
    expect(e.energy).toEqual(["Fire", "Grass"]);
  });
  it("round-trips every fixture code through a deck byte for byte", () => {
    for (const [name, fx] of Object.entries(fixtures as Record<string, { payload: string }>)) {
      const { deck, unknown } = fromCodeParts(decodeDeckCode(fx.payload), cat);
      expect(unknown, name).toEqual([]);
      expect(encodeDeckCode(toCodeParts(deck, cat)), name).toBe(fx.payload);
    }
  });
  it("groups Pokémon by evolution line, then trainers by type", () => {
    const { deck } = fromCodeParts(decodeDeckCode(lucario), cat);
    const groups = groupDeck(deck, cat);
    const line = groups.find((g) => g.label === "Riolu line")!;
    expect(line.cards.map((c) => c.entity.name)).toEqual(["Riolu", "Mega Lucario ex", "Lucario"]);
    expect(groups.map((g) => g.label)).toEqual(expect.arrayContaining(["Supporters", "Items"]));
  });
});

describe("validation: the one next message", () => {
  const lucarioDeck = () => fromCodeParts(decodeDeckCode(lucario), cat).deck;
  it("valid in-game deck is ready", () => {
    const v = validateDeck(lucarioDeck(), cat);
    expect(v.valid).toBe(true);
    expect(v.next).toEqual({ tone: "ready", text: "Ready to generate" });
  });
  it("counts down missing cards (19)", () => {
    const d = removeCard(lucarioDeck(), key("A2-091"));
    expect(validateDeck(d, cat).next.text).toBe("Add 1 more card");
  });
  it("asks for energy once the deck is full", () => {
    const d = { ...lucarioDeck(), energy: [] };
    expect(validateDeck(d, cat).next).toMatchObject({ tone: "todo", text: "Choose an energy", focus: "energy" });
  });
  it("flags 21 cards and a third copy", () => {
    const d = lucarioDeck();
    const over = { ...d, cards: d.cards.map((c) => (c.key === key("A1-154") ? { ...c, count: 2 } : c)) };
    expect(validateDeck(over, cat).next.text).toBe("Remove 1 card");
    const third = { ...d, cards: d.cards.map((c) => (c.key === key("A2-091") ? { ...c, count: 3 } : c)) };
    expect(validateDeck(third, cat).next).toMatchObject({ tone: "problem", text: "Only 2 Riolu allowed" });
  });
  it("needs a Basic Pokémon", () => {
    const d = { ...emptyDeck(), cards: [{ key: key("P-A-007"), count: 2 }], energy: ["Fire" as const] };
    expect(validateDeck(d, cat).issues.map((i) => i.code)).toContain("no-basic");
  });
  it("warns (not errors) about a missing pre-evolution", () => {
    const d = { ...emptyDeck(), cards: [{ key: key("B3-081"), count: 1 }], energy: ["Fighting" as const] };
    const w = validateDeck(d, cat).issues.find((i) => i.code === "missing-pre-evolution");
    expect(w?.severity).toBe("warning");
  });
});

describe("history", () => {
  it("undoes and redoes", () => {
    let h = initHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = commit(undo(h), 9);
    expect(h.future).toEqual([]);
  });
});

describe("import / export", () => {
  it("Limitless-style text round-trips", () => {
    const { deck } = fromCodeParts(decodeDeckCode(lucario), cat, "Lucario");
    const text = exportText(deck, cat);
    expect(text).toContain("2 Mega Lucario ex B3 81");
    expect(text.trim().endsWith("Energy: Fighting")).toBe(true);
    const back = importDeck(text, cat);
    expect(back.problems).toEqual([]);
    expect(validateDeck(back.deck, cat).valid).toBe(true);
    expect(deckSize(back.deck)).toBe(20);
  });
  it("our JSON round-trips", () => {
    const { deck } = fromCodeParts(decodeDeckCode(lucario), cat, "Lucario");
    const back = importDeck(exportJson(deck, cat), cat);
    expect(back.format).toBe("pocket-deck-lab-json");
    expect(back.deck.name).toBe("Lucario");
    expect(encodeDeckCode(toCodeParts(back.deck, cat))).toBe(encodeDeckCode(toCodeParts(deck, cat)));
  });
  it("accepts a pasted deck code", () => {
    const r = importDeck(`  ${lucario}  `, cat);
    expect(r.format).toBe("deck-code");
    expect(deckSize(r.deck)).toBe(20);
  });
  it("accepts tcgp-deck-qr JSON", () => {
    const json = JSON.stringify({ name: "x", pokemon: [{ name: "Riolu", set: "A2", number: 91, count: 2 }], trainers: [{ name: "Professor's Research", set: "PROMO-A", number: 7, count: 2 }], energy: ["Fighting"] });
    const r = importDeck(json, cat);
    expect(r.format).toBe("tcgp-deck-qr-json");
    expect(deckSize(r.deck)).toBe(4);
  });
  it("reports ambiguous names with candidates instead of guessing", () => {
    const r = importDeck("2 Bulbasaur\n2 Riolu A2 91\nEnergy: Grass", cat);
    expect(r.problems[0]).toMatchObject({ line: 1, text: "Bulbasaur" });
    expect(r.problems[0]!.candidates!.length).toBeGreaterThan(1);
    expect(deckSize(r.deck)).toBe(2);
  });
  it("catches a card number that doesn't match its name", () => {
    const r = importDeck("1 Hitmonlee A1 155", cat); // A1-155 is Hitmonchan
    expect(r.problems[0]!.reason).toMatch(/Hitmonchan/);
    expect(deckSize(r.deck)).toBe(0);
  });
  it("rejects garbage clearly", () => {
    expect(() => importDeck("", cat)).toThrow(ImportError);
    expect(() => importDeck("{not json", cat)).toThrow(ImportError);
    expect(() => importDeck('{"hello":1}', cat)).toThrow(ImportError);
  });
});

describe("storage", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };
  it("saves and loads", () => {
    const s = mem();
    const env = migrate(null);
    env.draft = { name: "A", cards: [{ key: "pokemon:3720", count: 2 }], energy: ["Fighting"] };
    expect(save(s, env)).toBe(true);
    expect(load(s).draft).toEqual(env.draft);
  });
  it("migrates a v0 bare draft", () => {
    const v0 = { name: "Old", cards: [{ key: "pokemon:1", count: 1 }], energy: [] };
    expect(migrate(v0).draft.name).toBe("Old");
  });
  it("survives corrupt or hostile data and blocked storage", () => {
    const s = mem();
    s.setItem(STORAGE_KEY, "{broken");
    expect(load(s).draft.cards).toEqual([]);
    s.setItem(STORAGE_KEY, JSON.stringify({ version: 1, draft: { name: "x", cards: [{ key: "<img>", count: 1 }], energy: [] } }));
    expect(load(s).draft.cards).toEqual([]);
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(load(throwing).draft.cards).toEqual([]);
    expect(save(throwing, migrate(null))).toBe(false);
  });
});

describe("share links", () => {
  it("round-trips through the URL hash with URL-safe characters", () => {
    const h = shareHash(lucario, "Lucario / test & more");
    expect(new URLSearchParams(h.slice(1)).get("d")).not.toMatch(/[+/=]/);
    const back = parseShareHash(h)!;
    expect(back.payload).toBe(lucario);
    expect(back.name).toBe("Lucario / test & more");
    expect(back.parts.energy).toEqual(["Fighting"]);
  });
  it("ignores hashes without a deck and throws on corrupt ones", () => {
    expect(parseShareHash("#about")).toBeNull();
    expect(() => parseShareHash("#d=AAAA")).toThrow();
  });
});
