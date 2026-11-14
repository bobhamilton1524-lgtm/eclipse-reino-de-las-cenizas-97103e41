/** Sprites pixel art (16x16) del Guerrero, enemigos y monedas. */
import type { EnemyKind } from "./rules";

type Palette = Record<string, string>;

const OUTLINE = "#0e0b12";

const WARRIOR_PAL: Palette = {
  k: OUTLINE,
  h: "#7c8290",
  H: "#b9bfca",
  v: "#1a1620",
  e: "#ffb347",
  a: "#4b5160",
  A: "#757c8c",
  R: "#6e1414",
  b: "#4a3020",
  g: "#c9a24a",
  p: "#a32222",
};
const WARRIOR_TOP = [
  ".......pp.......",
  "......pppk......",
  "....kkkkkkkk....",
  "....khHHHHhk....",
  "....kHhhhhhk....",
  "....kvevvevk....",
  "....khhhhhhk....",
  "..kRkaAAAAakRk..",
  "..kRaAAAAAAaRk..",
  "..kRkaAAAAakRk..",
  "..kRkbbgbbbkRk..",
  "..kRRkaaaaakRk..",
  "...kRkaakaakk...",
];
const WARRIOR = [
  [...WARRIOR_TOP, "....kaak.kaak...", "....kbbk.kbbk...", "....kkkk.kkkk..."],
  [...WARRIOR_TOP, "...kaak...kaak..", "...kbbk...kbbk..", "...kkk.....kkk.."],
];

const SKELETON_PAL: Palette = { k: OUTLINE, o: "#d9d2bf", O: "#a79f8c", r: "#ff3a2a", d: "#2a2530" };
const SKELETON_TOP = [
  "................",
  ".....kkkkkk.....",
  "....kooooooOk...",
  "....kodrodrOk...",
  "....koooooOOk...",
  ".....kokokok....",
  "......kkkkk.....",
  "....kk.kok.kk...",
  "...koOkoookOok..",
  "...kok.kOk.kok..",
  "...kok.kok.kok..",
  "...kk.kooOk.kk..",
  "......kOkOk.....",
];
const SKELETON = [
  [...SKELETON_TOP, ".....kok.kok....", ".....kok.kok....", ".....kkk.kkk...."],
  [...SKELETON_TOP, "....kok...kok...", "....kok...kok...", "....kkk...kkk..."],
];

const GHOUL_PAL: Palette = {
  k: OUTLINE,
  g: "#5d6b4a",
  G: "#44503a",
  l: "#7d8c63",
  r: "#ff3a2a",
  m: "#2a1a1a",
  c: "#3a2f2a",
};
const GHOUL_TOP = [
  "................",
  "................",
  ".....kkkkk......",
  "....kglllgk.....",
  "....kgrgrgk.....",
  "....kgmmmgk.....",
  ".....kgGgk......",
  "...kkcccccckk...",
  "..kgkcccccckgk..",
  ".kgk.kcGGck.kgk.",
  ".kgk.kccccck.kgk",
  "..kk.kcccck..kk.",
  ".....kGkGk......",
];
const GHOUL = [
  [...GHOUL_TOP, ".....kgk.kgk....", "....kgk...kgk...", "....kkk...kkk..."],
  [...GHOUL_TOP, "......kgkgk.....", ".....kgk.kgk....", ".....kkk.kkk...."],
];

const COIN_PAL: Palette = { k: OUTLINE, y: "#f2c14e", Y: "#b8862b", w: "#fff2b0" };
const COIN = ["..kkkk..", ".kyyyyk.", "kyywyyYk", "kywyyyYk", "kyyyyyYk", "kyyyyYYk", ".kYYYYk.", "..kkkk.."];

export interface SpriteSet {
  /** [frame] mirando a la derecha */
  right: HTMLCanvasElement[];
  /** [frame] mirando a la izquierda */
  left: HTMLCanvasElement[];
  /** silueta blanca para el destello de golpe [frame] */
  flashRight: HTMLCanvasElement[];
  flashLeft: HTMLCanvasElement[];
}

function draw(rows: string[], pal: Palette, flip = false, flash = false): HTMLCanvasElement {
  const w = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = rows.length;
  const c = canvas.getContext("2d")!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x] ?? "."];
      if (!col) continue;
      c.fillStyle = flash ? "#fff4e6" : col;
      c.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
  });
  return canvas;
}

function set(frames: string[][], pal: Palette): SpriteSet {
  return {
    right: frames.map((f) => draw(f, pal)),
    left: frames.map((f) => draw(f, pal, true)),
    flashRight: frames.map((f) => draw(f, pal, false, true)),
    flashLeft: frames.map((f) => draw(f, pal, true, true)),
  };
}

export interface Sprites {
  warrior: SpriteSet;
  enemies: Record<EnemyKind, SpriteSet>;
  coin: HTMLCanvasElement;
}

let cache: Sprites | null = null;
export function getSprites(): Sprites {
  if (!cache)
    cache = {
      warrior: set(WARRIOR, WARRIOR_PAL),
      enemies: { skeleton: set(SKELETON, SKELETON_PAL), ghoul: set(GHOUL, GHOUL_PAL) },
      coin: draw(COIN, COIN_PAL),
    };
  return cache;
}
