// 공 목록: 공이 수천 개여도 빠르게 돌도록 속성별 배열로 보관

export class Balls {
  readonly cap: number;
  n = 0;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vz: Float32Array;
  readonly life: Float32Array;
  readonly team: Int8Array;
  readonly power: Int16Array;
  readonly mask: Uint32Array;
  readonly bounce: Uint8Array;
  /** 0 보통 공, 1 거대 공 */
  readonly kind: Uint8Array;
  readonly dead: Uint8Array;

  constructor(cap: number) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.team = new Int8Array(cap);
    this.power = new Int16Array(cap);
    this.mask = new Uint32Array(cap);
    this.bounce = new Uint8Array(cap);
    this.kind = new Uint8Array(cap);
    this.dead = new Uint8Array(cap);
  }

  /** 공을 추가하고 번호를 돌려줌 (가득 차면 -1) */
  add(team: number, x: number, z: number, vx: number, vz: number, power: number, mask: number, kind: number, life: number): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vz[i] = vz;
    this.life[i] = life;
    this.team[i] = team;
    this.power[i] = power;
    this.mask[i] = mask;
    this.bounce[i] = 0;
    this.kind[i] = kind;
    this.dead[i] = 0;
    return i;
  }

  /** i번 공을 지움: 마지막 공을 그 자리로 옮김 */
  remove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.z[i] = this.z[last];
    this.vx[i] = this.vx[last];
    this.vz[i] = this.vz[last];
    this.life[i] = this.life[last];
    this.team[i] = this.team[last];
    this.power[i] = this.power[last];
    this.mask[i] = this.mask[last];
    this.bounce[i] = this.bounce[last];
    this.kind[i] = this.kind[last];
    this.dead[i] = this.dead[last];
  }

  /** 죽은 표시가 된 공을 모두 치움 */
  compact(): void {
    for (let i = this.n - 1; i >= 0; i--) if (this.dead[i]) this.remove(i);
  }
}
