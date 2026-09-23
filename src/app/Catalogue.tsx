import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Catalog, EntityKey } from "../lib/cards/catalog.ts";
import { SearchIndex, activeFilterCount, type Filters, type SearchHit } from "../lib/cards/search.ts";
import { copiesOfName, countOf, deckSize, DECK_SIZE, MAX_COPIES, type Deck } from "../lib/deck/model.ts";
import { CardArt, ENERGY_COLOR, Icon } from "./bits.tsx";
import type { DeckStore } from "./useDeck.ts";

const PAGE = 48;
const TYPES = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Dragon", "Colorless"];
const STAGES = ["Basic", "Stage 1", "Stage 2"] as const;
const TRAINER_TYPES = ["Supporter", "Item", "Tool", "Stadium"];
const RARITY_GROUPS = ["Diamond", "Star", "Shiny", "Crown"];

export function Catalogue({ catalog, store, searchRef }: { catalog: Catalog; store: DeckStore; searchRef: RefObject<HTMLInputElement | null> }) {
  const index = useMemo(() => new SearchIndex(catalog), [catalog]);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const deferredQuery = useDeferredValue(query);
  const hits = useMemo(() => index.search(deferredQuery, filters), [index, deferredQuery, filters]);
  // How many results are rendered; grows as you scroll and starts over for every new search.
  const resultsKey = `${deferredQuery}\u0000${JSON.stringify(filters)}`;
  const [paged, setPaged] = useState({ key: resultsKey, n: PAGE });
  const shown = paged.key === resultsKey ? paged.n : PAGE;
  const sentinel = useRef<HTMLDivElement>(null);
  const filterDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setPaged((p) => ({ key: resultsKey, n: (p.key === resultsKey ? p.n : PAGE) + PAGE }));
    }, { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [resultsKey]);

  const chips = filterChips(filters, catalog);
  const nFilters = activeFilterCount(filters);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter adds the top result: search → Enter is the fastest possible "add a known card".
    // Use the query as typed right now, not the deferred results (they can lag a keystroke behind).
    if (e.key === "Enter") {
      e.preventDefault();
      const top = index.search(query, filters, 1)[0];
      if (top) store.add(top.key, top.print.cardId);
    }
    if (e.key === "Escape") setQuery("");
  };

  return (
    <section className="catalogue" aria-label="Card catalogue">
      <div className="search-row">
        <label className="search">
          {Icon.search}
          <span className="sr-only">Search cards by name, attack or card number</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search cards…"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-describedby="search-help"
            aria-controls="results"
          />
          <kbd aria-hidden="true">/</kbd>
          <span id="search-help" className="sr-only">Press Enter to add the first result.</span>
        </label>
        <div className="chips">
          <button className="btn-ghost" type="button" onClick={() => filterDialog.current?.showModal()} aria-haspopup="dialog">
            {Icon.filter} Filters {nFilters > 0 && <span className="badge">{nFilters}</span>}
          </button>
          {chips.map((c) => (
            <button key={c.id} type="button" className="chip removable" onClick={() => setFilters(c.remove)} aria-label={`Remove filter ${c.label}`}>
              {c.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          {nFilters > 1 && (
            <button type="button" className="link-btn" onClick={() => setFilters({})}>Clear all</button>
          )}
          <span className="result-meta" role="status" aria-live="polite">
            {hits.length.toLocaleString()} {hits.length === 1 ? "card" : "cards"}
          </span>
        </div>
      </div>

      {hits.length === 0 ? (
        <p className="empty">
          No cards match{query ? <> “{query}”</> : null}.{" "}
          {nFilters > 0 && <button type="button" className="link-btn" onClick={() => setFilters({})}>Clear filters</button>}
        </p>
      ) : (
        <ul className="grid" id="results" role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {hits.slice(0, shown).map((h, i) => (
            <Tile key={h.key} hit={h} deck={store.deck} catalog={catalog} store={store} eager={i < 12} />
          ))}
        </ul>
      )}
      <div ref={sentinel} className="sentinel" aria-hidden="true" />

      <dialog ref={filterDialog} className="sheet center" aria-labelledby="filters-title" onClick={(e) => e.target === e.currentTarget && filterDialog.current?.close()}>
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="filters-title">Filters</h2>
          {nFilters > 0 && <button type="button" className="link-btn" onClick={() => setFilters({})}>Reset</button>}
          <button type="button" className="x-btn" onClick={() => filterDialog.current?.close()} aria-label="Close filters">×</button>
        </div>
        <div className="sheet-body filters">
          <ChipGroup legend="Card" options={["pokemon", "trainer"]} labels={{ pokemon: "Pokémon", trainer: "Trainer" }} value={filters.kinds ?? []} onChange={(v) => setFilters({ ...filters, kinds: v as Filters["kinds"] })} />
          <ChipGroup legend="Type" options={TYPES} value={filters.types ?? []} onChange={(v) => setFilters({ ...filters, types: v })} dots />
          <ChipGroup legend="Stage" options={[...STAGES]} value={filters.stages ?? []} onChange={(v) => setFilters({ ...filters, stages: v as Filters["stages"] })} />
          <ChipGroup legend="Trainer type" options={TRAINER_TYPES} value={filters.trainerTypes ?? []} onChange={(v) => setFilters({ ...filters, trainerTypes: v })} />
          <fieldset>
            <legend>Special</legend>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={filters.ex === true} onClick={() => setFilters({ ...filters, ex: filters.ex === true ? undefined : true })}>ex only</button>
              <button type="button" className="chip" aria-pressed={filters.ex === false} onClick={() => setFilters({ ...filters, ex: filters.ex === false ? undefined : false })}>No ex</button>
            </div>
          </fieldset>
          <ChipGroup legend="Rarity" options={RARITY_GROUPS} value={filters.rarityGroups ?? []} onChange={(v) => setFilters({ ...filters, rarityGroups: v })} />
          <ChipGroup
            legend="Set"
            options={[...catalog.sets].reverse().map((s) => s.code)}
            labels={Object.fromEntries(catalog.sets.map((s) => [s.code, `${s.name} (${s.code})`]))}
            value={filters.sets ?? []}
            onChange={(v) => setFilters({ ...filters, sets: v })}
          />
          <button type="button" className="primary" onClick={() => filterDialog.current?.close()}>
            Show {hits.length.toLocaleString()} cards
          </button>
        </div>
      </dialog>
    </section>
  );
}

function ChipGroup({ legend, options, value, onChange, labels, dots }: {
  legend: string; options: string[]; value: string[]; onChange: (v: string[]) => void; labels?: Record<string, string>; dots?: boolean;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="chips">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button key={o} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
              {dots && <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: "50%", background: ENERGY_COLOR[o] }} />}
              {labels?.[o] ?? o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function filterChips(f: Filters, catalog: Catalog): Array<{ id: string; label: string; remove: Filters }> {
  const out: Array<{ id: string; label: string; remove: Filters }> = [];
  const list = <K extends keyof Filters>(k: K, label: (v: string) => string = (v) => v) =>
    ((f[k] as string[] | undefined) ?? []).forEach((v) =>
      out.push({ id: `${k}:${v}`, label: label(v), remove: { ...f, [k]: (f[k] as string[]).filter((x) => x !== v) } }),
    );
  list("kinds", (v) => (v === "pokemon" ? "Pokémon" : "Trainer"));
  list("types");
  list("stages");
  list("trainerTypes");
  list("rarityGroups");
  list("sets", (v) => catalog.set(v)?.name ?? v);
  if (f.ex !== undefined) out.push({ id: "ex", label: f.ex ? "ex only" : "No ex", remove: { ...f, ex: undefined } });
  return out;
}

const Tile = memo(function Tile({ hit, deck, catalog, store, eager }: { hit: SearchHit; deck: Deck; catalog: Catalog; store: DeckStore; eager: boolean }) {
  const { entity: e, print, key } = hit;
  const n = countOf(deck, key);
  const sameName = copiesOfName(deck, catalog, e);
  const atLimit = sameName >= MAX_COPIES;
  const full = deckSize(deck) >= DECK_SIZE;
  const blocked = atLimit || full;
  const hintId = `hint-${key.replace(":", "-")}`;
  // Only the copy limit gets an inline note; a full deck is already obvious from the counter and disabled "+".
  const hint = atLimit ? (n < sameName ? `Max ${MAX_COPIES} named ${e.name}` : `Max ${MAX_COPIES} per deck`) : "";
  const label = `${e.name}, ${print.cardId}${n ? `, ${n} in deck` : ""}`;
  return (
    <li className={`tile${n ? " in-deck" : ""}${atLimit ? " maxed" : ""}`}>
      <button
        type="button"
        className="tile-hit"
        onClick={() => store.add(key as EntityKey, print.cardId)}
        aria-label={blocked ? `${label}. ${hint || "Deck is full"}` : `Add ${label}`}
        aria-disabled={blocked || undefined}
      >
        <CardArt print={print} eager={eager} />
        <div className="tile-name">{e.name}</div>
        <div className="tile-sub">
          {e.types?.[0] && <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: ENERGY_COLOR[e.types[0]] }} />}
          <span>{print.cardId}</span>
          {e.partial && <span title="Limited card data">· limited data</span>}
        </div>
      </button>
      {hint && <div className="limit-hint" id={hintId}>{hint}</div>}
      <div className="stepper">
        <span className="stepper-pill" role="group" aria-label={`${e.name} quantity`}>
          {n > 0 && (
            <>
              <button type="button" className="step" onClick={() => store.remove(key)} aria-label={`Remove one ${e.name}`}>−</button>
              <span className="step-count" aria-live="off">{n}</span>
            </>
          )}
          <button
            type="button"
            className="step plus"
            onClick={() => store.add(key, print.cardId)}
            disabled={blocked}
            aria-label={`Add one ${e.name}`}
            aria-describedby={hint ? hintId : undefined}
          >+</button>
        </span>
      </div>
    </li>
  );
});
