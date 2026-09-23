/*
 * Recovery of the game's decorated deck QR codes from screenshots (dotted blue modules, deck icon
 * over the centre), which ordinary QR readers usually fail on.
 *
 * Adapted to TypeScript from `src/qr.js` in tcgp-deck-qr by Kevin Gutowski
 * https://github.com/KevinGutowski/tcgp-deck-qr
 *
 * MIT License. Copyright (c) 2026 Kevin Gutowski
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions: The above copyright notice and this
 * permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
 *
 * How it works: find the blue "Pocket" pixels, locate the three finder patterns as connected
 * blobs, assume a version-9 grid (53 modules, finder centres 46 modules apart), sample each module
 * with 5 votes, redraw a clean black-and-white QR, and hand that to jsQR. It retries across
 * saturation thresholds and small scale and shift adjustments.
 */
import jsQR from "jsqr";
import type { RgbaImage } from "./decode.ts";

const MODULE_COUNT = 53;
const FINDER_DISTANCE = MODULE_COUNT - 7;

interface Blob {
  size: number;
  cx: number;
  cy: number;
}
interface Triple {
  tl: Blob;
  tr: Blob;
  bl: Blob;
  score: number;
}

function isPocketBlue(r: number, g: number, b: number, a: number, saturation: number): boolean {
  if (a < 128) return false;
  return Math.max(r, g, b) - Math.min(r, g, b) >= saturation && b - r >= 30 && g - r >= 5 && b >= 90;
}

function blueAt(img: RgbaImage, x: number, y: number, saturation: number): boolean {
  const cx = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const o = (cy * img.width + cx) * 4;
  const d = img.data;
  return isPocketBlue(d[o] as number, d[o + 1] as number, d[o + 2] as number, d[o + 3] as number, saturation);
}

function finderCandidates(img: RgbaImage, sample: number, saturation: number): Blob[] {
  const w = Math.ceil(img.width / sample);
  const h = Math.ceil(img.height / sample);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, x * sample + sample / 2);
      const sy = Math.min(img.height - 1, y * sample + sample / 2);
      mask[y * w + x] = blueAt(img, sx, sy, saturation) ? 1 : 0;
    }
  }
  const seen = new Uint8Array(mask.length);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    let area = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % w;
      const y = (i - x) / w;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbours = [x > 0 ? i - 1 : -1, x + 1 < w ? i + 1 : -1, y > 0 ? i - w : -1, y + 1 < h ? i + w : -1];
      for (const n of neighbours) {
        if (n >= 0 && mask[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const ratio = bw / bh;
    const density = area / (bw * bh);
    if (bw >= 12 && bh >= 12 && ratio >= 0.72 && ratio <= 1.38 && density >= 0.2 && density <= 0.78) {
      blobs.push({ size: (bw + bh) / 2, cx: ((minX + maxX + 1) / 2) * sample, cy: ((minY + maxY + 1) / 2) * sample });
    }
  }
  return blobs;
}

function finderTriples(blobs: Blob[]): Triple[] {
  const out: Triple[] = [];
  for (const tl of blobs) {
    for (const tr of blobs) {
      if (tr.cx <= tl.cx) continue;
      const horizontal = tr.cx - tl.cx;
      if (horizontal < tl.size * 4 || Math.abs(tr.cy - tl.cy) > tl.size * 0.75) continue;
      for (const bl of blobs) {
        if (bl.cy <= tl.cy) continue;
        const vertical = bl.cy - tl.cy;
        if (vertical < tl.size * 4 || Math.abs(bl.cx - tl.cx) > tl.size * 0.75) continue;
        const mean = (tl.size + tr.size + bl.size) / 3;
        const sizeError = (Math.abs(tl.size - mean) + Math.abs(tr.size - mean) + Math.abs(bl.size - mean)) / mean;
        const geometryError =
          Math.abs(horizontal - vertical) / Math.max(horizontal, vertical) + Math.abs(tr.cy - tl.cy) / mean + Math.abs(bl.cx - tl.cx) / mean;
        out.push({ tl, tr, bl, score: sizeError + geometryError });
      }
    }
  }
  return out.sort((a, b) => a.score - b.score);
}

function synthesise(img: RgbaImage, t: Triple, saturation: number, shiftX: number, shiftY: number, scale: number) {
  const px = 8;
  const quiet = 4;
  const side = (MODULE_COUNT + quiet * 2) * px;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  const col = { x: ((t.tr.cx - t.tl.cx) / FINDER_DISTANCE) * scale, y: ((t.tr.cy - t.tl.cy) / FINDER_DISTANCE) * scale };
  const row = { x: ((t.bl.cx - t.tl.cx) / FINDER_DISTANCE) * scale, y: ((t.bl.cy - t.tl.cy) / FINDER_DISTANCE) * scale };
  const offsets: Array<[number, number]> = [
    [0, 0],
    [col.x * 0.12, col.y * 0.12],
    [-col.x * 0.12, -col.y * 0.12],
    [row.x * 0.12, row.y * 0.12],
    [-row.x * 0.12, -row.y * 0.12],
  ];
  for (let r = 0; r < MODULE_COUNT; r++) {
    for (let c = 0; c < MODULE_COUNT; c++) {
      const co = c - 3 + shiftX;
      const ro = r - 3 + shiftY;
      const x = t.tl.cx + co * col.x + ro * row.x;
      const y = t.tl.cy + co * col.y + ro * row.y;
      let votes = 0;
      for (const [dx, dy] of offsets) votes += blueAt(img, x + dx, y + dy, saturation) ? 1 : 0;
      if (votes < 2) continue;
      const sx = (c + quiet) * px;
      const sy = (r + quiet) * px;
      for (let yy = sy; yy < sy + px; yy++) {
        for (let xx = sx; xx < sx + px; xx++) {
          const o = (yy * side + xx) * 4;
          pixels[o] = 0;
          pixels[o + 1] = 0;
          pixels[o + 2] = 0;
        }
      }
    }
  }
  return { pixels, side };
}

/** Try to read a decorated in-game deck code. Returns the payload, or null. */
export function recoverDecoratedCode(img: RgbaImage): string | null {
  const sample = Math.max(1, Math.floor(Math.max(img.width, img.height) / 1600));
  for (const saturation of [55, 45, 65]) {
    const triples = finderTriples(finderCandidates(img, sample, saturation)).slice(0, 8);
    for (const t of triples) {
      for (const scale of [1, 0.998, 1.002, 0.995, 1.005]) {
        for (const sx of [0, -0.06, 0.06]) {
          for (const sy of [0, -0.06, 0.06]) {
            const { pixels, side } = synthesise(img, t, saturation, sx, sy, scale);
            const hit = jsQR(pixels, side, side, { inversionAttempts: "dontInvert" });
            if (hit) return hit.data;
          }
        }
      }
    }
  }
  return null;
}
