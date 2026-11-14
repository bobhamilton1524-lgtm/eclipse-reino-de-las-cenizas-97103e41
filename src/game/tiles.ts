/** Dibujo procedural en pixel art de los tiles y fuentes de luz de cada mapa. */
import { TILE } from "./constants";
import type { GameMap } from "./maps";
import { mulberry32 } from "./rng";

type Ctx = CanvasRenderingContext2D;
type Rng = () => number;

const px = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
};
const pick = <T,>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;

function speckle(c: Ctx, ox: number, oy: number, rng: Rng, colors: string[], count: number) {
  for (let i = 0; i < count; i++)
    px(c, ox + Math.floor(rng() * 16), oy + Math.floor(rng() * 16), 1, 1, pick(rng, colors));
}

// ---------- Ciudad ----------
function ash(c: Ctx, ox: number, oy: number, rng: Rng) {
  px(c, ox, oy, 16, 16, "#27221f");
  speckle(c, ox, oy, rng, ["#2f2925", "#1e1a18", "#332c27"], 24);
  if (rng() < 0.15) px(c, ox + Math.floor(rng() * 13), oy + Math.floor(rng() * 14), 3, 1, "#3a2419");
  if (rng() < 0.06) px(c, ox + Math.floor(rng() * 15), oy + Math.floor(rng() * 15), 1, 1, "#7a3418");
}

function cobble(c: Ctx, ox: number, oy: number, rng: Rng) {
  px(c, ox, oy, 16, 16, "#1f1e23");
  const stones: [number, number, number, number][] = [
    [1, 1, 6, 5],
    [8, 1, 7, 6],
    [1, 7, 5, 8],
    [7, 8, 8, 7],
  ];
  for (const [x, y, w, h] of stones) {
    px(c, ox + x, oy + y, w, h, pick(rng, ["#3b3a41", "#37363d", "#403f47"]));
    px(c, ox + x, oy + y, w, 1, "#4a4952");
    px(c, ox + x, oy + y + h - 1, w, 1, "#2c2b31");
  }
  if (rng() < 0.2) px(c, ox + Math.floor(rng() * 14), oy + Math.floor(rng() * 14), 2, 1, "#29282d");
}

function bricks(c: Ctx, ox: number, oy: number, rng: Rng, base: string, mortar: string, hi: string) {
  px(c, ox, oy, 16, 16, mortar);
  for (let r = 0; r < 4; r++) {
    const off = r % 2 ? 4 : 0;
    for (let bx = -off; bx < 16; bx += 8) {
      const x0 = Math.max(bx + 1, 0);
      const x1 = Math.min(bx + 8, 16);
      if (x1 <= x0) continue;
      px(c, ox + x0, oy + r * 4 + 1, x1 - x0, 3, rng() < 0.3 ? hi : base);
    }
  }
}

function cityWall(c: Ctx, ox: number, oy: number, rng: Rng, below: string | undefined) {
  bricks(c, ox, oy, rng, "#3a3437", "#211d20", "#443d41");
  px(c, ox, oy, 16, 1, "#4e464b");
  if (below !== "#") px(c, ox, oy + 13, 16, 3, "#151214");
}

function roof(c: Ctx, ox: number, oy: number, rng: Rng, above: string | undefined) {
  px(c, ox, oy, 16, 16, "#4a1d1c");
  for (let r = 0; r < 4; r++) {
    const y = oy + r * 4;
    px(c, ox, y + 3, 16, 1, "#2f1211");
    const off = r % 2 ? 2 : 0;
    for (let x = off; x < 16; x += 4) px(c, ox + x, y, 1, 3, "#3a1615");
    if (rng() < 0.5) px(c, ox + Math.floor(rng() * 12), y, 3, 1, "#5c2724");
  }
  if (above !== "H") px(c, ox, oy, 16, 2, "#2a1010");
}

function facade(c: Ctx, ox: number, oy: number) {
  px(c, ox, oy, 16, 16, "#3a2a1e");
  px(c, ox, oy, 16, 2, "#241810");
  px(c, ox, oy + 14, 16, 2, "#241810");
  px(c, ox, oy, 2, 16, "#241810");
  px(c, ox + 2, oy + 2, 14, 1, "#46342599");
}

function windowTile(c: Ctx, ox: number, oy: number) {
  facade(c, ox, oy);
  px(c, ox + 4, oy + 4, 8, 7, "#1a120c");
  px(c, ox + 5, oy + 5, 6, 5, "#d9993f");
  px(c, ox + 5, oy + 5, 2, 1, "#f4c56a");
  px(c, ox + 7, oy + 5, 1, 5, "#7a4a1c");
  px(c, ox + 5, oy + 7, 6, 1, "#7a4a1c");
}

function door(c: Ctx, ox: number, oy: number) {
  facade(c, ox, oy);
  px(c, ox + 4, oy + 3, 8, 13, "#140c07");
  px(c, ox + 5, oy + 4, 6, 12, "#2e1d12");
  px(c, ox + 7, oy + 4, 1, 12, "#22150d");
  px(c, ox + 9, oy + 4, 1, 12, "#22150d");
  px(c, ox + 10, oy + 10, 1, 1, "#c9a24a");
}

function tree(c: Ctx, ox: number, oy: number, rng: Rng) {
  ash(c, ox, oy, rng);
  px(c, ox + 4, oy + 14, 9, 2, "#151210");
  px(c, ox + 7, oy + 5, 2, 10, "#2a1f1c");
  px(c, ox + 6, oy + 13, 4, 2, "#2a1f1c");
  px(c, ox + 4, oy + 3, 1, 5, "#3a2b25");
  px(c, ox + 5, oy + 7, 2, 1, "#3a2b25");
  px(c, ox + 11, oy + 1, 1, 5, "#3a2b25");
  px(c, ox + 9, oy + 6, 2, 1, "#3a2b25");
  px(c, ox + 8, oy + 1, 1, 4, "#3a2b25");
  px(c, ox + 3, oy + 2, 1, 1, "#3a2b25");
  px(c, ox + 12, oy + 0, 1, 1, "#3a2b25");
}

function tomb(c: Ctx, ox: number, oy: number, rng: Rng) {
  ash(c, ox, oy, rng);
  px(c, ox + 4, oy + 15, 9, 1, "#151214");
  px(c, ox + 4, oy + 4, 8, 11, "#14111a");
  px(c, ox + 5, oy + 3, 6, 1, "#14111a");
  px(c, ox + 5, oy + 4, 6, 10, "#55525c");
  px(c, ox + 5, oy + 4, 6, 1, "#6c6976");
  px(c, ox + 7, oy + 6, 2, 5, "#3a3840");
  px(c, ox + 6, oy + 7, 4, 1, "#3a3840");
  px(c, ox + 3, oy + 13, 10, 2, "#3d3a42");
}

function mausoleum(c: Ctx, ox: number, oy: number, rng: Rng, above: string | undefined) {
  bricks(c, ox, oy, rng, "#3e3a44", "#2a2730", "#4d4955");
  if (above !== "M" && above !== "C") {
    px(c, ox, oy, 16, 2, "#5d5866");
    px(c, ox, oy + 2, 16, 1, "#1d1b22");
  }
}

function cryptDoor(c: Ctx, ox: number, oy: number, left: string | undefined) {
  px(c, ox, oy, 16, 16, "#3e3a44");
  const isLeft = left !== "C";
  // arco oscuro compartido entre los dos tiles de la entrada
  px(c, isLeft ? ox + 4 : ox, oy + 2, 12, 14, "#07060a");
  px(c, isLeft ? ox + 6 : ox, oy, isLeft ? 10 : 10, 2, "#07060a");
  px(c, isLeft ? ox + 3 : ox + 15, oy + 2, 1, 14, "#5d5866");
  px(c, ox, oy + 12, 16, 1, "#1b1018");
  px(c, ox, oy + 14, 16, 2, "#34303a");
  px(c, isLeft ? ox + 8 : ox, oy + 6, 8, 4, "#1a0e0a");
}

function lamp(c: Ctx, ox: number, oy: number, rng: Rng) {
  cobble(c, ox, oy, rng);
  px(c, ox + 4, oy + 15, 8, 1, "#16151a");
  px(c, ox + 7, oy + 5, 2, 10, "#141216");
  px(c, ox + 5, oy + 14, 6, 2, "#141216");
  px(c, ox + 5, oy + 1, 6, 5, "#141216");
  px(c, ox + 6, oy + 2, 4, 3, "#ffcf6a");
  px(c, ox + 6, oy + 2, 1, 1, "#fff2c0");
  px(c, ox + 6, oy, 4, 1, "#141216");
}

interface Neighbors {
  up: string | undefined;
  down: string | undefined;
  left: string | undefined;
  right: string | undefined;
}

function fountain(c: Ctx, ox: number, oy: number, rng: Rng, n: Neighbors) {
  px(c, ox, oy, 16, 16, "#16303d");
  speckle(c, ox, oy, rng, ["#24506a", "#1d4052"], 10);
  const rim = "#56535e";
  const hi = "#6c6976";
  if (n.up !== "F") {
    px(c, ox, oy, 16, 3, rim);
    px(c, ox, oy, 16, 1, hi);
  }
  if (n.down !== "F") {
    px(c, ox, oy + 12, 16, 4, rim);
    px(c, ox, oy + 15, 16, 1, "#2c2a31");
  }
  if (n.left !== "F") px(c, ox, oy, 3, 16, rim);
  if (n.right !== "F") px(c, ox + 13, oy, 3, 16, rim);
}

// ---------- Cripta ----------
function cryptFloor(c: Ctx, ox: number, oy: number, rng: Rng) {
  px(c, ox, oy, 16, 16, "#24212a");
  px(c, ox, oy, 16, 1, "#1a1820");
  px(c, ox, oy, 1, 16, "#1a1820");
  px(c, ox, oy + 8, 8, 1, "#1d1b23");
  px(c, ox + 8, oy, 1, 8, "#1d1b23");
  speckle(c, ox, oy, rng, ["#29262f", "#1f1d25"], 12);
  if (rng() < 0.25) {
    let x = ox + 2 + Math.floor(rng() * 10);
    let y = oy + 2 + Math.floor(rng() * 10);
    for (let i = 0; i < 4; i++) {
      px(c, x, y, 1, 1, "#16141b");
      x += rng() < 0.5 ? 1 : -1;
      y += 1;
    }
  }
}

function cryptWall(c: Ctx, ox: number, oy: number, rng: Rng, below: string | undefined) {
  const front = below !== undefined && below !== "#" && below !== "t";
  if (front) {
    bricks(c, ox, oy, rng, "#2b2736", "#18151f", "#36314a");
    px(c, ox, oy + 14, 16, 2, "#100e15");
  } else {
    px(c, ox, oy, 16, 16, "#0f0d14");
    speckle(c, ox, oy, rng, ["#16131c", "#1a1722"], 10);
  }
}

function torch(c: Ctx, ox: number, oy: number, rng: Rng) {
  cryptWall(c, ox, oy, rng, ".");
  px(c, ox + 7, oy + 8, 2, 5, "#4a3a2a");
  px(c, ox + 6, oy + 7, 4, 1, "#2a1f16");
  px(c, ox + 6, oy + 3, 4, 4, "#ff8a2a");
  px(c, ox + 7, oy + 2, 2, 4, "#ffd36a");
  px(c, ox + 7, oy + 1, 1, 1, "#ff8a2a");
}

function coffin(c: Ctx, ox: number, oy: number, rng: Rng) {
  cryptFloor(c, ox, oy, rng);
  px(c, ox + 3, oy + 1, 10, 14, "#120c0a");
  px(c, ox + 4, oy + 2, 8, 12, "#3e2818");
  px(c, ox + 4, oy + 2, 8, 1, "#55381f");
  px(c, ox + 3, oy + 1, 1, 1, "#24212a");
  px(c, ox + 12, oy + 1, 1, 1, "#24212a");
  px(c, ox + 7, oy + 4, 2, 7, "#8a7a5a");
  px(c, ox + 5, oy + 6, 6, 2, "#8a7a5a");
}

function stairs(c: Ctx, ox: number, oy: number) {
  const cols = ["#15131b", "#23202c", "#2f2c3a", "#3d394a"];
  for (let i = 0; i < 4; i++) {
    px(c, ox, oy + i * 4, 16, 4, cols[i]!);
    px(c, ox, oy + i * 4, 16, 1, "#4c4858");
  }
}

function bones(c: Ctx, ox: number, oy: number, rng: Rng) {
  cryptFloor(c, ox, oy, rng);
  const b = "#b9b09a";
  const d = "#7d7666";
  px(c, ox + 3, oy + 9, 5, 1, b);
  px(c, ox + 2, oy + 8, 1, 3, b);
  px(c, ox + 8, oy + 8, 1, 3, b);
  px(c, ox + 9, oy + 4, 3, 3, b);
  px(c, ox + 9, oy + 5, 1, 1, d);
  px(c, ox + 11, oy + 5, 1, 1, d);
  px(c, ox + 10, oy + 7, 1, 1, b);
}

function drawTile(c: Ctx, map: GameMap, x: number, y: number, rng: Rng) {
  const t = map.tiles;
  const ch = t[y]?.[x];
  const ox = x * TILE;
  const oy = y * TILE;
  const below = t[y + 1]?.[x];
  const above = t[y - 1]?.[x];
  if (map.theme === "crypt") {
    switch (ch) {
      case "#":
        return cryptWall(c, ox, oy, rng, below);
      case "t":
        return torch(c, ox, oy, rng);
      case "c":
        return coffin(c, ox, oy, rng);
      case "S":
        return stairs(c, ox, oy);
      case "b":
        return bones(c, ox, oy, rng);
      default:
        return cryptFloor(c, ox, oy, rng);
    }
  }
  switch (ch) {
    case ".":
      return cobble(c, ox, oy, rng);
    case "#":
      return cityWall(c, ox, oy, rng, below);
    case "H":
      return roof(c, ox, oy, rng, above);
    case "h":
      return facade(c, ox, oy);
    case "n":
      return windowTile(c, ox, oy);
    case "D":
      return door(c, ox, oy);
    case "T":
      return tree(c, ox, oy, rng);
    case "+":
      return tomb(c, ox, oy, rng);
    case "M":
      return mausoleum(c, ox, oy, rng, above);
    case "C":
      return cryptDoor(c, ox, oy, t[y]?.[x - 1]);
    case "L":
      return lamp(c, ox, oy, rng);
    case "F":
      return fountain(c, ox, oy, rng, {
        up: above,
        down: below,
        left: t[y]?.[x - 1],
        right: t[y]?.[x + 1],
      });
    default:
      return ash(c, ox, oy, rng);
  }
}

/** Pre-renderiza el mapa completo en un canvas fuera de pantalla. */
export function renderMap(map: GameMap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = map.width * TILE;
  canvas.height = map.height * TILE;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  const rng = mulberry32(map.id === "city" ? 101 : 202);
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) drawTile(c, map, x, y, rng);
  return canvas;
}

export interface Light {
  x: number;
  y: number;
  r: number;
  warm: boolean;
  seed: number;
}

export function collectLights(map: GameMap): Light[] {
  const lights: Light[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const ch = map.tiles[y]?.[x];
      const cx = x * TILE + 8;
      const seed = x * 31 + y * 17;
      if (map.theme === "city") {
        if (ch === "L") lights.push({ x: cx, y: y * TILE + 4, r: 62, warm: true, seed });
        else if (ch === "n") lights.push({ x: cx, y: y * TILE + 10, r: 26, warm: true, seed });
        else if (ch === "C") lights.push({ x: cx, y: y * TILE + 12, r: 18, warm: false, seed });
      } else if (ch === "t") lights.push({ x: cx, y: y * TILE + 6, r: 66, warm: true, seed });
      else if (ch === "S") lights.push({ x: cx, y: y * TILE + 8, r: 28, warm: false, seed });
    }
  return lights;
}
