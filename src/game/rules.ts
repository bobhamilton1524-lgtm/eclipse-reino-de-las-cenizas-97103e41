/** Reglas y valores de juego: progresión, atributos, habilidades, enemigos y botín. */
import type { ItemId } from "./items";

// ---------- Progresión ----------
export const MAX_LEVEL = 500;
export const POINTS_PER_LEVEL = 1;
export const LEVELS_PER_EVOLUTION = 100;
export const MAX_EVOLUTIONS = 5;
/** Habilidades nuevas por evolución: 1 activa + 1 pasiva. */
export const SKILLS_PER_EVOLUTION = 2;
export const BASE_ACTIVES = 3;
export const BASE_PASSIVES = 3;
/** Espacios de la barra de habilidades (teclas 1-4). */
export const BAR_SLOTS = 4;

export const INVENTORY_SLOTS = 2000;
export const STACK_SIZE = 99;

/** Experiencia necesaria para pasar del nivel indicado al siguiente (0 en el nivel máximo). */
export const xpToNext = (level: number) => (level >= MAX_LEVEL ? 0 : Math.round(30 * level ** 1.5));

/** Evolución de clase alcanzada (0 = clase base, 1..5 cada 100 niveles). */
export const evolutionTier = (level: number) => Math.min(MAX_EVOLUTIONS, Math.floor(level / LEVELS_PER_EVOLUTION));

export interface LevelState {
  level: number;
  xp: number;
  points: number;
}

/** Suma experiencia: sube niveles hasta el máximo y da +1 punto de atributo por nivel. */
export function gainXp(s: LevelState, amount: number): LevelState & { gained: number } {
  let { level, xp, points } = s;
  let gained = 0;
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, xp: 0, points, gained };
  xp += amount;
  while (level < MAX_LEVEL && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    points += POINTS_PER_LEVEL;
    gained += 1;
  }
  if (level >= MAX_LEVEL) xp = 0;
  return { level, xp, points, gained };
}

// ---------- Atributos ----------
export type Attr = "fuerza" | "destreza" | "inteligencia" | "vitalidad" | "agilidad";
export type Attributes = Record<Attr, number>;
export const ATTRS: { id: Attr; name: string; hint: string }[] = [
  { id: "fuerza", name: "Fuerza", hint: "Daño de las clases de fuerza" },
  { id: "destreza", name: "Destreza", hint: "Daño de las clases de destreza y golpe crítico" },
  { id: "inteligencia", name: "Inteligencia", hint: "Daño de las clases mágicas" },
  { id: "vitalidad", name: "Vitalidad", hint: "Vida máxima y defensa" },
  { id: "agilidad", name: "Agilidad", hint: "Velocidad de movimiento y de ataque" },
];

export type Style = "melee" | "ranged" | "magic";

export const PLAYER = {
  baseHp: 60,
  hpPerVit: 6,
  hpPerLevel: 5,
  baseDamage: 2,
  damagePerPrimary: 1.5,
  damagePerLevel: 1,
  baseSpeed: 66, // px/s
  speedPerAgi: 0.5,
  maxSpeed: 115,
  atkSpdPerAgi: 0.01,
  baseCrit: 0.05,
  critPerDex: 0.004,
  maxCrit: 0.6,
  critMult: 1.75,
  reductionPerVit: 0.002,
  maxReduction: 0.7,
  invulnerable: 0.7, // s tras recibir daño
  swingTime: 0.16, // s
};

/** Ataque básico según el estilo de la clase. */
export const STYLE_ATTACK: Record<
  Style,
  { cooldown: number; reach: number; arc: number; speed: number; range: number; splash: number }
> = {
  melee: { cooldown: 0.38, reach: 22, arc: 1.25, speed: 0, range: 0, splash: 0 },
  ranged: { cooldown: 0.5, reach: 0, arc: 0, speed: 200, range: 150, splash: 0 },
  magic: { cooldown: 0.6, reach: 0, arc: 0, speed: 140, range: 130, splash: 12 },
};

// ---------- Habilidades ----------
export type ActiveKind =
  | "tajo"
  | "embestida"
  | "torbellino"
  | "disparo"
  | "abanico"
  | "nova"
  | "meteoro"
  | "curacion"
  | "furia"
  | "escudo";
export type PassiveKind = "vida" | "poder" | "celeridad" | "critico" | "coraza" | "vampirismo" | "frenesi";

/** power = multiplicador de daño, fracción de curación o bonificación según el tipo. */
export const ACTIVE: Record<ActiveKind, { cooldown: number; power: number; duration?: number; text: string }> = {
  tajo: { cooldown: 4, power: 2.2, text: "Golpe amplio y potente frente a ti" },
  embestida: { cooldown: 6, power: 1.8, text: "Te lanzas hacia delante dañando a tu paso" },
  torbellino: { cooldown: 7, power: 1.6, text: "Giro que daña a todos a tu alrededor" },
  disparo: { cooldown: 4, power: 2.5, text: "Proyectil potente que atraviesa enemigos" },
  abanico: { cooldown: 6, power: 1.3, text: "Cinco proyectiles en abanico" },
  nova: { cooldown: 7, power: 1.8, text: "Explosión alrededor de ti" },
  meteoro: { cooldown: 9, power: 3, text: "Impacto devastador frente a ti" },
  curacion: { cooldown: 14, power: 0.3, text: "Recuperas parte de tu vida máxima" },
  furia: { cooldown: 16, power: 0.4, duration: 6, text: "Aumenta tu daño durante unos segundos" },
  escudo: { cooldown: 15, power: 0.5, duration: 5, text: "Reduce el daño recibido durante unos segundos" },
};

export const PASSIVE: Record<PassiveKind, { value: number; text: string }> = {
  vida: { value: 0.1, text: "vida máxima" },
  poder: { value: 0.1, text: "daño" },
  celeridad: { value: 0.06, text: "velocidad de movimiento" },
  critico: { value: 0.05, text: "probabilidad de crítico" },
  coraza: { value: 0.06, text: "reducción de daño" },
  vampirismo: { value: 0.03, text: "robo de vida" },
  frenesi: { value: 0.08, text: "velocidad de ataque" },
};

/** Las habilidades de cada evolución son más fuertes: +50 % por nivel de evolución. */
export const TIER_SCALE = 0.5;
export const skillPower = (base: number, tier: number) => base * (1 + tier * TIER_SCALE);

export interface Stats {
  maxHp: number;
  damage: number;
  speed: number;
  attackCooldown: number;
  crit: number;
  reduction: number;
  lifesteal: number;
}

export function computeStats(input: {
  style: Style;
  primary: Attr;
  level: number;
  attrs: Attributes;
  passives: { kind: PassiveKind; tier: number }[];
}): Stats {
  const { style, primary, level, attrs: a } = input;
  const b: Record<PassiveKind, number> = {
    vida: 0,
    poder: 0,
    celeridad: 0,
    critico: 0,
    coraza: 0,
    vampirismo: 0,
    frenesi: 0,
  };
  for (const p of input.passives) b[p.kind] += skillPower(PASSIVE[p.kind].value, p.tier);
  return {
    maxHp: Math.round((PLAYER.baseHp + a.vitalidad * PLAYER.hpPerVit + (level - 1) * PLAYER.hpPerLevel) * (1 + b.vida)),
    damage: Math.round(
      (PLAYER.baseDamage + a[primary] * PLAYER.damagePerPrimary + (level - 1) * PLAYER.damagePerLevel) * (1 + b.poder),
    ),
    speed: Math.min(PLAYER.maxSpeed, (PLAYER.baseSpeed + a.agilidad * PLAYER.speedPerAgi) * (1 + b.celeridad)),
    attackCooldown: STYLE_ATTACK[style].cooldown / (1 + a.agilidad * PLAYER.atkSpdPerAgi + b.frenesi),
    crit: Math.min(PLAYER.maxCrit, PLAYER.baseCrit + a.destreza * PLAYER.critPerDex + b.critico),
    reduction: Math.min(PLAYER.maxReduction, a.vitalidad * PLAYER.reductionPerVit + b.coraza),
    lifesteal: b.vampirismo,
  };
}

// ---------- Enemigos y botín ----------
export type Rank = "normal" | "mini" | "boss" | "supreme";
/** Probabilidad de que un monstruo suelte su objeto único. */
export const DROP_CHANCE: Record<Rank, number> = { normal: 0.5, mini: 0.6, boss: 0.7, supreme: 1 };
const RANK_XP: Record<Rank, number> = { normal: 1, mini: 3, boss: 8, supreme: 25 };

/** Experiencia que da un monstruo según su nivel y rango. */
export const monsterXp = (level: number, rank: Rank = "normal") => Math.round((6 + level * 4) * RANK_XP[rank]);

export type EnemyKind = "skeleton" | "ghoul";

export interface EnemyStats {
  name: string;
  level: number;
  rank: Rank;
  drop: ItemId;
  hp: number;
  speed: number;
  damage: number;
  aggro: number;
  range: number;
  windup: number;
  cooldown: number;
  gold: [number, number];
}

export const ENEMIES: Record<EnemyKind, EnemyStats> = {
  skeleton: {
    name: "Esqueleto",
    level: 3,
    rank: "normal",
    drop: "hueso-astillado",
    hp: 30,
    speed: 38,
    damage: 8,
    aggro: 120,
    range: 15,
    windup: 0.45,
    cooldown: 1.1,
    gold: [3, 6],
  },
  ghoul: {
    name: "Necrófago",
    level: 2,
    rank: "normal",
    drop: "garra-necrofago",
    hp: 20,
    speed: 55,
    damage: 6,
    aggro: 140,
    range: 14,
    windup: 0.3,
    cooldown: 0.9,
    gold: [2, 5],
  },
};
