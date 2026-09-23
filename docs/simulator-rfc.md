# RFC: an honest path to deck-vs-deck simulation

**Status:** draft. **Nothing described here exists yet.** The app makes no win-rate claims.

## Why this is hard
Card text alone can't drive a simulator. Every attack, ability and trainer effect needs a precise, tested
implementation, and the core rules need them too: turn structure, energy zone, retreat, status conditions,
points and prize logic, and bench limits. One mis-implemented effect makes every matchup number wrong
while it still *looks* authoritative.

## Plan (in order; each step ships only when its tests pass)
1. **Deterministic engine:** a headless TypeScript game state with seeded RNG, validated actions, an event log,
   replay and serialisation. No UI.
2. **Core rules** plus a deliberately small supported card pool (e.g. two mirror-able starter decks).
3. **Typed effect system / DSL** for card effects, with fixtures for every implemented card and a public
   list of *unsupported* cards.
4. **Baseline agents:** random-legal and simple heuristics, before anything is called "AI".
5. **Monte Carlo matchups** in Web Workers. Report the sample size, confidence interval, the split by who
   goes first, and every unsupported effect encountered.
6. **Stronger search** (e.g. MCTS), only when benchmarked against fixed scenarios and baseline agents.
7. **"Play against the bot"**, only when the engine can enforce every action for the supported pool.

## Rules for honesty
- No win-rate for a deck unless **every** card in both decks is supported.
- Every number shows its sample size and uncertainty, and the UI labels the whole feature *experimental*.
- Local and reproducible: the same seed and decks give the same result. No live accounts, no scraping,
  no automation of the game.

## Out of scope
Anything that talks to the game client or servers.
