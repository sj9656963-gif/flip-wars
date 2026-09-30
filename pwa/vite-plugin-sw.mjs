// Vite 플러그인: 빌드 결과의 스크립트·스타일 목록과 버전을 pwa/sw.template.js에 채워 dist/sw.js로 내보냄.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** @returns {import('vite').Plugin} */
export function serviceWorker() {
  return {
    name: 'fw-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => /\.(js|css)$/.test(f))
        .sort();
      const precache = [
        ...files.map((f) => `./${f}`),
        './manifest.webmanifest',
        './icons/icon.svg',
        './icons/icon-192.png',
        './icons/icon-512.png',
      ];
      const template = readFileSync(fileURLToPath(new URL('./sw.template.js', import.meta.url)), 'utf8');
      const version = createHash('sha256').update(files.join('|')).update(template).digest('hex').slice(0, 12);
      const VERSION_LINE = "const VERSION = '__VERSION__';";
      const PRECACHE_LINE = 'const PRECACHE = __PRECACHE__;';
      if (!template.includes(VERSION_LINE) || !template.includes(PRECACHE_LINE)) {
        this.error('pwa/sw.template.js에 VERSION·PRECACHE 자리가 없어요.');
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace(VERSION_LINE, `const VERSION = '${version}';`)
          .replace(PRECACHE_LINE, `const PRECACHE = ${JSON.stringify(precache)};`),
      });
    },
  };
}
