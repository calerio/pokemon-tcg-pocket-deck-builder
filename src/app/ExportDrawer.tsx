import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Catalog } from "../lib/cards/catalog.ts";
import { encodeDeckCode } from "../lib/codec/payload.ts";
import { toCodeParts, type Deck } from "../lib/deck/model.ts";
import { shareHash } from "../lib/deck/share.ts";
import { deckQrMatrix, deckQrSvg, rasterise } from "../lib/qr/generate.ts";
import { FORMATS, layoutQrCard, type CardFormat, type DeckSummary } from "../lib/export/layout.ts";
import { THEME_LABELS, type ThemeId } from "../lib/export/themes.ts";
import { paint } from "../lib/export/paint.ts";
import { groupDeck } from "../lib/deck/model.ts";

export function fileName(name: string, ext: string): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "deck";
  return `${slug}-qr.${ext}`;
}

/** Plain, maximally scannable PNG: black on white, whole-pixel modules, 4-module quiet zone. */
export async function plainQrPng(payload: string, moduleSize = 12): Promise<Blob> {
  const { data, side } = rasterise(deckQrMatrix(payload), moduleSize);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.putImageData(new ImageData(data, side, side), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}

/** Deck facts shown on a QR card: counts, energy and up to three headline Pokémon (Mega/ex first). */
export function summarise(deck: Deck, catalog: Catalog, label: string): DeckSummary {
  const rows = groupDeck(deck, catalog).flatMap((g) => g.cards);
  const pokemon = rows.filter((r) => r.entity.kind === "pokemon");
  const rank = (e: (typeof rows)[number]["entity"]) => (e.isMega ? 0 : e.isEx ? 1 : e.stage === "Stage 2" ? 2 : e.stage === "Stage 1" ? 3 : 4);
  const highlights = [...pokemon].sort((a, b) => rank(a.entity) - rank(b.entity) || b.count - a.count).slice(0, 3).map((r) => r.entity.name);
  return {
    name: deck.name, label,
    pokemon: pokemon.reduce((n, r) => n + r.count, 0),
    trainers: rows.filter((r) => r.entity.kind === "trainer").reduce((n, r) => n + r.count, 0),
    energy: deck.energy, highlights,
  };
}

export function renderQrCard(payload: string, summary: DeckSummary, theme: ThemeId, format: CardFormat): HTMLCanvasElement {
  const scene = layoutQrCard(summary, deckQrMatrix(payload), theme, format);
  const canvas = document.createElement("canvas");
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  paint(ctx, scene);
  return canvas;
}

const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function ExportDrawer({ dialogRef, deck, catalog, onDone }: {
  dialogRef: RefObject<HTMLDialogElement | null>; deck: Deck; catalog: Catalog; onDone: (msg: string) => void;
}) {
  const payload = useMemo(() => {
    try {
      return encodeDeckCode(toCodeParts(deck, catalog));
    } catch {
      return null;
    }
  }, [deck, catalog]);
  const svg = useMemo(() => (payload ? deckQrSvg(payload, { title: `QR code for ${deck.name}` }) : ""), [payload, deck.name]);
  const link = payload ? `${location.origin}${location.pathname}${shareHash(payload, deck.name)}` : "";
  const [copied, setCopied] = useState<string | null>(null);
  const [mode, setMode] = useState<"plain" | "card">("plain");
  const [theme, setTheme] = useState<ThemeId>("clean");
  const [format, setFormat] = useState<CardFormat>("card");
  const [label, setLabel] = useState("");
  const preview = useRef<HTMLDivElement>(null);
  const summary = useMemo(() => summarise(deck, catalog, label), [deck, catalog, label]);
  useEffect(() => {
    if (mode !== "card" || !payload || !preview.current) return;
    const canvas = renderQrCard(payload, summary, theme, format);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `QR card for ${deck.name}, ${THEME_LABELS[theme]} theme`);
    canvas.style.cssText = "width:100%;height:auto;display:block;border-radius:14px";
    preview.current.replaceChildren(canvas);
  }, [mode, payload, summary, theme, format, deck.name]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (what: string) => {
    setCopied(what);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1800);
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(what);
    } catch {
      onDone("Couldn't copy. Select the text and copy it manually.");
    }
  };
  const currentPng = async (): Promise<Blob> =>
    mode === "card" && payload ? toPng(renderQrCard(payload, summary, theme, format)) : plainQrPng(payload as string);
  const savePng = async () => {
    if (!payload) return;
    download(await currentPng(), fileName(mode === "card" ? `${deck.name}-${theme}-${format}` : deck.name, "png"));
    onDone(mode === "card" ? "QR card saved" : "QR image saved");
  };
  const share = async () => {
    if (!payload) return;
    try {
      const file = new File([await currentPng()], fileName(deck.name, "png"), { type: "image/png" });
      const data: ShareData = { title: deck.name, text: `${deck.name}: scan in Pokémon TCG Pocket (My Decks → Build New → Scan Code)`, url: link };
      if (navigator.canShare?.({ ...data, files: [file] })) await navigator.share({ ...data, files: [file] });
      else if (navigator.share) await navigator.share(data);
      else await copy(link, "link");
    } catch (e) {
      if ((e as Error).name !== "AbortError") onDone("Sharing isn't available here. The link was copied instead.");
    }
  };

  return (
    <dialog ref={dialogRef} className="sheet center" aria-labelledby="export-title" onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}>
      <div className="grabber" aria-hidden="true" />
      <div className="sheet-head">
        <h2 id="export-title">{deck.name}</h2>
        <button type="button" className="x-btn" onClick={() => dialogRef.current?.close()} aria-label="Close">×</button>
      </div>
      <div className="sheet-body">
        {payload ? (
          <>
            <div className="segmented" role="radiogroup" aria-label="Style">
              <button type="button" role="radio" aria-checked={mode === "plain"} onClick={() => setMode("plain")}>Plain QR</button>
              <button type="button" role="radio" aria-checked={mode === "card"} onClick={() => setMode("card")}>QR card</button>
            </div>
            {mode === "plain" ? (
              <div className="qr-box" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <>
                <div ref={preview} className={`card-preview ${format}`} />
                <div className="card-options">
                  <div className="segmented small" role="radiogroup" aria-label="Theme">
                    {(Object.keys(THEME_LABELS) as ThemeId[]).map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}>{THEME_LABELS[t]}</button>
                    ))}
                  </div>
                  <div className="segmented small" role="radiogroup" aria-label="Size">
                    {(Object.keys(FORMATS) as CardFormat[]).map((f) => (
                      <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)}>{FORMATS[f].label}</button>
                    ))}
                  </div>
                  <label className="label-input">
                    <span>Label <small>(optional)</small></span>
                    <input value={label} maxLength={12} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Ladder" />
                  </label>
                </div>
              </>
            )}
            <p className="hint">In the game: <b>My Decks → Build New → Scan Code</b></p>
            <div className="export-actions">
              <button type="button" className="primary" onClick={savePng}>{mode === "card" ? "Save QR card" : "Save QR image"}</button>
              <button type="button" className="btn-ghost" onClick={() => copy(link, "link")}>{copied === "link" ? "✓ Link copied" : "Copy link"}</button>
              <button type="button" className="btn-ghost" onClick={share}>Share…</button>
            </div>
            <details>
              <summary style={{ cursor: "pointer", color: "var(--ink-2)", fontSize: 14 }}>Deck code (technical)</summary>
              <p className="code-text" style={{ marginBottom: 6 }}>{payload}</p>
              <button type="button" className="link-btn" onClick={() => copy(payload, "code")}>{copied === "code" ? "✓ Copied" : "Copy code"}</button>
            </details>
            <p className="hint">Deck codes carry cards and energy only. Artwork, sleeves and covers are chosen in the game.</p>
          </>
        ) : (
          <p>This deck can't be turned into a code yet.</p>
        )}
        <span className="sr-only" role="status" aria-live="polite">{copied ? `${copied === "link" ? "Link" : "Code"} copied` : ""}</span>
      </div>
    </dialog>
  );
}
