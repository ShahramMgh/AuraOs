/* Aura Shell — icon set.
   Thin 1.6px stroke line icons, 24x24, currentColor. Deliberately geometric
   to match the "instrument panel" language rather than filled glyphs. */
const ICON = (() => {
  const s = (body, sz = 24) =>
    `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" ` +
    `stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ` +
    `stroke-linejoin="round">${body}</svg>`;

  // path bodies
  const P = {
    dot:        `<circle cx="12" cy="12" r="3"/>`,
    shield:     `<path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/>`,
    shieldChk:  `<path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>`,
    lock:       `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
    unlock:     `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7-1.5"/>`,
    key:        `<circle cx="8" cy="14" r="4"/><path d="M11 11l8-8M17 5l2 2M14 8l2 2"/>`,
    mic:        `<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>`,
    micOff:     `<path d="M9 5a3 3 0 0 1 6 0v4M15 12.5a3 3 0 0 1-4.5 1.9M6 11a6 6 0 0 0 8.5 5.4M12 17v4"/><path d="M4 4l16 16"/>`,
    camOff:     `<path d="M8 7h6a2 2 0 0 1 2 2v6M16 11l5-3v9l-2-1.2M3.8 7.8A2 2 0 0 0 3 9.4V16a2 2 0 0 0 2 2h8"/><path d="M4 4l16 16"/>`,
    locOff:     `<path d="M8.6 4.9A6 6 0 0 1 18 10c0 1.9-.9 4-2.6 6.6M7.1 7.2A6 6 0 0 0 6 10c0 2.8 2 6 6 11 1-1.2 1.8-2.3 2.6-3.4"/><path d="M4 4l16 16"/>`,
    cam:        `<rect x="3" y="7" width="13" height="11" rx="2"/><path d="M16 11l5-3v9l-5-3z"/>`,
    loc:        `<path d="M12 21c4-5 6-8.2 6-11a6 6 0 1 0-12 0c0 2.8 2 6 6 11z"/><circle cx="12" cy="10" r="2.2"/>`,
    wifi:       `<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8 15.5a5 5 0 0 1 8 0"/><circle cx="12" cy="19" r="1"/>`,
    cell:       `<path d="M4 20v-3M9.3 20v-6M14.6 20v-9M19.9 20v-12"/>`,
    wifiOff:    `<path d="M2 8.5a15 15 0 0 1 8-3.9M14 4.9A15 15 0 0 1 22 8.5M8 15.5a5 5 0 0 1 6-.9"/><circle cx="12" cy="19" r="1"/><path d="M3 3l18 18"/>`,
    bt:         `<path d="M8 7l8 5-4 3V5l4 3-8 5"/>`,
    plane:      `<path d="M12 3c1 0 1.5 1 1.5 3v3l6 3.5v2l-6-2v3.5l2 1.5v1.5L12 21l-3-1.5V18l2-1.5V13l-6 2v-2L11 9V6c0-2 .5-3 1-3z"/>`,
    sun:        `<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>`,
    moon:       `<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>`,
    cloud:      `<path d="M6.5 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 16.6 8.9 4.3 4.3 0 0 1 17.5 18z"/>`,
    rainy:      `<path d="M6.5 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 16.6 5.9 4.3 4.3 0 0 1 17.5 15z"/><path d="M8 18l-1 2.5M12.5 18l-1 2.5M17 18l-1 2.5"/>`,
    snowy:      `<path d="M6.5 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 16.6 5.9 4.3 4.3 0 0 1 17.5 15z"/><path d="M8 18.5h0M12 20h0M16 18.5h0M10 21.5h0M14 17.5h0"/>`,
    bolt:       `<path d="M13 2L5 13h5l-1.5 9L17 10.5h-5z"/>`,
    vol:        `<path d="M4 9v6h4l5 4V5L8 9zM16 9a3 3 0 0 1 0 6M18.5 7a6 6 0 0 1 0 10"/>`,
    net:        `<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><circle cx="12" cy="12" r="3"/>`,
    globe:      `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>`,
    batt:       `<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 11v2"/>`,
    search:     `<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>`,
    grid:       `<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>`,
    list:       `<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>`,
    layers:     `<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/>`,
    android:    `<path d="M7 11a5 5 0 0 1 10 0v6H7z"/><path d="M8.5 7L7 4.5M15.5 7L17 4.5"/><circle cx="10" cy="10.6" r=".7"/><circle cx="14" cy="10.6" r=".7"/>`,
    store:      `<path d="M5 10v9h14v-9"/><path d="M3 10l2-5h14l2 5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M10 19v-5h4v5"/>`,
    gear:       `<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2"/>`,
    back:       `<path d="M15 5l-7 7 7 7"/>`,
    chev:       `<path d="M9 6l6 6-6 6"/>`,
    x:          `<path d="M6 6l12 12M18 6L6 18"/>`,
    check:      `<path d="M5 13l4 4 10-10"/>`,
    power:      `<path d="M12 3v9M6.5 6.5a8 8 0 1 0 11 0"/>`,
    bell:       `<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0"/>`,
    files:      `<path d="M4 6a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>`,
    folder:     `<path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>`,
    file:       `<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>`,
    home:       `<path d="M4 11l8-7 8 7"/><path d="M6 10v9h5v-6h2v6h5v-9"/>`,
    up:         `<path d="M12 19V6M6 11l6-6 6 6"/>`,
    contacts:   `<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6"/>`,
    msg:        `<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4z"/>`,
    phone:      `<path d="M6 3h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>`,
    photo:      `<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-4 4 3 3-2 6 5"/>`,
    map:        `<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>`,
    calc:       `<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0"/>`,
    note:       `<path d="M6 3h9l4 4v14H6zM15 3v4h4"/><path d="M9 12h6M9 16h4"/>`,
    browser:    `<circle cx="12" cy="12" r="9"/><path d="M3 9h18M8 4a13 13 0 0 0 0 16"/>`,
    music:      `<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>`,
    terminal:   `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>`,
    sync:       `<path d="M4 12a8 8 0 0 1 13-6l2 2M20 12a8 8 0 0 1-13 6l-2-2"/><path d="M17 4v4h-4M7 20v-4h4"/>`,
    clock:      `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
    calendar:   `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v4M16 3v4"/>`,
    eye:        `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`,
    trash:      `<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/>`,
    info:       `<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>`,
    chart:      `<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>`,
    cpu:        `<rect x="7" y="7" width="10" height="10" rx="1"/><rect x="10" y="10" width="4" height="4"/><path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2"/>`,
    ram:        `<rect x="3" y="8" width="18" height="9" rx="1"/><path d="M7 17v3M12 17v3M17 17v3M7 11h2M11 11h2M15 11h2"/>`,
    disk:       `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M18 6l-4.5 4.5"/>`,
    restart:    `<path d="M4 12a8 8 0 1 1 2.3 5.6"/><path d="M4 20v-5h5"/>`,
    play:       `<path d="M7 5l12 7-12 7z"/>`,
    globe2:     `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>`,
    spark:      `<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>`,
    brain:      `<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V15a3 3 0 0 0 4 2.8M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V15a3 3 0 0 1-4 2.8M12 4.5v14"/>`,
    stop:       `<rect x="6" y="6" width="12" height="12" rx="2"/>`,
    memory:     `<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5v14M4 9h4M4 13h4M16 9h4M16 13h4"/>`,
    logo:       `<path d="M12 2l8 3.5v6C20 18 16.4 22 12 23.5 7.6 22 4 18 4 11.5v-6z" stroke-width="1.4"/><path d="M12 7v10M8.5 9.5L12 7l3.5 2.5M8.5 14.5L12 17l3.5-2.5" stroke-width="1.4"/>`,
  };

  return {
    icon(name, sz) {
      const b = P[name] || P.dot;
      return s(b, sz);
    }
  };
})();
