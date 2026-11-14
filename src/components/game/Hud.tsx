import type { HudState } from "@/game/engine";

function Bar({ value, max, fill, track }: { value: number; max: number; fill: string; track: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`relative h-3 w-full ${track} shadow-[0_0_0_2px_var(--panel-shade)]`}>
      <div className={`h-full ${fill} transition-[width] duration-200`} style={{ width: `${pct}%` }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-foreground/25" />
    </div>
  );
}

export function Hud({ hud }: { hud: HudState }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex select-none flex-col gap-2 sm:left-5 sm:top-5">
      <div className="pixel-panel w-52 px-3 py-2.5 sm:w-60">
        <div className="mb-2 flex items-baseline justify-between text-pixel-shadow">
          <span className="text-sm uppercase tracking-widest text-foreground">Guerrero</span>
          <span className="text-xs text-accent">Nv {hud.level}</span>
        </div>

        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Vida</span>
          <span className="text-foreground">
            {hud.hp}/{hud.maxHp}
          </span>
        </div>
        <Bar value={hud.hp} max={hud.maxHp} fill="bg-hp" track="bg-hp-dim" />

        <div className="mb-1 mt-2 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Experiencia</span>
          <span className="text-foreground">
            {hud.xp}/{hud.xpNext}
          </span>
        </div>
        <Bar value={hud.xp} max={hud.xpNext} fill="bg-xp" track="bg-xp-dim" />

        <div className="mt-2.5 flex items-center gap-2 text-sm text-gold text-pixel-shadow">
          <span className="inline-block size-3 rounded-full bg-gold shadow-[0_0_0_2px_var(--panel-shade),inset_-2px_-2px_0_0_var(--ember)]" />
          <span>{hud.gold}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">oro</span>
        </div>
      </div>
    </div>
  );
}

export function LocationBanner({ name }: { name: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[18%] z-20 flex justify-center">
      <div className="animate-banner text-center">
        <div className="mx-auto mb-1 h-px w-24 bg-ember/70" />
        <p className="font-display text-4xl text-foreground text-ember-glow sm:text-5xl">{name}</p>
        <div className="mx-auto mt-1 h-px w-24 bg-ember/70" />
      </div>
    </div>
  );
}
