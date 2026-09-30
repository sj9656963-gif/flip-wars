// 진행 저장: 라운드·코인·강화·설정을 이 기기(localStorage)에만 저장

import { emptyUpgrades, UPGRADES, type Upgrades } from './sim/progress';

export interface Settings {
  sfx: boolean;
  music: boolean;
  vibrate: boolean;
  quality: 'high' | 'low';
}

export interface SaveData {
  v: 1;
  /** 도전할 모험 라운드 */
  round: number;
  /** 깬 가장 높은 라운드 */
  best: number;
  coins: number;
  upgrades: Upgrades;
  settings: Settings;
  tutorial: boolean;
  stats: { played: number; wins: number; flips: number };
}

const KEY = 'flip-wars:v1';

export function defaultSave(): SaveData {
  return {
    v: 1,
    round: 1,
    best: 0,
    coins: 0,
    upgrades: emptyUpgrades(),
    settings: { sfx: true, music: true, vibrate: true, quality: 'high' },
    tutorial: false,
    stats: { played: 0, wins: 0, flips: 0 },
  };
}

const num = (v: unknown, d: number, min = 0, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function loadSave(): SaveData {
  const d = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<SaveData>;
    const up = emptyUpgrades();
    for (const u of UPGRADES) up[u.id] = num(s.upgrades?.[u.id], 0, 0, u.max);
    return {
      v: 1,
      round: num(s.round, 1, 1, 9999),
      best: num(s.best, 0, 0, 9999),
      coins: num(s.coins, 0),
      upgrades: up,
      settings: {
        sfx: bool(s.settings?.sfx, true),
        music: bool(s.settings?.music, true),
        vibrate: bool(s.settings?.vibrate, true),
        quality: s.settings?.quality === 'low' ? 'low' : 'high',
      },
      tutorial: bool(s.tutorial, false),
      stats: { played: num(s.stats?.played, 0), wins: num(s.stats?.wins, 0), flips: num(s.stats?.flips, 0) },
    };
  } catch {
    return d;
  }
}

export function storeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장 공간이 없거나 막힘: 이번 실행 동안만 유지 */
  }
}
