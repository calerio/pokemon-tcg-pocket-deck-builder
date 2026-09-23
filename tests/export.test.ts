import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import jsQR from "jsqr";
import fixtures from "./fixtures/payloads.json";
import { deckQrMatrix, QUIET_ZONE } from "../src/lib/qr/generate.ts";
import { FORMATS, layoutQrCard, moduleSizeFor, type CardFormat, type DeckSummary } from "../src/lib/export/layout.ts";
import { THEMES, type ThemeId } from "../src/lib/export/themes.ts";
import { paint } from "../src/lib/export/paint.ts";

const payload = (fixtures as Record<string, { payload: string }>).ingame_verified_mega_lucario_ex!.payload;
const matrix = deckQrMatrix(payload);

const summaries: DeckSummary[] = [
  { name: "Mega Lucario ex", label: "Ladder", pokemon: 7, trainers: 13, energy: ["Fighting"], highlights: ["Mega Lucario ex", "Lucario", "Hitmonlee"] },
  { name: "A very long deck name that will certainly need truncating somewhere", pokemon: 10, trainers: 10, energy: ["Fire", "Lightning", "Metal"], highlights: [] },
  { name: "Psy", label: "", pokemon: 6, trainers: 14, energy: ["Psychic"], highlights: ["Mega Altaria ex"] },
];

function render(summary: DeckSummary, theme: ThemeId, format: CardFormat) {
  const scene = layoutQrCard(summary, matrix, theme, format);
  const canvas = createCanvas(scene.width, scene.height);
  const ctx = canvas.getContext("2d");
  paint(ctx as unknown as Parameters<typeof paint>[0], scene);
  const img = ctx.getImageData(0, 0, scene.width, scene.height);
  return { scene, img, png: canvas.toBuffer("image/png") };
}

describe("QR-card exports stay scannable", () => {
  for (const theme of Object.keys(THEMES) as ThemeId[]) {
    for (const format of Object.keys(FORMATS) as CardFormat[]) {
      it(`${theme} / ${format}: decodes to the exact payload, with a pure-white quiet zone`, () => {
        for (const s of summaries) {
          const { scene, img, png } = render(s, theme, format);
          expect(png.subarray(1, 4).toString()).toBe("PNG");
          expect([scene.width, scene.height]).toEqual([FORMATS[format].width, FORMATS[format].height]);

          const hit = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
          expect(hit?.data, `${theme}/${format}/${s.name}`).toBe(payload);

          // quiet zone: the ring between panel edge and symbol must be pure white
          const { x, y, size, module } = scene.qrPanel;
          expect(Number.isInteger(module) && module >= 3).toBe(true);
          const q = QUIET_ZONE * module;
          const inset = Math.ceil(module / 2) + 1; // skip the panel's rounded corners
          for (let py = y + inset; py < y + size - inset; py += 2) {
            for (let px = x + inset; px < x + size - inset; px += 2) {
              const inSymbol = px >= x + q && px < x + size - q && py >= y + q && py < y + size - q;
              if (inSymbol) continue;
              const o = (py * img.width + px) * 4;
              expect(img.data[o]! + img.data[o + 1]! + img.data[o + 2]!, `quiet zone at ${px},${py}`).toBe(765);
            }
          }
          // symbol modules are pure black or pure white (no tint, no anti-aliasing)
          for (let py = y + q; py < y + size - q; py += module) {
            for (let px = x + q; px < x + size - q; px += module) {
              const o = ((py + (module >> 1)) * img.width + px + (module >> 1)) * 4;
              expect([0, 765]).toContain(img.data[o]! + img.data[o + 1]! + img.data[o + 2]!);
            }
          }
        }
      });
    }
  }

  it("no text or shape overlaps the QR panel, and everything stays on the canvas", () => {
    for (const theme of Object.keys(THEMES) as ThemeId[]) {
      for (const format of Object.keys(FORMATS) as CardFormat[]) {
        for (const s of summaries) {
          const scene = layoutQrCard(s, matrix, theme, format);
          const p = scene.qrPanel;
          const hits = (b: { x: number; y: number; w: number; h: number }) =>
            b.x < p.x + p.size && b.x + b.w > p.x && b.y < p.y + p.size && b.y + b.h > p.y;
          scene.ops.forEach((op, i) => {
            if (op.t === "qr") return;
            if (op.t === "rect") {
              const encloses = op.x <= p.x && op.y <= p.y && op.x + op.w >= p.x + p.size && op.y + op.h >= p.y + p.size;
              const isPanel = op.x === p.x && op.y === p.y && op.w === p.size && op.fill === "#ffffff";
              if (!encloses && !isPanel) expect(hits({ x: op.x, y: op.y, w: op.w, h: op.h }), `${theme}/${format} rect #${i}`).toBe(false);
            } else if (op.t === "circle") {
              expect(hits({ x: op.x - op.r, y: op.y - op.r, w: op.r * 2, h: op.r * 2 }), `${theme}/${format} circle #${i}`).toBe(false);
            } else if (op.t === "text") {
              const w = op.maxWidth ?? op.text.length * op.size * 0.62;
              const x = op.align === "center" ? op.x - w / 2 : op.align === "right" ? op.x - w : op.x;
              const box = { x, y: op.y - op.size, w, h: op.size * 1.3 };
              expect(hits(box), `${theme}/${format} text "${op.text}"`).toBe(false);
              expect(box.y + box.h, `text "${op.text}" below canvas`).toBeLessThanOrEqual(scene.height);
            }
          });
        }
      }
    }
  });

  it("module size is the largest integer that fits", () => {
    expect(moduleSizeFor(610, 53)).toBe(10);
    expect(moduleSizeFor(609, 53)).toBe(9);
  });
});
