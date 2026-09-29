// Inline SVG icons for the DOM HUD and the touch buttons. All drawn here (no image files).
// Icons use currentColor so CSS can tint them.

const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

// five-point star polygon string centered at (cx, cy)
function star(cx, cy, r0, r1) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r1 : r0;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return pts.join(' ');
}

export const ICONS = {
  heart: svg('<path class="heart-fill" d="M12 21.2s-7.6-4.7-9.7-9.5C.8 8.1 3 4.3 6.7 4.3c2.2 0 3.6 1.2 5.3 3.2 1.7-2 3.1-3.2 5.3-3.2 3.7 0 5.9 3.8 4.4 7.4-2.1 4.8-9.7 9.5-9.7 9.5z"/><path class="shine" d="M6.2 7.2c-1.4.3-2.2 1.6-2 3"/>'),
  // police badge: shield with a star
  badge: svg(
    `<path class="shield" d="M12 1.6l2.3 1.7 3-.5 1.2 2.6 2.8 1.2-.6 3c1 2.3.3 5.4-1.8 7.6-1.9 2-4.4 3.3-6.9 5.2-2.5-1.9-5-3.2-6.9-5.2-2.1-2.2-2.8-5.3-1.8-7.6l-.6-3 2.8-1.2 1.2-2.6 3 .5z"/><polygon class="star" points="${star(12, 11.6, 5.4, 2.3)}"/>`,
  ),
  cash: svg('<rect x="2" y="6" width="20" height="12" rx="1.5" class="fill"/><circle cx="12" cy="12" r="3.2" class="cut"/><path class="cut" d="M4.5 9h2M17.5 15h2"/>'),
  rep: svg(`<polygon class="fill" points="${star(12, 12.5, 10, 4.2)}"/>`),
  phone: svg('<path class="fill" d="M6.6 3.5l2.8 3.4-1.7 2.4c1 2.3 2.8 4.1 5 5.1l2.4-1.7 3.4 2.8-1.5 3.2c-7.7-.2-13.8-6.3-14-14z"/>'),
  spray: svg('<rect x="7" y="8" width="8" height="14" rx="2" class="fill"/><rect x="9" y="4.5" width="4" height="3.5" class="fill"/><path class="fill" d="M15 4.5h2v2h-2zM18.5 3h1.5v1.5h-1.5zM18.5 6h1.5v1.5h-1.5z"/>'),
  car: svg('<path class="fill" d="M4 16.5v-4l2.2-5h11.6l2.2 5v4h-2a2 2 0 0 1-4 0H10a2 2 0 0 1-4 0z"/><path class="cut" d="M7.4 11.5l1.3-2.7h6.6l1.3 2.7z"/>'),
  tape: svg('<rect x="2" y="5" width="20" height="14" rx="1.6" class="fill"/><rect x="5" y="8" width="14" height="5.5" rx="1" class="cut"/><circle cx="8.6" cy="10.75" r="1.5" class="fill"/><circle cx="15.4" cy="10.75" r="1.5" class="fill"/><path class="cut" d="M7 19l1.5-3h7l1.5 3z"/>'),
  fist: svg('<path class="fill" d="M5 10.5c0-1.4 1-2.4 2.3-2.4.3-1.2 1.2-2 2.4-2 .8 0 1.5.4 1.9 1 .4-.6 1.1-1 1.9-1 1 0 1.9.7 2.2 1.6.4-.3.9-.4 1.4-.4 1.4 0 2.4 1.1 2.4 2.5v4.4c0 3.6-2.6 6.3-6.3 6.3h-1.6C8.1 20.5 5 17.8 5 14z"/><path class="cut" d="M9.7 8.2v4M13.5 8.2v4M17.1 9.3v3.2"/>'),
  jump: svg('<path class="fill" d="M12 3.5l8 8.2h-4.8V20H8.8v-8.3H4z"/>'),
  sprint: svg('<path class="fill" d="M3.5 5h4.2l6 7-6 7H3.5l6-7zM11 5h4.2l6 7-6 7H11l6-7z"/>'),
  hand: svg('<path class="fill" d="M9 11.5V4.2a1.5 1.5 0 0 1 3 0v6.3-7.4a1.5 1.5 0 0 1 3 0v7.4-5.8a1.5 1.5 0 0 1 3 0v8.8c0 4.2-2.6 7-6.4 7-2.4 0-4-1-5.3-3.1l-2.6-4.2a1.5 1.5 0 0 1 2.4-1.8z"/>'),
  sign: svg('<path class="fill" d="M8.2 12V3.6a1.5 1.5 0 0 1 3 0V10l1.6-6.3a1.5 1.5 0 0 1 2.9.8L14 11.2c1.9.2 3.5 1.8 3.5 3.9 0 3.4-2.6 6-6 6-3.3 0-5.8-2.5-5.8-5.8v-2.5a1.3 1.3 0 0 1 2.5-.8z"/>'),
  map: svg('<path class="fill" d="M2.5 5.5l6-2 7 2 6-2v15l-6 2-7-2-6 2z"/><path class="cut" d="M8.5 3.5v15M15.5 5.5v15"/>'),
  pause: svg('<rect x="5.5" y="4" width="4.5" height="16" rx="1" class="fill"/><rect x="14" y="4" width="4.5" height="16" rx="1" class="fill"/>'),
  horn: svg('<path class="fill" d="M3 9.5h4l7-5v15l-7-5H3z"/><path class="cut-stroke" d="M17 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5M19.5 5.8c2 1.7 3 3.8 3 6.2s-1 4.5-3 6.2"/>'),
  brake: svg('<circle cx="12" cy="12" r="8.6" class="ring"/><circle cx="12" cy="12" r="4.4" class="fill"/><path class="cut-stroke" d="M2.8 5.8A10.5 10.5 0 0 0 2.8 18.2M21.2 5.8a10.5 10.5 0 0 1 0 12.4"/>'),
  close: svg('<path class="cut-stroke" d="M5 5l14 14M19 5L5 19"/>'),
  plus: svg('<path class="cut-stroke" d="M12 4.5v15M4.5 12h15"/>'),
  minus: svg('<path class="cut-stroke" d="M4.5 12h15"/>'),
  target: svg('<circle cx="12" cy="12" r="7" class="ring"/><circle cx="12" cy="12" r="2.4" class="fill"/><path class="cut-stroke" d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>'),
  pin: svg('<path class="fill" d="M12 22.5c-5-6.5-7.8-10-7.8-13.6a7.8 7.8 0 0 1 15.6 0c0 3.6-2.8 7.1-7.8 13.6z"/><circle cx="12" cy="8.9" r="3" class="cut"/>'),
};

export const TOAST_ICONS = {
  cash: ICONS.cash,
  rep: ICONS.rep,
  heat: ICONS.badge,
  phone: ICONS.phone,
  spray: ICONS.spray,
  car: ICONS.car,
  tape: ICONS.tape,
  fist: ICONS.fist,
  star: ICONS.rep,
};
