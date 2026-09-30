// 코드로 그리는 질감: 공의 빛, 공 꼬리, 팻말 글자, 판 아래 푸른 빛. (그림 파일 없이)

import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function texture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 가운데가 밝고 바깥으로 흐려지는 빛 */
export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return texture(c, false);
}

/** 공 꼬리: 뒤쪽(왼쪽)은 투명, 앞쪽(오른쪽)은 진함, 가운데 줄이 가장 밝음 */
export function trailTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 32);
  const img = g.createImageData(128, 32);
  for (let y = 0; y < 32; y++) {
    const v = 1 - Math.abs(y - 15.5) / 16;
    for (let x = 0; x < 128; x++) {
      const u = x / 127;
      const a = Math.pow(u, 1.6) * Math.pow(Math.max(0, v), 1.8);
      const k = (y * 128 + x) * 4;
      img.data[k] = 255;
      img.data[k + 1] = 255;
      img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return texture(c, false);
}

/** 팻말 글자판 (예: ×3, +5) */
export function labelTexture(text: string, bg: string, fg = '#ffffff'): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  const r = 44;
  g.beginPath();
  g.roundRect(8, 10, 240, 108, r);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fill();
  g.beginPath();
  g.roundRect(8, 4, 240, 108, r);
  g.fillStyle = bg;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.stroke();
  g.font = '900 78px system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.strokeText(text, 128, 62);
  g.fillStyle = fg;
  g.fillText(text, 128, 62);
  return texture(c);
}

/** 판 아래로 번지는 푸른 빛 */
export function boardGlowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, 'rgba(70,140,255,0.55)');
  grd.addColorStop(0.55, 'rgba(50,110,255,0.22)');
  grd.addColorStop(1, 'rgba(40,90,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return texture(c);
}

/** 바닥에 까는 동그란 그림자 */
export function shadowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return texture(c, false);
}
