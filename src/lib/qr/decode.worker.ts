/// <reference lib="webworker" />
/** Off-main-thread QR reading; the decorated-code recovery can take a second on big screenshots. */
import { readQr, type RgbaImage } from "./decode.ts";

export type DecodeRequest = { id: number; image: RgbaImage };
export type DecodeResponse = { id: number; result: ReturnType<typeof readQr>; error?: string };

self.onmessage = (event: MessageEvent<DecodeRequest>) => {
  const { id, image } = event.data;
  try {
    (self as unknown as Worker).postMessage({ id, result: readQr(image) } satisfies DecodeResponse);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, result: null, error: String(e) } satisfies DecodeResponse);
  }
};
