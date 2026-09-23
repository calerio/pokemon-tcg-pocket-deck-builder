# Changelog

Notable changes. The format follows [Keep a Changelog](https://keepachangelog.com/),
and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-23
### Added
- Deck builder: search as you type (Enter adds the top result), inline `− n +` steppers, cards grouped by
  evolution line, manual reordering, energy picker with suggestions, a next-step hint, undo/redo and
  autosave.
- Deck QR codes in the game's own format (version 9, error correction H). Imported in-game on an iPhone.
- QR-card PNG exports in three original themes plus a social-post size, with scan-safety tests.
- Import from deck codes, Limitless/plain text, JSON (ours and tcgp-deck-qr's), QR images, the game's
  own Display Code screenshots, and the camera.
- Share links that keep the deck in the URL hash, so it isn't sent to a server.
- Card snapshot of 2,318 playable cards (3,879 prints) and the sync script that builds it.
