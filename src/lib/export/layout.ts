/**
 * QR-card export layout: pure data, no DOM. `layoutQrCard` turns a deck summary + theme into a list of
 * draw operations that `paint` renders on any Canvas2D context (browser, or @napi-rs/canvas in tests).
 *
 * Scan-safety rules (enforced here and in tests):
 *  - the QR is black on pure white, drawn at an INTEGER number of pixels per module;
 *  - a white panel extends at least QUIET_ZONE modules beyond the symbol on every side;
 *  - no decoration, text or gradient ever overlaps that panel.
 */
import { QUIET_ZONE, type QrMatrix } from "../qr/generate.ts";
import { THEMES, energyHex, type Theme, type ThemeId } from "./themes.ts";

export interface DeckSummary {
  name: string;
  label?: string;
  pokemon: number;
  trainers: number;
  energy: string[];
  /** Up to 3 highlight names, e.g. the main attackers. */
  highlights: string[];
}

export type Op =
  | { t: "rect"; x: number; y: number; w: number; h: number; r?: number; fill: string | Gradient; stroke?: string; lw?: number }
  | { t: "circle"; x: number; y: number; r: number; fill: string; stroke?: string; lw?: number }
  | { t: "text"; x: number; y: number; text: string; size: number; weight?: number; color: string; align?: "left" | "center" | "right"; maxWidth?: number }
  | { t: "qr"; x: number; y: number; module: number; matrix: QrMatrix };

export interface Gradient {
  from: string;
  to: string;
  angle: number; // degrees, 0 = left→right
}

export interface Scene {
  width: number;
  height: number;
  ops: Op[];
  /** Where the white quiet-zone panel is, for tests. */
  qrPanel: { x: number; y: number; size: number; module: number };
}

export type CardFormat = "card" | "social";

export const FORMATS: Record<CardFormat, { width: number; height: number; label: string }> = {
  card: { width: 1080, height: 1512, label: "Phone (card)" },
  social: { width: 1200, height: 630, label: "Social post" },
};

/** Largest integer module size whose symbol + quiet zone fits in `space` pixels. */
export function moduleSizeFor(space: number, modules: number): number {
  return Math.max(1, Math.floor(space / (modules + QUIET_ZONE * 2)));
}

export function layoutQrCard(deck: DeckSummary, matrix: QrMatrix, themeId: ThemeId, format: CardFormat = "card"): Scene {
  const theme: Theme = THEMES[themeId](deck.energy[0]);
  return format === "card" ? cardLayout(deck, matrix, theme) : socialLayout(deck, matrix, theme);
}

function qrPanelOps(x: number, y: number, space: number, matrix: QrMatrix, radius: number) {
  const module = moduleSizeFor(space, matrix.length);
  const size = module * (matrix.length + QUIET_ZONE * 2);
  const px = Math.round(x + (space - size) / 2);
  const py = Math.round(y + (space - size) / 2);
  const ops: Op[] = [
    // white panel (radius stays inside the quiet zone: at most half a quiet zone)
    { t: "rect", x: px, y: py, w: size, h: size, r: Math.min(radius, (module * QUIET_ZONE) / 2), fill: "#ffffff" },
    { t: "qr", x: px + module * QUIET_ZONE, y: py + module * QUIET_ZONE, module, matrix },
  ];
  return { ops, panel: { x: px, y: py, size, module } };
}

function energyRow(energy: string[], x: number, y: number, theme: Theme, size: number, align: "left" | "center"): Op[] {
  const ops: Op[] = [];
  const gap = size * 0.35;
  const widths = energy.map((e) => size * 1.3 + e.length * size * 0.52);
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, energy.length - 1);
  let cx = align === "center" ? x - total / 2 : x;
  energy.forEach((e, i) => {
    ops.push({ t: "circle", x: cx + size / 2, y, r: size / 2, fill: energyHex(e), stroke: theme.panel, lw: 3 });
    ops.push({ t: "text", x: cx + size * 1.15, y: y + size * 0.35, text: e, size: Math.round(size * 0.9), weight: 600, color: theme.ink, maxWidth: (widths[i] ?? size) - size * 1.2 });
    cx += (widths[i] ?? 0) + gap;
  });
  return ops;
}

function cardLayout(deck: DeckSummary, matrix: QrMatrix, theme: Theme): Scene {
  const W = 1080, H = 1512, pad = 56;
  const ops: Op[] = [];
  // background + frame
  ops.push({ t: "rect", x: 0, y: 0, w: W, h: H, fill: theme.background });
  ops.push(...theme.decorations(W, H));
  ops.push({ t: "rect", x: pad / 2, y: pad / 2, w: W - pad, h: H - pad, r: 54, fill: theme.frame, stroke: theme.frameStroke, lw: 6 });
  // header
  ops.push({ t: "text", x: pad * 1.4, y: 150, text: truncate(deck.name || "My deck", 26), size: 62, weight: 800, color: theme.ink, maxWidth: W - pad * 2.8 - 160 });
  ops.push({ t: "text", x: W - pad * 1.4, y: 150, text: deck.label?.trim() ? truncate(deck.label, 12) : "20 cards", size: 38, weight: 700, color: theme.accent, align: "right" });
  // art window = QR panel
  // Art window = QR panel, sized from what's left after the header, three info rows and the footer.
  const rowsH = 3 * 104, footerH = 170, artY = 200;
  const artW = Math.min(W - pad * 2.8, H - artY - rowsH - footerH - 40);
  const artX = Math.round((W - artW) / 2);
  ops.push({ t: "rect", x: artX - 10, y: artY - 10, w: artW + 20, h: artW + 20, r: 36, fill: theme.window });
  const qr = qrPanelOps(artX, artY, artW, matrix, 24);
  ops.push(...qr.ops);
  // info rows
  const rowX = pad * 1.4, rowW = W - pad * 2.8;
  let y = artY + artW + 100;
  ops.push({ t: "rect", x: rowX, y: y - 58, w: rowW, h: 86, r: 22, fill: theme.panel });
  ops.push({ t: "text", x: rowX + 30, y: y, text: `${deck.pokemon} Pokémon · ${deck.trainers} Trainers`, size: 38, weight: 700, color: theme.ink, maxWidth: rowW - 60 });
  y += 104;
  ops.push({ t: "rect", x: rowX, y: y - 58, w: rowW, h: 86, r: 22, fill: theme.panel });
  ops.push(...energyRow(deck.energy.length ? deck.energy : ["Colorless"], rowX + 30, y - 14, theme, 40, "left"));
  if (deck.highlights.length) {
    y += 104;
    ops.push({ t: "rect", x: rowX, y: y - 58, w: rowW, h: 86, r: 22, fill: theme.panel });
    ops.push({ t: "text", x: rowX + 30, y: y, text: truncate(deck.highlights.slice(0, 3).join(" · "), 44), size: 34, weight: 600, color: theme.ink, maxWidth: rowW - 60 });
  }
  // footer
  ops.push({ t: "text", x: W / 2, y: H - 110, text: "Scan to import", size: 44, weight: 800, color: theme.accent, align: "center" });
  ops.push({ t: "text", x: W / 2, y: H - 62, text: "My Decks → Build New → Scan Code", size: 28, weight: 600, color: theme.muted, align: "center" });
  return { width: W, height: H, ops, qrPanel: qr.panel };
}

function socialLayout(deck: DeckSummary, matrix: QrMatrix, theme: Theme): Scene {
  const W = 1200, H = 630, pad = 40;
  const ops: Op[] = [{ t: "rect", x: 0, y: 0, w: W, h: H, fill: theme.background }, ...theme.decorations(W, H)];
  ops.push({ t: "rect", x: pad / 2, y: pad / 2, w: W - pad, h: H - pad, r: 40, fill: theme.frame, stroke: theme.frameStroke, lw: 5 });
  const space = H - pad * 3;
  const qr = qrPanelOps(pad * 1.5, pad * 1.5, space, matrix, 18);
  ops.push({ t: "rect", x: pad * 1.5 - 8, y: pad * 1.5 - 8, w: space + 16, h: space + 16, r: 28, fill: theme.window });
  ops.push(...qr.ops);
  const tx = pad * 1.5 + space + 56;
  const tw = W - tx - pad * 1.5;
  ops.push({ t: "text", x: tx, y: 150, text: truncate(deck.name || "My deck", 24), size: 54, weight: 800, color: theme.ink, maxWidth: tw });
  if (deck.label?.trim()) ops.push({ t: "text", x: tx, y: 205, text: truncate(deck.label, 20), size: 32, weight: 700, color: theme.accent });
  ops.push({ t: "text", x: tx, y: 290, text: `${deck.pokemon} Pokémon · ${deck.trainers} Trainers`, size: 32, weight: 600, color: theme.ink });
  ops.push(...energyRow(deck.energy.length ? deck.energy : ["Colorless"], tx, 350, theme, 34, "left"));
  if (deck.highlights.length) ops.push({ t: "text", x: tx, y: 440, text: truncate(deck.highlights.slice(0, 3).join(" · "), 40), size: 28, weight: 600, color: theme.muted, maxWidth: tw });
  ops.push({ t: "text", x: tx, y: 540, text: "Scan in Pokémon TCG Pocket", size: 30, weight: 800, color: theme.accent });
  ops.push({ t: "text", x: tx, y: 578, text: "My Decks → Build New → Scan Code", size: 24, weight: 600, color: theme.muted });
  return { width: W, height: H, ops, qrPanel: qr.panel };
}

function truncate(s: string, n: number): string {
  const chars = [...s.trim()];
  return chars.length > n ? `${chars.slice(0, n - 1).join("")}…` : chars.join("");
}
