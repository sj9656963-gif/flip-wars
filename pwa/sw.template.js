// 땅따먹기 대작전 서비스 워커. 빌드할 때 pwa/vite-plugin-sw.mjs가 VERSION·PRECACHE를 채워 dist/sw.js로 내보냄.
// - 화면(index.html)은 먼저 인터넷에서 새 버전을 확인하고, 안 되면 저장본
// - 이름에 해시가 붙은 스크립트·스타일은 저장본 먼저 (내용이 바뀌면 이름도 바뀜)

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `fw-shell-${VERSION}`;
const FILES = 'fw-files';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // 화면은 브라우저 캐시에 남은 옛 버전이 아니라 서버의 새 버전으로 저장
      .then((c) => c.addAll([new Request('./', { cache: 'reload' }), ...PRECACHE]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set(PRECACHE.map((p) => new URL(p, self.registration.scope).href));
      for (const key of await caches.keys()) {
        if (key.startsWith('fw-shell-') && key !== SHELL) await caches.delete(key);
      }
      const files = await caches.open(FILES);
      for (const req of await files.keys()) {
        if (/\.(js|css)$/.test(new URL(req.url).pathname) && !keep.has(req.url)) await files.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // 새 버전을 올린 직후 옛 화면이 지워진 옛 스크립트를 찾다가 깨지지 않도록 항상 서버에 확인
          const res = await fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }));
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(SHELL).then((c) => c.put('./', copy)));
          }
          return res;
        } catch {
          return (await caches.match('./', { ignoreSearch: true })) ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && url.pathname.includes('/assets/')) {
        const copy = res.clone();
        event.waitUntil(caches.open(FILES).then((c) => c.put(req, copy)));
      }
      return res;
    })(),
  );
});
