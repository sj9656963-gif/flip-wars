// 길찾기 거리 지도: 각 칸에서 목표 칸까지 벽을 돌아가는 거리 (8방향, 대각선은 벽 모서리를 가로지르지 않음)

import { WALL } from './constants';

const DC = [1, -1, 0, 0, 1, 1, -1, -1];
const DR = [0, 0, 1, -1, 1, -1, 1, -1];

export function distanceField(cols: number, rows: number, owner: Int8Array, goals: readonly number[]): Float32Array {
  const n = cols * rows;
  const dist = new Float32Array(n).fill(Infinity);
  const hi: number[] = [];
  const hk: number[] = [];
  const swap = (a: number, b: number) => {
    const ti = hi[a];
    hi[a] = hi[b];
    hi[b] = ti;
    const tk = hk[a];
    hk[a] = hk[b];
    hk[b] = tk;
  };
  const push = (i: number, d: number) => {
    hi.push(i);
    hk.push(d);
    let k = hi.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hk[p] <= hk[k]) break;
      swap(p, k);
      k = p;
    }
  };
  const pop = (): number => {
    const top = hi[0];
    const li = hi.pop() as number;
    const lk = hk.pop() as number;
    if (hi.length) {
      hi[0] = li;
      hk[0] = lk;
      let k = 0;
      const len = hi.length;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < len && hk[l] < hk[m]) m = l;
        if (r < len && hk[r] < hk[m]) m = r;
        if (m === k) break;
        swap(k, m);
        k = m;
      }
    }
    return top;
  };
  for (const gi of goals) {
    if (gi < 0 || gi >= n || owner[gi] === WALL || dist[gi] === 0) continue;
    dist[gi] = 0;
    push(gi, 0);
  }
  while (hi.length) {
    const d = hk[0];
    const u = pop();
    if (d > dist[u]) continue;
    const c = u % cols;
    const r = (u - c) / cols;
    for (let k = 0; k < 8; k++) {
      const dc = DC[k];
      const dr = DR[k];
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const v = nr * cols + nc;
      if (owner[v] === WALL) continue;
      const diag = dc !== 0 && dr !== 0;
      if (diag && (owner[r * cols + nc] === WALL || owner[nr * cols + c] === WALL)) continue;
      // 저장 배열이 32비트라 키도 같은 정밀도로 맞춰야 '이미 처리한 칸' 판정이 어긋나지 않음
      const nd = Math.fround(d + (diag ? Math.SQRT2 : 1));
      if (nd < dist[v]) {
        dist[v] = nd;
        push(v, nd);
      }
    }
  }
  return dist;
}

/** 거리 지도를 따라 나아갈 방향(단위 벡터)을 out에 넣음. 이미 목표 칸이면 false */
export function fieldDir(
  cols: number,
  rows: number,
  owner: Int8Array,
  field: Float32Array,
  x: number,
  z: number,
  out: { x: number; z: number },
): boolean {
  const c = Math.min(cols - 1, Math.max(0, Math.floor(x)));
  const r = Math.min(rows - 1, Math.max(0, Math.floor(z)));
  const here = field[r * cols + c];
  let best = here;
  let bc = -1;
  let br = -1;
  for (let k = 0; k < 8; k++) {
    const dc = DC[k];
    const dr = DR[k];
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
    const v = nr * cols + nc;
    if (owner[v] === WALL) continue;
    if (dc !== 0 && dr !== 0 && (owner[r * cols + nc] === WALL || owner[nr * cols + c] === WALL)) continue;
    if (field[v] < best - 1e-6) {
      best = field[v];
      bc = nc;
      br = nr;
    }
  }
  if (bc < 0) {
    out.x = 0;
    out.z = 0;
    return false;
  }
  const tx = bc + 0.5 - x;
  const tz = br + 0.5 - z;
  const len = Math.hypot(tx, tz) || 1;
  out.x = tx / len;
  out.z = tz / len;
  return true;
}
