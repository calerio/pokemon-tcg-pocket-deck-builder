import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Catalog } from "../lib/cards/catalog.ts";
import { encodeDeckCode } from "../lib/codec/payload.ts";
import { toCodeParts, type Deck } from "../lib/deck/model.ts";
import { shareHash } from "../lib/deck/share.ts";
import { deckQrMatrix, deckQrSvg, rasterise } from "../lib/qr/generate.ts";

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
  const savePng = async () => {
    if (!payload) return;
    download(await plainQrPng(payload), fileName(deck.name, "png"));
    onDone("QR image saved");
  };
  const share = async () => {
    if (!payload) return;
    try {
      const file = new File([await plainQrPng(payload)], fileName(deck.name, "png"), { type: "image/png" });
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
            <div className="qr-box" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="hint">In the game: <b>My Decks → Build New → Scan Code</b></p>
            <div className="export-actions">
              <button type="button" className="primary" onClick={savePng}>Save QR image</button>
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
