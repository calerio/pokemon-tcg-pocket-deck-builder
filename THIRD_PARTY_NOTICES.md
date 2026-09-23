# Third-party notices

Pocket Deck Lab is an unofficial fan project. It is not affiliated with, endorsed, sponsored or
approved by The Pokémon Company, Nintendo, Creatures Inc., GAME FREAK inc. or DeNA Co., Ltd.
Pokémon and Pokémon TCG Pocket are trademarks of their respective owners. Card names, card text and
card artwork are © their owners. This project does not host card artwork: images are loaded directly
from the community sources listed below, and the app still works text-only when they are unavailable.

## Deck-code format research
**[KevinGutowski/tcgp-deck-qr](https://github.com/KevinGutowski/tcgp-deck-qr)**: MIT License,
Copyright (c) 2026 Kevin Gutowski.
Kevin reverse-engineered the deck-share payload and documented it. Our codec is an independent
implementation written from that documentation. The screenshot-recovery routine in
`src/lib/qr/recover.ts` is adapted from `src/qr.js` in that project. Its MIT notice:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions: The above copyright notice and this
> permission notice shall be included in all copies or substantial portions of the Software.
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## Card data
- **[flibustier/pokemon-tcg-pocket-database](https://github.com/flibustier/pokemon-tcg-pocket-database)**
  (npm `pokemon-tcg-pocket-database`): MIT License, Copyright (c) 2025 Jon (flibustier).
  It supplies card identities, the internal entity IDs used by deck codes, sets and packs.
- **[TCGdex](https://tcgdex.dev)** ([cards-database](https://github.com/tcgdex/cards-database)): MIT License.
  It supplies gameplay fields for the sets it covers, and card images for those sets (hotlinked from
  `assets.tcgdex.net`).
- **[Limitless TCG Pocket card database](https://pocket.limitlesstcg.com/cards)**: gameplay fields
  for sets that TCGdex does not cover yet. Limitless publishes no licence for this data. See
  `docs/data-sources.md`, where this is recorded as an open question.
- **Card images for newer sets** are hotlinked, never copied, via jsDelivr from
  [flibustier/pokemon-tcg-exchange](https://github.com/flibustier/pokemon-tcg-exchange). That
  repository's code is AGPL-3.0; the artwork itself is © The Pokémon Company et al.

## Runtime libraries
| Package | Licence | Copyright |
|---|---|---|
| [jsQR](https://github.com/cozmo/jsQR) 1.4.0 | Apache-2.0 | Copyright Cosmo Wolfe. The full licence ships in `node_modules/jsqr/LICENSE`; the package has no NOTICE file. |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4 | MIT | Copyright (c) Kazuhiko Arase |
| [React / React DOM](https://react.dev) 19 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates |
| [zod](https://zod.dev) 4 | MIT | Copyright (c) Colin McDonnell |

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
