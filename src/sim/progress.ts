// 성장: 강화(코인으로 영구 강화), 라운드마다 강해지는 적, 판이 끝난 뒤 받는 코인

import { CARDS, type CardId } from './constants';
import type { AiProfile, CannonStats } from './types';

export type UpgradeId = 'fire' | 'pierce' | 'hp' | 'army' | 'points' | 'start';
export type Upgrades = Record<UpgradeId, number>;

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  max: number;
  base: number;
  growth: number;
  /** 이 레벨일 때의 효과 설명 */
  effect: (lv: number) => string;
}

const PLAYER_INTERVAL = 0.08;

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'fire', name: '발사 속도', desc: '대포가 더 빨리 쏴요', max: 12, base: 60, growth: 1.32, effect: (lv) => `초당 ${(1 / fireInterval(lv)).toFixed(1)}발` },
  { id: 'pierce', name: '관통 공', desc: '공 하나가 두 번 치는 힘을 가질 확률', max: 5, base: 120, growth: 1.6, effect: (lv) => `${lv * 12}%` },
  { id: 'hp', name: '기지 체력', desc: '기지가 더 오래 버텨요', max: 10, base: 50, growth: 1.3, effect: (lv) => `체력 ${baseHp(lv)}` },
  { id: 'army', name: '용병 강화', desc: '병사·탱크 체력이 늘어요', max: 8, base: 70, growth: 1.35, effect: (lv) => `체력 +${lv * 20}%` },
  { id: 'points', name: '포인트 보너스', desc: '땅을 뒤집을 때 받는 포인트', max: 10, base: 80, growth: 1.33, effect: (lv) => `+${lv * 8}%` },
  { id: 'start', name: '시작 포인트', desc: '판을 시작할 때 가진 포인트', max: 8, base: 40, growth: 1.3, effect: (lv) => `${startPoints(lv)}점` },
];

export function emptyUpgrades(): Upgrades {
  return { fire: 0, pierce: 0, hp: 0, army: 0, points: 0, start: 0 };
}

export function upgradeCost(def: UpgradeDef, lv: number): number {
  return Math.round((def.base * def.growth ** lv) / 5) * 5;
}

function fireInterval(lv: number): number {
  return PLAYER_INTERVAL / (1 + 0.07 * lv);
}

function baseHp(lv: number): number {
  return 80 + lv * 12;
}

function startPoints(lv: number): number {
  return 20 + lv * 15;
}

export function playerStats(up: Upgrades): CannonStats {
  return {
    fireInterval: fireInterval(up.fire),
    ballSpeed: 11,
    pierce: up.pierce * 0.12,
    spread: 0.1,
    multishot: 1,
    unitHp: 1 + up.army * 0.2,
    pointMul: 1 + up.points * 0.08,
    turnSpeed: 9,
  };
}

export function playerHp(up: Upgrades): number {
  return baseHp(up.hp);
}

export function playerStartPoints(up: Upgrades): number {
  return startPoints(up.start);
}

/** 모험 r라운드 적 대포 (라운드마다 빨라지고 관통·연발이 붙음) */
export function enemyStats(round: number, boss: boolean): CannonStats {
  const r = Math.max(1, round);
  return {
    fireInterval: Math.max(0.027, 0.093 / (1 + 0.045 * (r - 1))) * (boss ? 1.35 : 1),
    ballSpeed: 10 + Math.min(3, r * 0.1),
    pierce: Math.min(0.5, 0.03 * (r - 1)),
    spread: 0.12,
    multishot: boss ? 2 : 1,
    unitHp: 1 + 0.06 * (r - 1),
    pointMul: 1,
    turnSpeed: Math.min(6, 2.6 + 0.15 * r),
  };
}

export function enemyHp(round: number, boss: boolean, duo: boolean): number {
  const hp = 50 + 8 * (Math.max(1, round) - 1);
  return Math.round(hp * (boss ? 1.8 : 1) * (duo ? 0.7 : 1));
}

export function enemyAi(round: number): AiProfile {
  const r = Math.max(1, round) - 1;
  return {
    think: Math.max(0.25, 0.9 - 0.035 * r),
    noise: Math.max(0.05, 0.35 - 0.016 * r),
    spend: Math.min(0.9, 0.35 + 0.03 * r),
    smart: Math.min(1, 0.2 + 0.045 * r),
  };
}

/** 모험 r라운드까지 열린 카드 */
export function cardsForRound(round: number): CardId[] {
  return CARDS.filter((c) => c.unlock <= round).map((c) => c.id);
}

export interface MatchResult {
  win: boolean;
  ko: boolean;
  /** 끝났을 때 내 땅 비율 (0~1) */
  share: number;
  round: number;
  gold: number;
}

export function rewardCoins(r: MatchResult): number {
  const base = 15 + Math.round(r.share * 50) + r.gold * 4;
  const win = r.win ? 30 + 6 * r.round + (r.ko ? 20 : 0) : 0;
  return base + win;
}
