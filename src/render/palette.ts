// 팀 색: 나는 파랑, 적은 빨강(1대2의 두 번째 적은 보라), 난투는 초록·노랑 추가. 빈 땅은 회색.

import type { ColorKey } from '../sim/types';

export interface TeamColors {
  /** 땅 칸 */
  tile: number;
  /** 기지 받침 */
  dark: number;
  /** 용병·조준선 */
  light: number;
  /** 공 (밝게 빛남) */
  ball: number;
  css: string;
  cssDark: string;
  cssLight: string;
}

export const COLORS: Record<ColorKey, TeamColors> = {
  blue: { tile: 0x3b82f6, dark: 0x1d4ed8, light: 0x93c5fd, ball: 0xe0f0ff, css: '#3b82f6', cssDark: '#1d4ed8', cssLight: '#93c5fd' },
  red: { tile: 0xef4444, dark: 0xb91c1c, light: 0xfca5a5, ball: 0xffe4de, css: '#ef4444', cssDark: '#b91c1c', cssLight: '#fca5a5' },
  green: { tile: 0x22c55e, dark: 0x15803d, light: 0x86efac, ball: 0xe3ffe9, css: '#22c55e', cssDark: '#15803d', cssLight: '#86efac' },
  amber: { tile: 0xf59e0b, dark: 0xb45309, light: 0xfcd34d, ball: 0xfff5d6, css: '#f59e0b', cssDark: '#b45309', cssLight: '#fcd34d' },
  purple: { tile: 0xa855f7, dark: 0x7e22ce, light: 0xd8b4fe, ball: 0xf5e9ff, css: '#a855f7', cssDark: '#7e22ce', cssLight: '#d8b4fe' },
};

export const NEUTRAL_TILE = 0x8b929e;
export const NEUTRAL_CSS = '#8b929e';
export const WALL_COLOR = 0x39404e;
export const FRAME_COLOR = 0xeef2f8;
export const GOLD_COLOR = 0xffc53d;
