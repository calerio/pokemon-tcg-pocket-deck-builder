import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/payloads.json";
import { DeckCodeError, bytesToBase64, decodeDeckCode, encodeDeckCode, TRAINER_ID_OFFSET } from "../src/lib/codec/payload.ts";
import { ENERGY_TYPES, energyFromCode, type EnergyType } from "../src/lib/codec/energy.ts";

type Fixture = { source: string; trainers: number[]; pokemon: number[]; energy: number[]; payload: string };
const all = Object.entries(fixtures as Record<string, Fixture>);

const toEnergy = (codes: number[]): EnergyType[] => codes.map((c) => energyFromCode(c) as EnergyType);

describe("known-good payloads (regression: never change these)", () => {
  it("includes the payload that imported in the real game and the tcgp-deck-qr reference", () => {
    const keys = all.map(([k]) => k);
    expect(keys).toContain("ingame_verified_mega_lucario_ex");
    expect(keys).toContain("reference_tcgp_deck_qr");
  });

  it.each(all)("%s decodes to the expected entities", (_, fx) => {
    expect(decodeDeckCode(fx.payload)).toEqual({ trainers: fx.trainers, pokemon: fx.pokemon, energy: toEnergy(fx.energy) });
  });

  it.each(all)("%s re-encodes byte for byte", (_, fx) => {
    expect(encodeDeckCode({ trainers: fx.trainers, pokemon: fx.pokemon, energy: toEnergy(fx.energy) })).toBe(fx.payload);
  });

  it("in-game verified deck has 20 cards and Fighting energy", () => {
    const fx = (fixtures as Record<string, Fixture>).ingame_verified_mega_lucario_ex as Fixture;
    const d = decodeDeckCode(fx.payload);
    expect(d.trainers.length + d.pokemon.length).toBe(20);
    expect(d.energy).toEqual(["Fighting"]);
  });
});

describe("energy", () => {
  // every ordered selection of 1–3 distinct energies: 8 + 8·7 + 8·7·6 = 400
  const combos: EnergyType[][] = [];
  for (const a of ENERGY_TYPES) {
    combos.push([a]);
    for (const b of ENERGY_TYPES) {
      if (b === a) continue;
      combos.push([a, b]);
      for (const c of ENERGY_TYPES) if (c !== a && c !== b) combos.push([a, b, c]);
    }
  }
  it("covers all 400 ordered combinations", () => expect(combos).toHaveLength(400));

  it("round-trips every combination and preserves order", () => {
    for (const energy of combos) {
      const parts = { trainers: [40, 40], pokemon: [3720], energy };
      expect(decodeDeckCode(encodeDeckCode(parts))).toEqual(parts);
    }
  });

  it("encodes the documented byte values", () => {
    // layout: [0 trainers][1 Pokémon][u24 id][energy count][energies…] → energies start at byte 6
    const bytes = (e: EnergyType[]) => atob(encodeDeckCode({ trainers: [], pokemon: [1], energy: e })).slice(6);
    expect([...bytes(["Grass", "Fire", "Water"])].map((c) => c.charCodeAt(0))).toEqual([1, 2, 3]);
    expect([...bytes(["Lightning", "Psychic", "Fighting"])].map((c) => c.charCodeAt(0))).toEqual([4, 5, 6]);
    expect([...bytes(["Darkness", "Metal"])].map((c) => c.charCodeAt(0))).toEqual([7, 8]);
  });

  it("refuses to encode 0, 4 or duplicate energies", () => {
    expect(() => encodeDeckCode({ trainers: [], pokemon: [1], energy: [] })).toThrow(DeckCodeError);
    expect(() => encodeDeckCode({ trainers: [], pokemon: [1], energy: ["Grass", "Fire", "Water", "Metal"] })).toThrow(DeckCodeError);
    expect(() => encodeDeckCode({ trainers: [], pokemon: [1], energy: ["Grass", "Grass"] })).toThrow(DeckCodeError);
  });
});

describe("malformed payloads", () => {
  const raw = (...b: number[]) => bytesToBase64(Uint8Array.from(b));
  const ok = [0, 1, 0, 0x0e, 0x88, 1, 6]; // 0 trainers, 1 Pokémon (3720), Fighting

  it("accepts the minimal well-formed payload", () => {
    expect(decodeDeckCode(raw(...ok))).toEqual({ trainers: [], pokemon: [3720], energy: ["Fighting"] });
  });
  it.each([
    ["energy 0", [0, 1, 0, 0x0e, 0x88, 1, 0]],
    ["energy 9 (unnamed)", [0, 1, 0, 0x0e, 0x88, 1, 9]],
    ["Dragon (10) crashes the game", [0, 1, 0, 0x0e, 0x88, 1, 10]],
    ["Colorless (11) is unbuildable", [0, 1, 0, 0x0e, 0x88, 1, 11]],
    ["duplicate energy", [0, 1, 0, 0x0e, 0x88, 2, 6, 6]],
    ["four energies", [0, 1, 0, 0x0e, 0x88, 4, 1, 2, 3, 4]],
    ["zero energies", [0, 1, 0, 0x0e, 0x88, 0]],
    ["truncated ID", [0, 1, 0, 0x0e]],
    ["missing energy count", [0, 1, 0, 0x0e, 0x88]],
    ["trailing byte", [...ok, 0]],
    ["trainer below offset", [1, 0, 0, 1, 1, 0, 0x0e, 0x88, 1, 6]],
  ])("rejects %s", (_, bytes) => {
    expect(() => decodeDeckCode(raw(...bytes))).toThrow(DeckCodeError);
  });
  it.each(["", "   ", "not base64!", "abc", "AAAA=A=="])("rejects bad base64 %j", (s) => {
    expect(() => decodeDeckCode(s)).toThrow(DeckCodeError);
  });
  it("tolerates surrounding whitespace (pasted codes)", () => {
    expect(decodeDeckCode(`  ${raw(...ok)}\n`).pokemon).toEqual([3720]);
  });
  it("applies the 10,000,000 trainer offset", () => {
    const code = encodeDeckCode({ trainers: [40], pokemon: [1], energy: ["Grass"] });
    const b = atob(code);
    expect((b.charCodeAt(1) << 16) | (b.charCodeAt(2) << 8) | b.charCodeAt(3)).toBe(40 + TRAINER_ID_OFFSET);
  });
});
