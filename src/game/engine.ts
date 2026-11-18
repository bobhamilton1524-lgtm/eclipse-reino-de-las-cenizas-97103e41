/**
 * Motor del juego: bucle, cámara centrada en el personaje, colisiones, IA de enemigos,
 * combate (cuerpo a cuerpo, a distancia y mágico), habilidades, botín, guardado e iluminación.
 */
import { CLASSES, classTitle, unlockedActives, unlockedPassives, type ClassDef } from "./classes";
import { TILE } from "./constants";
import type { Input } from "./input";
import { addItem, type ItemId } from "./items";
import { getMaps, isSolidTile, type GameMap, type MapId } from "./maps";
import {
  ACTIVE,
  BAR_SLOTS,
  DROP_CHANCE,
  ENEMIES,
  MAX_LEVEL,
  PLAYER,
  STYLE_ATTACK,
  computeStats,
  evolutionTier,
  gainXp,
  monsterXp,
  skillPower,
  xpToNext,
  type ActiveKind,
  type Attr,
  type EnemyKind,
  type Stats,
} from "./rules";
import { newSave, writeSave, type SaveData } from "./save";
import {
  SPRITE_H,
  SPRITE_W,
  WALK_CYCLE,
  getClassSprites,
  getCoin,
  getEnemySprites,
  getItemIcon,
  type Dir,
  type SpriteSet,
} from "./sprites";
import { collectLights, renderMap, type Light } from "./tiles";

export interface HudSkill {
  name: string;
  kind: ActiveKind;
  cd: number;
  max: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  level: number;
  gold: number;
  mapName: string;
  title: string;
  points: number;
  style: ClassDef["style"];
  bar: (HudSkill | null)[];
}

export interface Sheet {
  save: SaveData;
  cls: ClassDef;
  title: string;
  stats: Stats;
  activesUnlocked: number;
  passivesUnlocked: number;
}

export interface EngineCallbacks {
  onHud: (hud: HudState) => void;
  onMapChange: (name: string) => void;
  onDeath: () => void;
  onNotice: (text: string) => void;
}

interface Body {
  x: number;
  y: number;
  kx: number;
  ky: number;
}

interface Player extends Body {
  fx: number;
  fy: number;
  hp: number;
  attackCd: number;
  swing: number;
  swingAngle: number;
  swingReach: number;
  swingArc: number;
  invuln: number;
  walk: number;
  moving: boolean;
  dir: Dir;
  dash: { t: number; vx: number; vy: number; dmg: number; hit: Set<Enemy> } | null;
  furyT: number;
  furyV: number;
  shieldT: number;
  shieldV: number;
}

type EnemyState = "idle" | "chase" | "windup" | "recover";

interface Enemy extends Body {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  homeX: number;
  homeY: number;
  state: EnemyState;
  timer: number;
  wx: number;
  wy: number;
  wanderT: number;
  flash: number;
  dir: Dir;
  walk: number;
  moving: boolean;
  dead: boolean;
  deathT: number;
}

interface Coin {
  x: number;
  y: number;
  value: number;
  t: number;
}
interface Drop {
  x: number;
  y: number;
  item: ItemId;
  t: number;
}
interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  pierce: boolean;
  splash: number;
  size: number;
  kind: "arrow" | "bolt";
  hit: Set<Enemy>;
}
interface Strike {
  x: number;
  y: number;
  t: number;
  r: number;
  dmg: number;
}
interface Effect {
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  kind: "ring" | "burst" | "aura";
  color: string;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ember: boolean;
}

const HALF_W = 5;
const BODY_H = 6;
const FADE = 0.35;
const AUTOSAVE = 10;
/** Altura (px) del centro del cuerpo sobre los pies. */
const MID = 10;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private light = document.createElement("canvas");
  private lctx: CanvasRenderingContext2D;
  private maps = getMaps();
  private mapCanvases = new Map<MapId, HTMLCanvasElement>();
  private mapLights = new Map<MapId, Light[]>();
  private map!: GameMap;
  private save: SaveData = newSave("guerrero");
  private cls: ClassDef = CLASSES.guerrero;
  private stats!: Stats;
  private cds: number[] = [];
  private player: Player;
  private enemies: Enemy[] = [];
  private coins: Coin[] = [];
  private drops: Drop[] = [];
  private projectiles: Projectile[] = [];
  private strikes: Strike[] = [];
  private effects: Effect[] = [];
  private particles: Particle[] = [];
  private vw = 320;
  private vh = 200;
  private camX = 0;
  private camY = 0;
  private time = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private paused = false;
  private fade: { t: number; dir: "out" | "in"; target?: MapId } | null = null;
  private lastHud = "";
  private saveT = 0;
  private fullNoticeT = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private input: Input,
    private cb: EngineCallbacks,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.lctx = this.light.getContext("2d")!;
    this.player = {
      x: 0,
      y: 0,
      kx: 0,
      ky: 0,
      fx: 0,
      fy: 1,
      hp: 1,
      attackCd: 0,
      swing: 0,
      swingAngle: 0,
      swingReach: 0,
      swingArc: 0,
      invuln: 0,
      walk: 0,
      moving: false,
      dir: "down",
      dash: null,
      furyT: 0,
      furyV: 0,
      shieldT: 0,
      shieldV: 0,
    };
    this.applySave(this.save);
    this.resize();
    this.loadMap("city", null, true);
    window.addEventListener("resize", this.resize);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  /** Empieza (o continúa) una partida a partir de un guardado. */
  start(save: SaveData) {
    this.applySave(save);
    this.player.hp = this.stats.maxHp;
    this.player.invuln = 0;
    this.input.reset();
    this.loadMap(save.map, null, true);
    this.cb.onMapChange(this.map.name);
    this.running = true;
    this.paused = false;
    this.last = performance.now();
    this.persist();
  }

  respawn() {
    const p = this.player;
    p.hp = this.stats.maxHp;
    p.invuln = 1;
    p.kx = p.ky = 0;
    p.dash = null;
    this.input.reset();
    this.loadMap("city", null);
    this.fade = { t: FADE, dir: "in" };
    this.running = true;
    this.last = performance.now();
    this.persist();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.input.reset();
    this.last = performance.now();
    if (paused) this.persist();
  }

  persist() {
    if (!this.running && !this.paused) return;
    this.save.map = this.map.id;
    writeSave(this.save);
  }

  sheet(): Sheet {
    const lv = this.save.level;
    return {
      save: structuredClone(this.save),
      cls: this.cls,
      title: classTitle(this.cls, lv),
      stats: { ...this.stats },
      activesUnlocked: unlockedActives(lv),
      passivesUnlocked: unlockedPassives(lv),
    };
  }

  /** Gasta un punto de atributo. */
  allocate(attr: Attr) {
    if (this.save.points <= 0) return;
    this.save.points -= 1;
    this.save.attrs[attr] += 1;
    const before = this.stats.maxHp;
    this.recompute();
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + Math.max(0, this.stats.maxHp - before));
    this.persist();
    this.emitHud();
  }

  /** Coloca una habilidad activa desbloqueada en un espacio de la barra. */
  assignSkill(slot: number, active: number) {
    if (slot < 0 || slot >= BAR_SLOTS || active >= unlockedActives(this.save.level)) return;
    const bar = this.save.bar;
    const prev = bar.indexOf(active);
    if (prev >= 0) bar[prev] = bar[slot] ?? null;
    bar[slot] = active;
    this.persist();
    this.emitHud();
  }

  private applySave(save: SaveData) {
    this.save = structuredClone(save);
    this.cls = CLASSES[save.classId];
    this.cds = this.cls.actives.map(() => 0);
    this.recompute();
  }

  private recompute() {
    const lv = this.save.level;
    this.stats = computeStats({
      style: this.cls.style,
      primary: this.cls.primary,
      level: lv,
      attrs: this.save.attrs,
      passives: this.cls.passives.slice(0, unlockedPassives(lv)),
    });
  }

  resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.max(2, Math.min(5, Math.round(Math.min(w, h) / 210)));
    this.vw = Math.ceil(w / scale);
    this.vh = Math.ceil(h / scale);
    this.canvas.width = this.vw;
    this.canvas.height = this.vh;
    this.canvas.style.width = `${this.vw * scale}px`;
    this.canvas.style.height = `${this.vh * scale}px`;
    this.light.width = this.vw;
    this.light.height = this.vh;
    this.ctx.imageSmoothingEnabled = false;
    this.particles = [];
    const count = Math.round((this.vw * this.vh) / 1600);
    for (let i = 0; i < count; i++) this.particles.push(this.newParticle(true));
  };

  // ---------- Mapas ----------
  private loadMap(id: MapId, from: MapId | null, silent = false) {
    const map = this.maps[id];
    this.map = map;
    if (!this.mapCanvases.has(id)) {
      this.mapCanvases.set(id, renderMap(map));
      this.mapLights.set(id, collectLights(map));
    }
    const pos = (from && map.arrivals[from]) || map.spawn;
    const p = this.player;
    p.x = pos.x;
    p.y = pos.y;
    p.fx = 0;
    p.fy = 1;
    p.dir = "down";
    p.dash = null;
    this.coins = [];
    this.drops = [];
    this.projectiles = [];
    this.strikes = [];
    this.effects = [];
    this.enemies = map.enemies.map((s) => {
      const st = ENEMIES[s.kind];
      return {
        kind: s.kind,
        x: s.x,
        y: s.y,
        kx: 0,
        ky: 0,
        hp: st.hp,
        maxHp: st.hp,
        homeX: s.x,
        homeY: s.y,
        state: "idle" as EnemyState,
        timer: 0,
        wx: 0,
        wy: 0,
        wanderT: rand(0.5, 2),
        flash: 0,
        dir: "down" as Dir,
        walk: Math.random() * 10,
        moving: false,
        dead: false,
        deathT: 0,
      };
    });
    this.particles = this.particles.map(() => this.newParticle(true));
    this.updateCamera();
    this.emitHud();
    if (!silent) {
      this.cb.onMapChange(map.name);
      this.persist();
    }
  }

  private tileAt(px: number, py: number) {
    return this.map.tiles[Math.floor(py / TILE)]?.[Math.floor(px / TILE)];
  }

  private blocked(x: number, y: number) {
    const l = Math.floor((x - HALF_W) / TILE);
    const r = Math.floor((x + HALF_W - 0.01) / TILE);
    const t = Math.floor((y - BODY_H) / TILE);
    const b = Math.floor((y - 0.01) / TILE);
    for (let ty = t; ty <= b; ty++)
      for (let tx = l; tx <= r; tx++) if (isSolidTile(this.map.tiles[ty]?.[tx])) return true;
    return false;
  }

  private moveBody(e: Body, dx: number, dy: number) {
    if (dx && !this.blocked(e.x + dx, e.y)) e.x += dx;
    else if (dx) e.kx = 0;
    if (dy && !this.blocked(e.x, e.y + dy)) e.y += dy;
    else if (dy) e.ky = 0;
  }

  // ---------- Bucle ----------
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;
    if (this.running && !this.paused) this.update(dt);
    this.render();
  };

  private update(dt: number) {
    this.time += dt;
    this.updateFade(dt);
    if (!this.fade || this.fade.dir === "in") this.updatePlayer(dt);
    else {
      this.input.wantsAttack();
      this.input.takeSkill();
    }
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.updateProjectiles(dt);
    this.updateStrikes(dt);
    this.enemies = this.enemies.filter((e) => !e.dead || e.deathT > 0);
    this.separateEnemies();
    this.updatePickups(dt);
    this.effects = this.effects.filter((f) => (f.t += dt) < f.dur);
    this.updateParticles(dt);
    this.updateCamera();
    this.emitHud();
    this.saveT += dt;
    if (this.saveT > AUTOSAVE) {
      this.saveT = 0;
      this.persist();
    }
  }

  private updateFade(dt: number) {
    if (!this.fade) return;
    this.fade.t -= dt;
    if (this.fade.t > 0) return;
    if (this.fade.dir === "out" && this.fade.target) {
      const from = this.map.id;
      this.loadMap(this.fade.target, from);
      this.fade = { t: FADE, dir: "in" };
    } else this.fade = null;
  }

  private faceDir(x: number, y: number): Dir {
    if (Math.abs(x) >= Math.abs(y) * 0.9) return x >= 0 ? "right" : "left";
    return y < 0 ? "up" : "down";
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    const st = this.stats;
    for (let i = 0; i < this.cds.length; i++) this.cds[i] = Math.max(0, this.cds[i]! - dt);
    p.furyT = Math.max(0, p.furyT - dt);
    p.shieldT = Math.max(0, p.shieldT - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.swing = Math.max(0, p.swing - dt);

    if (p.dash) {
      const d = p.dash;
      d.t -= dt;
      this.moveBody(p, d.vx * dt, d.vy * dt);
      for (const e of this.enemies) {
        if (e.dead || d.hit.has(e) || Math.hypot(e.x - p.x, e.y - p.y) > 14) continue;
        d.hit.add(e);
        const n = Math.hypot(d.vx, d.vy) || 1;
        this.dealDamage(e, d.dmg, d.vx / n, d.vy / n);
      }
      if (d.t <= 0) p.dash = null;
      p.walk += dt * 14;
      p.moving = true;
    } else {
      const m = this.input.move();
      p.moving = m.x !== 0 || m.y !== 0;
      if (p.moving) {
        const len = Math.hypot(m.x, m.y);
        p.fx = m.x / len;
        p.fy = m.y / len;
        p.walk += dt * 8;
        if (p.swing <= 0) p.dir = this.faceDir(p.fx, p.fy);
      }
      const slow = p.swing > 0 ? 0.55 : 1;
      this.moveBody(p, (m.x * st.speed * slow + p.kx) * dt, (m.y * st.speed * slow + p.ky) * dt);
    }
    const decay = Math.exp(-12 * dt);
    p.kx *= decay;
    p.ky *= decay;

    if (this.input.wantsAttack() && p.attackCd <= 0 && !p.dash) this.attack();
    const slot = this.input.takeSkill();
    if (slot !== null && !p.dash) this.useSkill(slot);

    // Entradas/salidas entre Umbravía y la cripta
    const target = this.map.exits[this.tileAt(p.x, p.y - 3) ?? ""];
    if (target && !this.fade) {
      this.fade = { t: FADE, dir: "out", target };
      this.input.reset();
    }
  }

  /** Dirección de ataque: hacia donde mira, con ayuda de puntería al enemigo más cercano. */
  private aim(range: number): { x: number; y: number } {
    const p = this.player;
    const base = Math.atan2(p.fy, p.fx);
    let best: Enemy | null = null;
    let bestD = range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      let diff = Math.atan2(dy, dx) - base;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (d < bestD && Math.abs(diff) < 0.6) {
        best = e;
        bestD = d;
      }
    }
    if (!best) return { x: p.fx, y: p.fy };
    const dx = best.x - p.x;
    const dy = best.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  private attack() {
    const p = this.player;
    const sa = STYLE_ATTACK[this.cls.style];
    p.attackCd = this.stats.attackCooldown;
    if (this.cls.style === "melee") {
      this.meleeArc(this.stats.damage, sa.reach, sa.arc);
      return;
    }
    const a = this.aim(sa.range);
    p.fx = a.x;
    p.fy = a.y;
    p.dir = this.faceDir(a.x, a.y);
    this.shoot(a.x, a.y, this.stats.damage, {
      speed: sa.speed,
      range: sa.range,
      splash: sa.splash,
      kind: this.cls.style === "magic" ? "bolt" : "arrow",
      pierce: false,
      size: this.cls.style === "magic" ? 2 : 1,
    });
  }

  private meleeArc(dmg: number, reach: number, arc: number) {
    const p = this.player;
    p.swing = PLAYER.swingTime;
    p.swingAngle = Math.atan2(p.fy, p.fx);
    p.swingReach = reach;
    p.swingArc = arc;
    p.dir = this.faceDir(p.fx, p.fy);
    const cx = p.x;
    const cy = p.y - MID;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - cx;
      const dy = e.y - MID - cy;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      let diff = Math.atan2(dy, dx) - p.swingAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (d > 9 && Math.abs(diff) > arc) continue;
      this.dealDamage(e, dmg, dx / (d || 1), dy / (d || 1));
    }
  }

  private shoot(
    dx: number,
    dy: number,
    dmg: number,
    o: { speed: number; range: number; splash: number; kind: "arrow" | "bolt"; pierce: boolean; size: number },
  ) {
    const p = this.player;
    this.projectiles.push({
      x: p.x + dx * 6,
      y: p.y - MID + dy * 4,
      vx: dx * o.speed,
      vy: dy * o.speed,
      life: o.range / o.speed,
      dmg,
      pierce: o.pierce,
      splash: o.splash,
      size: o.size,
      kind: o.kind,
      hit: new Set(),
    });
  }

  private aoe(x: number, y: number, r: number, dmg: number) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - MID - y;
      const d = Math.hypot(dx, dy);
      if (d <= r + 6) this.dealDamage(e, dmg, dx / (d || 1), dy / (d || 1));
    }
  }

  private fx(kind: Effect["kind"], x: number, y: number, r: number, dur: number) {
    this.effects.push({ kind, x, y, r, t: 0, dur, color: this.cls.fx });
  }

  private useSkill(slot: number) {
    const idx = this.save.bar[slot];
    if (idx === null || idx === undefined || idx >= unlockedActives(this.save.level)) return;
    if ((this.cds[idx] ?? 0) > 0) return;
    const sk = this.cls.actives[idx];
    if (!sk) return;
    const def = ACTIVE[sk.kind];
    const power = skillPower(def.power, sk.tier);
    const dmg = this.stats.damage * power;
    const p = this.player;
    const cx = p.x;
    const cy = p.y - MID;
    this.cds[idx] = def.cooldown;
    switch (sk.kind) {
      case "tajo": {
        const sa = STYLE_ATTACK.melee;
        this.meleeArc(dmg, sa.reach * 1.5, sa.arc * 1.3);
        this.fx("burst", cx + p.fx * 14, cy + p.fy * 14, 16, 0.25);
        break;
      }
      case "embestida":
        p.dash = { t: 0.2, vx: p.fx * 260, vy: p.fy * 260, dmg, hit: new Set() };
        p.invuln = Math.max(p.invuln, 0.25);
        p.dir = this.faceDir(p.fx, p.fy);
        break;
      case "torbellino":
        this.aoe(cx, cy, 30, dmg);
        this.fx("ring", cx, cy, 32, 0.35);
        p.swing = PLAYER.swingTime * 2;
        p.swingArc = Math.PI;
        p.swingReach = 26;
        p.swingAngle = this.time * 10;
        break;
      case "disparo": {
        const a = this.aim(200);
        p.dir = this.faceDir(a.x, a.y);
        this.shoot(a.x, a.y, dmg, {
          speed: 240,
          range: 200,
          splash: 0,
          kind: this.cls.style === "ranged" ? "arrow" : "bolt",
          pierce: true,
          size: 3,
        });
        break;
      }
      case "abanico": {
        const a = this.aim(150);
        const base = Math.atan2(a.y, a.x);
        p.dir = this.faceDir(a.x, a.y);
        for (let i = -2; i <= 2; i++) {
          const ang = base + i * 0.22;
          this.shoot(Math.cos(ang), Math.sin(ang), dmg, {
            speed: 210,
            range: 150,
            splash: 0,
            kind: this.cls.style === "ranged" ? "arrow" : "bolt",
            pierce: false,
            size: 1,
          });
        }
        break;
      }
      case "nova":
        this.aoe(cx, cy, 46, dmg);
        this.fx("ring", cx, cy, 48, 0.45);
        break;
      case "meteoro": {
        const a = this.aim(90);
        const tx = cx + a.x * 48;
        const ty = cy + a.y * 48;
        this.strikes.push({ x: tx, y: ty, t: 0.4, r: 32, dmg });
        this.fx("aura", tx, ty, 32, 0.4);
        break;
      }
      case "curacion":
        p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.maxHp * power);
        this.fx("aura", cx, cy, 18, 0.6);
        break;
      case "furia":
        p.furyT = def.duration ?? 6;
        p.furyV = power;
        this.fx("ring", cx, cy, 22, 0.4);
        break;
      case "escudo":
        p.shieldT = def.duration ?? 5;
        p.shieldV = Math.min(0.85, power);
        this.fx("ring", cx, cy, 18, 0.4);
        break;
    }
  }

  private dealDamage(e: Enemy, base: number, nx: number, ny: number) {
    let dmg = base * (this.player.furyT > 0 ? 1 + this.player.furyV : 1);
    if (Math.random() < this.stats.crit) dmg *= PLAYER.critMult;
    dmg = Math.max(1, Math.round(dmg));
    if (this.stats.lifesteal > 0)
      this.player.hp = Math.min(this.stats.maxHp, this.player.hp + dmg * this.stats.lifesteal);
    this.hitEnemy(e, dmg, nx, ny);
  }

  private hitEnemy(e: Enemy, dmg: number, nx: number, ny: number) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.12;
    e.kx = nx * 170;
    e.ky = ny * 170;
    if (e.state === "idle" || e.state === "windup") {
      e.state = "recover";
      e.timer = 0.35;
    }
    if (e.hp > 0) return;
    e.dead = true;
    e.deathT = 0.45;
    const st = ENEMIES[e.kind];
    this.coins.push({ x: e.x - 3, y: e.y - 2, value: Math.round(rand(st.gold[0], st.gold[1])), t: 0 });
    if (Math.random() < DROP_CHANCE[st.rank]) this.drops.push({ x: e.x + 4, y: e.y, item: st.drop, t: 0 });
    this.addXp(monsterXp(st.level, st.rank));
  }

  private addXp(amount: number) {
    const s = this.save;
    const tierBefore = evolutionTier(s.level);
    const r = gainXp(s, amount);
    s.level = r.level;
    s.xp = r.xp;
    s.points = r.points;
    if (!r.gained) return;
    this.recompute();
    this.player.hp = this.stats.maxHp;
    const tier = evolutionTier(s.level);
    if (tier > tierBefore) {
      // Coloca la nueva habilidad activa en un espacio libre de la barra
      const newActive = unlockedActives(s.level) - 1;
      const free = s.bar.indexOf(null);
      if (free >= 0 && !s.bar.includes(newActive)) s.bar[free] = newActive;
      this.cb.onNotice(`¡Evolución! Ahora eres ${classTitle(this.cls, s.level)} · 2 habilidades nuevas`);
    } else {
      this.cb.onNotice(`Nivel ${s.level} · +${r.gained} punto${r.gained > 1 ? "s" : ""} de atributo`);
    }
    this.persist();
  }

  private updateProjectiles(dt: number) {
    this.projectiles = this.projectiles.filter((pr) => {
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (pr.life <= 0) return false;
      if (isSolidTile(this.tileAt(pr.x, pr.y + 6))) {
        if (pr.splash) this.fx("burst", pr.x, pr.y, pr.splash, 0.25);
        return false;
      }
      for (const e of this.enemies) {
        if (e.dead || pr.hit.has(e)) continue;
        if (Math.hypot(e.x - pr.x, e.y - MID - pr.y) > 7 + pr.size) continue;
        pr.hit.add(e);
        const n = Math.hypot(pr.vx, pr.vy) || 1;
        this.dealDamage(e, pr.dmg, pr.vx / n, pr.vy / n);
        if (pr.splash) {
          for (const o of this.enemies)
            if (o !== e && !o.dead && Math.hypot(o.x - pr.x, o.y - MID - pr.y) < pr.splash + 6)
              this.dealDamage(o, pr.dmg * 0.5, pr.vx / n, pr.vy / n);
          this.fx("burst", pr.x, pr.y, pr.splash, 0.25);
        }
        if (!pr.pierce) return false;
      }
      return true;
    });
  }

  private updateStrikes(dt: number) {
    this.strikes = this.strikes.filter((s) => {
      s.t -= dt;
      if (s.t > 0) return true;
      this.aoe(s.x, s.y, s.r, s.dmg);
      this.fx("burst", s.x, s.y, s.r, 0.4);
      return false;
    });
  }

  private updateEnemy(e: Enemy, dt: number) {
    e.flash = Math.max(0, e.flash - dt);
    const decay = Math.exp(-10 * dt);
    if (e.dead) {
      e.deathT -= dt;
      this.moveBody(e, e.kx * dt, e.ky * dt);
      e.kx *= decay;
      e.ky *= decay;
      return;
    }
    const st = ENEMIES[e.kind];
    const p = this.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    const alive = p.hp > 0;
    let mx = 0;
    let my = 0;
    let speed = st.speed;

    switch (e.state) {
      case "idle": {
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = rand(1.5, 3);
          const toHome = Math.hypot(e.homeX - e.x, e.homeY - e.y) > 40;
          const a = toHome ? Math.atan2(e.homeY - e.y, e.homeX - e.x) : Math.random() * Math.PI * 2;
          const still = !toHome && Math.random() < 0.4;
          e.wx = still ? 0 : Math.cos(a);
          e.wy = still ? 0 : Math.sin(a);
        }
        mx = e.wx;
        my = e.wy;
        speed *= 0.35;
        if (alive && d < st.aggro) e.state = "chase";
        break;
      }
      case "chase":
        if (!alive || d > st.aggro * 1.6) {
          e.state = "idle";
          break;
        }
        if (d < st.range) {
          e.state = "windup";
          e.timer = st.windup;
          break;
        }
        mx = dx / d;
        my = dy / d;
        break;
      case "windup":
        e.timer -= dt;
        if (e.timer <= 0) {
          if (alive && d < st.range + 6) this.hurtPlayer(st.damage, e);
          e.state = "recover";
          e.timer = st.cooldown;
        }
        break;
      case "recover":
        e.timer -= dt;
        if (d > st.range) {
          mx = dx / d;
          my = dy / d;
          speed *= 0.4;
        }
        if (e.timer <= 0) e.state = "chase";
        break;
    }
    e.moving = !!(mx || my);
    if (e.moving) {
      e.walk += dt * 7;
      e.dir = this.faceDir(mx, my);
    }
    if (e.state !== "idle" && d > 2) e.dir = this.faceDir(dx, dy);
    this.moveBody(e, (mx * speed + e.kx) * dt, (my * speed + e.ky) * dt);
    e.kx *= decay;
    e.ky *= decay;
  }

  private hurtPlayer(dmg: number, from: Enemy) {
    const p = this.player;
    if (p.invuln > 0 || p.hp <= 0) return;
    let taken = dmg * (1 - this.stats.reduction);
    if (p.shieldT > 0) taken *= 1 - p.shieldV;
    p.hp = Math.max(0, p.hp - Math.max(1, Math.round(taken)));
    p.invuln = PLAYER.invulnerable;
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    p.kx = (dx / d) * 130;
    p.ky = (dy / d) * 130;
    if (p.hp <= 0) {
      this.running = false;
      this.input.reset();
      this.emitHud();
      this.save.map = "city";
      writeSave(this.save);
      this.cb.onDeath();
    }
  }

  private separateEnemies() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.dead || b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 11) {
          const push = (11 - d) / 2;
          this.moveBody(a, (-dx / d) * push, (-dy / d) * push);
          this.moveBody(b, (dx / d) * push, (dy / d) * push);
        }
      }
  }

  private updatePickups(dt: number) {
    const p = this.player;
    this.coins = this.coins.filter((c) => {
      c.t += dt;
      if (c.t > 0.25 && Math.hypot(c.x - p.x, c.y - p.y) < 12) {
        this.save.gold += c.value;
        return false;
      }
      return true;
    });
    this.fullNoticeT = Math.max(0, this.fullNoticeT - dt);
    this.drops = this.drops.filter((dr) => {
      dr.t += dt;
      if (dr.t < 0.4 || Math.hypot(dr.x - p.x, dr.y - p.y) > 12) return true;
      if (addItem(this.save.inventory, dr.item)) return false;
      if (this.fullNoticeT <= 0) {
        this.cb.onNotice("Inventario lleno");
        this.fullNoticeT = 4;
      }
      return true;
    });
  }

  private newParticle(anywhere: boolean): Particle {
    const city = this.map?.theme !== "crypt";
    const ember = city && Math.random() < 0.15;
    return {
      x: Math.random() * this.vw,
      y: anywhere ? Math.random() * this.vh : -2,
      vx: city ? rand(-10, -3) : rand(-2, 2),
      vy: city ? rand(6, 14) : rand(-2, 2),
      ember,
    };
  }

  private updateParticles(dt: number) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt + Math.sin(this.time * 2 + pt.y * 0.1) * 0.05;
      pt.y += pt.vy * dt;
      if (pt.y > this.vh + 2 || pt.x < -2 || pt.x > this.vw + 2 || pt.y < -3) {
        Object.assign(pt, this.newParticle(false));
        if (pt.vy < 0) pt.y = this.vh;
        if (Math.random() < 0.5) {
          pt.x = this.vw + 1;
          pt.y = Math.random() * this.vh;
        }
      }
    }
  }

  private updateCamera() {
    const mw = this.map.width * TILE;
    const mh = this.map.height * TILE;
    const cx = this.player.x - this.vw / 2;
    const cy = this.player.y - 10 - this.vh / 2;
    this.camX = Math.round(mw > this.vw ? Math.min(Math.max(cx, 0), mw - this.vw) : (mw - this.vw) / 2);
    this.camY = Math.round(mh > this.vh ? Math.min(Math.max(cy, 0), mh - this.vh) : (mh - this.vh) / 2);
  }

  private emitHud() {
    const p = this.player;
    const s = this.save;
    const unlocked = unlockedActives(s.level);
    const hud: HudState = {
      hp: Math.ceil(p.hp),
      maxHp: this.stats.maxHp,
      xp: s.xp,
      xpNext: xpToNext(s.level),
      level: s.level,
      gold: s.gold,
      mapName: this.map.name,
      title: classTitle(this.cls, s.level),
      points: s.points,
      style: this.cls.style,
      bar: s.bar.map((idx) => {
        if (idx === null || idx >= unlocked) return null;
        const sk = this.cls.actives[idx];
        if (!sk) return null;
        return { name: sk.name, kind: sk.kind, cd: Math.ceil((this.cds[idx] ?? 0) * 10) / 10, max: ACTIVE[sk.kind].cooldown };
      }),
    };
    const key = JSON.stringify(hud);
    if (key !== this.lastHud) {
      this.lastHud = key;
      this.cb.onHud(hud);
    }
  }

  // ---------- Render ----------
  private render() {
    const c = this.ctx;
    const { vw, vh, camX, camY } = this;
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.fillStyle = "#07060a";
    c.fillRect(0, 0, vw, vh);
    const mc = this.mapCanvases.get(this.map.id);
    if (mc) c.drawImage(mc, -camX, -camY);

    // Marcas de impacto pendientes
    for (const s of this.strikes) {
      c.strokeStyle = this.cls.fx;
      c.globalAlpha = 0.35 + Math.sin(this.time * 30) * 0.15;
      c.beginPath();
      c.ellipse(Math.round(s.x - camX), Math.round(s.y + MID - camY), s.r, s.r / 2.2, 0, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }

    // Monedas y botín
    const coin = getCoin();
    for (const k of this.coins) {
      const bob = Math.round(Math.sin(this.time * 5 + k.x) * 1.5);
      this.shadow(k.x, k.y, 4);
      c.drawImage(coin, Math.round(k.x - 5 - camX), Math.round(k.y - 9 - camY + bob));
    }
    for (const dr of this.drops) {
      const bob = Math.round(Math.sin(this.time * 4 + dr.x) * 1.5);
      this.shadow(dr.x, dr.y, 4);
      c.drawImage(getItemIcon(dr.item), Math.round(dr.x - 5 - camX), Math.round(dr.y - 11 - camY + bob));
    }

    // Entidades ordenadas por profundidad
    const drawables: { y: number; draw: () => void }[] = [];
    for (const e of this.enemies) drawables.push({ y: e.y, draw: () => this.drawEnemy(e) });
    drawables.push({ y: this.player.y, draw: () => this.drawPlayer() });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    this.drawProjectiles();

    // Ceniza / polvo bajo la luz
    for (const pt of this.particles)
      if (!pt.ember) {
        c.fillStyle = this.map.theme === "crypt" ? "rgba(170,160,190,0.25)" : "rgba(160,150,140,0.55)";
        c.fillRect(Math.round(pt.x), Math.round(pt.y), 1, 1);
      }

    this.renderLighting();
    this.drawEffects();

    // Brasas sobre la oscuridad
    for (const pt of this.particles)
      if (pt.ember) {
        c.fillStyle = `rgba(255,${120 + Math.round(Math.sin(this.time * 6 + pt.x) * 40)},50,0.9)`;
        c.fillRect(Math.round(pt.x), Math.round(pt.y), 1, 1);
      }

    if (this.fade) {
      const k = Math.max(0, this.fade.t / FADE);
      c.fillStyle = `rgba(4,3,6,${this.fade.dir === "out" ? 1 - k : k})`;
      c.fillRect(0, 0, vw, vh);
    }
  }

  private shadow(x: number, y: number, r: number) {
    const c = this.ctx;
    c.fillStyle = "rgba(0,0,0,0.38)";
    c.beginPath();
    c.ellipse(Math.round(x - this.camX), Math.round(y - this.camY), r, r / 2.4, 0, 0, Math.PI * 2);
    c.fill();
  }

  private blit(set: SpriteSet, dir: Dir, frame: number, flash: boolean, x: number, y: number) {
    const arr = (flash ? set.flash : set.frames)[dir];
    this.ctx.drawImage(
      arr[frame % arr.length]!,
      Math.round(x - SPRITE_W / 2 - this.camX),
      Math.round(y - SPRITE_H + 1 - this.camY),
    );
  }

  private drawEnemy(e: Enemy) {
    const c = this.ctx;
    const set = getEnemySprites(e.kind);
    if (e.dead) c.globalAlpha = Math.max(0, e.deathT / 0.45);
    this.shadow(e.x, e.y, 6);
    let ox = 0;
    if (e.state === "windup") ox = Math.round(Math.sin(this.time * 60) * 1);
    const frame = e.moving ? WALK_CYCLE[Math.floor(e.walk) % 4]! : 0;
    this.blit(set, e.dir, frame, e.flash > 0, e.x + ox, e.y + (e.dead ? (0.45 - e.deathT) * 8 : 0));
    c.globalAlpha = 1;
    if (!e.dead && e.hp < e.maxHp) {
      const bx = Math.round(e.x - 6 - this.camX);
      const by = Math.round(e.y - 26 - this.camY);
      c.fillStyle = "#0e0b12";
      c.fillRect(bx - 1, by - 1, 14, 4);
      c.fillStyle = "#3a1212";
      c.fillRect(bx, by, 12, 2);
      c.fillStyle = "#d63a2a";
      c.fillRect(bx, by, Math.max(1, Math.round((12 * e.hp) / e.maxHp)), 2);
    }
  }

  private drawPlayer() {
    const p = this.player;
    if (p.hp > 0 && p.invuln > 0 && !p.dash && Math.floor(p.invuln * 14) % 2 === 0) return;
    this.shadow(p.x, p.y, 6);
    if (p.shieldT > 0) {
      const c = this.ctx;
      c.strokeStyle = this.cls.fx;
      c.globalAlpha = 0.45 + Math.sin(this.time * 8) * 0.15;
      c.beginPath();
      c.arc(Math.round(p.x - this.camX), Math.round(p.y - MID - this.camY), 13, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
    const melee = this.cls.style === "melee";
    const behind = p.swing > 0 ? Math.sin(p.swingAngle) < -0.3 : p.dir === "up";
    if (melee && behind) this.drawWeapon();
    const frame = p.moving ? WALK_CYCLE[Math.floor(p.walk) % 4]! : 0;
    const bob = p.moving && frame !== 0 ? -1 : 0;
    this.blit(getClassSprites(this.cls.id), p.dir, frame, p.furyT > 0 && Math.floor(this.time * 10) % 4 === 0, p.x, p.y + bob);
    if (melee && !behind) this.drawWeapon();
  }

  /** Arma cuerpo a cuerpo: en reposo junto a la mano, o trazando el arco del tajo. */
  private drawWeapon() {
    const p = this.player;
    const c = this.ctx;
    const w = this.cls.weapon;
    const hx = p.x - this.camX;
    const hy = p.y - MID - this.camY;
    let angle: number;
    if (p.swing > 0) {
      const t = 1 - p.swing / PLAYER.swingTime;
      const arc = p.swingArc || STYLE_ATTACK.melee.arc;
      angle = p.swingAngle - arc + arc * 2 * Math.min(1, t);
      const r = Math.max(15, (p.swingReach || 22) * 0.7);
      c.strokeStyle = "rgba(255,236,200,0.55)";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(hx, hy, r, p.swingAngle - arc, angle);
      c.stroke();
      c.strokeStyle = this.cls.fx;
      c.globalAlpha = 0.45;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(hx, hy, r + 3, p.swingAngle - arc, angle);
      c.stroke();
      c.globalAlpha = 1;
    } else {
      angle =
        p.dir === "right" ? -1.0 : p.dir === "left" ? Math.PI + 1.0 : p.dir === "down" ? -1.25 : Math.PI + 1.25;
    }
    if (!w) return; // puños: solo la estela
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const side = p.dir === "left" ? -1 : p.dir === "right" ? 1 : p.dir === "down" ? 1 : -1;
    const sx = p.swing > 0 ? hx : hx + side * 5;
    const sy = p.swing > 0 ? hy : hy + 3;
    const n = w.len;
    for (let i = 0; i < n; i++) {
      c.fillStyle = i < 2 ? w.handle : i === 2 ? w.guard : i === n - 1 ? w.edge : w.blade;
      c.fillRect(Math.round(sx + ca * i), Math.round(sy + sa * i), 1, 1);
    }
  }

  private drawProjectiles() {
    const c = this.ctx;
    for (const pr of this.projectiles) {
      const x = pr.x - this.camX;
      const y = pr.y - this.camY;
      const n = Math.hypot(pr.vx, pr.vy) || 1;
      const ux = pr.vx / n;
      const uy = pr.vy / n;
      if (pr.kind === "arrow") {
        const len = 5 + pr.size;
        for (let i = 0; i < len; i++) {
          c.fillStyle = i === len - 1 ? "#d8dce4" : i < 2 ? this.cls.fx : "#8a6a3a";
          c.fillRect(Math.round(x - ux * (len - 1 - i)), Math.round(y - uy * (len - 1 - i)), 1, 1);
        }
      } else {
        c.fillStyle = this.cls.fx;
        c.globalAlpha = 0.4;
        c.beginPath();
        c.arc(Math.round(x - ux * 3), Math.round(y - uy * 3), pr.size, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
        c.beginPath();
        c.arc(Math.round(x), Math.round(y), pr.size + 0.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#ffffff";
        c.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }

  private drawEffects() {
    const c = this.ctx;
    c.globalCompositeOperation = "lighter";
    for (const f of this.effects) {
      const k = f.t / f.dur;
      const x = Math.round(f.x - this.camX);
      const y = Math.round(f.y - this.camY);
      c.globalAlpha = Math.max(0, 1 - k) * 0.8;
      c.strokeStyle = f.color;
      c.fillStyle = f.color;
      if (f.kind === "ring") {
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, Math.max(1, f.r * (0.3 + k * 0.7)), 0, Math.PI * 2);
        c.stroke();
      } else if (f.kind === "burst") {
        c.globalAlpha *= 0.6;
        c.beginPath();
        c.arc(x, y, Math.max(1, f.r * (0.4 + k * 0.6)), 0, Math.PI * 2);
        c.fill();
      } else {
        c.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const a = this.time * 4 + (i * Math.PI) / 3;
          const r = f.r * (1 - k * 0.5);
          c.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.5 - k * 8), 1, 2);
        }
      }
    }
    c.lineWidth = 1;
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  private renderLighting() {
    const l = this.lctx;
    const { vw, vh, camX, camY } = this;
    l.globalCompositeOperation = "source-over";
    l.clearRect(0, 0, vw, vh);
    l.fillStyle = `rgba(6,4,12,${this.map.ambient})`;
    l.fillRect(0, 0, vw, vh);
    l.globalCompositeOperation = "destination-out";
    const lights = this.mapLights.get(this.map.id) ?? [];
    const p = this.player;
    const dynamic: Light[] = [
      { x: p.x, y: p.y - 12, r: this.map.theme === "crypt" ? 72 : 92, warm: false, seed: 0 },
      ...this.projectiles.filter((pr) => pr.kind === "bolt").map((pr) => ({ x: pr.x, y: pr.y, r: 18, warm: false, seed: 1 })),
      ...this.drops.map((d) => ({ x: d.x, y: d.y - 4, r: 12, warm: false, seed: 2 })),
      ...this.effects.map((f) => ({ x: f.x, y: f.y, r: f.r + 10, warm: false, seed: 3 })),
    ];
    const visible = [...dynamic, ...lights].filter(
      (L) => L.x + L.r > camX && L.x - L.r < camX + vw && L.y + L.r > camY && L.y - L.r < camY + vh,
    );
    // Luz en bandas escalonadas para un look pixel art
    for (const L of visible) {
      const flick = L.warm ? 1 + Math.sin(this.time * 9 + L.seed) * 0.04 + Math.sin(this.time * 23 + L.seed) * 0.02 : 1;
      const r = L.r * flick;
      for (const [k, a] of [
        [1, 0.35],
        [0.72, 0.4],
        [0.45, 0.5],
      ] as const) {
        l.fillStyle = `rgba(0,0,0,${a})`;
        l.beginPath();
        l.arc(Math.round(L.x - camX), Math.round(L.y - camY), Math.round(r * k), 0, Math.PI * 2);
        l.fill();
      }
    }
    this.ctx.drawImage(this.light, 0, 0);

    // Resplandor cálido de faroles y antorchas
    const c = this.ctx;
    c.globalCompositeOperation = "lighter";
    for (const L of visible) {
      if (!L.warm) continue;
      const r = L.r * 0.45 * (1 + Math.sin(this.time * 11 + L.seed) * 0.05);
      c.fillStyle = "rgba(255,120,40,0.07)";
      c.beginPath();
      c.arc(Math.round(L.x - camX), Math.round(L.y - camY), Math.round(r), 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = "source-over";
  }
}

export { MAX_LEVEL };
