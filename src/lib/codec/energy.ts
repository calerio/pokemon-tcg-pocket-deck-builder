/**
 * Energy types as stored in a deck code (one byte each).
 *
 * Only 1–8 can be picked in the game's deck editor, in this order. The format also has
 * Dragon (10) and Colorless (11), but a scanned code carrying Dragon crashes the game on
 * entering a battle, and Colorless produces a deck the editor can't build. So we never
 * encode either (see docs/qr-format.md).
 */
export const ENERGY_TYPES = [
  "Grass",
  "Fire",
  "Water",
  "Lightning",
  "Psychic",
  "Fighting",
  "Darkness",
  "Metal",
] as const;

export type EnergyType = (typeof ENERGY_TYPES)[number];

/** Byte value used in the payload for each selectable energy. */
export const ENERGY_CODE: Readonly<Record<EnergyType, number>> = {
  Grass: 1,
  Fire: 2,
  Water: 3,
  Lightning: 4,
  Psychic: 5,
  Fighting: 6,
  Darkness: 7,
  Metal: 8,
};

/** Names for every value a payload might contain, including the unselectable ones (decode only). */
const ENERGY_NAME_BY_CODE: ReadonlyMap<number, string> = new Map([
  ...ENERGY_TYPES.map((t) => [ENERGY_CODE[t], t] as const),
  [10, "Dragon"],
  [11, "Colorless"],
]);

export const MIN_ENERGIES = 1;
export const MAX_ENERGIES = 3;

export function isSelectableEnergyCode(code: number): boolean {
  return Number.isInteger(code) && code >= 1 && code <= 8;
}

export function energyFromCode(code: number): EnergyType | undefined {
  return isSelectableEnergyCode(code) ? (ENERGY_TYPES[code - 1] as EnergyType) : undefined;
}

/** Human name for any byte, for error messages and inspecting foreign codes. */
export function energyNameForCode(code: number): string {
  return ENERGY_NAME_BY_CODE.get(code) ?? `unknown (${code})`;
}

export function isEnergyType(value: string): value is EnergyType {
  return (ENERGY_TYPES as readonly string[]).includes(value);
}
