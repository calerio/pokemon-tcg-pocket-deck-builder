import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Catalog } from "../lib/cards/catalog.ts";
import { deckSize, groupDeck, type Deck } from "../lib/deck/model.ts";
import { importDeck, ImportError, type ImportProblem } from "../lib/deck/io.ts";
import type { RgbaImage } from "../lib/qr/decode.ts";
import type { DecodeResponse } from "../lib/qr/decode.worker.ts";

const MAX_SIDE = 2400; // downscale huge photos before decoding

let worker: Worker | null = null;
let seq = 0;
function decodeInWorker(image: RgbaImage): Promise<DecodeResponse["result"]> {
  worker ??= new Worker(new URL("../lib/qr/decode.worker.ts", import.meta.url), { type: "module" });
  const id = ++seq;
  const w = worker;
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<DecodeResponse>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMsg);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, image }, [image.data.buffer]);
  });
}

async function pixelsFrom(source: Blob | HTMLVideoElement): Promise<RgbaImage> {
  const bmp = source instanceof Blob ? await createImageBitmap(source) : source;
  const w0 = bmp instanceof HTMLVideoElement ? bmp.videoWidth : bmp.width;
  const h0 = bmp instanceof HTMLVideoElement ? bmp.videoHeight : bmp.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

interface Pending {
  deck: Deck;
  problems: ImportProblem[];
  source: string;
}

export function ImportDialog({ dialogRef, catalog, onImport }: {
  dialogRef: RefObject<HTMLDialogElement | null>; catalog: Catalog; onImport: (deck: Deck) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [over, setOver] = useState(false);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText("");
    setError(null);
    setPending(null);
    setBusy(false);
    setCamera(false);
  };

  const fromText = useCallback((value: string, source: string) => {
    try {
      const r = importDeck(value, catalog);
      if (r.deck.cards.length === 0 && r.problems.length === 0) throw new ImportError("No cards found.");
      setPending({ deck: r.deck, problems: r.problems, source });
      setError(null);
    } catch (e) {
      setError(e instanceof ImportError ? e.message : "That couldn't be read.");
    }
  }, [catalog]);

  const fromImage = useCallback(async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const hit = await decodeInWorker(await pixelsFrom(blob));
      if (!hit) setError("No deck code found in that image. Try a sharper screenshot of the code.");
      else fromText(hit.payload, hit.method === "pocket-decorated" ? "in-game code screenshot" : "QR image");
    } catch {
      setError("That image couldn't be read.");
    } finally {
      setBusy(false);
    }
  }, [fromText]);

  // paste an image anywhere while the dialog is open
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onPaste = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (img) {
        e.preventDefault();
        void fromImage(img);
      }
    };
    d.addEventListener("paste", onPaste);
    return () => d.removeEventListener("paste", onPaste);
  }, [dialogRef, fromImage]);

  // camera scanning: BarcodeDetector where supported, otherwise frames go to the worker
  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = video.current;
        if (!v || stop) return;
        v.srcObject = stream;
        await v.play();
        const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => { detect(s: CanvasImageSource): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
        const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
        while (!stop) {
          await new Promise((r) => setTimeout(r, 350));
          if (!v.videoWidth) continue;
          const value = detector ? (await detector.detect(v))[0]?.rawValue : (await decodeInWorker(await pixelsFrom(v)))?.payload;
          if (value) {
            stop = true;
            setCamera(false);
            fromText(value, "camera");
          }
        }
      } catch {
        setCamera(false);
        setError("The camera isn't available. Upload or paste a screenshot instead.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera, fromText]);

  const close = () => {
    dialogRef.current?.close();
    reset();
  };

  return (
    <dialog ref={dialogRef} className="sheet center" aria-labelledby="import-title" onClose={reset} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="grabber" aria-hidden="true" />
      <div className="sheet-head">
        <h2 id="import-title">{pending ? "Import this deck?" : "Import a deck"}</h2>
        <button type="button" className="x-btn" onClick={close} aria-label="Close">×</button>
      </div>
      <div className="sheet-body">
        {pending ? (
          <>
            <p style={{ margin: 0 }}>
              <b>{deckSize(pending.deck)}</b> cards{pending.deck.energy.length ? ` · ${pending.deck.energy.join(", ")}` : ""} <span style={{ color: "var(--ink-3)" }}>from {pending.source}</span>
            </p>
            <ul className="preview-list">
              {groupDeck(pending.deck, catalog).flatMap((g) => g.cards).map((c) => (
                <li key={c.key}>{c.count}× {c.entity.name}</li>
              ))}
            </ul>
            {pending.problems.length > 0 && (
              <div className="problems" role="alert">
                <b>{pending.problems.length} line{pending.problems.length > 1 ? "s" : ""} couldn't be added:</b>
                <ul>
                  {pending.problems.map((p, i) => (
                    <li key={i}>
                      {p.line ? `Line ${p.line}: ` : ""}“{p.text}”: {p.reason}
                      {p.candidates && ` (e.g. ${p.candidates.slice(0, 3).join(", ")})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button type="button" className="primary" onClick={() => { onImport(pending.deck); close(); }}>
              Replace my current deck
            </button>
            <button type="button" className="btn-ghost" onClick={() => setPending(null)}>Back</button>
          </>
        ) : camera ? (
          <>
            <video ref={video} className="camera" muted playsInline aria-label="Camera preview" />
            <p className="hint">Point the camera at a deck QR code.</p>
            <button type="button" className="btn-ghost" onClick={() => setCamera(false)}>Stop camera</button>
          </>
        ) : (
          <>
            <div
              className={`drop${over ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const f = e.dataTransfer.files[0];
                if (f) void fromImage(f);
              }}
            >
              <p style={{ margin: "0 0 10px" }}>A screenshot of a deck QR code, including the game's own <b>Display Code</b> screen.</p>
              <div className="chips" style={{ justifyContent: "center" }}>
                <button type="button" className="btn-ghost" onClick={() => fileInput.current?.click()} disabled={busy}>Choose image</button>
                {"mediaDevices" in navigator && <button type="button" className="btn-ghost" onClick={() => setCamera(true)} disabled={busy}>Use camera</button>}
              </div>
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromImage(f); e.target.value = ""; }} />
              <p className="hint" style={{ marginTop: 8 }}>{busy ? "Reading the code…" : "You can also paste or drop an image here."}</p>
            </div>
            <label>
              <span style={{ fontWeight: 650, fontSize: 14 }}>…or paste a decklist, deck code or JSON</span>
              <textarea className="paste" value={text} onChange={(e) => setText(e.target.value)} placeholder={"2 Riolu A2 91\n2 Mega Lucario ex B3 81\n…\n\nEnergy: Fighting"} spellCheck={false} />
            </label>
            <button type="button" className="primary" disabled={!text.trim()} onClick={() => fromText(text, "pasted text")}>Read deck</button>
          </>
        )}
        {error && <p className="problems" role="alert" style={{ margin: 0 }}>{error}</p>}
        <p className="hint">Everything is read on this device; nothing is uploaded.</p>
      </div>
    </dialog>
  );
}
