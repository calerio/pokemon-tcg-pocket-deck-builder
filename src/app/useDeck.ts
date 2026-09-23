/** Deck state for the app: undo/redo history, continuous autosave, and friendly change feedback. */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Catalog, EntityKey } from "../lib/cards/catalog.ts";
import type { EnergyType } from "../lib/codec/energy.ts";
import { canRedo, canUndo, commit, initHistory, redo, undo, type History } from "../lib/deck/history.ts";
import {
  addCard, countOf, deckSize, emptyDeck, moveCard, removeCard, renameDeck, toggleEnergy, type Deck,
} from "../lib/deck/model.ts";
import { load, save, type Envelope } from "../lib/deck/storage.ts";
import { validateDeck } from "../lib/deck/validate.ts";
import { MAX_ENERGIES } from "../lib/codec/energy.ts";

type Action =
  | { type: "set"; deck: Deck; transient?: boolean }
  | { type: "undo" }
  | { type: "redo" };

function reducer(h: History<Deck>, a: Action): History<Deck> {
  switch (a.type) {
    case "set":
      // renames update in place (typing a name shouldn't fill the undo stack)
      return a.transient ? { ...h, present: a.deck } : commit(h, a.deck);
    case "undo":
      return undo(h);
    case "redo":
      return redo(h);
  }
}

export interface Notice {
  id: number;
  text: string;
  undoable: boolean;
  tone?: "info" | "limit";
}

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function useDeck(catalog: Catalog | null) {
  const envRef = useRef<Envelope | null>(null);
  const [history, dispatch] = useReducer(reducer, null, () => initHistory(load(storage()).draft));
  const deck = history.present;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [bump, setBump] = useState(0); // increments on add → animates the counter
  const noticeId = useRef(0);

  // Autosave continuously (debounced a little so typing a name doesn't write on every key).
  useEffect(() => {
    const t = setTimeout(() => {
      envRef.current = { ...(envRef.current ?? load(storage())), draft: deck };
      save(storage(), envRef.current);
    }, 250);
    return () => clearTimeout(t);
  }, [deck]);

  const notify = useCallback((text: string, undoable: boolean, tone: Notice["tone"] = "info") => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, text, undoable, tone });
    setAnnouncement(text);
  }, []);

  const validation = useMemo(() => (catalog ? validateDeck(deck, catalog) : null), [deck, catalog]);

  const add = useCallback(
    (key: EntityKey, printId?: string) => {
      if (!catalog) return false;
      const r = addCard(deck, catalog, key, printId);
      const name = catalog.entity(key)?.name ?? "Card";
      if (!r.ok) {
        notify(r.message, false, "limit");
        return false;
      }
      dispatch({ type: "set", deck: r.deck });
      setBump((b) => b + 1);
      notify(`Added ${name} · ${deckSize(r.deck)}/20`, true);
      return true;
    },
    [catalog, deck, notify],
  );

  const remove = useCallback(
    (key: EntityKey) => {
      if (!catalog || countOf(deck, key) === 0) return;
      const next = removeCard(deck, key);
      dispatch({ type: "set", deck: next });
      notify(`Removed ${catalog.entity(key)?.name ?? "card"} · ${deckSize(next)}/20`, true);
    },
    [catalog, deck, notify],
  );

  const move = useCallback((key: EntityKey, delta: -1 | 1) => dispatch({ type: "set", deck: moveCard(deck, key, delta) }), [deck]);

  const energy = useCallback(
    (e: EnergyType) => {
      const next = toggleEnergy(deck, e);
      if (next === deck) {
        notify(`Up to ${MAX_ENERGIES} energy types. Remove one first.`, false, "limit");
        return;
      }
      dispatch({ type: "set", deck: next });
      setAnnouncement(next.energy.includes(e) ? `${e} energy on` : `${e} energy off`);
    },
    [deck, notify],
  );

  const rename = useCallback((name: string) => dispatch({ type: "set", deck: renameDeck(deck, name), transient: true }), [deck]);

  const replace = useCallback(
    (next: Deck, message: string) => {
      dispatch({ type: "set", deck: next });
      notify(message, true);
    },
    [notify],
  );

  const clear = useCallback(() => {
    dispatch({ type: "set", deck: { ...emptyDeck(deck.name), energy: deck.energy } });
    notify("Deck cleared", true);
  }, [deck, notify]);

  const doUndo = useCallback(() => {
    if (!canUndo(history)) return;
    dispatch({ type: "undo" });
    notify("Undone", false);
  }, [history, notify]);

  const doRedo = useCallback(() => {
    if (!canRedo(history)) return;
    dispatch({ type: "redo" });
    notify("Redone", false);
  }, [history, notify]);

  return {
    deck, validation, notice, announcement, bump,
    dismissNotice: () => setNotice(null),
    notify: (text: string) => notify(text, false),
    add, remove, move, energy, rename, replace, clear,
    undo: doUndo, redo: doRedo,
    canUndo: canUndo(history), canRedo: canRedo(history),
  };
}

export type DeckStore = ReturnType<typeof useDeck>;
