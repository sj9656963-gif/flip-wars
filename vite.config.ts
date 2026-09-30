import { defineConfig } from 'vitest/config';
import { serviceWorker } from './pwa/vite-plugin-sw.mjs';

export default defineConfig({
  // 상대 경로로 빌드해 어떤 정적 호스팅 경로(예: 깃허브 Pages 하위 주소)에서도 동작
  base: './',
  // 홈 화면 설치·오프라인용 서비스 워커(dist/sw.js) 생성
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: { host: 'localhost', port: 5174 },
  preview: { host: 'localhost', port: 4180 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
