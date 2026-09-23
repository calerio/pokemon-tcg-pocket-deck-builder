# Contributing

Thanks for helping. The quick path:

```sh
git clone https://github.com/calerio/pokemon-tcg-pocket-deck-builder.git
cd pokemon-tcg-pocket-deck-builder
npm install && npm run sync-data && npm run dev
```

Before opening a pull request, run `npm run lint && npm run typecheck && npm test && npm run build`.
If you touched the UI, also run `npx playwright install webkit && npm run test:e2e`. The project tests in
WebKit only.

## Ground rules
- **Never change the deck-code bytes casually.** `tests/fixtures/payloads.json` holds codes that are known to
  import in the real game. They must keep decoding and re-encoding byte for byte.
- **`src/lib/**` stays framework-free** (lint enforces this). UI goes in `src/app/`.
- **Card data changes go through `npm run sync-data`**, which fails loudly on ambiguity. Fixes to upstream
  data go in `data/overrides.json` with evidence.
- **Don't add card artwork, official logos or scraped images** to the repository.
- Keep the core flow simple: search → tap → energy → Generate QR. New features belong in secondary menus
  unless they make that flow faster.

Card-data errors (a wrong name, HP or missing card)? Open a "Card data error" issue with the card number.
