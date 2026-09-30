import type { Plugin } from 'vite';

/** 빌드할 때 dist/sw.js(서비스 워커)를 만들어 내보내는 플러그인 */
export function serviceWorker(): Plugin;
