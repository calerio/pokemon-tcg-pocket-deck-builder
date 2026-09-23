/** Render a Scene onto any Canvas2D-compatible context (browser canvas, OffscreenCanvas, @napi-rs/canvas). */
import type { Gradient, Op, Scene } from "./layout.ts";

type Ctx = Pick<
  CanvasRenderingContext2D,
  "beginPath" | "fill" | "stroke" | "fillRect" | "arc" | "roundRect" | "fillText" | "measureText" | "createLinearGradient" | "save" | "restore"
> & { fillStyle: unknown; strokeStyle: unknown; lineWidth: number; font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline; imageSmoothingEnabled: boolean };

export const FONT_STACK = `ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

function fillFor(ctx: Ctx, fill: string | Gradient, x: number, y: number, w: number, h: number): unknown {
  if (typeof fill === "string") return fill;
  const a = (fill.angle * Math.PI) / 180;
  const cx = x + w / 2, cy = y + h / 2;
  const dx = (Math.cos(a) * w) / 2, dy = (Math.sin(a) * h) / 2;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  g.addColorStop(0, fill.from);
  g.addColorStop(1, fill.to);
  return g;
}

function draw(ctx: Ctx, op: Op): void {
  switch (op.t) {
    case "rect": {
      ctx.fillStyle = fillFor(ctx, op.fill, op.x, op.y, op.w, op.h);
      ctx.beginPath();
      if (op.r) ctx.roundRect(op.x, op.y, op.w, op.h, op.r);
      else ctx.roundRect(op.x, op.y, op.w, op.h, 0);
      ctx.fill();
      if (op.stroke) {
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = op.lw ?? 2;
        ctx.stroke();
      }
      return;
    }
    case "circle":
      ctx.fillStyle = op.fill;
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      ctx.fill();
      if (op.stroke) {
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = op.lw ?? 2;
        ctx.stroke();
      }
      return;
    case "text": {
      // Canvas font shorthand only accepts weights in steps of 100; anything else silently drops the font.
      const weight = Math.min(900, Math.max(100, Math.round((op.weight ?? 500) / 100) * 100));
      ctx.font = `${weight} ${Math.round(op.size)}px ${FONT_STACK}`;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align ?? "left";
      ctx.textBaseline = "alphabetic";
      let text = op.text;
      if (op.maxWidth) while (text.length > 1 && ctx.measureText(text).width > op.maxWidth) text = `${[...text].slice(0, -2).join("")}…`;
      ctx.fillText(text, op.x, op.y);
      return;
    }
    case "qr": {
      // Integer module size and integer origin → crisp, antialias-free modules.
      ctx.fillStyle = "#000000";
      op.matrix.forEach((row, r) =>
        row.forEach((dark, c) => {
          if (dark) ctx.fillRect(op.x + c * op.module, op.y + r * op.module, op.module, op.module);
        }),
      );
      return;
    }
  }
}

export function paint(ctx: Ctx, scene: Scene): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const op of scene.ops) draw(ctx, op);
  ctx.restore();
}
