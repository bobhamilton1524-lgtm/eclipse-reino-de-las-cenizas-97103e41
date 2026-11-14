import { useRef, useState, type PointerEvent } from "react";
import { Sword } from "lucide-react";
import type { Input } from "@/game/input";

const RADIUS = 48;

/** Joystick virtual (mitad izquierda) y botón de ataque para Android. */
export function TouchControls({ input }: { input: Input }) {
  const pointerId = useRef<number | null>(null);
  const [stick, setStick] = useState<{ bx: number; by: number; kx: number; ky: number } | null>(null);

  const update = (e: PointerEvent, bx: number, by: number) => {
    let dx = e.clientX - bx;
    let dy = e.clientY - by;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    input.joy = { x: dx / RADIUS, y: dy / RADIUS };
    setStick({ bx, by, kx: dx, ky: dy });
  };

  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    input.joy = { x: 0, y: 0 };
    setStick(null);
  };

  return (
    <>
      <div
        className="absolute bottom-0 left-0 z-30 h-[60%] w-1/2 touch-none"
        onPointerDown={(e) => {
          if (pointerId.current !== null) return;
          pointerId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.pointerId === pointerId.current && stick) update(e, stick.bx, stick.by);
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div
          className="pointer-events-none fixed size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel-edge bg-panel/60"
          style={
            stick
              ? { left: stick.bx, top: stick.by }
              : { left: 84, bottom: 36, top: "auto", transform: "none", opacity: 0.5 }
          }
        >
          <div
            className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30 shadow-[0_0_0_2px_var(--panel-shade)]"
            style={stick ? { marginLeft: stick.kx, marginTop: stick.ky } : undefined}
          />
        </div>
      </div>

      <button
        type="button"
        aria-label="Atacar"
        className="absolute bottom-8 right-6 z-30 flex size-20 touch-none select-none items-center justify-center rounded-full bg-primary/85 text-primary-foreground shadow-[0_0_0_3px_var(--panel-shade),inset_0_-4px_0_0_var(--hp-dim)] active:scale-95 active:bg-ember"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          input.queueAttack();
          input.touchAttackHeld = true;
        }}
        onPointerUp={() => (input.touchAttackHeld = false)}
        onPointerCancel={() => (input.touchAttackHeld = false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Sword className="size-9" strokeWidth={2.5} />
      </button>
    </>
  );
}
