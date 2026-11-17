/**
 * Pixel art procedural: personajes y monstruos humanoides de 16x28 con 4 direcciones
 * y 3 fotogramas de caminata, contorno automático y sombreado por capas.
 */
import { CLASSES, type ClassId } from "./classes";
import type { ItemId } from "./items";
import type { EnemyKind } from "./rules";

const OUTLINE = "#0e0b12";
const FLASH = "#fff4e6";
export const SPRITE_W = 16;
export const SPRITE_H = 28;
/** Margen superior para sombreros, plumas y cuernos. */
const OY = 4;

export type Dir = "down" | "up" | "right" | "left";
/** Orden de fotogramas al caminar: reposo, paso, reposo, paso. */
export const WALK_CYCLE = [0, 1, 0, 2] as const;

export interface Look {
  skin: string;
  eyes: string;
  head: "helmet" | "horned" | "hood" | "hat" | "hair" | "bald" | "skull";
  headColor: string;
  plume?: string;
  horn?: string;
  body: string;
  trim: string;
  legs: string;
  boots: string;
  cape?: string;
  held?: "bow" | "staff" | "crossbow";
  heldColor?: string;
  orb?: string;
  ribs?: boolean;
  hunch?: boolean;
  ears?: boolean;
  fangs?: boolean;
}

export interface SpriteSet {
  frames: Record<Dir, HTMLCanvasElement[]>;
  flash: Record<Dir, HTMLCanvasElement[]>;
}

// ---------- utilidades de color ----------
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** f > 0 aclara hacia un tono cálido, f < 0 oscurece hacia un violeta profundo. */
function shade(hex: string, f: number) {
  const [r, g, b] = rgb(hex);
  const t = f < 0 ? [22, 14, 30] : [255, 246, 228];
  const k = Math.abs(f);
  const mix = (a: number, z: number) => Math.round(a + (z - a) * k);
  const v = (mix(r, t[0]!) << 16) | (mix(g, t[1]!) << 8) | mix(b, t[2]!);
  return `#${v.toString(16).padStart(6, "0")}`;
}

// ---------- lienzo de píxeles ----------
class Pix {
  d: (string | null)[];
  constructor(
    public w = SPRITE_W,
    public h = SPRITE_H,
    private oy = OY,
  ) {
    this.d = new Array(w * h).fill(null);
  }
  p(x: number, y: number, c: string) {
    y += this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }
  r(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, c);
  }
  outline() {
    const src = this.d.slice();
    const { w, h } = this;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (src[y * w + x]) continue;
        const n =
          (x > 0 && src[y * w + x - 1]) ||
          (x < w - 1 && src[y * w + x + 1]) ||
          (y > 0 && src[(y - 1) * w + x]) ||
          (y < h - 1 && src[(y + 1) * w + x]);
        if (n) this.d[y * w + x] = OUTLINE;
      }
  }
  canvas(flip = false, flash = false) {
    const cv = document.createElement("canvas");
    cv.width = this.w;
    cv.height = this.h;
    const c = cv.getContext("2d")!;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const col = this.d[y * this.w + x];
        if (!col) continue;
        c.fillStyle = flash ? FLASH : col;
        c.fillRect(flip ? this.w - 1 - x : x, y, 1, 1);
      }
    return cv;
  }
}

function tones(L: Look) {
  return {
    skinD: shade(L.skin, -0.28),
    skinL: shade(L.skin, 0.25),
    bodyD: shade(L.body, -0.32),
    bodyL: shade(L.body, 0.2),
    legsD: shade(L.legs, -0.3),
    bootsD: shade(L.boots, -0.35),
    headD: shade(L.headColor, -0.32),
    headL: shade(L.headColor, 0.28),
    trimL: shade(L.trim, 0.35),
    capeD: shade(L.cape ?? L.body, -0.3),
    capeL: shade(L.cape ?? L.body, 0.15),
    heldD: shade(L.heldColor ?? "#6b4a2a", -0.3),
    orbL: shade(L.orb ?? "#ffffff", 0.6),
    plumeD: shade(L.plume ?? L.headColor, -0.3),
  };
}
type Tones = ReturnType<typeof tones>;
const SOCKET = "#1a1418";
const MOUTH = "#2a1a1a";
const FANG = "#ece4d2";
const STRING = "#d8d0c0";

// ---------- vista de frente / espalda ----------
function drawFront(g: Pix, L: Look, C: Tones, f: number, back: boolean) {
  const top = 2 + (L.hunch ? 2 : 0);
  const armored = L.head === "helmet" || L.head === "horned";
  if (back && L.held) heldFront(g, L, C, 2, -1);
  if (L.cape && !back) {
    g.r(3, 13, 1, 6, C.capeD);
    g.r(12, 13, 1, 6, C.capeD);
  }

  // Piernas: la que avanza se eleva un píxel
  const leg = (x: number, up: number) => {
    if (L.ribs) {
      g.r(x + (x < 8 ? 1 : 0), 19, 1, 3 - up, L.legs);
      g.r(x, 22 - up, 2, 1, L.boots);
      return;
    }
    g.r(x, 19, 2, 2 - up, L.legs);
    g.p(x + (x < 8 ? 1 : 0), 19, C.legsD);
    g.r(x, 21 - up, 2, 1, L.boots);
    g.r(x, 22 - up, 2, 1, C.bootsD);
  };
  leg(5, f === 1 ? 1 : 0);
  leg(9, f === 2 ? 1 : 0);

  // Torso
  if (L.ribs) {
    g.r(4, 12, 8, 1, L.body);
    g.r(7, 12, 2, 7, L.body);
    for (const ry of [14, 16]) g.r(5, ry, 6, 1, L.body);
    g.r(5, 18, 6, 1, C.bodyD);
  } else {
    g.r(4, 12, 8, 7, L.body);
    g.r(4, 12, 1, 7, C.bodyD);
    g.r(11, 12, 1, 7, C.bodyD);
    g.r(5, 13, 1, 3, C.bodyL);
    g.r(4, 17, 8, 1, L.trim);
    g.r(4, 18, 8, 1, C.bodyD);
    if (!back) {
      g.r(7, 17, 2, 1, C.trimL);
      g.r(6, 12, 4, 1, C.bodyD);
      if (armored) g.r(7, 13, 2, 3, L.trim);
    }
    if (back && L.cape) {
      g.r(4, 12, 8, 8, L.cape);
      g.r(4, 12, 1, 8, C.capeD);
      g.r(11, 12, 1, 8, C.capeD);
      g.r(6, 13, 1, 5, C.capeL);
      g.r(5, 19, 6, 1, C.capeD);
    }
  }

  // Brazos: balanceo opuesto a las piernas
  const alen = L.hunch ? 6 : 4;
  const arm = (x: number, len: number) => {
    g.r(x, 12, 1, len, L.ribs ? L.body : L.body);
    g.p(x, 12 + len, L.skin);
  };
  arm(3, alen + (f === 2 ? 1 : 0));
  arm(12, alen + (f === 1 ? 1 : 0));
  if (armored) {
    g.r(3, 11, 2, 2, L.headColor);
    g.r(11, 11, 2, 2, L.headColor);
    g.p(3, 11, C.headL);
    g.p(11, 11, C.headL);
  }

  // Cabeza
  const sk = L.skin;
  if (L.head === "skull") {
    g.r(4, top + 1, 8, 6, sk);
    g.r(5, top, 6, 1, sk);
    g.r(5, top + 7, 6, 1, sk);
    g.r(6, top + 8, 4, 1, C.skinD);
  } else {
    g.r(4, top + 1, 8, 7, sk);
    g.r(5, top, 6, 1, sk);
    g.r(5, top + 8, 6, 1, C.skinD);
    g.r(4, top + 6, 1, 2, C.skinD);
    g.r(11, top + 6, 1, 2, C.skinD);
  }
  if (!L.hunch) g.r(6, top + 9, 4, 1, C.skinD);
  if (L.ears) {
    g.p(3, top + 4, sk);
    g.p(12, top + 4, sk);
    g.p(3, top + 3, C.skinD);
    g.p(12, top + 3, C.skinD);
  }
  if (!back) {
    if (L.head === "skull") {
      g.r(5, top + 3, 2, 2, SOCKET);
      g.r(9, top + 3, 2, 2, SOCKET);
      g.p(6, top + 4, L.eyes);
      g.p(9, top + 4, L.eyes);
      g.p(7, top + 6, SOCKET);
      g.p(8, top + 6, SOCKET);
      g.p(6, top + 7, C.skinD);
      g.p(8, top + 7, C.skinD);
    } else {
      g.r(6, top + 4, 1, 2, L.eyes);
      g.r(9, top + 4, 1, 2, L.eyes);
      if (L.fangs) {
        g.r(6, top + 7, 4, 1, MOUTH);
        g.p(6, top + 7, FANG);
        g.p(9, top + 7, FANG);
      } else g.r(7, top + 7, 2, 1, C.skinD);
    }
  } else if (L.head === "skull") {
    g.p(6, top + 2, C.skinD);
    g.p(7, top + 3, C.skinD);
  }

  // Tocado
  const hc = L.headColor;
  switch (L.head) {
    case "hair":
      g.r(5, top - 1, 6, 1, hc);
      if (back) {
        g.r(4, top, 8, 8, hc);
        g.r(4, top + 7, 8, 1, C.headD);
      } else {
        g.r(4, top, 8, 3, hc);
        g.r(4, top + 3, 1, 3, hc);
        g.r(11, top + 3, 1, 3, hc);
        g.p(6, top + 3, hc);
        g.p(9, top + 3, C.headD);
      }
      g.r(5, top, 2, 1, C.headL);
      break;
    case "bald":
      g.p(6, top + 1, C.skinL);
      g.p(7, top + 1, C.skinL);
      break;
    case "helmet":
    case "horned":
      g.r(5, top - 1, 6, 1, hc);
      if (back) {
        g.r(4, top, 8, 8, hc);
        g.r(4, top + 7, 8, 1, C.headD);
      } else {
        g.r(4, top, 8, 4, hc);
        g.r(4, top + 3, 8, 1, C.headD);
        g.r(4, top + 4, 1, 3, hc);
        g.r(11, top + 4, 1, 3, hc);
        g.r(7, top + 4, 2, 2, hc);
      }
      g.r(5, top, 2, 1, C.headL);
      if (L.plume) {
        g.r(7, top - 3, 2, 2, L.plume);
        g.p(6, top - 2, C.plumeD);
        g.p(9, top - 2, C.plumeD);
      }
      if (L.head === "horned") {
        const h = L.horn ?? "#e8dcc0";
        for (const [x, y] of [
          [3, top],
          [2, top - 1],
          [2, top - 2],
          [12, top],
          [13, top - 1],
          [13, top - 2],
        ] as const)
          g.p(x, y, h);
      }
      break;
    case "hood":
      g.r(5, top - 2, 6, 1, hc);
      g.r(4, top - 1, 8, 1, hc);
      if (back) {
        g.r(3, top, 10, 10, hc);
        g.r(3, top, 1, 10, C.headD);
        g.r(12, top, 1, 10, C.headD);
        g.r(7, top + 1, 2, 7, C.headL);
      } else {
        g.r(3, top, 10, 3, hc);
        g.r(3, top + 3, 2, 6, hc);
        g.r(11, top + 3, 2, 6, hc);
        g.r(5, top + 3, 6, 1, C.skinD);
        g.r(3, top + 3, 1, 6, C.headD);
        g.r(12, top + 3, 1, 6, C.headD);
        g.r(4, top, 2, 1, C.headL);
      }
      if (!L.hunch) g.r(4, 11, 8, 1, hc);
      break;
    case "hat":
      g.r(4, top - 1, 8, 2, hc);
      g.r(5, top - 3, 6, 2, hc);
      g.r(6, top - 5, 4, 2, hc);
      g.r(8, top - 6, 3, 1, hc);
      g.p(11, top - 6, C.headD);
      g.r(5, top - 3, 1, 2, C.headL);
      g.r(4, top, 8, 1, L.trim);
      g.r(2, top + 1, 12, 1, hc);
      g.r(3, top + 2, 10, 1, C.headD);
      if (back) g.r(4, top + 3, 8, 5, C.headD);
      break;
    case "skull":
      break;
  }

  if (!back && L.held) heldFront(g, L, C, 13, 1);
}

/** Arco, bastón o ballesta en vista frontal (s = 1 a la derecha, -1 a la izquierda). */
function heldFront(g: Pix, L: Look, C: Tones, x: number, s: 1 | -1) {
  const hc = L.heldColor ?? "#6b4a2a";
  if (L.held === "bow") {
    g.p(x, 9, hc);
    g.r(x + s, 10, 1, 10, hc);
    g.p(x, 20, hc);
    g.r(x, 10, 1, 10, STRING);
    g.p(x + s, 15, C.heldD);
  } else if (L.held === "staff") {
    g.r(x, 6, 1, 17, hc);
    g.p(x, 22, C.heldD);
    g.r(x - 1, 3, 3, 3, L.orb ?? "#ffffff");
    g.p(x - (s > 0 ? 1 : -1), 3, C.orbL);
    g.p(x, 2, L.orb ?? "#ffffff");
  } else if (L.held === "crossbow") {
    g.r(s > 0 ? x - 2 : x - 1, 15, 4, 1, C.heldD);
    g.r(x, 14, 1, 4, hc);
  }
  g.p(x - s, 16, L.skin);
}

// ---------- vista lateral (mirando a la derecha) ----------
function drawSide(g: Pix, L: Look, C: Tones, f: number) {
  const top = 2 + (L.hunch ? 2 : 0);
  const hx = 5 + (L.hunch ? 1 : 0);
  const armored = L.head === "helmet" || L.head === "horned";

  if (L.cape) {
    g.r(4, 12, 2, 8, L.cape);
    g.r(3, 13, 1, f === 0 ? 6 : 7, C.capeD);
    if (f !== 0) g.p(2, 19, C.capeD);
  }

  // Piernas: zancada en los fotogramas 1 y 2
  const leg = (x: number, col: string, boot: string, up: number) => {
    if (L.ribs) {
      g.r(x, 19, 1, 3 - up, col);
      g.r(x, 22 - up, 2, 1, boot);
      return;
    }
    g.r(x, 19, 2, 2 - up, col);
    g.r(x, 21 - up, 2, 1, boot);
    g.r(x, 22 - up, 3, 1, C.bootsD);
  };
  const backX = f === 0 ? 6 : f === 1 ? 5 : 9;
  const frontX = f === 0 ? 8 : f === 1 ? 9 : 5;
  leg(backX, C.legsD, C.bootsD, 0);
  leg(frontX, L.legs, L.boots, f === 2 ? 1 : 0);

  // Torso
  if (L.ribs) {
    g.r(6, 12, 4, 1, L.body);
    g.r(6, 12, 1, 7, L.body);
    for (const ry of [14, 16]) g.r(6, ry, 4, 1, L.body);
    g.r(6, 18, 4, 1, C.bodyD);
  } else {
    g.r(5, 12, 6, 7, L.body);
    g.r(5, 12, 1, 7, C.bodyD);
    g.r(10, 13, 1, 3, C.bodyL);
    g.r(5, 17, 6, 1, L.trim);
    g.p(9, 17, C.trimL);
    g.r(5, 18, 6, 1, C.bodyD);
  }
  if (L.hunch) g.r(5, 11, 4, 1, L.ribs ? L.body : C.bodyD);

  // Cabeza
  const sk = L.skin;
  if (L.head === "skull") {
    g.r(hx, top + 1, 7, 6, sk);
    g.r(hx + 1, top, 5, 1, sk);
    g.r(hx + 2, top + 7, 5, 1, sk);
    g.r(hx + 3, top + 8, 3, 1, C.skinD);
    g.r(hx + 4, top + 3, 2, 2, SOCKET);
    g.p(hx + 5, top + 4, L.eyes);
    g.p(hx + 6, top + 6, SOCKET);
    g.p(hx + 4, top + 7, C.skinD);
  } else {
    g.r(hx, top + 1, 7, 7, sk);
    g.r(hx + 1, top, 5, 1, sk);
    g.r(hx + 1, top + 8, 5, 1, C.skinD);
    g.p(hx + 7, top + 5, sk);
    g.r(hx + 5, top + 4, 1, 2, L.eyes);
    g.p(hx + 2, top + 5, C.skinD);
    if (L.fangs) {
      g.r(hx + 4, top + 7, 3, 1, MOUTH);
      g.p(hx + 6, top + 7, FANG);
    } else g.p(hx + 6, top + 7, C.skinD);
  }
  if (!L.hunch) g.r(hx + 1, top + 9, 3, 1, C.skinD);
  if (L.ears) {
    g.p(hx + 1, top + 3, sk);
    g.p(hx + 1, top + 2, C.skinD);
  }

  const hc = L.headColor;
  switch (L.head) {
    case "hair":
      g.r(hx + 1, top - 1, 5, 1, hc);
      g.r(hx, top, 7, 3, hc);
      g.r(hx, top + 3, 3, 4, hc);
      g.p(hx + 6, top + 3, hc);
      g.r(hx + 2, top, 2, 1, C.headL);
      break;
    case "bald":
      g.p(hx + 3, top + 1, C.skinL);
      g.p(hx + 4, top + 1, C.skinL);
      break;
    case "helmet":
    case "horned":
      g.r(hx + 1, top - 1, 5, 1, hc);
      g.r(hx, top, 7, 4, hc);
      g.r(hx, top + 3, 7, 1, C.headD);
      g.r(hx, top + 4, 3, 4, hc);
      g.r(hx + 6, top + 4, 1, 2, hc);
      g.r(hx + 2, top, 2, 1, C.headL);
      if (L.plume) {
        g.r(hx + 2, top - 3, 2, 2, L.plume);
        g.r(hx, top - 2, 2, 2, C.plumeD);
      }
      if (L.head === "horned") {
        const h = L.horn ?? "#e8dcc0";
        g.p(hx + 5, top - 1, h);
        g.p(hx + 6, top - 2, h);
        g.p(hx + 6, top - 3, h);
        g.p(hx + 1, top - 1, h);
        g.p(hx, top - 2, h);
      }
      break;
    case "hood":
      g.r(hx + 1, top - 2, 5, 1, hc);
      g.r(hx, top - 1, 7, 1, hc);
      g.r(hx - 1, top, 8, 3, hc);
      g.r(hx - 1, top + 3, 4, 6, hc);
      g.p(hx - 2, top + 1, hc);
      g.r(hx + 3, top + 3, 4, 1, C.skinD);
      g.r(hx - 1, top, 1, 9, C.headD);
      g.r(hx + 1, top - 1, 2, 1, C.headL);
      if (!L.hunch) g.r(hx - 1, 11, 6, 1, hc);
      break;
    case "hat":
      g.r(hx, top - 1, 7, 2, hc);
      g.r(hx + 1, top - 3, 5, 2, hc);
      g.r(hx + 1, top - 5, 3, 2, hc);
      g.r(hx - 1, top - 6, 3, 1, hc);
      g.r(hx + 1, top - 3, 1, 2, C.headL);
      g.r(hx, top, 7, 1, L.trim);
      g.r(hx - 2, top + 1, 11, 1, hc);
      g.r(hx - 1, top + 2, 9, 1, C.headD);
      g.r(hx, top + 3, 3, 4, C.headD);
      break;
    case "skull":
      break;
  }

  // Brazo delantero (o sujetando el arma a distancia)
  const alen = L.hunch ? 5 : 3;
  const sleeve = L.ribs ? L.body : C.bodyD;
  if (L.held) {
    g.r(8, 12, 2, 3, sleeve);
    g.p(10, 15, L.skin);
  } else if (f === 0) {
    g.r(7, 12, 2, alen + 1, sleeve);
    g.r(7, 13 + alen, 2, 1, L.skin);
  } else {
    const fwd = f === 2;
    g.r(fwd ? 8 : 6, 12, 2, alen, sleeve);
    g.p(fwd ? 10 : 5, 12 + alen, sleeve);
    g.p(fwd ? 10 : 5, 13 + alen, L.skin);
  }
  if (armored) {
    g.r(6, 11, 3, 2, hc);
    g.p(7, 11, C.headL);
  }

  // Arma a distancia delante del cuerpo
  const held = L.heldColor ?? "#6b4a2a";
  if (L.held === "bow") {
    g.p(11, 9, held);
    g.r(12, 10, 1, 10, held);
    g.p(11, 20, held);
    g.r(11, 10, 1, 10, STRING);
    g.p(11, 15, L.skin);
  } else if (L.held === "staff") {
    g.r(11, 6, 1, 17, held);
    g.r(10, 3, 3, 3, L.orb ?? "#ffffff");
    g.p(10, 3, C.orbL);
    g.p(11, 15, L.skin);
  } else if (L.held === "crossbow") {
    g.r(9, 15, 5, 1, held);
    g.r(13, 13, 1, 5, C.heldD);
    g.p(10, 15, L.skin);
  }
}

function frame(L: Look, dir: "down" | "up" | "side", f: number) {
  const g = new Pix();
  const C = tones(L);
  if (dir === "side") drawSide(g, L, C, f);
  else drawFront(g, L, C, f, dir === "up");
  g.outline();
  return g;
}

export function buildSpriteSet(L: Look): SpriteSet {
  const make = (flash: boolean): Record<Dir, HTMLCanvasElement[]> => {
    const fr = (dir: "down" | "up" | "side", flip = false) =>
      [0, 1, 2].map((f) => frame(L, dir, f).canvas(flip, flash));
    return { down: fr("down"), up: fr("up"), right: fr("side"), left: fr("side", true) };
  };
  return { frames: make(false), flash: make(true) };
}

// ---------- monstruos ----------
const MONSTER_LOOKS: Record<EnemyKind, Look> = {
  skeleton: {
    skin: "#ddd5c0",
    eyes: "#ff3a2a",
    head: "skull",
    headColor: "#ddd5c0",
    body: "#d2cab4",
    trim: "#8a8270",
    legs: "#cfc7b2",
    boots: "#a79f8c",
    ribs: true,
  },
  ghoul: {
    skin: "#6f7e55",
    eyes: "#ff3a2a",
    head: "bald",
    headColor: "#6f7e55",
    body: "#3d322c",
    trim: "#2a221e",
    legs: "#5d6b4a",
    boots: "#44503a",
    hunch: true,
    ears: true,
    fangs: true,
  },
};

// ---------- objetos ----------
type Palette = Record<string, string>;
const ITEM_ART: Record<ItemId, { rows: string[]; pal: Palette }> = {
  "hueso-astillado": {
    pal: { w: "#ece4d0", s: "#a8a08c" },
    rows: [
      "..........",
      ".ww.......",
      ".wws......",
      "..wws.....",
      "...wws....",
      "....wws...",
      ".....wws..",
      "......wws.",
      ".......ss.",
      "..........",
    ],
  },
  "garra-necrofago": {
    pal: { g: "#2e2a26", G: "#6f7e55", d: "#4d5a3a" },
    rows: [
      "..........",
      ".g..g..g..",
      ".g..g..g..",
      ".gG.gG.gG.",
      "..GGGGGGG.",
      "..GGGGGGd.",
      "...GGGGd..",
      "....ddd...",
      "..........",
      "..........",
    ],
  },
};

function drawArt(rows: string[], pal: Palette) {
  const w = rows[0]!.length;
  const g = new Pix(w, rows.length, 0);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]!];
      if (col) g.p(x, y, col);
    }
  });
  g.outline();
  return g.canvas();
}

const COIN_PAL: Palette = { y: "#f2c14e", Y: "#b8862b", w: "#fff2b0" };
const COIN = ["..........", "...yyyy...", "..yywyyY..", "..ywyyyY..", "..yyyyyY..", "..yyyyYY..", "...YYYY...", ".........."];

// ---------- cachés ----------
const classCache = new Map<ClassId, SpriteSet>();
const enemyCache = new Map<EnemyKind, SpriteSet>();
const itemCache = new Map<ItemId, HTMLCanvasElement>();
const urlCache = new Map<string, string>();
let coin: HTMLCanvasElement | null = null;

export function getClassSprites(id: ClassId) {
  let s = classCache.get(id);
  if (!s) classCache.set(id, (s = buildSpriteSet(CLASSES[id].look)));
  return s;
}
export function getEnemySprites(kind: EnemyKind) {
  let s = enemyCache.get(kind);
  if (!s) enemyCache.set(kind, (s = buildSpriteSet(MONSTER_LOOKS[kind])));
  return s;
}
export function getItemIcon(id: ItemId) {
  let c = itemCache.get(id);
  if (!c) itemCache.set(id, (c = drawArt(ITEM_ART[id].rows, ITEM_ART[id].pal)));
  return c;
}
export function getCoin() {
  return (coin ??= drawArt(COIN, COIN_PAL));
}

/** Imágenes para la interfaz (solo en el navegador). */
export function getItemIconUrl(id: ItemId) {
  const k = `item:${id}`;
  let u = urlCache.get(k);
  if (!u) urlCache.set(k, (u = getItemIcon(id).toDataURL()));
  return u;
}
export function getClassPreviewUrl(id: ClassId) {
  const k = `class:${id}`;
  let u = urlCache.get(k);
  if (!u) urlCache.set(k, (u = getClassSprites(id).frames.down[0]!.toDataURL()));
  return u;
}
