/** Read deck codes from pixels: plain QR first, then the in-game decorated-code recovery. */
import jsQR from "jsqr";
import { recoverDecoratedCode } from "./recover.ts";

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface QrReadResult {
  payload: string;
  method: "standard" | "pocket-decorated";
}

export function readQr(img: RgbaImage): QrReadResult | null {
  const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
  if (hit) return { payload: hit.data, method: "standard" };
  const recovered = recoverDecoratedCode(img);
  return recovered ? { payload: recovered, method: "pocket-decorated" } : null;
}
