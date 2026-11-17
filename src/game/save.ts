/** Guardado de la partida en el dispositivo (localStorage). */
import { CLASSES, isClassId, type ClassId } from "./classes";
import { isItemId, type Slot } from "./items";
import type { MapId } from "./maps";
import { ATTRS, BAR_SLOTS, MAX_LEVEL, type Attributes } from "./rules";

const KEY = "eclipse-partida-v1";

export interface SaveData {
  version: 1;
  classId: ClassId;
  level: number;
  xp: number;
  points: number;
  gold: number;
  attrs: Attributes;
  inventory: Slot[];
  /** Índice de habilidad activa en cada espacio de la barra (null = vacío). */
  bar: (number | null)[];
  map: MapId;
}

export function newSave(classId: ClassId): SaveData {
  return {
    version: 1,
    classId,
    level: 1,
    xp: 0,
    points: 0,
    gold: 0,
    attrs: { ...CLASSES[classId].base },
    inventory: [],
    bar: [0, 1, 2, null].slice(0, BAR_SLOTS),
    map: "city",
  };
}

const num = (v: unknown, min: number, max: number, def: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : def;

export function loadSave(): SaveData | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (!isClassId(d.classId)) return null;
    const base = newSave(d.classId);
    const attrs = { ...base.attrs };
    for (const a of ATTRS) attrs[a.id] = num(d.attrs?.[a.id], 0, 99999, base.attrs[a.id]);
    return {
      ...base,
      level: num(d.level, 1, MAX_LEVEL, 1),
      xp: num(d.xp, 0, Number.MAX_SAFE_INTEGER, 0),
      points: num(d.points, 0, 99999, 0),
      gold: num(d.gold, 0, Number.MAX_SAFE_INTEGER, 0),
      attrs,
      inventory: Array.isArray(d.inventory)
        ? d.inventory.filter((s) => isItemId(s?.id)).map((s) => ({ id: s.id, qty: num(s.qty, 1, 99, 1) }))
        : [],
      bar: Array.isArray(d.bar)
        ? Array.from({ length: BAR_SLOTS }, (_, i) => (typeof d.bar?.[i] === "number" ? d.bar[i]! : null))
        : base.bar,
      map: d.map === "crypt" ? "crypt" : "city",
    };
  } catch {
    return null;
  }
}

export function writeSave(d: SaveData) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}
