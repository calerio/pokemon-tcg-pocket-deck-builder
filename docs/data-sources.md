# Data sources and licence audit

The audit was done 2026-09-23. Re-check it before every public release.

## What each source provides

| Need | Source | Licence | How we use it |
|---|---|---|---|
| Card identity, **entity IDs** for deck codes, sets and packs | [flibustier/pokemon-tcg-pocket-database](https://github.com/flibustier/pokemon-tcg-pocket-database) (npm `pokemon-tcg-pocket-database@2.10.0`, pinned) | MIT | Read at **sync time** from `node_modules`. Only the derived snapshot ships. |
| Gameplay fields (HP, types, stage, attacks, abilities, weakness, retreat, trainer text) | `data/upstream/gameplay.json`, built by `scripts/import-gameplay.mjs` from a TCGdex-shaped catalogue | TCGdex: MIT. Limitless: **no published licence** | Merged at sync time, checked in as the input file. |
| Card images for A1–B2a (where available) | TCGdex assets, `https://assets.tcgdex.net/en/tcgp/{SET}/{NNN}/low.webp` | Artwork © TPC et al. | **Hotlinked** in the browser. CORS `*`. |
| Card images for every set | jsDelivr → `flibustier/pokemon-tcg-exchange` `public/images/cards-by-set/{SET}/{n}.webp` | Repo code AGPL-3.0; artwork © TPC et al. | **Hotlinked** fallback. CORS `*`. |
| Deck-code payload format | [KevinGutowski/tcgp-deck-qr](https://github.com/KevinGutowski/tcgp-deck-qr) `docs/format.md` | MIT | Independent implementation, with credit. |

We never re-host card artwork. If both image hosts fail, the card renders as an original text tile.

### Entity IDs
A deck code stores the game's internal entity ID, not the collector number. flibustier's `image`
field is the game asset name, e.g. `cPK_10_018340_00_MIRAIDONex_RR.webp`, which gives Pokémon entity
`18340`. `cTR_…` marks a Trainer. Different prints of the same playable card (alt art, rarities) share
an entity ID. **One card name can still map to several entities.** Bulbasaur, for example, is both 10
and 13070. That is why the 2-copy rule counts by name.

### Set naming
flibustier uses `PROMO-A`/`PROMO-B`, and TCGdex and the game use `P-A`/`P-B`. The sync aliases them.

### Known data gaps (as of 2026-09-23)
- **17 promos, P-A-101 to P-A-117,** exist in flibustier with entity IDs but have no gameplay data. They
  ship marked `partial`: they can be added to decks and encoded, and they show "limited data".
- **Limitless-sourced records** (A4b, B2b, B3, B3a, B3b, B4, B4a, P-B) have no weakness *value*. In
  Pocket every weakness is +20, but we store what the source says and display "+20" only as a rule note.
- Four B2a records (126–129) are missing their " ex" suffix in the gameplay source. This is fixed by the
  reviewed `data/overrides.json`.

## Open questions (resolve before publishing)
1. **Limitless-sourced gameplay text.** Card text is © TPC. Limitless compiled it and states no reuse
   licence. Options: (a) ship it with attribution, the common practice for fan deck builders;
   (b) ship only identity data (name, set, rarity, entity) for those sets until TCGdex covers them;
   (c) ask Limitless. **Owner decision.**
2. **Hotlinking the exchange repo via jsDelivr.** It is technically allowed (CORS `*`, public CDN). Keep
   the adapter in `src/lib/cards/images.ts` so the host can be swapped in one place.

## Refreshing
Run `npm run sync-data`. It rebuilds `public/data/cards.v1.json` and `meta.json`, and fails loudly on
ambiguity or on regressions. The scheduled `sync-data.yml` workflow opens a PR with the diff and
never deploys directly.
