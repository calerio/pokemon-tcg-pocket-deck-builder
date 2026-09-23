# The Pokémon TCG Pocket deck-code format

> **Credit:** this format was reverse-engineered and documented by **Kevin Gutowski** in
> [tcgp-deck-qr](https://github.com/KevinGutowski/tcgp-deck-qr) (MIT). Pocket Deck Lab's codec
> (`src/lib/codec/`) is an independent implementation written from his documentation. We did not
> discover the format.

In the game, **My Decks → ⋯ → Display Code** shows a deck's code, and **My Decks → Build New → Scan Code**
imports one. The QR symbol contains a plain Base64 string.

## Payload

```text
u8   trainer_count
     trainer_count × u24 big-endian   (trainer entity ID + 10,000,000)
u8   pokemon_count
     pokemon_count × u24 big-endian   (Pokémon entity ID)
u8   energy_count
     energy_count  × u8               (energy type)
```

- **One entry per copy.** Two copies of a card write its ID twice.
- **Entity IDs identify the playable card, not the print.** Alternate-art and higher-rarity versions
  share an ID, so a code can't choose artwork. The receiving account uses whichever print it owns.
- A 20-card deck with 1–3 energies is always 64–66 bytes, which is 88 Base64 characters.

## Energy values

| Value | Energy | In the editor |
|---:|---|---|
| 1 | Grass | ✓ |
| 2 | Fire | ✓ |
| 3 | Water | ✓ |
| 4 | Lightning | ✓ |
| 5 | Psychic | ✓ |
| 6 | Fighting | ✓ |
| 7 | Darkness | ✓ |
| 8 | Metal | ✓ |
| 10 | Dragon | ✗ (a scanned code imports, then **crashes the game in battle**) |
| 11 | Colorless | ✗ (imports and plays, but the editor can't build it) |

Pocket Deck Lab only ever encodes 1–8. The deck screen shows energies in payload order.
(Energy behaviour for 10 and 11 is as reported by tcgp-deck-qr.)

## Where entity IDs come from
They appear in the game's asset file names, which the community database
[flibustier/pokemon-tcg-pocket-database](https://github.com/flibustier/pokemon-tcg-pocket-database)
records per card: `cPK_10_018340_00_MIRAIDONex_RR.webp` → Pokémon **18340**. `cTR_…` names are Trainers.

## QR symbol
The game's codes are **QR version 9 (53×53), error correction H, byte mode**. On screen the game draws
dotted modules with a deck icon over the centre; high error correction absorbs the icon. Pocket Deck Lab
emits a conventional square-module version-9 H symbol with a 4-module quiet zone, and the game scans it.

## Verification
- `tests/fixtures/payloads.json` holds the tcgp-deck-qr reference payload and the prototype payload for a Mega
  Lucario ex deck, which **imported correctly in the real game on an iPhone on 2026-09-23**. It also holds
  eleven more tournament decklists encoded by the original prototype as an oracle. Every one must decode and
  re-encode byte for byte (`tests/codec.test.ts`).
- Energies other than Fighting and Lightning have not been checked by an in-game scan yet. That's tracked in
  the launch checklist.
