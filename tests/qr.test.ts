import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import fixtures from "./fixtures/payloads.json";
import { DECK_QR_MODULES, QUIET_ZONE, deckQrMatrix, deckQrSvg, rasterise } from "../src/lib/qr/generate.ts";
import { readQr, type RgbaImage } from "../src/lib/qr/decode.ts";
import { recoverDecoratedCode } from "../src/lib/qr/recover.ts";

const payloads = Object.values(fixtures as Record<string, { payload: string }>).map((f) => f.payload);

describe("QR generation", () => {
  it("always makes a version-9 (53×53) symbol, like the game", () => {
    for (const p of payloads) expect(deckQrMatrix(p)).toHaveLength(DECK_QR_MODULES);
  });

  it.each([2, 4, 8])("every fixture decodes back exactly at %ipx per module", (px) => {
    for (const p of payloads) {
      const { data, side } = rasterise(deckQrMatrix(p), px);
      const hit = jsQR(data, side, side);
      expect(hit?.data).toBe(p);
      expect(hit?.version).toBe(9);
    }
  });

  it("keeps the quiet zone pure white", () => {
    const px = 4;
    const { data, side } = rasterise(deckQrMatrix(payloads[0]!), px);
    const q = QUIET_ZONE * px;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        if (x >= q && x < side - q && y >= q && y < side - q) continue;
        const o = (y * side + x) * 4;
        expect(data[o]! + data[o + 1]! + data[o + 2]!).toBe(765);
      }
    }
  });

  it("makes an accessible SVG", () => {
    const svg = deckQrSvg(payloads[0]!, { title: 'Deck "A" <b>' });
    expect(svg).toContain('role="img"');
    expect(svg).toContain("&#34;A&#34; &#60;b&#62;");
    expect(svg).toContain(`viewBox="0 0 ${DECK_QR_MODULES + 8} ${DECK_QR_MODULES + 8}"`);
  });
});

/** A synthetic imitation of the game's decorated code: blue dots, light background, a centre badge. */
function decorated(payload: string, px = 14): RgbaImage {
  const m = deckQrMatrix(payload);
  const n = m.length;
  const margin = 60;
  const side = n * px + margin * 2;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 238; data[i + 1] = 244; data[i + 2] = 252; data[i + 3] = 255; // pale background
  }
  const paint = (x: number, y: number, rgb: [number, number, number]) => {
    const o = (y * side + x) * 4;
    data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2];
  };
  const blue: [number, number, number] = [0, 111, 199];
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!m[r]![c]) continue;
      const cx = margin + c * px + px / 2;
      const cy = margin + r * px + px / 2;
      const rad = finder(r, c) ? px / 2 : px * 0.38; // finders solid, data modules as dots
      for (let y = Math.floor(cy - px / 2); y < cy + px / 2; y++) {
        for (let x = Math.floor(cx - px / 2); x < cx + px / 2; x++) {
          if (finder(r, c) || (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) paint(x, y, blue);
        }
      }
    }
  }
  // centre badge covering ~7×7 modules (error correction H absorbs it)
  const c0 = margin + Math.floor(n / 2 - 3.5) * px;
  for (let y = c0; y < c0 + 7 * px; y++) for (let x = c0; x < c0 + 7 * px; x++) paint(x, y, [255, 255, 255]);
  return { width: side, height: side, data };
}

describe("QR reading", () => {
  it("reads a plain code", () => {
    const { data, side } = rasterise(deckQrMatrix(payloads[1]!), 6);
    expect(readQr({ width: side, height: side, data })).toEqual({ payload: payloads[1], method: "standard" });
  });

  it("reads a decorated, dotted, centre-obscured code", () => {
    const methods: string[] = [];
    for (const p of payloads.slice(0, 3)) {
      const r = readQr(decorated(p));
      expect(r?.payload).toBe(p);
      methods.push(r!.method);
    }
    // at least one must need the in-game recovery path, or this test isn't testing it
    expect(methods).toContain("pocket-decorated");
  });

  it("the recovery path alone reads the decorated code", () => {
    for (const p of payloads.slice(0, 3)) expect(recoverDecoratedCode(decorated(p))).toBe(p);
  });

  it("returns null when there's no code", () => {
    const side = 200;
    expect(readQr({ width: side, height: side, data: new Uint8ClampedArray(side * side * 4).fill(255) })).toBeNull();
  });
});
