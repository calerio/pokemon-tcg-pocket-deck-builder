/** Original QR-card themes. None imitate an official card frame; decoration never touches the QR panel. */
import type { Op } from "./layout.ts";

const ENERGY_HEX: Record<string, string> = {
  Grass: "#3f9b4a", Fire: "#e0552d", Water: "#2f86d6", Lightning: "#d9a800",
  Psychic: "#9a55c9", Fighting: "#b86a33", Darkness: "#3d4450", Metal: "#7d8a96",
};
export const energyHex = (e: string): string => ENERGY_HEX[e] ?? "#b9b3a6";

export interface Theme {
  background: string | { from: string; to: string; angle: number };
  frame: string;
  frameStroke: string;
  window: string;
  panel: string;
  ink: string;
  muted: string;
  accent: string;
  decorations: (w: number, h: number) => Op[];
}

export type ThemeId = "clean" | "cute" | "energy";

export const THEME_LABELS: Record<ThemeId, string> = { clean: "Clean", cute: "Cute", energy: "Energy" };

const mix = (hex: string, withHex: string, t: number): string => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(withHex)];
  return `#${a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

export const THEMES: Record<ThemeId, (energy?: string) => Theme> = {
  clean: () => ({
    background: "#eef1f6",
    frame: "#ffffff",
    frameStroke: "#dfe4ee",
    window: "#f3f5f9",
    panel: "#f3f5f9",
    ink: "#1d2433",
    muted: "#6b7486",
    accent: "#2f5bea",
    decorations: () => [],
  }),
  cute: () => ({
    background: { from: "#ffd9e8", to: "#dcd6ff", angle: 135 },
    frame: "#fffafc",
    frameStroke: "#ffc4dc",
    window: "#ffeaf3",
    panel: "#fff0f6",
    ink: "#4a2340",
    muted: "#9a6a8c",
    accent: "#e0508f",
    decorations: (w, h) => {
      // soft confetti dots around the edges only (outside the frame's inner area)
      const ops: Op[] = [];
      const dots = [[0.06, 0.03], [0.2, 0.012], [0.8, 0.018], [0.95, 0.05], [0.03, 0.5], [0.975, 0.62], [0.1, 0.985], [0.5, 0.99], [0.9, 0.975]];
      dots.forEach(([fx, fy], i) => ops.push({ t: "circle", x: fx! * w, y: fy! * h, r: 8 + (i % 3) * 5, fill: i % 2 ? "#ffffff" : "#ffb3d1" }));
      return ops;
    },
  }),
  energy: (energy) => {
    const c = energyHex(energy ?? "Colorless");
    return {
      background: { from: mix(c, "#ffffff", 0.15), to: mix(c, "#000000", 0.25), angle: 160 },
      frame: mix(c, "#ffffff", 0.9),
      frameStroke: mix(c, "#ffffff", 0.55),
      window: mix(c, "#ffffff", 0.75),
      panel: mix(c, "#ffffff", 0.8),
      ink: mix(c, "#000000", 0.7),
      muted: mix(c, "#000000", 0.45),
      accent: mix(c, "#000000", 0.2),
      decorations: () => [],
    };
  },
};
