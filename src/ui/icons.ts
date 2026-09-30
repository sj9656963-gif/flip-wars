// 카드·화면 아이콘 (SVG 글자로 넣어 기기마다 똑같이 보이게)

import type { CardId } from '../sim/constants';

export const CARD_ICONS: Record<CardId, string> = {
  soldiers:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="7" r="2.7"/><path d="M3.4 20.5v-4.4A3.7 3.7 0 0 1 7.1 12.4h1.8a3.7 3.7 0 0 1 3.7 3.7v4.4z"/><circle cx="16.6" cy="7.8" r="2.4" opacity=".7"/><path d="M13.4 20.5v-3.7a3.3 3.3 0 0 1 3.3-3.3h.6a3.3 3.3 0 0 1 3.3 3.3v3.7z" opacity=".7"/></svg>',
  bomb: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="14" r="7"/><path d="M14.6 8.3 17 5.9" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M19.3 2.6l.5 1.8 1.8.5-1.8.5-.5 1.8-.5-1.8-1.8-.5 1.8-.5z"/></svg>',
  rapid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 1.8 4.4 13.6h6.2l-1.2 8.6 9.3-11.9h-6.3z"/></svg>',
  freeze:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 2.2v19.6M3.5 7.1l17 9.8M20.5 7.1l-17 9.8"/><path d="M9.4 4.1 12 6.3l2.6-2.2M9.4 19.9 12 17.7l2.6 2.2M3.7 10.4l3.3-.8-.8-3.3M20.3 13.6l-3.3.8.8 3.3M6.2 17.7l.8-3.3-3.3-.8M17.8 6.3l-.8 3.3 3.3.8"/></svg>',
  tank: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.4" y="13.2" width="19.2" height="6.6" rx="3.3"/><rect x="6.4" y="8.2" width="9" height="5.6" rx="2"/><path d="M15 10.4h7" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/></svg>',
  mega: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="14.6" cy="12" r="7.6"/><path d="M1.6 8.8h4.6M.9 12h5.2M1.6 15.2h4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

export const UI = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4.2" height="15" rx="1.6"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13.3a7.7 7.7 0 0 0 0-2.6l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.3-1.3L14.4 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.3 1.3l-2.3-1-2 3.4 2 1.6a7.7 7.7 0 0 0 0 2.6l-2 1.6 2 3.4 2.3-1a7.6 7.6 0 0 0 2.3 1.3l.4 2.4h4l.3-2.4a7.6 7.6 0 0 0 2.3-1.3l2.4 1 2-3.4zM12.4 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5 8 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6 4.2 13A5 5 0 0 1 11 5.8l1 .9 1-.9A5 5 0 0 1 19.8 13z"/></svg>',
  aim: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke-linecap="round"/></svg>',
  flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="8.5" height="8.5" rx="1.8" opacity=".55"/><rect x="13" y="2.5" width="8.5" height="8.5" rx="1.8"/><rect x="2.5" y="13" width="8.5" height="8.5" rx="1.8"/><rect x="13" y="13" width="8.5" height="8.5" rx="1.8" opacity=".55"/></svg>',
  gate: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="2.6" height="15" rx="1"/><rect x="19.4" y="5" width="2.6" height="15" rx="1"/><rect x="2" y="4" width="20" height="2.4" rx="1"/><path d="m8.4 9.4 7.2 7.2m0-7.2-7.2 7.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5 7.6 12 12 5l4.4 7L21 8.5 19.3 18H4.7z"/><rect x="4.6" y="19" width="14.8" height="2.4" rx="1"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2 20 5.3v6.1c0 5-3.4 8.7-8 10.4-4.6-1.7-8-5.4-8-10.4V5.3z"/></svg>',
};
