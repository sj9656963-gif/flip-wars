// 게임 규칙에 쓰는 숫자들 (밸런스 조정은 여기서)

/** 시뮬레이션 한 번의 시간(초): 1초에 60번 진행 */
export const TICK = 1 / 60;
export const NEUTRAL = -1;
export const WALL = -2;
export const MAX_BALLS = 2400;
export const MAX_UNITS_PER_TEAM = 80;
export const MAX_GATES = 30;
export const BALL_RADIUS = 0.16;
export const MEGA_RADIUS = 0.55;
export const CLASH_DIST = 0.34;
export const BALL_LIFE = 5.5;
export const MAX_BOUNCES = 6;
/** 기지 가운데에서 포구까지 거리 */
export const MUZZLE = 1.3;
/** 끝나기 전 이 시간(초)부터 피버 타임: 발사가 빨라지고 포인트 2배 */
export const FEVER_TIME = 20;
export const FEVER_FIRE = 1.5;
export const FEVER_POINTS = 2;
export const RAPID_MUL = 0.4;
export const RAPID_TIME = 6;
export const FREEZE_TIME = 4;
export const BOMB_RADIUS = 2.6;
export const BOMB_DELAY = 0.8;
export const BOMB_BASE_DAMAGE = 5;
/** 칸은 남의 공에 이만큼 맞아야 뒤집힘 (공이 많이 날아다니는 대신 한 개의 힘은 작게) */
export const TILE_HP = 3;
/** 보통 공 하나가 기지에 주는 피해 */
export const BALL_BASE_DAMAGE = 0.07;
/** 보통 공 하나가 용병에게 주는 피해 */
export const BALL_UNIT_DAMAGE = 1 / 3;
/** 기지 방어: 이 간격(초)마다 기지 둘레 이 거리 안의 가장 가까운 남의 칸을 되찾음 */
export const GUARD_INTERVAL = 0.3;
export const GUARD_RADIUS = 2.7;
export const MEGA_BASE_DAMAGE = 14;
export const MEGA_POWER = 40;
export const MEGA_SPEED = 6;
export const KO_BONUS = 60;
export const GOLD_POINTS = 10;
export const SQUAD_SIZE = 6;

export type CardId = 'soldiers' | 'bomb' | 'rapid' | 'freeze' | 'tank' | 'mega';

export interface CardDef {
  id: CardId;
  name: string;
  desc: string;
  cost: number;
  cooldown: number;
  /** 모험 모드에서 쓸 수 있게 되는 라운드 */
  unlock: number;
}

export const CARDS: readonly CardDef[] = [
  { id: 'soldiers', name: '병사', desc: '병사 6명이 조준한 곳을 지나 적 기지로 행진하며 밟는 땅을 뒤집고, 기지에 부딪혀요. + 팻말을 지나면 병사가 늘어나요.', cost: 40, cooldown: 2.5, unlock: 1 },
  { id: 'bomb', name: '폭탄', desc: '조준한 곳에 떨어져 주변 땅을 한 번에 뒤집고 적 공·병사를 없애요.', cost: 55, cooldown: 4, unlock: 2 },
  { id: 'rapid', name: '연사', desc: '6초 동안 대포가 2.5배 빨리 쏴요.', cost: 60, cooldown: 9, unlock: 3 },
  { id: 'freeze', name: '얼음', desc: '4초 동안 상대 대포를 얼려서 멈춰요.', cost: 80, cooldown: 12, unlock: 4 },
  { id: 'tank', name: '탱크', desc: '튼튼한 탱크가 3칸 너비로 땅을 밀면서 적 기지로 가요.', cost: 110, cooldown: 6, unlock: 5 },
  { id: 'mega', name: '거대 공', desc: '땅을 넓게 뚫고 지나가는 거대한 공을 쏴요. 기지에 맞으면 큰 피해를 줘요.', cost: 130, cooldown: 10, unlock: 6 },
];

export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;

export interface UnitDef {
  name: string;
  hp: number;
  /** 칸/초 */
  speed: number;
  /** 몸 크기 (서로 밀어내기·싸움) */
  radius: number;
  /** 공에 맞는 범위: 자기가 밟고 선 칸보다 조금 넓어서 공이 발밑 칸을 뒤집기 전에 맞음 */
  hitbox: number;
  /** 적 용병과 싸울 때 초당 피해 */
  dps: number;
  /** 적 기지에 부딪힐 때 주는 피해 (부딪히면 사라짐) */
  crash: number;
  /** 뒤집는 범위 (0이면 밟은 칸만, 1이면 둘레 3×3) */
  flip: number;
}

export const SOLDIER = 0;
export const TANK = 1;
export const UNITS: readonly UnitDef[] = [
  { name: '병사', hp: 3, speed: 2.1, radius: 0.24, hitbox: 0.46, dps: 6, crash: 1.5, flip: 0 },
  { name: '탱크', hp: 34, speed: 1.05, radius: 0.5, hitbox: 0.74, dps: 16, crash: 10, flip: 1 },
];
