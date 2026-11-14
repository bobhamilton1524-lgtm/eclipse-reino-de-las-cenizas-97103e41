/**
 * Motor del juego: bucle, cámara centrada en el Guerrero, colisiones,
 * IA de enemigos (persiguen y atacan), combate cuerpo a cuerpo, iluminación y transiciones.
 */
import { TILE } from "./constants";
import type { Input } from "./input";
import { getMaps, isSolidTile, type GameMap, type MapId } from "./maps";
import { ENEMIES, PLAYER, gainXp, playerDamage, xpToNext, type EnemyKind } from "./rules";
import { getSprites, type SpriteSet } from "./sprites";
import { collectLights, renderMap, type Light } from "./tiles";

export interface HudState {
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  level: number;
  gold: number;
  mapName: string;
}

export interface EngineCallbacks {
  onHud: (hud: HudState) => void;
  onMapChange: (name: string) => void;
  onDeath: () => void;
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
  maxHp: number;
  level: number;
  xp: number;
  gold: number;
  attackCd: number;
  swing: number;
  swingAngle: number;
  invuln: number;
  walk: number;
  moving: boolean;
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
  face: 1 | -1;
  walk: number;
  dead: boolean;
  deathT: number;
}

interface Coin {
  x: number;
  y: number;
  value: number;
  t: number;
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

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private light = document.createElement("canvas");
  private lctx: CanvasRenderingContext2D;
  private maps = getMaps();
  private mapCanvases = new Map<MapId, HTMLCanvasElement>();
  private mapLights = new Map<MapId, Light[]>();
  private map!: GameMap;
  private player: Player;
  private enemies: Enemy[] = [];
  private coins: Coin[] = [];
  private particles: Particle[] = [];
  private vw = 320;
  private vh = 200;
  private camX = 0;
  private camY = 0;
  private time = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private started = false;
  private fade: { t: number; dir: "out" | "in"; target?: MapId } | null = null;
  private lastHud = "";

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
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      level: 1,
      xp: 0,
      gold: 0,
      attackCd: 0,
      swing: 0,
      swingAngle: 0,
      invuln: 0,
      walk: 0,
      moving: false,
    };
    this.resize();
    this.loadMap("city", null, true);
    window.addEventListener("resize", this.resize);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  start() {
    this.running = true;
    this.last = performance.now();
    if (!this.started) {
      this.started = true;
      this.cb.onMapChange(this.map.name);
    }
  }

  respawn() {
    const p = this.player;
    p.hp = p.maxHp;
    p.invuln = 1;
    p.kx = p.ky = 0;
    this.input.reset();
    this.loadMap("city", null);
    this.fade = { t: FADE, dir: "in" };
    this.running = true;
    this.last = performance.now();
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
    this.player.x = pos.x;
    this.player.y = pos.y;
    this.player.fx = 0;
    this.player.fy = 1;
    this.coins = [];
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
        face: 1 as const,
        walk: Math.random() * 10,
        dead: false,
        deathT: 0,
      };
    });
    this.particles = this.particles.map(() => this.newParticle(true));
    this.updateCamera();
    this.emitHud();
    if (!silent) this.cb.onMapChange(map.name);
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
    if (this.running) this.update(dt);
    this.render();
  };

  private update(dt: number) {
    this.time += dt;
    this.updateFade(dt);
    if (!this.fade || this.fade.dir === "in") this.updatePlayer(dt);
    else this.input.wantsAttack();
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.enemies = this.enemies.filter((e) => !e.dead || e.deathT > 0);
    this.separateEnemies();
    this.updateCoins(dt);
    this.updateParticles(dt);
    this.updateCamera();
    this.emitHud();
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

  private updatePlayer(dt: number) {
    const p = this.player;
    const m = this.input.move();
    p.moving = m.x !== 0 || m.y !== 0;
    if (p.moving) {
      const len = Math.hypot(m.x, m.y);
      p.fx = m.x / len;
      p.fy = m.y / len;
      p.walk += dt * 8;
    }
    const slow = p.swing > 0 ? 0.55 : 1;
    this.moveBody(p, (m.x * PLAYER.speed * slow + p.kx) * dt, (m.y * PLAYER.speed * slow + p.ky) * dt);
    const decay = Math.exp(-12 * dt);
    p.kx *= decay;
    p.ky *= decay;
    p.invuln = Math.max(0, p.invuln - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.swing = Math.max(0, p.swing - dt);

    if (this.input.wantsAttack() && p.attackCd <= 0) this.attack();

    // Entradas/salidas entre Umbravía y la cripta
    const target = this.map.exits[this.tileAt(p.x, p.y - 3) ?? ""];
    if (target && !this.fade) {
      this.fade = { t: FADE, dir: "out", target };
      this.input.reset();
    }
  }

  private attack() {
    const p = this.player;
    p.attackCd = PLAYER.attackCooldown;
    p.swing = PLAYER.swingTime;
    p.swingAngle = Math.atan2(p.fy, p.fx);
    const cx = p.x;
    const cy = p.y - 7;
    const dmg = playerDamage(p.level);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - cx;
      const dy = e.y - 7 - cy;
      const d = Math.hypot(dx, dy);
      if (d > PLAYER.reach) continue;
      let diff = Math.atan2(dy, dx) - p.swingAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (d > 9 && Math.abs(diff) > PLAYER.arc) continue;
      this.hitEnemy(e, dmg, dx / (d || 1), dy / (d || 1));
    }
  }

  private hitEnemy(e: Enemy, dmg: number, nx: number, ny: number) {
    e.hp -= dmg;
    e.flash = 0.12;
    e.kx = nx * 170;
    e.ky = ny * 170;
    if (e.state === "idle" || e.state === "windup") {
      e.state = "recover";
      e.timer = 0.35;
    }
    if (e.hp <= 0) {
      e.dead = true;
      e.deathT = 0.45;
      const st = ENEMIES[e.kind];
      const p = this.player;
      const next = gainXp(p, st.xp);
      Object.assign(p, next);
      this.coins.push({ x: e.x, y: e.y - 2, value: Math.round(rand(st.gold[0], st.gold[1])), t: 0 });
    }
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
    if (mx || my) {
      e.walk += dt * 7;
      if (Math.abs(mx) > 0.1) e.face = mx > 0 ? 1 : -1;
    }
    if (e.state !== "idle" && Math.abs(dx) > 2) e.face = dx > 0 ? 1 : -1;
    this.moveBody(e, (mx * speed + e.kx) * dt, (my * speed + e.ky) * dt);
    e.kx *= decay;
    e.ky *= decay;
  }

  private hurtPlayer(dmg: number, from: Enemy) {
    const p = this.player;
    if (p.invuln > 0 || p.hp <= 0) return;
    p.hp = Math.max(0, p.hp - dmg);
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

  private updateCoins(dt: number) {
    const p = this.player;
    this.coins = this.coins.filter((c) => {
      c.t += dt;
      if (c.t > 0.25 && Math.hypot(c.x - p.x, c.y - p.y) < 12) {
        p.gold += c.value;
        return false;
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
    const cy = this.player.y - 8 - this.vh / 2;
    this.camX = Math.round(mw > this.vw ? Math.min(Math.max(cx, 0), mw - this.vw) : (mw - this.vw) / 2);
    this.camY = Math.round(mh > this.vh ? Math.min(Math.max(cy, 0), mh - this.vh) : (mh - this.vh) / 2);
  }

  private emitHud() {
    const p = this.player;
    const hud: HudState = {
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      xp: p.xp,
      xpNext: xpToNext(p.level),
      level: p.level,
      gold: p.gold,
      mapName: this.map.name,
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

    // Monedas
    const sprites = getSprites();
    for (const coin of this.coins) {
      const bob = Math.round(Math.sin(this.time * 5 + coin.x) * 1.5);
      this.shadow(coin.x, coin.y, 4);
      c.drawImage(sprites.coin, Math.round(coin.x - 4 - camX), Math.round(coin.y - 9 - camY + bob));
    }

    // Entidades ordenadas por profundidad
    const drawables: { y: number; draw: () => void }[] = [];
    for (const e of this.enemies) drawables.push({ y: e.y, draw: () => this.drawEnemy(e) });
    drawables.push({ y: this.player.y, draw: () => this.drawPlayer() });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // Ceniza / polvo bajo la luz
    for (const pt of this.particles)
      if (!pt.ember) {
        c.fillStyle = this.map.theme === "crypt" ? "rgba(170,160,190,0.25)" : "rgba(160,150,140,0.55)";
        c.fillRect(Math.round(pt.x), Math.round(pt.y), 1, 1);
      }

    this.renderLighting();

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

  private blit(set: SpriteSet, face: 1 | -1, frame: number, flash: boolean, x: number, y: number) {
    const arr = flash ? (face > 0 ? set.flashRight : set.flashLeft) : face > 0 ? set.right : set.left;
    this.ctx.drawImage(arr[frame % arr.length]!, Math.round(x - 8 - this.camX), Math.round(y - 16 - this.camY));
  }

  private drawEnemy(e: Enemy) {
    const c = this.ctx;
    const set = getSprites().enemies[e.kind];
    if (e.dead) c.globalAlpha = Math.max(0, e.deathT / 0.45);
    this.shadow(e.x, e.y, 5);
    let ox = 0;
    if (e.state === "windup") ox = Math.round(Math.sin(this.time * 60) * 1);
    const frame = Math.floor(e.walk) % 2;
    this.blit(set, e.face, frame, e.flash > 0, e.x + ox, e.y + (e.dead ? (0.45 - e.deathT) * 8 : 0));
    c.globalAlpha = 1;
    if (!e.dead && e.hp < e.maxHp) {
      const bx = Math.round(e.x - 6 - this.camX);
      const by = Math.round(e.y - 19 - this.camY);
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
    if (p.hp > 0 && p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) return;
    const face: 1 | -1 = p.fx < -0.1 ? -1 : p.fx > 0.1 ? 1 : this.lastFace;
    this.lastFace = face;
    this.shadow(p.x, p.y, 6);
    const behind = p.swing > 0 ? Math.sin(p.swingAngle) < -0.3 : p.fy < -0.5;
    if (behind) this.drawSword();
    const frame = p.moving ? Math.floor(p.walk) % 2 : 0;
    const bob = p.moving && frame === 1 ? -1 : 0;
    this.blit(getSprites().warrior, face, frame, false, p.x, p.y + bob);
    if (!behind) this.drawSword();
  }
  private lastFace: 1 | -1 = 1;

  /** Espada en pixel art: en reposo junto al Guerrero, o trazando el arco del tajo. */
  private drawSword() {
    const p = this.player;
    const c = this.ctx;
    const hx = p.x - this.camX;
    const hy = p.y - 8 - this.camY;
    let angle: number;
    if (p.swing > 0) {
      const t = 1 - p.swing / PLAYER.swingTime;
      angle = p.swingAngle - PLAYER.arc + PLAYER.arc * 2 * t;
      // estela del tajo
      c.strokeStyle = "rgba(255,236,200,0.55)";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(hx, hy, 15, p.swingAngle - PLAYER.arc, angle);
      c.stroke();
      c.strokeStyle = "rgba(255,170,90,0.35)";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(hx, hy, 18, p.swingAngle - PLAYER.arc, angle);
      c.stroke();
    } else {
      angle = this.lastFace > 0 ? -1.0 : Math.PI + 1.0;
    }
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const start = p.swing > 0 ? 4 : 5;
    const sx = p.swing > 0 ? hx : hx + this.lastFace * 5;
    const sy = p.swing > 0 ? hy : hy + 3;
    for (let i = 0; i < 12; i++) {
      const r = start + i;
      c.fillStyle = i < 2 ? "#6b4a2a" : i === 2 ? "#c9a24a" : i === 11 ? "#9aa0ad" : "#d8dce4";
      c.fillRect(Math.round(sx + ca * (r - start)), Math.round(sy + sa * (r - start)), 1, 1);
    }
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
    const playerLight: Light = {
      x: p.x,
      y: p.y - 8,
      r: this.map.theme === "crypt" ? 72 : 92,
      warm: false,
      seed: 0,
    };
    const visible = [playerLight, ...lights].filter(
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
