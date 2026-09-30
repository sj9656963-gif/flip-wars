// 게임 상태·판 설계·명령·사건 타입

import type { Balls } from './balls';
import type { CardId } from './constants';
import type { Rng } from './rng';

export type ColorKey = 'blue' | 'red' | 'green' | 'amber' | 'purple';
export type Side = 'bottom' | 'top' | 'left' | 'right';
export type GameMode = 'adventure' | 'brawl' | 'local' | 'demo';

export interface CannonStats {
  /** 발사 간격(초) */
  fireInterval: number;
  /** 공 속도(칸/초) */
  ballSpeed: number;
  /** 공이 땅 2칸을 뒤집을 확률 */
  pierce: number;
  /** 발사 각도 흔들림(라디안) */
  spread: number;
  /** 한 번에 쏘는 공 수 */
  multishot: number;
  /** 용병 체력 배수 */
  unitHp: number;
  /** 포인트 배수 */
  pointMul: number;
  /** 포신 회전 속도(라디안/초) */
  turnSpeed: number;
}

export interface AiProfile {
  /** 판단 간격(초) */
  think: number;
  /** 조준 오차(라디안) */
  noise: number;
  /** 카드를 쓸 수 있을 때 쓰는 확률 */
  spend: number;
  /** 0~1: 팻말 활용·방어·저축 판단 */
  smart: number;
}

export interface TeamSetup {
  control: 'human' | 'ai';
  name: string;
  color: ColorKey;
  side: Side;
  /** 2×2 기지의 왼쪽 위 칸 */
  baseCol: number;
  baseRow: number;
  stats: CannonStats;
  hp: number;
  startPoints: number;
  cards: CardId[];
  ai?: AiProfile;
}

export interface GateDef {
  x: number;
  z: number;
  /** 팻말 절반 너비(칸) */
  width: number;
  /** 0이면 가로(x 방향)로 놓임 */
  angle: number;
  op: 'mul' | 'add';
  value: number;
  moveAmp?: number;
  moveSpeed?: number;
}

export interface LevelDef {
  mode: GameMode;
  label: string;
  round: number;
  boss: boolean;
  cols: number;
  rows: number;
  /** 칸마다 처음 주인 (NEUTRAL·WALL·팀 번호) */
  tiles: Int8Array;
  gold: number[];
  gates: GateDef[];
  teams: TeamSetup[];
  duration: number;
  seed: number;
}

export interface TeamState {
  id: number;
  control: 'human' | 'ai';
  name: string;
  color: ColorKey;
  side: Side;
  alive: boolean;
  baseCol: number;
  baseRow: number;
  /** 기지 가운데 */
  cx: number;
  cz: number;
  angle: number;
  targetAngle: number;
  aimX: number;
  aimZ: number;
  fireTimer: number;
  /** 기지 방어가 다음에 칸을 되찾기까지 남은 시간 */
  guardTimer: number;
  stats: CannonStats;
  hp: number;
  maxHp: number;
  points: number;
  earned: number;
  flips: number;
  tiles: number;
  gold: number;
  shots: number;
  kills: number;
  units: number;
  cardsUsed: number;
  frozenUntil: number;
  rapidUntil: number;
  cards: CardId[];
  cardReady: Record<CardId, number>;
  eliminatedAt: number;
  eliminatedBy: number;
  rank: number;
  ai: AiProfile | null;
  aiNext: number;
}

/** 같이 출발한 용병 무리: + 팻말은 무리마다 한 번만 적용 */
export interface Squad {
  id: number;
  addMask: number;
  /** 경유지(조준한 곳)까지 거리 지도 */
  path: Float32Array | null;
  wx: number;
  wz: number;
}

export interface Unit {
  id: number;
  team: number;
  kind: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  /** 지나간 × 팻말 표시 */
  mask: number;
  squad: Squad;
  wpDone: boolean;
  target: number;
  retarget: number;
  fighting: boolean;
  attacking: boolean;
  face: number;
}

export interface Gate {
  id: number;
  op: 'mul' | 'add';
  value: number;
  x: number;
  z: number;
  x0: number;
  z0: number;
  width: number;
  angle: number;
  cos: number;
  sin: number;
  moveAmp: number;
  moveSpeed: number;
  /** 팻말이 선 칸의 주인 (그 팀만 쓸 수 있음, 빈 땅이면 모두) */
  owner: number;
  flash: number;
  hits: number;
}

export interface Bomb {
  team: number;
  x: number;
  z: number;
  at: number;
}

export type GameEvent =
  | { t: 'flip'; tile: number; from: number; to: number; delay: number }
  | { t: 'chip'; tile: number; team: number }
  | { t: 'gold'; tile: number; team: number }
  | { t: 'shot'; team: number }
  | { t: 'clash'; x: number; z: number }
  | { t: 'gate'; gate: number; team: number; n: number }
  | { t: 'baseHit'; team: number; by: number; hp: number }
  | { t: 'guard'; team: number; tile: number }
  | { t: 'eliminated'; team: number; by: number }
  | { t: 'unitDown'; x: number; z: number; team: number; kind: number }
  | { t: 'bombDrop'; x: number; z: number; team: number }
  | { t: 'explode'; x: number; z: number; r: number; team: number }
  | { t: 'card'; team: number; card: CardId }
  | { t: 'fever' }
  | { t: 'end'; winner: number };

export type Command =
  | { type: 'aim'; team: number; x: number; z: number }
  | { type: 'card'; team: number; card: CardId; x?: number; z?: number };

export interface Game {
  level: LevelDef;
  cols: number;
  rows: number;
  n: number;
  owner: Int8Array;
  /** 기지 칸이면 그 팀 번호, 아니면 -1 */
  baseOf: Int8Array;
  gold: Uint8Array;
  /** 칸마다 남은 체력 (0이 되면 친 팀 색으로 뒤집힘) */
  tileHp: Uint8Array;
  /** 벽이 아닌 칸 수 */
  playable: number;
  time: number;
  tick: number;
  duration: number;
  balls: Balls;
  units: Unit[];
  gates: Gate[];
  bombs: Bomb[];
  teams: TeamState[];
  /** 팀별: 그 팀 기지까지 거리 지도 */
  fields: Float32Array[];
  events: GameEvent[];
  rng: Rng;
  over: boolean;
  winner: number;
  endReason: '' | 'ko' | 'time';
  fever: boolean;
  nextId: number;
  cellHead: Int32Array;
  cellNext: Int32Array;
  unitHead: Int32Array;
  unitNext: Int32Array;
  /** 칸마다 서 있는 용병의 팀 (없으면 -1) */
  unitMap: Int8Array;
}
