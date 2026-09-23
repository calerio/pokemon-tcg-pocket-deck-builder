/** Small shared UI pieces: energy colours, progressive card art with text fallback, icons. */
import { useState, type CSSProperties } from "react";
import type { Print } from "../lib/cards/catalog.ts";

export const ENERGY_COLOR: Record<string, string> = {
  Grass: "var(--e-grass)",
  Fire: "var(--e-fire)",
  Water: "var(--e-water)",
  Lightning: "var(--e-lightning)",
  Psychic: "var(--e-psychic)",
  Fighting: "var(--e-fighting)",
  Darkness: "var(--e-darkness)",
  Metal: "var(--e-metal)",
  Colorless: "var(--e-colorless)",
  Dragon: "var(--e-dragon)",
};

export const cssVar = (name: string, value: string) => ({ [name]: value }) as CSSProperties;

/**
 * Card art that appears progressively: shimmer skeleton → image. Hosts are tried in order, and when all fail
 * it becomes an original text tile, so the builder never depends on third-party images.
 */
export function CardArt({ print, className = "tile-art", eager = false }: { print: Print; className?: string; eager?: boolean }) {
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const e = print.entity;
  const src = print.images[i];
  const energy = e.types?.[0];
  return (
    <div className={`${className}${loaded || !src ? " loaded" : ""}`}>
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setI((n) => n + 1)}
        />
      ) : (
        <div className="text-tile" style={cssVar("--tile-energy", energy ? (ENERGY_COLOR[energy] ?? "") : "var(--e-colorless)")}>
          <strong>{e.name}</strong>
          <span className="meta">
            {e.kind === "pokemon" ? `${e.stage ?? "Pokémon"}${e.hp ? ` · ${e.hp} HP` : ""}` : (e.trainerType ?? "Trainer")}
          </span>
          {e.attacks?.slice(0, 2).map((a) => (
            <span key={a.name}>
              {a.name} {a.damage ?? ""}
            </span>
          ))}
          {e.effect && <span className="meta">{e.effect.slice(0, 90)}{e.effect.length > 90 ? "…" : ""}</span>}
        </div>
      )}
    </div>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  // original mark: a card with a QR-ish corner
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="5" y="3" width="22" height="26" rx="4" fill="var(--accent)" />
      <rect x="9" y="7" width="6" height="6" rx="1.2" fill="var(--paper)" />
      <rect x="17" y="7" width="6" height="6" rx="1.2" fill="var(--paper)" />
      <rect x="9" y="15" width="6" height="6" rx="1.2" fill="var(--paper)" />
      <rect x="18" y="16" width="2.4" height="2.4" fill="var(--paper)" />
      <rect x="20.6" y="18.6" width="2.4" height="2.4" fill="var(--paper)" />
      <rect x="9" y="23" width="14" height="2.2" rx="1.1" fill="var(--paper)" opacity=".7" />
    </svg>
  );
}

export const Icon = {
  search: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  filter: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  ),
  more: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  ),
  qr: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h3v3h-3zm5 0h3v3h-3zm-5 5h3v3h-3zm5 0h3v3h-3zm-2.5-2.5h3v3h-3z" />
    </svg>
  ),
  undo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  ),
  redo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </svg>
  ),
};
