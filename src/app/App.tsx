import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { loadCatalog, type Catalog } from "../lib/cards/catalog.ts";
import { decodeDeckCode, DeckCodeError } from "../lib/codec/payload.ts";
import { deckSize, fromCodeParts, type Deck } from "../lib/deck/model.ts";
import { exportJson, exportText } from "../lib/deck/io.ts";
import { parseShareHash } from "../lib/deck/share.ts";
import { Catalogue } from "./Catalogue.tsx";
import { DeckPanel, MobileDeckBar } from "./DeckPanel.tsx";
import { ExportDrawer, download } from "./ExportDrawer.tsx";
import { ImportDialog } from "./ImportDialog.tsx";
import { Icon, Logo } from "./bits.tsx";
import { useDeck } from "./useDeck.ts";

/** A tournament Mega Lucario ex list; this exact code has been imported in the real game. */
const SAMPLE_CODE = "DZiWqJiWqJiaXpiYJJiXwJiblJiYLpiWnpiWnpiWlJibgJiWipibxgcADogADogARDQARDQADpIABgQACigBBg==";
const DATA_URL = `${import.meta.env.BASE_URL}data/cards.v1.json`;

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const store = useDeck(catalog);
  const searchRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDialogElement>(null);
  const importRef = useRef<HTMLDialogElement>(null);
  const deckSheetRef = useRef<HTMLDialogElement>(null);
  const [shared, setShared] = useState<{ deck: Deck; unknown: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    loadCatalog(DATA_URL).then(setCatalog, (e: Error) => setLoadError(e.message));
  }, []);

  // Deck in the URL hash: open it directly into an empty workspace, otherwise ask first.
  useEffect(() => {
    if (!catalog) return;
    const handle = () => {
      try {
        const s = parseShareHash(location.hash);
        if (!s) return;
        const { deck, unknown } = fromCodeParts(s.parts, catalog, s.name ?? "Shared deck");
        history.replaceState(null, "", location.pathname + location.search);
        if (store.deck.cards.length === 0) store.replace(deck, `Opened ${deck.name}`);
        else setShared({ deck, unknown: unknown.length });
      } catch (e) {
        if (e instanceof DeckCodeError) setShared(null);
      }
    };
    handle();
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // Global keys: "/" focuses search; ⌘Z / ⇧⌘Z undo/redo (outside text fields, which keep native undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.matches("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  // Toasts disappear on their own.
  useEffect(() => {
    if (!store.notice) return;
    const t = setTimeout(store.dismissNotice, store.notice.undoable ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [store.notice, store.dismissNotice]);

  const generate = () => {
    deckSheetRef.current?.close();
    exportRef.current?.showModal();
  };
  const loadSample = () => {
    if (!catalog) return;
    store.replace(fromCodeParts(decodeDeckCode(SAMPLE_CODE), catalog, "Mega Lucario ex (sample)").deck, "Loaded a sample deck");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>Pocket Deck Lab <small>· Deck Builder &amp; QR</small></span>
        </div>
        <span className="spacer" />
        <div className="menu">
          <button type="button" className="icon-btn" aria-label="More options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            {Icon.more}
          </button>
          {menuOpen && catalog && (
            <MenuPopover onClose={() => setMenuOpen(false)}>
              <button type="button" role="menuitem" onClick={() => importRef.current?.showModal()}>Import deck (QR, code or list)…</button>
              <button type="button" role="menuitem" disabled={!store.deck.cards.length} onClick={async () => {
                try {
                  await navigator.clipboard.writeText(exportText(store.deck, catalog));
                  store.notify("Decklist copied");
                } catch {
                  store.notify("Couldn't copy. Your browser blocked the clipboard.");
                }
              }}>Copy decklist as text</button>
              <button type="button" role="menuitem" disabled={!store.deck.cards.length} onClick={() => download(new Blob([exportJson(store.deck, catalog)], { type: "application/json" }), `${store.deck.name || "deck"}.json`)}>Download deck as JSON</button>
              <hr />
              <button type="button" role="menuitem" onClick={loadSample}>Load a sample deck</button>
              <button type="button" role="menuitem" disabled={!store.deck.cards.length} onClick={store.clear}>Start a new deck</button>
              <hr />
              <a role="menuitem" href="#about">How it works &amp; credits</a>
            </MenuPopover>
          )}
        </div>
      </header>

      {shared && (
        <div className="banner" role="region" aria-label="Shared deck">
          <span>Open the shared deck <b>{shared.deck.name}</b> ({deckSize(shared.deck)} cards)? Your current deck can be restored with Undo.</span>
          <span className="spacer" />
          <button type="button" className="btn-ghost" onClick={() => setShared(null)}>Keep mine</button>
          <button type="button" className="primary" style={{ height: 40, padding: "0 14px", fontSize: 15 }} onClick={() => { store.replace(shared.deck, `Opened ${shared.deck.name}`); setShared(null); }}>Open it</button>
        </div>
      )}

      <main className="workspace" id="main">
        {catalog ? (
          <Catalogue catalog={catalog} store={store} searchRef={searchRef} />
        ) : (
          <section className="catalogue" aria-busy="true" aria-label="Card catalogue">
            <div className="search-row">
              <label className="search">{Icon.search}<input disabled placeholder={loadError ? "Card data couldn't load" : "Loading cards…"} aria-label="Search cards" /></label>
            </div>
            {loadError ? (
              <p className="empty" role="alert">Couldn't load the card list ({loadError}). <button type="button" className="link-btn" onClick={() => location.reload()}>Try again</button></p>
            ) : (
              <ul className="grid loading-grid" aria-hidden="true" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {Array.from({ length: 18 }, (_, i) => <li key={i} className="tile"><div className="tile-art" /><div className="tile-name" style={{ width: "70%", height: 14, background: "var(--line)", borderRadius: 6 }} /></li>)}
              </ul>
            )}
          </section>
        )}
        <aside className="deck-panel" aria-labelledby="deck-heading">
          {catalog && <DeckPanel store={store} catalog={catalog} onGenerate={generate} />}
        </aside>
      </main>

      {catalog && (
        <>
          <MobileDeckBar store={store} onOpen={() => deckSheetRef.current?.showModal()} onGenerate={generate} />
          <dialog ref={deckSheetRef} className="sheet deck-sheet" aria-labelledby="deck-heading-m" onClick={(e) => e.target === e.currentTarget && deckSheetRef.current?.close()}>
            <div className="grabber" aria-hidden="true" />
            <div className="sheet-head">
              <h2 style={{ fontSize: 16 }}>Deck</h2>
              <button type="button" className="x-btn" onClick={() => deckSheetRef.current?.close()} aria-label="Close deck">×</button>
            </div>
            <div className="deck-panel-inner">
              <DeckPanel store={store} catalog={catalog} onGenerate={generate} headingId="deck-heading-m" />
            </div>
          </dialog>
          <ExportDrawer dialogRef={exportRef} deck={store.deck} catalog={catalog} onDone={store.notify} />
          <ImportDialog dialogRef={importRef} catalog={catalog} onImport={(d) => store.replace(d, `Imported ${d.name}`)} />
        </>
      )}

      <div className="toast-wrap" aria-hidden={!store.notice}>
        {store.notice && (
          <div className={`toast${store.notice.tone === "limit" ? " limit" : ""}`} key={store.notice.id}>
            <span>{store.notice.text}</span>
            {store.notice.undoable && <button type="button" onClick={store.undo}>Undo</button>}
          </div>
        )}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{store.announcement}</div>
    </div>
  );
}

function MenuPopover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus();
    const onDown = (e: MouseEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="menu-pop" role="menu" ref={ref} onClick={onClose}>
      {children}
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty" role="alert" style={{ maxWidth: 520, margin: "10vh auto" }}>
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p>Your deck is saved in this browser. Reloading usually fixes this.</p>
        <button type="button" className="primary" style={{ padding: "0 20px" }} onClick={() => location.reload()}>Reload</button>
        <p className="code-text" style={{ marginTop: 16 }}>{this.state.error.message}</p>
      </div>
    );
  }
}
