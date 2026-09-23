# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/),
and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-23
### Added
- One-workspace deck builder: instant search (Enter adds the top result), inline `− n +` steppers,
  evolution-line grouping, manual reordering, always-visible energy picker with suggestions, one next-step
  message, undo/redo, continuous autosave.
- Deck-share QR codes matching the game's own (version 9, error correction H), verified by importing
  in-game on iPhone.
- QR-card PNG exports in three original themes plus a social-post size, with scan-safety tests.
- Import from deck codes, Limitless/plain text, JSON (ours and tcgp-deck-qr's), QR images, the game's
  own Display Code screenshots, and the camera.
- Share links that keep the deck in the URL hash (never sent to a server).
- Card snapshot of 2,318 playable cards / 3,879 prints with a validated sync pipeline.
