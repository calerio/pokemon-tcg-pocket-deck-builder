# Pocket Deck Lab

**Pokémon TCG Pocket Deck Builder & QR Generator**

A deck builder for Pokémon TCG Pocket that makes the QR code the game scans. It runs entirely in your
browser.

**[Open the app](https://calerio.github.io/pokemon-tcg-pocket-deck-builder/)** · [How the QR format works](docs/qr-format.md)

![A deck QR card made with Pocket Deck Lab](public/og.png)

## What it does

Search for a card and tap it to add it, or press Enter to add the top result. Each result has a `− n +`
stepper, so there's no dialog to open. A counter shows `n/20` with a single hint underneath (*Add 4 more
cards*, *Choose an energy*, *Ready to generate*). The two-copies-per-name rule counts different prints of a
card together.

The QR codes use the same version and error correction as the game's own. Plain codes and all three QR-card
themes have been scanned into the game on an iPhone. A QR card is a card-shaped PNG (Clean, Cute or Energy
theme, plus a social-post size) with the code in the artwork slot.

You can import a Limitless decklist, a deck code, JSON, or a screenshot of the game's **Display Code**
screen. Changes autosave locally, and every add or remove can be undone.

## Quick start

1. Type a card name and tap the card, or press **Enter**.
2. Keep going until the counter reads **20/20**.
3. Pick an **energy** under the counter. Dashed rings are suggestions based on your attacks.
4. Press **Generate QR**, then save the image or keep it on screen.
5. In the game: **My Decks → Build New → Scan Code**.

## Privacy

There's no server, no accounts, no analytics and no cookies. Decks are kept in your browser's local
storage, and imported screenshots are decoded on your device. The only outside requests are for card
images, which load from TCGdex and jsDelivr.

## Limitations

- Tested in Safari/WebKit on macOS and at iPhone screen sizes (automated). In-game import tested on iPhone
  with the plain QR, every QR-card theme and a 3-energy deck.
- Not yet tested on Android, or by hand in Chrome and Firefox. The automated tests run in WebKit only.
- A deck code holds cards and energy only. Artwork, rarity, sleeves, covers and highlighted cards are
  chosen in the game.
- Cards from sets that aren't in the community database yet can't be added until it updates. A few
  promos are marked "limited data" but still work in codes.
- Reading the game's decorated codes from a screenshot is heuristic. A sharp, uncropped screenshot works
  best.

## How the QR format works

**The deck-code format was reverse-engineered and documented by Kevin Gutowski in
[tcgp-deck-qr](https://github.com/KevinGutowski/tcgp-deck-qr).** Pocket Deck Lab's codec is a separate
implementation written from his notes, and the screenshot reader is adapted from his code (MIT). A code
is Base64 of the cards' entity IDs followed by the energy types; details in [docs/qr-format.md](docs/qr-format.md).

## Development

```sh
npm install
npm run sync-data   # build public/data/cards.v1.json from the pinned card database
npm run dev         # http://localhost:5173/pokemon-tcg-pocket-deck-builder/
npm test            # unit + integration (Vitest, single worker)
npm run lint && npm run typecheck
npm run build       # production build + size budget check
npx playwright install webkit && npm run test:e2e   # end-to-end, WebKit only
```

Architecture: [docs/architecture.md](docs/architecture.md) · Data sources and licences:
[docs/data-sources.md](docs/data-sources.md).
Pushes to `main` deploy to GitHub Pages via `.github/workflows/pages.yml`.

## Roadmap

Next is a side-by-side deck comparison: shared cards, ratios, energy needs and setup risks. Further out,
maybe, a deterministic rules engine and simulator ([draft](docs/simulator-rfc.md)); none of that exists yet.

Contributions are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Data, credits and licences

- Code: [MIT](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Card identities and entity IDs: [flibustier/pokemon-tcg-pocket-database](https://github.com/flibustier/pokemon-tcg-pocket-database) (MIT).
- Card details: [TCGdex](https://tcgdex.dev) (MIT) and the [Limitless Pocket database](https://pocket.limitlesstcg.com/cards).
- Deck-code format: [KevinGutowski/tcgp-deck-qr](https://github.com/KevinGutowski/tcgp-deck-qr) (MIT).

*Pocket Deck Lab is an unofficial fan project. It is not affiliated with, endorsed, sponsored or approved by
The Pokémon Company, Nintendo, Creatures Inc., GAME FREAK inc. or DeNA Co., Ltd. Pokémon names, card text and
card images are © their respective owners. Card images are not hosted in this repository.*
