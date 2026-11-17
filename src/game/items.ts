/** Objetos e inventario (máximo de espacios en rules.ts). */
import { INVENTORY_SLOTS, STACK_SIZE } from "./rules";

export type ItemId = "hueso-astillado" | "garra-necrofago";

export const ITEMS: Record<ItemId, { name: string; description: string }> = {
  "hueso-astillado": {
    name: "Hueso astillado",
    description: "Fragmento de un esqueleto de la cripta. Aún guarda un frío antinatural.",
  },
  "garra-necrofago": {
    name: "Garra de necrófago",
    description: "Garra ennegrecida arrancada a un necrófago. Huele a tumba.",
  },
};

export interface Slot {
  id: ItemId;
  qty: number;
}

/** Añade objetos apilando hasta STACK_SIZE por espacio. Devuelve false si no cabe nada más. */
export function addItem(inv: Slot[], id: ItemId, qty = 1): boolean {
  let left = qty;
  for (const s of inv) {
    if (s.id !== id || s.qty >= STACK_SIZE) continue;
    const n = Math.min(left, STACK_SIZE - s.qty);
    s.qty += n;
    left -= n;
    if (!left) return true;
  }
  while (left > 0 && inv.length < INVENTORY_SLOTS) {
    const n = Math.min(left, STACK_SIZE);
    inv.push({ id, qty: n });
    left -= n;
  }
  return left === 0;
}

export const isItemId = (v: unknown): v is ItemId => typeof v === "string" && v in ITEMS;
