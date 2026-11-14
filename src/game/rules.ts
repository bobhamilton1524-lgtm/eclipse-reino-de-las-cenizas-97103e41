/** Reglas y valores de juego: personaje Guerrero, enemigos y progresión. */

export const PLAYER = {
  maxHp: 100,
  speed: 70, // px/s
  attackCooldown: 0.38, // s
  swingTime: 0.16, // s
  invulnerable: 0.7, // s tras recibir daño
  reach: 22, // px de alcance del espadazo
  arc: 1.25, // rad a cada lado de la dirección de ataque
};

export type EnemyKind = "skeleton" | "ghoul";

export interface EnemyStats {
  name: string;
  hp: number;
  speed: number;
  damage: number;
  aggro: number;
  range: number;
  windup: number;
  cooldown: number;
  xp: number;
  gold: [number, number];
}

export const ENEMIES: Record<EnemyKind, EnemyStats> = {
  skeleton: {
    name: "Esqueleto",
    hp: 30,
    speed: 38,
    damage: 8,
    aggro: 120,
    range: 15,
    windup: 0.45,
    cooldown: 1.1,
    xp: 10,
    gold: [3, 6],
  },
  ghoul: {
    name: "Necrófago",
    hp: 20,
    speed: 55,
    damage: 6,
    aggro: 140,
    range: 14,
    windup: 0.3,
    cooldown: 0.9,
    xp: 8,
    gold: [2, 5],
  },
};

export const xpToNext = (level: number) => 25 * level;
export const playerDamage = (level: number) => 10 + (level - 1) * 3;
export const HP_PER_LEVEL = 10;

export interface Progress {
  level: number;
  xp: number;
  maxHp: number;
  hp: number;
}

/** Suma experiencia y aplica subidas de nivel (vida máxima +10 y curación completa). */
export function gainXp(p: Progress, amount: number): Progress {
  let { level, xp, maxHp, hp } = p;
  xp += amount;
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    maxHp += HP_PER_LEVEL;
    hp = maxHp;
  }
  return { level, xp, maxHp, hp };
}
