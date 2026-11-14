import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GameEngine, type HudState } from "@/game/engine";
import { Input } from "@/game/input";
import titleArt from "@/assets/eclipse-title.jpg";
import { Hud, LocationBanner } from "./Hud";
import { TouchControls } from "./TouchControls";

type Phase = "title" | "playing" | "dead";

export function GameScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [input] = useState(() => new Input());
  const [phase, setPhase] = useState<Phase>("title");
  const [hud, setHud] = useState<HudState | null>(null);
  const [banner, setBanner] = useState<{ name: string; key: number } | null>(null);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    input.attach();
    const engine = new GameEngine(canvas, input, {
      onHud: setHud,
      onMapChange: (name) => setBanner({ name, key: Date.now() }),
      onDeath: () => setPhase("dead"),
    });
    engineRef.current = engine;
    setIsTouch(window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);
    return () => {
      engine.destroy();
      input.detach();
    };
  }, [input]);

  const start = useCallback(() => {
    engineRef.current?.start();
    setPhase("playing");
  }, []);

  const respawn = useCallback(() => {
    engineRef.current?.respawn();
    setPhase("playing");
  }, []);

  useEffect(() => {
    if (phase === "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Enter") return;
      if (phase === "title") start();
      else respawn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, start, respawn]);

  return (
    <main
      className="fixed inset-0 touch-none select-none overflow-hidden bg-void"
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="pixelated absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        aria-label="Mundo de ECLIPSE: Reino de las Cenizas"
      />

      {phase !== "title" && hud && <Hud hud={hud} />}
      {phase === "playing" && banner && <LocationBanner key={banner.key} name={banner.name} />}
      {phase === "playing" && isTouch && <TouchControls input={input} />}

      {phase === "title" && (
        <section className="absolute inset-0 z-40 flex flex-col items-center justify-end bg-void pb-[12vh] text-center">
          <img
            src={titleArt}
            alt=""
            width={1600}
            height={912}
            className="pixelated absolute inset-0 size-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
          <div className="relative z-10 px-6">
            <h1 className="font-display text-7xl leading-none text-foreground text-ember-glow sm:text-9xl">
              ECLIPSE
            </h1>
            <p className="mt-2 text-lg uppercase tracking-[0.35em] text-accent text-pixel-shadow sm:text-xl">
              Reino de las Cenizas
            </p>
            <Button variant="ember" size="xl" className="mt-10 animate-flicker" onClick={start}>
              Comenzar
            </Button>
            <p className="mt-6 text-xs uppercase tracking-widest text-muted-foreground text-pixel-shadow">
              {isTouch ? "Joystick: moverse · Espada: atacar" : "WASD / Flechas: moverse · Espacio / J: atacar"}
            </p>
          </div>
        </section>
      )}

      {phase === "dead" && (
        <section className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-void/75 text-center">
          <h2 className="font-display text-6xl text-hp text-ember-glow sm:text-8xl">Has caído</h2>
          <p className="mt-3 text-sm uppercase tracking-widest text-muted-foreground">
            Las cenizas te devuelven a Umbravía
          </p>
          <Button variant="ember" size="xl" className="mt-8" onClick={respawn}>
            Despertar
          </Button>
        </section>
      )}
    </main>
  );
}
