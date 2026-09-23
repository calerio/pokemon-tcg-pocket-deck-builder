/**
 * Generates public/og.png (1200×630 social preview) and public/icon-512.png from the app's own QR-card
 * renderer, so the preview shows the real product. Run: node --experimental-strip-types scripts/make-og.ts
 */
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { deckQrMatrix } from "../src/lib/qr/generate.ts";
import { layoutQrCard } from "../src/lib/export/layout.ts";
import { paint } from "../src/lib/export/paint.ts";

// The tournament Mega Lucario ex list whose code was verified in the real game.
const SAMPLE = "DZiWqJiWqJiaXpiYJJiXwJiblJiYLpiWnpiWnpiWlJibgJiWipibxgcADogADogARDQARDQADpIABgQACigBBg==";
const scene = layoutQrCard(
  { name: "Pocket Deck Lab", label: "Deck Builder & QR", pokemon: 7, trainers: 13, energy: ["Fighting"], highlights: ["Search · tap · Generate QR"] },
  deckQrMatrix(SAMPLE), "clean", "social",
);
const og = createCanvas(scene.width, scene.height);
paint(og.getContext("2d") as never, scene);
writeFileSync("public/og.png", og.toBuffer("image/png"));

// App icon: the logo mark on the accent colour.
const s = 512, icon = createCanvas(s, s), c = icon.getContext("2d");
c.fillStyle = "#2f5bea"; c.beginPath(); c.roundRect(0, 0, s, s, 112); c.fill();
c.fillStyle = "#f7f4ee";
const u = s / 32;
for (const [x, y, w, h] of [[9, 7, 6, 6], [17, 7, 6, 6], [9, 15, 6, 6], [18, 16, 2.4, 2.4], [20.6, 18.6, 2.4, 2.4], [9, 23, 14, 2.2]] as const) {
  c.beginPath(); c.roundRect(x * u, y * u, w * u, h * u, w > 3 ? 1.2 * u : 0); c.fill();
}
writeFileSync("public/icon-512.png", icon.toBuffer("image/png"));
console.log("wrote public/og.png and public/icon-512.png");
