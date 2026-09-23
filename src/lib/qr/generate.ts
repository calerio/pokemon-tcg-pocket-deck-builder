/**
 * QR generation for deck codes. The game's own codes are QR version 9 (53×53), error correction H,
 * byte mode, so ours match exactly. A 20-card payload is always 88 Base64 characters, which fits.
 */
import qrcode from "qrcode-generator";

export const DECK_QR_VERSION = 9;
export const DECK_QR_MODULES = 17 + 4 * DECK_QR_VERSION; // 53
/** Light border around the symbol, in modules. The QR spec requires at least 4. */
export const QUIET_ZONE = 4;

export type QrMatrix = boolean[][];

export function deckQrMatrix(payload: string): QrMatrix {
  const qr = qrcode(DECK_QR_VERSION, "H");
  qr.addData(payload, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  if (n !== DECK_QR_MODULES) throw new Error(`expected a ${DECK_QR_MODULES}-module symbol, got ${n}`);
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Crisp black-on-white SVG, with the quiet zone included. */
export function deckQrSvg(payload: string, { title = "Deck QR code" }: { title?: string } = {}): string {
  const m = deckQrMatrix(payload);
  const side = m.length + QUIET_ZONE * 2;
  let d = "";
  m.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) d += `M${c + QUIET_ZONE} ${r + QUIET_ZONE}h1v1h-1z`;
    }),
  );
  const esc = title.replace(/[<&>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img" aria-label="${esc}">` +
    `<title>${esc}</title><rect width="${side}" height="${side}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`
  );
}

/**
 * Rasterise a matrix to RGBA pixels at an integer module size (never fractional, so edges stay sharp).
 * Returns the pixel buffer plus its side length. Used by exports and tests.
 */
export function rasterise(matrix: QrMatrix, moduleSize: number, quiet = QUIET_ZONE): { data: Uint8ClampedArray; side: number } {
  if (!Number.isInteger(moduleSize) || moduleSize < 1) throw new Error("module size must be a positive integer");
  const side = (matrix.length + quiet * 2) * moduleSize;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      const x0 = (c + quiet) * moduleSize;
      const y0 = (r + quiet) * moduleSize;
      for (let y = y0; y < y0 + moduleSize; y++) {
        for (let x = x0; x < x0 + moduleSize; x++) {
          const o = (y * side + x) * 4;
          data[o] = 0;
          data[o + 1] = 0;
          data[o + 2] = 0;
        }
      }
    }),
  );
  return { data, side };
}
