/** Entrada unificada: teclado (PC) y controles táctiles (Android). */
import { BAR_SLOTS } from "./rules";

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const ATTACK_KEYS = new Set(["Space", "KeyJ", "KeyK"]);
/** Teclas 1-4 para las habilidades de la barra. */
const SKILL_KEYS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

export class Input {
  private keys = new Set<string>();
  private attackQueued = false;
  private keyAttackHeld = false;
  private skillQueue: number[] = [];
  /** Vector del joystick táctil, cada eje en [-1, 1]. */
  joy = { x: 0, y: 0 };
  touchAttackHeld = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (MOVE_KEYS[e.code] || ATTACK_KEYS.has(e.code)) e.preventDefault();
    if (ATTACK_KEYS.has(e.code)) {
      if (!e.repeat) this.attackQueued = true;
      this.keyAttackHeld = true;
    }
    const s = SKILL_KEYS[e.code];
    if (s !== undefined && !e.repeat) this.queueSkill(s);
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (ATTACK_KEYS.has(e.code)) this.keyAttackHeld = false;
    this.keys.delete(e.code);
  };
  private onBlur = () => this.reset();

  attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }
  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }
  reset() {
    this.keys.clear();
    this.keyAttackHeld = false;
    this.touchAttackHeld = false;
    this.attackQueued = false;
    this.skillQueue = [];
    this.joy = { x: 0, y: 0 };
  }

  queueAttack() {
    this.attackQueued = true;
  }
  queueSkill(slot: number) {
    if (slot >= 0 && slot < BAR_SLOTS && this.skillQueue.length < 3) this.skillQueue.push(slot);
  }
  /** Siguiente espacio de habilidad pulsado, o null. */
  takeSkill(): number | null {
    return this.skillQueue.shift() ?? null;
  }

  /** Dirección de movimiento normalizada (longitud <= 1). */
  move(): { x: number; y: number } {
    let x = this.joy.x;
    let y = this.joy.y;
    for (const code of this.keys) {
      const m = MOVE_KEYS[code];
      if (m) {
        x += m[0];
        y += m[1];
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) return { x: x / len, y: y / len };
    if (len < 0.15) return { x: 0, y: 0 };
    return { x, y };
  }

  /** Devuelve true si hay que atacar en este frame. */
  wantsAttack(): boolean {
    const q = this.attackQueued;
    this.attackQueued = false;
    return q || this.keyAttackHeld || this.touchAttackHeld;
  }
}
