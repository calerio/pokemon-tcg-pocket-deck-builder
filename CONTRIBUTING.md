# Contributing

To get a local copy running:

```sh
git clone https://github.com/calerio/pokemon-tcg-pocket-deck-builder.git
cd pokemon-tcg-pocket-deck-builder
npm install && npm run sync-data && npm run dev
```

Before opening a pull request, run `npm run lint && npm run typecheck && npm test && npm run build`.
If you touched the UI, also run `npx playwright install webkit && npm run test:e2e`. The project tests in
WebKit only.

## Ground rules
- **Don't change deck-code output.** `tests/fixtures/payloads.json` holds codes known to import in the game,
  and they must keep decoding and re-encoding byte for byte.
- `src/lib/**` stays framework-free (lint enforces this). UI code goes in `src/app/`.
- Card data changes go through `npm run sync-data`, which fails on ambiguity. Corrections to upstream data
  go in `data/overrides.json`, with a source.
- Don't commit card artwork, official logos or scraped images.
- The main flow is search → tap → energy → Generate QR. New features go in secondary menus unless they make
  that flow faster.

For a wrong name, wrong HP or a missing card, open a "Card data error" issue with the card number.
