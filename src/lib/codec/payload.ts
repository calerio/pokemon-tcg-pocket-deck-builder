/**
 * Pokémon TCG Pocket deck-share payload.
 *
 * The format was reverse-engineered and documented by Kevin Gutowski
 * (https://github.com/KevinGutowski/tcgp-deck-qr, MIT). This is an independent implementation
 * written from that documentation:
 *
 *   base64(
 *     u8  trainerCount,  trainerCount × u24be (trainer entity ID + 10,000,000),
 *     u8  pokemonCount,  pokemonCount × u24be (Pokémon entity ID),
 *     u8  energyCount,   energyCount  × u8    energy type (1–8)
 *   )
 *
 * Every copy of a card is its own entry (two copies = the ID twice). Entity IDs identify the
 * playable card, not a particular print, so artwork and rarity are not part of a deck code.
 */
import { ENERGY_CODE, MAX_ENERGIES, MIN_ENERGIES, energyFromCode, energyNameForCode, type EnergyType } from "./energy.ts";

export const TRAINER_ID_OFFSET = 10_000_000;
const MAX_U24 = 0xff_ff_ff;
const MAX_U8 = 0xff;

export interface DeckCodeParts {
  /** Trainer entity IDs, one per copy, WITHOUT the 10,000,000 offset. */
  trainers: number[];
  /** Pokémon entity IDs, one per copy. */
  pokemon: number[];
  /** 1–3 distinct selectable energies, in the order the deck screen shows them. */
  energy: EnergyType[];
}

export class DeckCodeError extends Error {
  override name = "DeckCodeError";
}

function pushU24(out: number[], value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_U24) {
    throw new DeckCodeError(`${label} ${value} does not fit in an unsigned 24-bit integer`);
  }
  out.push((value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function pushCount(out: number[], count: number, label: string): void {
  if (count > MAX_U8) throw new DeckCodeError(`too many ${label} entries (${count}); the format allows ${MAX_U8}`);
  out.push(count);
}

function checkEnergies(energy: readonly EnergyType[]): void {
  if (energy.length < MIN_ENERGIES || energy.length > MAX_ENERGIES) {
    throw new DeckCodeError(`a deck needs ${MIN_ENERGIES}–${MAX_ENERGIES} energy types, got ${energy.length}`);
  }
  if (new Set(energy).size !== energy.length) {
    throw new DeckCodeError(`duplicate energy type in ${energy.join(", ")}`);
  }
  for (const e of energy) {
    if (!(e in ENERGY_CODE)) throw new DeckCodeError(`not a selectable energy type: ${String(e)}`);
  }
}

/** Encode deck parts to the exact base64 string the game reads from the QR code. */
export function encodeDeckCode(parts: DeckCodeParts): string {
  checkEnergies(parts.energy);
  const bytes: number[] = [];
  pushCount(bytes, parts.trainers.length, "trainer");
  for (const id of parts.trainers) pushU24(bytes, id + TRAINER_ID_OFFSET, "encoded trainer ID");
  pushCount(bytes, parts.pokemon.length, "Pokémon");
  for (const id of parts.pokemon) pushU24(bytes, id, "Pokémon ID");
  pushCount(bytes, parts.energy.length, "energy");
  for (const e of parts.energy) bytes.push(ENERGY_CODE[e]);
  return bytesToBase64(Uint8Array.from(bytes));
}

/**
 * Decode a payload. Throws DeckCodeError on anything malformed: bad base64, truncation,
 * trailing bytes, trainer IDs below the offset, or energy the game's editor can't select.
 */
export function decodeDeckCode(payload: string): DeckCodeParts {
  const text = payload.trim();
  if (!text) throw new DeckCodeError("empty deck code");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) {
    throw new DeckCodeError("deck code is not valid base64");
  }
  const bytes = base64ToBytes(text);
  let offset = 0;

  const readU8 = (label: string): number => {
    if (offset >= bytes.length) throw new DeckCodeError(`deck code ends before the ${label}`);
    return bytes[offset++] as number;
  };
  const readU24 = (label: string): number => {
    if (offset + 3 > bytes.length) throw new DeckCodeError(`deck code ends inside a ${label}`);
    const v = ((bytes[offset] as number) << 16) | ((bytes[offset + 1] as number) << 8) | (bytes[offset + 2] as number);
    offset += 3;
    return v;
  };

  const trainers: number[] = [];
  const trainerCount = readU8("trainer count");
  for (let i = 0; i < trainerCount; i++) {
    const raw = readU24("trainer ID");
    if (raw < TRAINER_ID_OFFSET) throw new DeckCodeError(`trainer entry ${raw} is below the ${TRAINER_ID_OFFSET} offset`);
    trainers.push(raw - TRAINER_ID_OFFSET);
  }
  const pokemon: number[] = [];
  const pokemonCount = readU8("Pokémon count");
  for (let i = 0; i < pokemonCount; i++) pokemon.push(readU24("Pokémon ID"));

  const energy: EnergyType[] = [];
  const energyCount = readU8("energy count");
  for (let i = 0; i < energyCount; i++) {
    const code = readU8("energy type");
    const e = energyFromCode(code);
    if (!e) throw new DeckCodeError(`energy ${energyNameForCode(code)} can't be selected in the game's deck editor`);
    energy.push(e);
  }
  if (offset !== bytes.length) throw new DeckCodeError(`${bytes.length - offset} unexpected trailing bytes`);
  checkEnergies(energy);
  return { trainers, pokemon, energy };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
