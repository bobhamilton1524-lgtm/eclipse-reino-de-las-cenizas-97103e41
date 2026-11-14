/**
 * Mapas del juego: la ciudad de Umbravía y la Cripta.
 * Se construyen de forma determinista con rectángulos para que sea fácil editarlos.
 *
 * Leyenda de tiles:
 *  ','  ceniza (ciudad)          '.'  suelo (adoquín en ciudad / losa en cripta)
 *  '#'  muro                      'H'  tejado          'h' fachada   'n' ventana   'D' puerta
 *  'T'  árbol muerto              '+'  lápida          'M' mausoleo  'C' entrada a la cripta
 *  'L'  farol                     'F'  fuente
 *  't'  antorcha (muro cripta)    'c'  ataúd           'S' escaleras de salida   'b' huesos
 */
import { TILE } from "./constants";
import { mulberry32 } from "./rng";
import type { EnemyKind } from "./rules";

export type MapId = "city" | "crypt";
export type Theme = "city" | "crypt";

export interface EnemySpawn {
  kind: EnemyKind;
  x: number; // px
  y: number; // px
}

export interface GameMap {
  id: MapId;
  name: string;
  theme: Theme;
  width: number; // tiles
  height: number; // tiles
  tiles: string[][]; // [y][x]
  /** Punto de aparición inicial / al revivir (px). */
  spawn: { x: number; y: number };
  /** Dónde aparece el jugador al llegar desde otro mapa (px). */
  arrivals: Partial<Record<MapId, { x: number; y: number }>>;
  /** Tile que lleva a otro mapa. */
  exits: Record<string, MapId>;
  enemies: EnemySpawn[];
  /** Oscuridad ambiental 0..1 */
  ambient: number;
}

const SOLID = new Set(["#", "H", "h", "n", "D", "T", "+", "M", "L", "F", "c", "t"]);

export function isSolidTile(ch: string | undefined) {
  return ch === undefined || SOLID.has(ch);
}

type Grid = string[][];

const fill = (w: number, h: number, ch: string): Grid =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => ch));

function get(g: Grid, x: number, y: number): string | undefined {
  return g[y]?.[x];
}

function set(g: Grid, x: number, y: number, ch: string) {
  const row = g[y];
  if (row && row[x] !== undefined) row[x] = ch;
}

function rect(g: Grid, x: number, y: number, w: number, h: number, ch: string) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(g, i, j, ch);
}

const px = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + 12 });

/** Casa: tejado + fachada inferior con ventanas y puerta centrada. */
function house(g: Grid, x: number, y: number, w: number, h: number) {
  rect(g, x, y, w, h - 1, "H");
  for (let i = x; i < x + w; i++) set(g, i, y + h - 1, (i - x) % 2 === 1 ? "n" : "h");
  set(g, x + Math.floor(w / 2), y + h - 1, "D");
}

function buildCity(): GameMap {
  const W = 48;
  const H = 40;
  const g = fill(W, H, ",");
  const rng = mulberry32(7);

  // Muralla exterior
  rect(g, 0, 0, W, 1, "#");
  rect(g, 0, H - 1, W, 1, "#");
  rect(g, 0, 0, 1, H, "#");
  rect(g, W - 1, 0, 1, H, "#");

  // Camposanto al norte, separado por una muralla interior con puerta
  rect(g, 1, 10, W - 2, 1, "#");
  rect(g, 22, 10, 4, 1, ".");

  // Mausoleo con la entrada a la cripta
  rect(g, 18, 2, 12, 5, "M");
  set(g, 23, 6, "C");
  set(g, 24, 6, "C");
  rect(g, 23, 7, 2, 3, ".");
  set(g, 21, 7, "L");
  set(g, 26, 7, "L");

  // Lápidas
  for (const tx of [4, 7, 10, 13, 34, 37, 40, 43])
    for (const ty of [3, 6, 8]) if (rng() > 0.2) set(g, tx, ty, "+");

  // Calles y plaza
  rect(g, 22, 11, 4, H - 12, ".");
  rect(g, 1, 22, W - 2, 2, ".");
  rect(g, 16, 18, 16, 10, ".");
  rect(g, 23, 21, 2, 2, "F");
  for (const [lx, ly] of <[number, number][]>[
    [16, 18],
    [31, 18],
    [16, 27],
    [31, 27],
    [21, 14],
    [26, 14],
    [21, 32],
    [26, 32],
    [8, 21],
    [39, 21],
  ])
    set(g, lx, ly, "L");

  // Casas de Umbravía
  for (const [hx, hy, hw, hh] of <[number, number, number, number][]>[
    [3, 12, 7, 5],
    [11, 12, 6, 4],
    [30, 12, 7, 5],
    [38, 12, 7, 4],
    [3, 26, 8, 5],
    [12, 29, 6, 5],
    [30, 29, 7, 5],
    [38, 26, 7, 5],
    [3, 33, 7, 4],
    [38, 33, 7, 4],
  ])
    house(g, hx, hy, hw, hh);

  // Árboles muertos sobre la ceniza
  for (let n = 0; n < 60; n++) {
    const tx = 1 + Math.floor(rng() * (W - 2));
    const ty = 1 + Math.floor(rng() * (H - 2));
    if (get(g, tx, ty) !== ",") continue;
    // dejar libre alrededor de caminos
    const nearPath = [get(g, tx, ty - 1), get(g, tx, ty + 1), get(g, tx - 1, ty), get(g, tx + 1, ty)].some(
      (c) => c === "." || c === "D" || c === "C",
    );
    if (!nearPath) set(g, tx, ty, "T");
  }

  return {
    id: "city",
    name: "Umbravía",
    theme: "city",
    width: W,
    height: H,
    tiles: g,
    spawn: { x: 24 * TILE, y: 31 * TILE },
    arrivals: { crypt: { x: 24 * TILE, y: 8 * TILE + 12 } },
    exits: { C: "crypt" },
    enemies: [],
    ambient: 0.6,
  };
}

function buildCrypt(): GameMap {
  const W = 50;
  const H = 40;
  const g = fill(W, H, "#");
  const rng = mulberry32(13);

  const rooms = [
    { x: 3, y: 3, w: 8, h: 6 }, // 0 entrada
    { x: 16, y: 2, w: 10, h: 8 }, // 1
    { x: 32, y: 3, w: 12, h: 7 }, // 2
    { x: 4, y: 16, w: 10, h: 9 }, // 3
    { x: 19, y: 15, w: 12, h: 10 }, // 4 sala de ataúdes
    { x: 36, y: 16, w: 10, h: 10 }, // 5
    { x: 8, y: 30, w: 12, h: 7 }, // 6
    { x: 26, y: 30, w: 18, h: 7 }, // 7 cámara profunda
  ];
  for (const r of rooms) rect(g, r.x, r.y, r.w, r.h, ".");

  const center = (i: number) => {
    const r = rooms[i]!;
    return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
  };
  const corridor = (a: number, b: number) => {
    const p = center(a);
    const q = center(b);
    rect(g, Math.min(p.x, q.x), p.y, Math.abs(q.x - p.x) + 2, 2, ".");
    rect(g, q.x, Math.min(p.y, q.y), 2, Math.abs(q.y - p.y) + 2, ".");
  };
  for (const [a, b] of <[number, number][]>[
    [0, 1],
    [1, 2],
    [0, 3],
    [1, 4],
    [2, 5],
    [3, 4],
    [4, 5],
    [3, 6],
    [4, 7],
    [6, 7],
  ])
    corridor(a, b);

  // Escaleras de salida hacia Umbravía
  set(g, 6, 3, "S");
  set(g, 7, 3, "S");

  // Ataúdes
  for (const [cx, cy] of <[number, number][]>[
    [21, 17],
    [21, 21],
    [28, 17],
    [28, 21],
    [29, 32],
    [32, 32],
    [38, 32],
    [41, 32],
  ])
    set(g, cx, cy, "c");

  // Antorchas en los muros que dan al suelo
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++)
      if (get(g, x, y) === "#" && get(g, x, y + 1) === "." && (x * 7 + y * 3) % 6 === 0) set(g, x, y, "t");

  // Huesos decorativos
  for (let n = 0; n < 40; n++) {
    const tx = Math.floor(rng() * W);
    const ty = Math.floor(rng() * H);
    if (get(g, tx, ty) === ".") set(g, tx, ty, "b");
  }

  const e = (kind: EnemyKind, tx: number, ty: number): EnemySpawn => ({ kind, ...px(tx, ty) });
  const enemies: EnemySpawn[] = [
    e("skeleton", 19, 5),
    e("skeleton", 23, 7),
    e("ghoul", 35, 5),
    e("ghoul", 40, 7),
    e("skeleton", 38, 4),
    e("skeleton", 7, 19),
    e("skeleton", 10, 22),
    e("skeleton", 23, 18),
    e("skeleton", 26, 22),
    e("skeleton", 24, 16),
    e("ghoul", 26, 19),
    e("ghoul", 39, 19),
    e("ghoul", 42, 23),
    e("skeleton", 11, 32),
    e("skeleton", 16, 34),
    e("skeleton", 30, 34),
    e("ghoul", 35, 33),
    e("skeleton", 39, 34),
    e("ghoul", 42, 31),
  ];

  return {
    id: "crypt",
    name: "Cripta de las Cenizas",
    theme: "crypt",
    width: W,
    height: H,
    tiles: g,
    spawn: { x: 7 * TILE, y: 5 * TILE + 12 },
    arrivals: { city: { x: 7 * TILE, y: 5 * TILE + 12 } },
    exits: { S: "city" },
    enemies,
    ambient: 0.84,
  };
}

let cache: Record<MapId, GameMap> | null = null;
export function getMaps(): Record<MapId, GameMap> {
  if (!cache) cache = { city: buildCity(), crypt: buildCrypt() };
  return cache;
}
