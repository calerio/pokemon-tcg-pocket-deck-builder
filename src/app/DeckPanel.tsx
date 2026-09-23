import { useMemo } from "react";
import type { Catalog } from "../lib/cards/catalog.ts";
import { ENERGY_TYPES, MAX_ENERGIES } from "../lib/codec/energy.ts";
import { DECK_SIZE, MAX_COPIES, copiesOfName, groupDeck, suggestedEnergy } from "../lib/deck/model.ts";
import { CardArt, ENERGY_COLOR, Icon, cssVar } from "./bits.tsx";
import type { DeckStore } from "./useDeck.ts";

export function DeckStatus({ store, compact = false }: { store: DeckStore; compact?: boolean }) {
  const v = store.validation;
  const size = v?.size ?? 0;
  const pct = Math.min(100, (size / DECK_SIZE) * 100);
  return (
    <div className="status" aria-live="off">
      <span className={`counter${store.bump ? " bump" : ""}`} key={store.bump} aria-label={`${size} of ${DECK_SIZE} cards`}>
        {size}<small>/{DECK_SIZE}</small>
      </span>
      {!compact && (
        <span className={`meter${size === DECK_SIZE ? " full" : size > DECK_SIZE ? " over" : ""}`} aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  );
}

export function NextMessage({ store, id }: { store: DeckStore; id?: string }) {
  const n = store.validation?.next;
  if (!n) return null;
  return (
    <p className={`next ${n.tone}`} id={id} style={{ margin: 0 }}>
      <span aria-hidden="true">{n.tone === "ready" ? "✓" : n.tone === "problem" ? "!" : "→"}</span> {n.text}
    </p>
  );
}

export function EnergyPicker({ store, catalog }: { store: DeckStore; catalog: Catalog }) {
  const suggested = useMemo(() => new Set(suggestedEnergy(store.deck, catalog).slice(0, 2)), [store.deck, catalog]);
  const chosen = store.deck.energy;
  return (
    <div role="group" aria-labelledby="energy-label" id="energy-picker">
      <div className="energy-label" id="energy-label">
        Energy <span style={{ textTransform: "none", fontWeight: 500 }}>· up to {MAX_ENERGIES}{suggested.size > 0 && chosen.length === 0 ? " · dashed = suggested" : ""}</span>
      </div>
      <div className="energy" style={{ marginTop: 6 }}>
        {ENERGY_TYPES.map((t) => {
          const on = chosen.includes(t);
          return (
            <button
              key={t}
              type="button"
              className={`e-btn${suggested.has(t) ? " suggested" : ""}`}
              style={cssVar("--c", ENERGY_COLOR[t] ?? "")}
              aria-pressed={on}
              aria-label={`${t} energy${suggested.has(t) && !on ? " (suggested)" : ""}`}
              title={t}
              onClick={() => store.energy(t)}
            >
              <span className="dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DeckPanel({ store, catalog, onGenerate, headingId = "deck-heading" }: {
  store: DeckStore; catalog: Catalog; onGenerate: () => void; headingId?: string;
}) {
  const groups = useMemo(() => groupDeck(store.deck, catalog), [store.deck, catalog]);
  const warnings = useMemo(() => new Map((store.validation?.issues ?? []).filter((i) => i.severity === "warning").map((i) => [i.focus, i.message])), [store.validation]);
  const valid = store.validation?.valid ?? false;
  return (
    <>
      <div className="deck-head">
        <h2 id={headingId} className="sr-only">Your deck</h2>
        <label>
          <span className="sr-only">Deck name</span>
          <input className="deck-name" value={store.deck.name} maxLength={80} onChange={(e) => store.rename(e.target.value)} />
        </label>
        <DeckStatus store={store} />
        <NextMessage store={store} id={`${headingId}-next`} />
        <EnergyPicker store={store} catalog={catalog} />
      </div>

      <div className="deck-list" aria-labelledby={headingId}>
        {groups.length === 0 ? (
          <div className="deck-empty">
            <p style={{ marginTop: 0 }}><b>Search, then tap cards to add them.</b></p>
            <p style={{ marginBottom: 0 }}>Pick an energy, and when you reach 20 cards, generate the QR code to scan in the game.</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.id} aria-label={g.label}>
              <div className="group-label">{g.label} · {g.cards.reduce((n, c) => n + c.count, 0)}</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {g.cards.map((c) => {
                  const print = (c.printId && catalog.printById(c.printId)) || catalog.basePrint(c.key);
                  const atLimit = copiesOfName(store.deck, catalog, c.entity) >= MAX_COPIES;
                  const warn = warnings.get(c.key);
                  return (
                    <li className="row" key={c.key}>
                      <div className="row-thumb" aria-hidden="true">{print && <CardArt print={print} className="tile-art row-thumb" />}</div>
                      <div className="row-main">
                        <div className="row-name">{c.entity.name}</div>
                        <div className="row-sub">
                          {print?.cardId}
                          {warn && <span className="warn-dot" title={warn}> · <span aria-hidden="true">⚠︎</span> {warn.replace(`${c.entity.name} `, "")}</span>}
                        </div>
                      </div>
                      <div className="row-move">
                        <button type="button" onClick={() => store.move(c.key, -1)} aria-label={`Move ${c.entity.name} up`}>▲</button>
                        <button type="button" onClick={() => store.move(c.key, 1)} aria-label={`Move ${c.entity.name} down`}>▼</button>
                      </div>
                      <span className="stepper-pill" role="group" aria-label={`${c.entity.name}: ${c.count}`}>
                        <button type="button" className="step" onClick={() => store.remove(c.key)} aria-label={`Remove one ${c.entity.name}`}>−</button>
                        <span className="step-count">{c.count}</span>
                        <button type="button" className="step plus" onClick={() => store.add(c.key, c.printId)} disabled={atLimit} aria-label={atLimit ? `${c.entity.name}: max ${MAX_COPIES}` : `Add one ${c.entity.name}`}>+</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="deck-foot">
        <button type="button" className="primary" onClick={onGenerate} disabled={!valid} aria-describedby={`${headingId}-next`}>
          {Icon.qr} Generate QR
        </button>
        <div className="foot-actions">
          <button type="button" className="link-btn" onClick={store.undo} disabled={!store.canUndo} aria-label="Undo" title="Undo (⌘Z)">{Icon.undo} Undo</button>
          <button type="button" className="link-btn" onClick={store.redo} disabled={!store.canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">{Icon.redo}</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="link-btn" onClick={store.clear} disabled={store.deck.cards.length === 0}>Clear</button>
        </div>
      </div>
    </>
  );
}

export function MobileDeckBar({ store, onOpen, onGenerate }: { store: DeckStore; onOpen: () => void; onGenerate: () => void }) {
  const v = store.validation;
  return (
    <div className="deckbar">
      <button type="button" className="deckbar-open" onClick={onOpen} aria-haspopup="dialog" aria-label={`Open deck: ${v?.size ?? 0} of ${DECK_SIZE} cards. ${v?.next.text ?? ""}`}>
        <DeckStatus store={store} compact />
        <span style={{ minWidth: 0, display: "grid" }}>
          {store.deck.energy.length > 0 && (
            <span className="mini-energy" aria-hidden="true">{store.deck.energy.map((e) => <i key={e} style={cssVar("--c", ENERGY_COLOR[e] ?? "")} />)}</span>
          )}
          <span className="deckbar-next">{v?.next.text}</span>
        </span>
      </button>
      <button type="button" className="primary" onClick={onGenerate} disabled={!v?.valid}>
        {Icon.qr} QR
      </button>
    </div>
  );
}
