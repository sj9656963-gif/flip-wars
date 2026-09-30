// 홈 화면 설치(PWA): 서비스 워커 등록(한 번 열면 인터넷 없이도 열림)과 '앱 설치' 버튼.
// 서비스 워커(sw.js)는 빌드할 때 만들어지므로 개발 서버에서는 등록하지 않음.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function initPwa(btn: HTMLButtonElement | null): void {
  let deferred: InstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    if (btn && !isStandalone()) btn.hidden = false;
  });
  btn?.addEventListener('click', () => {
    const ev = deferred;
    if (!ev) return;
    deferred = null;
    btn.hidden = true;
    void ev.prompt().catch(() => undefined);
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    if (btn) btn.hidden = true;
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const q = new URLSearchParams(location.search);
  if (q.has('e2e') && !q.has('sw')) return;
  const register = () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
