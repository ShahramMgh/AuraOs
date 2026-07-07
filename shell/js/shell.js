/* ============================================================================
   Aura Shell — UI + interaction
   ============================================================================ */
(() => {
  const ic = (n, s) => ICON.icon(n, s);
  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const S = {
    view: 'home',
    history: [],
    controlOpen: false,
    appOpen: null,
    locked: true,
    pin: '',
    pinSheetOpen: false,  // the iOS-style passcode sheet — closed until woken
    ctlTab: 'controls',   // which pull-down panel is showing: 'notifs' | 'controls'
    insTab: null,         // which insight-margin section is expanded (or null)
    homeEdit: false,      // iOS/Android-style home edit mode (long-press to enter)
    pendingNote: null,    // a note to open on the next Notes render (deep search)
    pendingBrowse: null,  // a query/URL to open on the next Browser open (search)
    pendingQuery: null,   // a query to pre-fill the drawer search (AI search action)
    focusSearch: false,   // focus the search field on the next drawer render
  };

  /* ======================================================================
     PERSONALIZATION — device-local UI prefs (wallpaper, home layout).
     Kept in localStorage: a per-device preference, no account, no cloud.
     (Later the AI Engine can propose home layouts; the user's choice wins.)
     ====================================================================== */
  const PREF = {
    get(k, d) { try { const v = localStorage.getItem('sov.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sov.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const WALLPAPERS = [
    { id: 'petrol', name: 'Petrol', css: 'radial-gradient(120% 82% at 50% 6%, #0c1420 0%, #070d15 55%, #04080e 100%)' },
    { id: 'aurora', name: 'Aurora', css: 'radial-gradient(95% 75% at 18% -2%, #0b2f33 0%, #0a1a24 45%, #050b12 100%)' },
    { id: 'dusk',   name: 'Dusk',   css: 'radial-gradient(100% 80% at 78% -4%, #1c1338 0%, #0e1124 50%, #06070f 100%)' },
    { id: 'ember',  name: 'Ember',  css: 'radial-gradient(100% 80% at 26% -2%, #2a1720 0%, #17131f 50%, #08070e 100%)' },
    { id: 'nebula', name: 'Nebula', css: 'radial-gradient(85% 72% at 82% 8%, #17224e 0%, #0c1330 45%, #060814 100%)' },
    { id: 'mono',   name: 'Mono',   css: 'radial-gradient(120% 90% at 50% 0%, #12161c 0%, #0a0d12 55%, #050709 100%)' },
    { id: 'moss',   name: 'Moss',   css: 'radial-gradient(110% 80% at 30% -6%, #0e2620 0%, #08160f 52%, #04090a 100%)' },
    { id: 'dawn',   name: 'Dawn',   css: 'radial-gradient(120% 85% at 50% -10%, #33202b 0%, #1a1420 48%, #0a0810 100%)' },
    { id: 'abyss',  name: 'Abyss',  css: 'radial-gradient(90% 75% at 70% -5%, #0a1f38 0%, #071426 50%, #030710 100%)' },
  ];
  let _wpDaily = null;   // last daily-wallpaper answer (meta or honest failure), for Personalize
  async function applyWallpaper() {
    const setWp = v => document.documentElement.style.setProperty('--wallpaper', v);
    // Live daily wallpaper (opt-in): one Bing image a day, fetched by the agent
    // only because the user turned it on. On any failure we fall through to the
    // local choice — a plain reason shows in Personalize, never a blank screen.
    if (PREF.get('liveWallpaper', false)) {
      const pick = PREF.get('liveWpPick', null);   // a pinned gallery pick beats the daily rotation
      if (pick && pick.urlbase) {
        const u = Sov.wallpaperImageUrlFor(pick.urlbase, 'full');
        if (u) { _wpDaily = Object.assign({ available: true, pinned: true }, pick); return setWp(`center / cover no-repeat url("${u}")`); }
        _wpDaily = { available: false, error: 'Live wallpaper needs the device agent.' };
      } else {
        _wpDaily = await Sov.wallpaperDaily();
        const url = _wpDaily && _wpDaily.available && Sov.wallpaperImageUrl(_wpDaily.date);
        if (url) return setWp(`center / cover no-repeat url("${url}")`);
      }
    } else _wpDaily = null;
    const img = PREF.get('wallpaperImg', null);
    const url = img && Sov.photoUrl ? Sov.photoUrl(img) : null;
    if (url) {   // a photo from ~/Pictures wins over the gradient presets
      setWp(`center / cover no-repeat url("${url}")`);
      return;
    }
    const w = WALLPAPERS.find(x => x.id === PREF.get('wallpaper', 'petrol')) || WALLPAPERS[0];
    setWp(w.css);
  }
  // A photo picker (~/Pictures) → set it as the wallpaper.
  async function openPhotoPicker() {
    const scrim = $('#promptScrim');
    const close = () => { scrim.classList.remove('open'); setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200); };
    const r = await Sov.photos();
    const items = (r && r.items) || [];
    if (!items.length) {
      scrim.innerHTML = `<div class="prompt-card"><div class="pc-title">No photos</div>
        <div class="pc-body">Add images to <b>~/Pictures</b> on the device first.</div>
        <button class="pbtn allow" data-close style="margin-top:12px">OK</button></div>`;
      scrim.classList.add('open'); scrim.querySelector('[data-close]').onclick = close; return;
    }
    scrim.innerHTML = `<div class="prompt-card wp-picker"><div class="pc-title">Choose a photo</div>
      <div class="wp-photos">${items.slice(0, 60).map((it, i) => `<button class="wp-photo" data-i="${i}"><img loading="lazy" src="${Sov.photoUrl(it.rel)}" alt=""></button>`).join('')}</div>
      <button class="pbtn deny" data-close style="margin-top:10px">Cancel</button></div>`;
    scrim.classList.add('open');
    scrim.querySelector('[data-close]').onclick = close;
    scrim.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      PREF.set('wallpaperImg', items[+b.dataset.i].rel); applyWallpaper();
      toast('Wallpaper set', 'ok', 'check'); close();
    });
  }

  // Weather place picker — type a city, pick a match (Open-Meteo geocoding via
  // the agent). Only the chosen coordinates are stored, on-device; GPS is
  // never consulted for the weather.
  function openPlacePicker() {
    const scrim = $('#promptScrim');
    const close = () => { scrim.classList.remove('open'); setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200); };
    scrim.innerHTML = `<div class="prompt-card">
      <div class="pc-title">Weather place</div>
      <div class="pc-body">Type a city — only its coordinates are kept, on this device.</div>
      <input class="pp-input" id="ppQ" type="text" placeholder="e.g. Tehran, Berlin, Osaka" autocomplete="off">
      <div class="pp-results" id="ppResults"></div>
      <button class="pbtn deny" data-close style="margin-top:10px">Cancel</button></div>`;
    scrim.classList.add('open');
    scrim.querySelector('[data-close]').onclick = close;
    const q = $('#ppQ'), out = $('#ppResults');
    let seq = 0;
    q.oninput = async () => {
      const my = ++seq, term = q.value.trim();
      if (term.length < 2) { out.innerHTML = ''; return; }
      out.innerHTML = `<div class="pp-note">Searching…</div>`;
      const r = await Sov.geocode(term);
      if (my !== seq) return;   // a newer keystroke owns the box
      if (!r || r.available === false) { out.innerHTML = `<div class="pp-note">${esc((r && r.error) || 'Search failed.')}</div>`; return; }
      if (!r.results.length) { out.innerHTML = `<div class="pp-note">No places found.</div>`; return; }
      out.innerHTML = r.results.map((p, i) => `
        <button class="pp-item" data-pp="${i}">${ic('map',14)}
          <span class="ppi-text"><span class="ppi-name">${esc(p.name)}</span>
          <span class="ppi-sub">${esc([p.admin, p.country].filter(Boolean).join(' · '))}</span></span></button>`).join('');
      out.querySelectorAll('[data-pp]').forEach(b => b.onclick = async () => {
        const p = r.results[+b.dataset.pp];
        PREF.set('wxPlace', { name: p.name, country: p.country, lat: p.lat, lon: p.lon });
        close();
        await refreshWeather(true);
        if (S.view === 'pz-weather') renderPzWeather();
        else if (S.view === 'personalize') renderPersonalize();
        toast(`Weather set to ${p.name}`, 'ok', 'check');
      });
    };
    setTimeout(() => q.focus(), 50);
  }

  /* Color themes — one accent hue drives the whole appearance: every derived
     token, glow and gradient in auraos.css follows --accent, and the Aura's
     resting light follows it too. Sensor colours stay semantic on any theme. */
  const THEMES = [
    { id: 'teal',    name: 'Signal Teal', accent: '#35BCEE' },
    { id: 'violet',  name: 'Ultraviolet', accent: '#8B7CF6' },
    { id: 'emerald', name: 'Emerald',     accent: '#34D399' },
    { id: 'amber',   name: 'Solar',       accent: '#F5A83C' },
    { id: 'rose',    name: 'Rose',        accent: '#F16E9E' },
    { id: 'ice',     name: 'Glacier',     accent: '#A8C8DE' },
  ];
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function applyTheme() {
    const th = THEMES.find(t => t.id === PREF.get('theme', 'teal')) || THEMES[0];
    document.documentElement.style.setProperty('--accent', th.accent);
    if (typeof Aura !== 'undefined') Aura.setPalette(hexRgb(th.accent));
  }

  /* Live effects — an ambient layer behind home + lock, a motion level, and a
     warm Night Light tint. Pure CSS, chosen by the user, stored on-device. */
  const FX = [
    { id: 'aurora',  name: 'Aurora',        sub: 'Breathing pools of light' },
    { id: 'stars',   name: 'Starfield',     sub: 'A quiet night sky' },
    { id: 'drift',   name: 'Drift',         sub: 'Slow color currents' },
    { id: 'rain',    name: 'Rainfall',      sub: 'Streaks of falling light' },
    { id: 'embers',  name: 'Fireflies',     sub: 'Drifting motes of light' },
    { id: 'weather', name: 'Match the sky', sub: 'Follows live weather' },
    { id: 'off',     name: 'Minimal',       sub: 'No ambient layer' },
  ];
  const FX_LEVELS = [
    { id: 'still', name: 'Still' }, { id: 'calm', name: 'Calm' }, { id: 'vivid', name: 'Vivid' },
  ];

  /* ---- Live weather (opt-in) ----------------------------------------------
     Conditions from Open-Meteo, via the agent, for a place the user typed in
     (never GPS). Off by default; the Personalize toggle is the consent. Feeds
     a small reading on home + lock, and — if the ambient effect is set to
     "Match the sky" — drives which ambient layer plays. */
  let _wx = { at: 0, data: null };
  const weatherOn = () => PREF.get('weatherOn', false) && !!PREF.get('wxPlace', null);
  // WMO weather code → the ambient effect that matches the sky.
  const WX_FX = (code, isDay) =>
    code >= 95 ? 'storm'
    : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow'
    : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? 'rain'
    : code >= 1 ? 'drift'
    : isDay ? 'aurora' : 'stars';
  const wxIcon = w =>
    w.code >= 95 ? 'bolt'
    : (w.code >= 71 && w.code <= 77) || w.code === 85 || w.code === 86 ? 'snowy'
    : (w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 82) ? 'rainy'
    : w.code >= 2 ? 'cloud'
    : w.isDay ? 'sun' : 'moon';
  async function refreshWeather(force) {
    if (!weatherOn()) { _wx = { at: 0, data: null }; applyEffects(); paintWeather(); return null; }
    if (!force && _wx.data && Date.now() - _wx.at < 15 * 60000) return _wx.data;
    const p = PREF.get('wxPlace', null);
    _wx = { at: Date.now(), data: await Sov.weather(p.lat, p.lon) };
    applyEffects();     // "Match the sky" may need a different layer now
    paintWeather();
    return _wx.data;
  }
  const wxReading = w => `${Math.round(w.temp)}° · ${w.label}`;
  function paintWeather() {
    const el = $('#homeWx'); if (!el) return;
    const w = weatherOn() && _wx.data && _wx.data.available ? _wx.data : null;
    el.innerHTML = w ? `${ic(wxIcon(w), 14)}<span>${esc(wxReading(w))}</span>` : '';
    el.classList.toggle('on', !!w);
    // The reading loads after the hero was laid out; re-measure so a tall/
    // wrapped reading grows the reservation instead of overlapping below it.
    requestAnimationFrame(reconcileClockSpan);
  }

  function applyEffects() {
    const root = document.documentElement;
    let fx = PREF.get('fx', 'aurora');
    if (fx === 'weather') {
      const w = _wx.data && _wx.data.available ? _wx.data : null;
      // no reading (yet, or weather off) → a calm default, not a guess
      fx = w ? WX_FX(w.code, w.isDay) : 'aurora';
    }
    root.dataset.fx = fx;
    root.dataset.fxLevel = PREF.get('fxLevel', 'calm');
    $('#device').classList.toggle('nightlight', PREF.get('nightlight', false));
  }

  /* Appearance — how the menus and surfaces are built (Personalize › Menus &
     surfaces). Three device-local switches, all pure CSS via data attributes:
     a light/dark token set for menus (home + lock keep the night language, so
     their text stays on the wallpaper where it belongs), a glass level
     (frosted / glass / solid) for how translucent surfaces are, and an
     adjustable wallpaper-contrast scrim so content stays readable on a light
     photo. */
  const GLASS_MODES = [
    { id: 'frosted', name: 'Frosted' },
    { id: 'glass',   name: 'Glass' },
    { id: 'solid',   name: 'Solid' },
  ];
  const wpScrim = () => Math.max(0, Math.min(70, Math.round(+PREF.get('wpScrim', 0) || 0)));
  function applyAppearance() {
    const root = document.documentElement;
    root.dataset.ui = PREF.get('uiTheme', 'dark') === 'light' ? 'light' : 'dark';
    const g = PREF.get('glass', 'glass');
    root.dataset.glass = GLASS_MODES.some(x => x.id === g) ? g : 'glass';
    root.style.setProperty('--wp-scrim', `rgba(2, 5, 9, ${(wpScrim() / 100).toFixed(2)})`);
  }

  /* Icon pack — the shape language of app icons (home tiles, the focus card
     and the drawer) plus whether labels sit under home tiles. Pure CSS
     switches driven by data attributes; stored on-device like the rest. */
  const TILE_SHAPES = [
    { id: 'squircle', name: 'Squircle' },
    { id: 'round',    name: 'Round' },
    { id: 'sharp',    name: 'Sharp' },
  ];
  function applyIconStyle() {
    const root = document.documentElement;
    const s = PREF.get('tileShape', 'squircle');
    root.dataset.tiles = TILE_SHAPES.some(t => t.id === s) ? s : 'squircle';
    root.dataset.tileLabels = PREF.get('tileLabels', true) ? 'on' : 'off';
  }

  /* Typeface + text size (Personalize › Appearance). Device-local, applied by
     overriding the --font root variable and a --ui-scale zoom that reflows the
     menu/app/lock text. Every stack ends in system fonts, so a choice degrades
     gracefully to whatever the image actually ships — no web fonts, no egress. */
  const FONTS = [
    { id: 'system',  name: 'Aura',    sub: 'Ubuntu — the default', stack: "'Ubuntu','Inter',-apple-system,'Segoe UI',system-ui,sans-serif" },
    { id: 'inter',   name: 'Inter',   sub: 'Clean & neutral',      stack: "'Inter','Noto Sans','Ubuntu',system-ui,sans-serif" },
    { id: 'rounded', name: 'Rounded', sub: 'Soft & friendly',      stack: "'Nunito','Quicksand','Comfortaa','Ubuntu',system-ui,sans-serif" },
    { id: 'serif',   name: 'Serif',   sub: 'Editorial',            stack: "'Noto Serif','DejaVu Serif',Georgia,'Times New Roman',serif" },
    { id: 'mono',    name: 'Mono',    sub: 'Technical',            stack: "'Ubuntu Mono','DejaVu Sans Mono',ui-monospace,monospace" },
  ];
  const FONT_SIZES = [
    { id: 's',  name: 'Small',   scale: 0.92 },
    { id: 'm',  name: 'Default', scale: 1 },
    { id: 'l',  name: 'Large',   scale: 1.1 },
    { id: 'xl', name: 'Larger',  scale: 1.22 },
  ];
  const fontFace = () => { const f = PREF.get('fontFace', 'system'); return FONTS.some(x => x.id === f) ? f : 'system'; };
  const fontSizeId = () => { const s = PREF.get('fontSize', 'm'); return FONT_SIZES.some(x => x.id === s) ? s : 'm'; };
  const fontScale = () => (FONT_SIZES.find(x => x.id === fontSizeId()) || FONT_SIZES[1]).scale;
  function applyFont() {
    const root = document.documentElement;
    root.style.setProperty('--font', (FONTS.find(f => f.id === fontFace()) || FONTS[0]).stack);
    root.style.setProperty('--ui-scale', String(fontScale()));
  }

  /* ---- top-level layout --------------------------------------------------- */
  const device = $('#device');
  device.innerHTML = `
    <div id="pane"></div>
    <div class="agent-badge" id="agentBadge">SIM</div>
    <div id="stage">
      <div class="view" id="v-home"></div>
      <div class="view" id="v-drawer"><div class="view-scroll" id="drawerScroll"></div></div>
      <div class="view" id="v-screen"><div class="view-scroll" id="screenScroll"></div></div>
    </div>
    <div id="control"><div class="ctl-inner"><div class="ctl-grip"></div><div id="controlBody"></div></div></div>
    <div id="helm">
      <button class="helm-back" id="helmBack">${ic('back',20)}<span>Back</span></button>
      <button class="home-orb" id="homeOrb" aria-label="Home"><canvas class="orb-aura" id="orbAura"></canvas></button>
      <button class="helm-activity" id="helmAct"><span class="actcount" id="actCount">0</span></button>
    </div>
    <div id="radial"></div>
    <div id="appframe"></div>
    <div id="liveWins"></div>
    <div id="recents"></div>
    <div id="insScrim"></div>
    <div id="insight" class="side-left hidden"></div>
    <div id="promptScrim"></div>
    <div id="toast"></div>
    <div id="boot">
      <div class="boot-mark" style="color:var(--accent)">${ic('logo',76)}</div>
      <div class="boot-name">Aura</div>
      <div class="boot-bar"><span></span></div>
    </div>
    <div id="lock"></div>
  `;

  /* ======================================================================
     STATUS PANE
     ====================================================================== */
  function renderPane(st) {
    const sensors = Object.entries(st.sensors);
    const sensorHTML = sensors.length ? `<div id="paneSensors">${
      [...new Set(sensors.map(([k]) => k))].map(k => {
        const lbl = { mic: 'Mic', cam: 'Cam', loc: 'GPS' }[k];
        return `<span class="sig ${k}"><span class="dot"></span>${lbl}</span>`;
      }).join('')
    }</div>` : '';

    const b = st.battery;
    const bcls = b.level <= 10 ? 'crit' : b.level <= 20 ? 'low' : '';
    const net = st.net.airplane ? `${ic('plane',14)}`
      : st.net.wifi ? `${ic('wifi',14)}`
      : `${ic('wifiOff',14)}`;

    const unseen = Sov.notify.unseen();
    const dnd = Sov.notify.dnd();
    // The bell is always present: it's the handle for the notification panel.
    const notifHTML = dnd
      ? `<span class="pane-notif dnd" title="Do Not Disturb">${ic('bell',13)}<span class="pn-slash"></span></span>`
      : `<span class="pane-notif${unseen ? '' : ' idle'}" title="Notifications">${ic('bell',13)}${
          unseen ? `<span class="pn-count">${unseen > 9 ? '9+' : unseen}</span>` : ''}</span>`;

    const day = (st.date || '').split(',')[0].slice(0, 3);
    $('#pane').innerHTML = `
      <span class="pane-time">${st.time}</span>
      ${day ? `<span class="pane-date">${esc(day)}</span>` : ''}
      ${st.net.vpn ? `<span class="pane-chip">VPN</span>` : ''}
      <span class="pane-spacer"></span>
      ${sensorHTML}
      ${notifHTML}
      ${_cellStatus && _cellStatus.present
        ? `<span class="pane-cell${_cellStatus.dataConnected ? ' on' : ''}" title="${esc(_cellStatus.operator || 'Cellular')}">${ic('cell',12)}${_cellStatus.tech ? `<span class="pane-tech">${esc(String(_cellStatus.tech).toUpperCase())}</span>` : ''}</span>`
        : ''}
      <span class="pane-net">${net}</span>
      ${st.net.bluetooth ? `<span class="pane-net">${ic('bt',13)}</span>` : ''}
      <span class="pane-batt ${bcls}">
        <span class="batt-gauge"><span class="batt-fill" style="width:${Math.max(8, Math.min(100, b.level))}%"></span></span>
        <span class="b-pct">${b.level}%</span>${b.charging ? ic('power',11) : ''}</span>
    `;
  }

  /* ======================================================================
     HELM
     ====================================================================== */
  function updateHelm() {
    const canBack = S.history.length > 0 || S.view === 'drawer';
    $('#helmBack').classList.toggle('show', canBack && !S.appOpen);
    const n = Sov.running().length;
    $('#actCount').textContent = n;
    $('#helmAct').style.opacity = n ? '1' : '.4';
  }

  /* ======================================================================
     HOME
     ====================================================================== */
  // Home = a calm, modern launcher driven by home.config.json: a glass "focus"
  // card for what the AI suggests right now, over a clean grid of glass app
  // tiles. In Phase II the AI Engine rewrites that config (focus + which apps
  // are featured, and their order) from time of day and learned routine; here we
  // just render whatever it holds. Tapping runs the shell's normal launch flow,
  // so permissions + the live ribbon are untouched. Full A–Z grid is in the drawer.
  let HOME_CFG = null;   // cached config, preloaded at boot
  // Play the staggered entrance only when we arrive at home (via go('home')),
  // not on the ~20s in-place state re-renders — otherwise the tiles would pop
  // every refresh. Set true on navigation, consumed once per render.
  let _animateHome = true;

  // ---- home clock widget ---------------------------------------------------
  // A choosable widget, Android-style: several visual styles + a position.
  // Stored per-device in PREF (clockStyle / clockAlign); rendered here and
  // patched in place on each tick (paintHomeClock) so animations don't restart.
  const CLOCK_STYLES = [
    { id: 'aura',    name: 'Aura',    sub: 'Soft & luminous' },
    { id: 'stacked', name: 'Stacked', sub: 'Hours over minutes' },
    { id: 'minimal', name: 'Minimal', sub: 'Quiet & thin' },
    { id: 'mono',    name: 'Mono',    sub: 'Technical' },
    { id: 'words',   name: 'Words',   sub: 'Time, in words' },
    { id: 'analog',  name: 'Analog',  sub: 'Classic face' },
  ];
  const clockStyle = () => { const s = PREF.get('clockStyle', 'aura'); return CLOCK_STYLES.some(c => c.id === s) ? s : 'aura'; };
  const clockAlign = () => { const a = PREF.get('clockAlign', 'center'); return a === 'left' || a === 'right' ? a : 'center'; };
  // Continuous size, not a binary preset: drag the handle in edit mode, or
  // pick a quick preset in Personalize — both write the same number. Falls
  // back to the old regular/large preset once, for anyone who set it before.
  let _clockScaleLive = null;   // transient scale while the resize handle is mid-drag
  const clockScale = () => {
    if (_clockScaleLive != null) return _clockScaleLive;
    const v = PREF.get('clockScale', null);
    if (v != null) return Math.max(.7, Math.min(1.8, +v || 1));
    return PREF.get('clockSize', 'regular') === 'large' ? 1.3 : 1;
  };
  /* ---- home WIDGETS live in the page grid ---------------------------------
     One positioning system for everything on home: a page is a fixed-slot grid
     (3 columns × N rows spanning the full page height), icons occupy one cell,
     and widgets (clock hero · focus card · Up next) occupy full-width row
     spans at an explicit row. Because widgets and icons share the same grid,
     nothing can ever overlap: widget-covered cells are BLOCKED for tiles, a
     repair pass relocates any tile that would collide (see homeLayout), and
     widgets that would overlap each other are pushed apart, the most recently
     moved one winning a contested row. In edit mode a widget drags vertically
     and snaps to a row, exactly like icons snap to cells.
     Stored as PREF 'homeWidgets': { clock: {page,row,seq}, focus: …, upnext: … }
     — row null means "auto: stack after the previous widget". */
  const W_ORDER = ['clock', 'focus', 'upnext', 'search'];
  // The clock hero's row span follows its TRUE height, so growing the clock —
  // by scale, style, or switching weather on — can never spill onto the rows
  // below it: the grid reserves exactly enough rows, never fewer.
  const ROW_H = () => 84 + 14;                   // grid-auto-rows + row-gap (see CSS)
  // The non-scaling parts of the hero, stacked under the clock face. These do
  // NOT zoom (only .clockw does — see CSS), so they're a fixed pixel budget.
  const HERO_DATE_H   = 24;                       // date line + its margin-top
  const HERO_WX_H     = 23;                       // weather line + its margin-top (opt-in)
  const HERO_STATUS_H = 45;                       // privacy status pill + its margin-top
  // The clock face height per style at scale 1 — the part that zoom() grows.
  // Kept slightly generous; the post-render measure below is the real backstop.
  const CLOCK_FACE_H = { aura: 74, minimal: 50, mono: 54, stacked: 120, analog: 132, words: 116 };
  // What identifies a hero layout for measurement caching: anything that
  // changes its height. Weather counts as ON the moment it's opted in, so the
  // row is reserved BEFORE the async reading pops in — no late overlap.
  const clockKey = () => `${clockStyle()}|${clockScale().toFixed(3)}|${weatherOn() ? 1 : 0}`;
  let _clockMeasure = { key: null, h: 0 };        // last measured hero height, keyed
  // Analytic height of the hero (before we've measured the real thing): the
  // scaling face + the fixed stack + weather when it's opted in.
  function estHeroHeight() {
    const face = (CLOCK_FACE_H[clockStyle()] || CLOCK_FACE_H.aura) * clockScale();
    return face + HERO_DATE_H + (weatherOn() ? HERO_WX_H : 0) + HERO_STATUS_H;
  }
  function widgetSpan(id) {
    // +row-gap: N spanned rows give N*84 + (N-1)*14 of height, so the content
    // must fit N*ROW_H - 14 — without this, a mid-scale clock could overhang
    // its last reserved row by a few pixels and shade the row below.
    if (id === 'clock') {
      // Estimate is the floor (it already reserves for opted-in weather); a
      // real measurement of the current layout can only push it TALLER, never
      // shorter — so tall styles/fonts can't underflow into an overlap.
      const measured = _clockMeasure.key === clockKey() ? _clockMeasure.h : 0;
      const h = Math.max(estHeroHeight(), measured);
      return Math.max(2, Math.ceil((h + 14) / ROW_H()));
    }
    return 1;                                    // focus card · Up next · search: one row each
  }
  // After a home render, measure the clock hero for real and, if it's taller
  // than we reserved (an odd font, a locale, a style we under-guessed), grow
  // the span and re-render once. Idempotent: the second pass measures the same
  // height, the cache already holds it, so it stops. The no-overlap backstop.
  function reconcileClockSpan() {
    if (_clockScaleLive != null) return;          // mid resize-drag: estimate governs
    const hero = document.querySelector('.hw-clock .aura-hero');
    if (!hero) return;
    const key = clockKey(), h = hero.offsetHeight;
    const known = _clockMeasure.key === key ? _clockMeasure.h : 0;
    if (h <= known) return;                        // nothing new to learn
    const before = widgetSpan('clock');
    _clockMeasure = { key, h };
    if (widgetSpan('clock') > before) renderHome(); // reservation grew → reflow
  }
  // Where the search pill sits when the user hasn't placed it: the bottom row
  // of the page (a launcher's search belongs near the thumb), measured from
  // the pager if it's live, else estimated from the stage.
  function defaultSearchRow() {
    const pager = $('#homePager'), stage = $('#stage');
    const h = (pager && pager.clientHeight)
      || ((stage && stage.clientHeight ? stage.clientHeight : 640) - 96);
    return Math.max(3, Math.floor(h / ROW_H()) - 1);
  }
  // How many icon slots one home page really holds: the rows that FIT the
  // pager, times 3 columns. A page is a fixed canvas, never a scroll — this
  // is the ceiling the overflow pass enforces (see homeLayout).
  function pageCap() {
    const pager = $('#homePager'), stage = $('#stage');
    const h = (pager && pager.clientHeight)
      || ((stage && stage.clientHeight ? stage.clientHeight : 640) - 96);
    return Math.max(4, Math.floor(h / ROW_H())) * 3;
  }
  // Icons the overflow pass displaced onto a later page — the ONLY ones the
  // backfill pass may pull back when space frees up. In-session only: after a
  // reload (or a manual drag, which clears it) the layout is settled history.
  const _overflowed = new Set();
  function widgetPos() {
    let w = PREF.get('homeWidgets', null);
    if (!w || typeof w !== 'object') {
      // one-time migration from the old free-floating clock (percent anchor):
      // its vertical percent maps to the nearest row; the overlay days are over.
      const legacyRow = PREF.get('clockFree', false)
        ? Math.max(0, Math.min(6, Math.round(((+PREF.get('clockPY', 15) || 15) / 100) * 6))) : 0;
      w = { clock: { page: 0, row: legacyRow || null, seq: 0 } };
    }
    return w;
  }
  // Which widgets exist right now, with their rows resolved per page: fixed
  // rows first (recently-moved wins a tie), then autos stacked underneath —
  // and any widget overlap resolved by pushing the later one down.
  function resolveWidgets(showFocus, pageCount) {
    const pos = widgetPos();
    const act = [];
    const add = (id, on) => {
      if (!on) return;
      const p = pos[id] || {};
      let row = (p.row == null ? null : Math.max(0, p.row | 0));
      // the search pill defaults to the bottom row, not the top auto-stack
      if (id === 'search' && row == null) row = defaultSearchRow();
      act.push({ id, span: widgetSpan(id),
        page: Math.max(0, Math.min((pageCount || 1) - 1, p.page || 0)),
        row, seq: p.seq || 0 });
    };
    add('clock', true);
    add('focus', showFocus);
    // "Up next" only exists when there IS a next event — an empty widget
    // would block a whole grid row and read as a dead band under the clock.
    add('upnext', PREF.get('upnext', true) && !!_upnext.ev);
    add('search', PREF.get('homeSearchBar', true));
    const byPage = {};
    act.forEach(w => (byPage[w.page] = byPage[w.page] || []).push(w));
    Object.values(byPage).forEach(list => {
      // One vertical stack, top to bottom. A fixed row is an ANCHOR (recently
      // moved wins a contested row); autos keep W_ORDER and flow into the
      // earliest open space. Crucially, a widget that grows or moves pushes
      // everything after it DOWN — a fixed widget below never makes a growing
      // one jump around it, it yields and slides down instead.
      const fixedQ = list.filter(w => w.row != null).sort((a, b) => a.row - b.row || b.seq - a.seq);
      const autoQ = list.filter(w => w.row == null);
      let next = 0;
      while (fixedQ.length || autoQ.length) {
        let w;
        if (fixedQ.length && (!autoQ.length || fixedQ[0].row <= next)) {
          w = fixedQ.shift(); w.row = Math.max(w.row, next);
        } else {
          w = autoQ.shift(); w.row = next;
        }
        next = w.row + w.span;
      }
    });
    return act;
  }
  // Every grid cell a page's widgets cover — blocked for icons.
  function blockedSlotSet(widgets, pi) {
    const s = new Set();
    widgets.forEach(w => {
      if (w.page !== pi) return;
      for (let r = w.row; r < w.row + w.span; r++)
        for (let c = 0; c < 3; c++) s.add(r * 3 + c);
    });
    return s;
  }
  // Nearest non-blocked slot to `slot` (occupied is fine — tile-tile drops
  // swap). Guarantees a tile can never be dropped under a widget.
  function freeSlotNear(slot, blocked) {
    if (!blocked.has(slot)) return slot;
    for (let d = 1; d < 60; d++) {
      if (!blocked.has(slot + d)) return slot + d;
      if (slot - d >= 0 && !blocked.has(slot - d)) return slot - d;
    }
    return slot;
  }

  // The time, spelled out (nearest five), for the "Words" style — calm and human.
  const _NUM = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
  const _MW = { 5: 'five', 10: 'ten', 15: 'a quarter', 20: 'twenty', 25: 'twenty-five', 30: 'half' };
  function timeWords(time) {
    const p = String(time || '').split(':');
    let h = (parseInt(p[0], 10) || 0) % 12, r = Math.round((parseInt(p[1], 10) || 0) / 5) * 5;
    if (r === 60) { r = 0; h = (h + 1) % 12; }
    if (r === 0) return `${_NUM[h]} o'clock`;
    if (r <= 30) return `${_MW[r]} past ${_NUM[h]}`;
    return `${_MW[60 - r]} to ${_NUM[(h + 1) % 12]}`;
  }

  // The inner markup for a given style + time (also used for the Personalize preview).
  function clockInner(style, time) {
    const p = String(time || '').split(':'), hh = p[0] || '--', mm = p[1] || '--';
    if (style === 'words') return `<span class="cl-words">${timeWords(time)}</span>`;
    if (style === 'stacked') return `<span class="cl-hh">${hh}</span><span class="cl-mm">${mm}</span>`;
    if (style === 'analog') {
      const h = ((parseInt(hh, 10) % 12) + (parseInt(mm, 10) || 0) / 60) * 30, m = (parseInt(mm, 10) || 0) * 6;
      return `<svg class="cl-face" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="cl-ring" cx="50" cy="50" r="46"/>
          ${[0,1,2,3,4,5,6,7,8,9,10,11].map(i => `<line class="cl-tick" x1="50" y1="6" x2="50" y2="${i % 3 ? 10 : 13}" transform="rotate(${i * 30} 50 50)"/>`).join('')}
          <line class="cl-h" x1="50" y1="53" x2="50" y2="28" transform="rotate(${h} 50 50)"/>
          <line class="cl-m" x1="50" y1="55" x2="50" y2="15" transform="rotate(${m} 50 50)"/>
          <circle class="cl-cap" cx="50" cy="50" r="3.4"/>
        </svg>`;
    }
    return `<span class="cl-time">${time || '--:--'}</span>`;   // aura · minimal · mono
  }
  function clockWidgetHTML(st) {
    const style = clockStyle();
    return `<div class="clock-widget-wrap">
      <div id="homeClock" class="clockw cw-${style}" data-style="${style}">${clockInner(style, st.time)}</div>
      <span class="clk-resize" id="clkResize" aria-hidden="true">${ic('chev', 10)}</span>
    </div>`;
  }
  // Patch the live clock without rebuilding it (keeps the sheen animation smooth).
  function paintHomeClock(st) {
    const el = $('#homeClock'); if (!el) return;
    const style = el.dataset.style, p = String(st.time || '').split(':'), hh = p[0] || '--', mm = p[1] || '--';
    if (style === 'words') {
      const w = el.querySelector('.cl-words'); if (w) w.textContent = timeWords(st.time);
    } else if (style === 'stacked') {
      const a = el.querySelector('.cl-hh'), b = el.querySelector('.cl-mm');
      if (a) a.textContent = hh; if (b) b.textContent = mm;
    } else if (style === 'analog') {
      const h = ((parseInt(hh, 10) % 12) + (parseInt(mm, 10) || 0) / 60) * 30, m = (parseInt(mm, 10) || 0) * 6;
      const hEl = el.querySelector('.cl-h'), mEl = el.querySelector('.cl-m');
      if (hEl) hEl.setAttribute('transform', `rotate(${h} 50 50)`);
      if (mEl) mEl.setAttribute('transform', `rotate(${m} 50 50)`);
    } else {
      const t = el.querySelector('.cl-time'); if (t) t.textContent = st.time;
    }
  }

  // ---- "Up next" home widget -----------------------------------------------
  // The next real calendar event, from the same store the Calendar app uses
  // (Sov.calendar → /api/calendar live, the SIM store offline). Real data only:
  // when nothing is scheduled in the next week, the widget simply isn't there.
  let _upnext = { at: 0, ev: null };
  const _localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function nextEvent(events) {
    const now = new Date(), today = _localISO(now);
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const horizon = _localISO(new Date(now.getTime() + 7 * 864e5));
    return (events || [])
      .filter(e => e && e.date && e.date >= today && e.date <= horizon
        && !(e.date === today && e.time && e.time < hhmm))   // today's past events are over
      .sort((a, b) => ((a.date + (a.time || '99')) < (b.date + (b.time || '99')) ? -1 : 1))[0] || null;
  }
  function upNextWhen(ev) {
    const today = _localISO(new Date()), tomorrow = _localISO(new Date(Date.now() + 864e5));
    const day = ev.date === today ? 'Today' : ev.date === tomorrow ? 'Tomorrow'
      : new Date(ev.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short' });
    return ev.time ? `${day} · ${ev.time}` : day;
  }
  async function paintUpNext() {
    if (!PREF.get('upnext', true)) { const s = $('#upnextSlot'); if (s) s.innerHTML = ''; return; }
    if (Date.now() - _upnext.at > 60000) {   // fresh enough for a home widget, cheap on the agent
      _upnext.at = Date.now();
      try { _upnext.ev = nextEvent(await Sov.calendar.list()); } catch (e) { _upnext.ev = null; }
    }
    // The widget exists only while an event does (resolveWidgets) — when that
    // changes, the grid reshapes, so re-render instead of patching. Never
    // mid-edit: yanking a row out from under a drag would be hostile.
    const slot = $('#upnextSlot');
    if (!!_upnext.ev !== !!slot) {
      if (S.view === 'home' && !S.appOpen && !S.homeEdit) renderHome();
      return;
    }
    if (!slot) return;
    const ev = _upnext.ev;
    const key = ev ? `${ev.id}|${ev.title}|${ev.date}|${ev.time}` : '';
    if (slot.dataset.k === key) return;   // patch only on change, so ticks don't re-pop it
    slot.dataset.k = key;
    if (!ev) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <button class="upnext" data-upnext>
        <span class="un-ic">${ic('calendar', 18)}</span>
        <span class="un-text"><span class="un-eyebrow">Up next</span><span class="un-title">${esc(ev.title || 'Event')}</span></span>
        <span class="un-when">${esc(upNextWhen(ev))}</span>
      </button>`;
    slot.querySelector('[data-upnext]').onclick = () => {
      _calSel = ev.date; _calYM = { y: +ev.date.slice(0, 4), m: +ev.date.slice(5, 7) - 1 };
      go('calendar');
    };
  }

  // A short, human tagline for the focus card per app (config may override with
  // focusTag). Keeps the hero card feeling like an invitation, not a shortcut.
  const FOCUS_TAG = {
    assistant: 'Ask me anything…', phone: 'Call someone', messages: 'Start a conversation',
    browser: 'Search the web', camera: 'Capture the moment', maps: 'Find your way',
    music: 'Play something', notes: 'Jot something down', files: 'Browse your files',
    photos: 'Look back', settings: 'Tune your device', clock: 'Set an alarm',
    contacts: 'Find someone', calc: 'Crunch the numbers', terminal: 'Open a shell',
  };

  // The home layout comes from config, but the user's own choices (Personalize +
  // drag-to-reorder) override it and persist per-device.
  // Home apps live on one or more pages (Android/iOS style). Stored as an array
  // of arrays of app ids in PREF 'homePages'; migrated once from the old single
  // 'homeApps' list. The focus app is the hero card, so it's filtered out of the
  // grids, and no app appears on two pages.
  function homePagesIds() {
    let pages = PREF.get('homePages', null);
    if (!Array.isArray(pages) || !pages.length) {
      const cfg = HOME_CFG || Sov._homeCfgSync();
      const single = PREF.get('homeApps', null) || (cfg.nodes || []).map(n => n.app);
      pages = [Array.isArray(single) ? single : []];
    }
    return pages;
  }
  // A home tile id is a built-in app id, "android:<package>" for an Android
  // app, or "desktop:<desktop-id>" for a native Linux app discovered from the
  // agent's registry — resolve any of them to a tile object. Desktop apps are
  // remembered in PREF 'desktopApps' the moment one is added to home, so home
  // can draw the tile without waiting for the drawer's async catalog.
  function resolveHomeApp(id) {
    if (id && id.indexOf('android:') === 0) {
      const pkg = id.slice(8), names = PREF.get('androidApps', {});
      return { id, pkg, android: true, name: names[pkg] || pkg, glyph: 'android', color: '#2BA869' };
    }
    if (id && id.indexOf('desktop:') === 0) {
      const did = id.slice(8);
      const reg = PREF.get('desktopApps', {})[did]
        || (INSTALLED || []).filter(a => a.id === did)
          .map(a => ({ name: a.name, icon: !!a.icon, glyph: catIcon(a.categories) }))[0];
      if (!reg) return null;
      return { id, did, desktop: true, name: reg.name || did, glyph: reg.glyph || 'grid',
        color: '#5C7A99', iconUrl: reg.icon && Sov.appIconUrl ? Sov.appIconUrl(did) : null };
    }
    return Sov.app(id);
  }
  const onHomeAlready = id => homePagesIds().some(p => (p || []).includes(id));
  // Put any app onto the home screen, the way a phone drops a new app there:
  // the first empty slot (a gap) if one exists, else the end of the last page.
  // homeLayout's overflow pass then reflows it onto a further page (creating
  // one if needed) when that page is already full — never below the fold.
  function addToHome(id) {
    const pgs = homePagesIds().map(p => (p || []).slice());
    if (!pgs.length) pgs.push([]);
    if (pgs.some(p => p.includes(id))) return false;
    let placed = false;
    for (const p of pgs) { const e = p.indexOf(null); if (e !== -1) { p[e] = id; placed = true; break; } }
    if (!placed) pgs[pgs.length - 1].push(id);
    PREF.set('homePages', pgs);
    return true;
  }
  // Take an app off home: null the slot (keep positions) rather than filter,
  // which would shift every later icon up a cell.
  function removeFromHome(id) {
    PREF.set('homePages', homePagesIds().map(p => (p || []).map(a => a === id ? null : a)));
  }
  // A freshly-installed Android app lands on home like any other app.
  function addAndroidToHome(pkg, name) {
    const names = PREF.get('androidApps', {}); names[pkg] = name || pkg; PREF.set('androidApps', names);
    addToHome('android:' + pkg);
    _androidApps = null;   // drawer refetches
  }
  // Uninstalling an Android app removes it from home + name map everywhere.
  function removeAndroidFromHome(pkg) {
    const id = 'android:' + pkg;
    const names = PREF.get('androidApps', {}); delete names[pkg]; PREF.set('androidApps', names);
    // null the slot (keep positions) rather than filter, which would shift every
    // later icon up a cell; trailing nulls are trimmed on the next drag persist.
    PREF.set('homePages', homePagesIds().map(p => (p || []).map(x => x === id ? null : x)));
    _androidApps = null;
  }
  function homeLayout() {
    const cfg = HOME_CFG || Sov._homeCfgSync();
    const apps = Sov.apps();
    const byId = id => apps.find(a => a.id === id);
    const focus = byId(PREF.get('focus', null) || cfg.focus) || byId('assistant') || apps[0];
    const showFocus = focus.id !== 'assistant';   // the Aura orb IS the assistant

    let raw = homePagesIds().map(p => (p || []).slice());
    if (!raw.length) raw = [[]];
    const widgets = resolveWidgets(showFocus, raw.length);

    // REPAIR PASS — the no-overlap guarantee. Widgets and icons share one slot
    // grid; any icon sitting in a cell a widget now covers (the clock grew, a
    // widget was dragged here, a proposal packed slots 0..n) is relocated to
    // the first free, unblocked cell. Deterministic, and persisted so the
    // layout is stable on the next render.
    let changed = false;
    const cap = pageCap();
    // Sequential so an overflowing page can spill into the next one, and THAT
    // page's own pass then handles what arrived (raw can grow mid-loop).
    for (let pi = 0; pi < raw.length; pi++) {
      const p = raw[pi];
      const blocked = blockedSlotSet(widgets, pi);
      // Push-down repair: an icon in a widget-covered cell shifts into the
      // next open cell, rippling the icons after it along (order preserved);
      // deliberate gaps further down absorb the shift. So a growing widget
      // pushes icons downward like a physical stack — never on top of them,
      // and never teleporting one to some far free cell.
      const q = [];
      for (let s = 0; s < p.length || q.length; s++) {
        if (blocked.has(s)) {
          if (p[s] != null) { q.push(p[s]); p[s] = null; changed = true; }
          continue;
        }
        if (!q.length) continue;
        if (p[s] != null) q.push(p[s]);
        p[s] = q.shift(); changed = true;
      }
      // OVERFLOW PASS — a page is a fixed canvas, never a scroll. Anything
      // past the last row that fits (widgets included pushed it there) spills
      // onto the NEXT page: into its gaps first, else appended — and a new
      // page is created when there isn't one. Cascades page by page.
      if (p.length > cap) {
        const spill = p.splice(cap).filter(id => id != null);
        changed = true;
        if (spill.length) {
          if (pi + 1 >= raw.length) raw.push([]);
          const np = raw[pi + 1], nblocked = blockedSlotSet(widgets, pi + 1);
          spill.forEach(id => {
            _overflowed.add(id);   // remember WHO was displaced — backfill only returns these
            let s = 0;
            while (s < cap && (nblocked.has(s) || np[s] != null)) s++;
            if (s < cap) np[s] = id;
            else np.push(id);   // past that page's cap too — its own pass cascades it on
          });
        }
      }
    }
    // BACKFILL PASS — the overflow's mirror: when room frees up on an earlier
    // page (the clock shrank, an icon was removed), icons the overflow pass
    // itself displaced flow BACK into the trailing space, in order. Only those
    // — an icon the user placed on a later page is theirs and never moves; a
    // manual drag clears the displaced set (the user took ownership).
    for (let pi = 0; pi + 1 < raw.length && _overflowed.size; pi++) {
      const p = raw[pi], blocked = blockedSlotSet(widgets, pi), np = raw[pi + 1];
      let last = -1;
      p.forEach((id, s) => { if (id != null) last = s; });
      for (let s = last + 1; s < cap; s++) {
        if (blocked.has(s)) continue;
        // the next page's first icon, in slot order — but only if it was displaced
        let j = 0;
        while (j < np.length && np[j] == null) j++;
        if (j >= np.length || !_overflowed.has(np[j])) break;
        _overflowed.delete(np[j]);
        p[s] = np[j]; np[j] = null; changed = true;
      }
    }
    // PRUNE PASS — a page with no icons and no widgets vanishes (never while
    // editing: "Add page" creates exactly such a page on purpose, and it must
    // survive until something lands on it — or edit mode ends).
    if (!S.homeEdit) {
      for (let pi = raw.length - 1; pi >= 0 && raw.length > 1; pi--) {
        if (raw[pi].some(id => id != null) || widgets.some(w => w.page === pi)) continue;
        raw.splice(pi, 1);
        widgets.forEach(w => { if (w.page > pi) w.page--; });
        changed = true;
        // keep stored widget anchors in the same page frame the user sees
        const pos = widgetPos();
        let wch = false;
        Object.values(pos).forEach(p0 => {
          if (p0 && (p0.page || 0) > pi) { p0.page--; wch = true; }
        });
        if (wch && PREF.get('homeWidgets', null)) PREF.set('homeWidgets', pos);
      }
    }
    // STICKY LAYOUT (optional — Style sheet / Personalize): rows glue
    // together like magnets. Any fully-empty row — left by a shrinking
    // clock, a removed icon row or a moved widget — collapses, and every
    // widget and icon below jumps back UP. Growing pushes down (the stack
    // pass above), shrinking pulls up (this pass): the two halves of
    // "nothing floats, nothing overlaps". Rows that still hold an icon keep
    // their column gaps — only whole empty bands vanish.
    if (PREF.get('homeSticky', true)) {
      raw.forEach((p, pi) => {
        const pw = widgets.filter(w => w.page === pi);
        const maxRow = Math.max(Math.ceil(p.length / 3) - 1,
          ...pw.map(w => w.row + w.span - 1), 0);
        const used = r => pw.some(w => r >= w.row && r < w.row + w.span)
          || p[r * 3] != null || p[r * 3 + 1] != null || p[r * 3 + 2] != null;
        const map = []; let shift = 0;
        for (let r = 0; r <= maxRow; r++) map[r] = used(r) ? r - shift : (shift++, null);
        if (!shift) return;
        pw.forEach(w => { if (map[w.row] != null) w.row = map[w.row]; });
        const np = [];
        p.forEach((id, s) => {
          if (id == null) return;
          const nr = map[(s / 3) | 0];
          if (nr != null) np[nr * 3 + s % 3] = id;
        });
        p.length = 0;
        for (let i = 0; i < np.length; i++) p[i] = np[i] == null ? null : np[i];
        changed = true;
      });
      // Keep stored widget anchors in the same (collapsed) frame the user
      // sees, so drag/drop math and this pass always agree.
      if (PREF.get('homeWidgets', null)) {
        const pos = widgetPos();
        let wchanged = false;
        widgets.forEach(w => {
          const p0 = pos[w.id];
          if (p0 && p0.row != null && p0.row !== w.row) { p0.row = w.row; wchanged = true; }
        });
        if (wchanged) PREF.set('homeWidgets', pos);
      }
    }
    // Persist the repair only when the user already owns a layout — a repair
    // of the config-driven default stays derived (recomputed each render, same
    // result), so the default keeps following home.config.json until the user
    // actually customizes home.
    if (changed && PREF.get('homePages', null)) PREF.set('homePages', raw.map(p => {
      const q = p.slice();
      while (q.length && q[q.length - 1] == null) q.pop();
      return q;
    }));

    // Positions are meaningful: a page is a slot array where index == grid
    // slot and a null is a deliberately-empty slot (a gap). So we map slot by
    // slot instead of filtering — a removed/duplicate/unknown app collapses to
    // null (an empty cell) rather than shifting every later icon up a slot.
    const seen = new Set([focus.id]);
    const pages = raw.map(ids => ids.map(id => {
      if (id == null) return null;
      const a = resolveHomeApp(id);
      if (!a || seen.has(a.id)) return null;
      seen.add(a.id); return a;
    }));
    if (pages.every(p => !p.some(Boolean))) {
      // First run: lay the catalog page by page — skip widget-covered cells,
      // and when a page's rows are full, continue on the next page (created
      // as needed) instead of piling everything onto page 0.
      pages.length = 0; pages.push([]);
      let s = 0, pi = 0, blocked = blockedSlotSet(widgets, 0);
      apps.filter(a => a.id !== focus.id).forEach(a => {
        while (s >= cap || blocked.has(s)) {
          if (s >= cap) { pi++; s = 0; pages.push([]); blocked = blockedSlotSet(widgets, pi); }
          else pages[pi][s++] = null;
        }
        pages[pi][s++] = a;
      });
    }
    return { cfg, focus, pages, widgets, showFocus };
  }

  function renderHome() {
    const st = Sov.get();
    HOME_CFG = HOME_CFG || Sov._homeCfgSync();
    const animate = _animateHome; _animateHome = false;   // entrance plays once per arrival
    const { cfg, focus, pages, widgets } = homeLayout();

    // The hero (clock + date + weather + privacy status) is the clock
    // widget's CONTENT — the widget itself is a full-width grid resident,
    // positioned by row exactly like every other widget and icon.
    const heroInner = `
      ${clockWidgetHTML(st)}
      <div class="aura-date">${esc(st.date)} · ${esc(cfg.greeting || greetShort(st.time))}</div>
      <div class="aura-wx" id="homeWx"></div>
      <button class="aura-status" id="auraStatus" data-nav="permissions">${auraStatusHTML()}</button>`;
    const widgetHTML = w => {
      const body = w.id === 'clock'
        ? `<section class="aura-hero align-${clockAlign()}" style="--clock-scale:${clockScale()}">${heroInner}</section>`
        : w.id === 'focus' ? focusCardHTML(focus, cfg)
        : w.id === 'search'
          ? `<button class="home-search" id="homeSearch">${ic('search',16)}<span>Search apps, files, everything</span></button>`
        : `<div class="upnext-slot" id="upnextSlot"></div>`;
      return `<div class="home-widget hw-${w.id}" data-widget="${w.id}"
        style="grid-column:1 / -1;grid-row:${w.row + 1} / span ${w.span}">${body}</div>`;
    };

    $('#v-home').innerHTML = `
      <div class="home2-aura" aria-hidden="true"></div>
      <div class="home2-body ${S.homeEdit ? 'editing' : ''} ${animate ? 'anim' : ''}">
        <div id="suggestSlot"></div>
        <div class="home-pager" id="homePager">${pages.map((ps, pi) =>
          `<section class="home-page"><div class="tile-grid" data-page="${pi}">${
            widgets.filter(w => w.page === pi).map(widgetHTML).join('')}${
            ps.map((app, i) => app ? homeTile(app, i) : '').join('')}</div></section>`).join('')}</div>
        ${pages.length > 1 ? `<div class="page-dots" id="pageDots">${pages.map((_, pi) =>
          `<button class="pdot ${pi === 0 ? 'on' : ''}" data-pdot="${pi}" aria-label="Page ${pi + 1}"></button>`).join('')}</div>` : ''}
        <div class="home-edit-bar">
          <button class="heb-btn" data-hedit="wallpaper">${ic('sun',15)}<span>Wallpaper</span></button>
          <button class="heb-btn" data-hedit="style">${ic('spark',15)}<span>Style</span></button>
          <button class="heb-btn" data-hedit="tidy">${ic('layers',15)}<span>Tidy</span></button>
          <button class="heb-btn" data-hedit="addpage">${ic('grid',15)}<span>Add page</span></button>
          <button class="heb-btn done" data-hedit="done">Done</button>
        </div>
      </div>`;

    // Each grid remembers which of its cells its widgets cover; the tile drag
    // consults this so a drop can never land under a widget (see enableTileSort).
    $$('#homePager .tile-grid').forEach(g => { g._blocked = blockedSlotSet(widgets, +g.dataset.page || 0); });

    bindHome();
    $$('#homePager .tile-grid').forEach(g => enableTileSort(g));
    wireHomePager();
    wireHomeEdit();
    wireWidgetDrag();
    wireClockResize();
    const hs = $('#homeSearch'); if (hs) hs.onclick = () => openSearch();
    maybeSuggest();   // the resident may gently offer a learned routine (async)
    paintUpNext();    // the next real calendar event, if any (async)
    paintWeather();   // the live reading, if the user turned weather on
    syncLiveBricks();
    // Backstop: measure the real hero and grow its reservation if we under-
    // guessed, so nothing below the clock is ever overlapped (rAF: post-layout).
    requestAnimationFrame(reconcileClockSpan);
  }

  const activeSensorKinds = () => Object.keys(Sov.get().sensors);   // 'mic'|'cam'|'loc'
  function auraStatusHTML() {
    const kinds = activeSensorKinds();
    if (!kinds.length) return `<span class="as-dot calm"></span><span>Private · the Aura is watching over you</span>`;
    const label = { mic: 'Microphone', cam: 'Camera', loc: 'Location' };
    const cls = kinds.includes('cam') ? 'cam' : kinds.includes('mic') ? 'mic' : 'loc';
    return `<span class="as-dot ${cls}"></span><span>${esc(kinds.map(k => label[k]).join(' · '))} in use right now</span>`;
  }
  // The Aura now lives in the home orb — a persistent companion in the helm,
  // present on every screen. The orb handles its own taps (tap = home,
  // long-press = the radial menu), so the Aura is mounted for its light only.
  function mountAura() {
    const cvs = $('#orbAura'); if (!cvs || typeof Aura === 'undefined') return;
    Aura.mount(cvs, {});
    Aura.setSensors(activeSensorKinds());
  }

  function focusCardHTML(app, cfg) {
    const using = Sov.activeSensorsFor(app.id).length ? 'using' : '';
    return `
      <button class="focus-card ${using}" data-launch="${app.id}" style="--col:${app.color}">
        <span class="fc-ic">${ic(app.glyph, 26)}</span>
        <span class="fc-text">
          <span class="fc-eyebrow">Suggested now</span>
          <span class="fc-title">${esc(app.name)}</span>
          <span class="fc-sub">${esc(cfg.focusTag || FOCUS_TAG[app.id] || 'Open')}</span>
        </span>
        <span class="fc-chev">${ic('chev', 20)}</span>
      </button>`;
  }

  function homeTile(app, i) {
    const using = Sov.activeSensorsFor(app.id).length ? 'using' : '';
    const del = `<span class="tile-x" data-hdel="${app.id}" aria-label="Remove">${ic('x', 11)}</span>`;
    // Android apps show their own real icon when we can resolve it; else a glyph.
    const iconUrl = app.iconUrl
      || (app.android && Sov.appIconUrl ? Sov.appIconUrl('waydroid.' + app.pkg) : null);
    const img = iconUrl ? `<img class="tile-img" src="${iconUrl}" onerror="this.remove()" alt="">` : '';
    // --i drives the staggered entrance; --col tints the icon its own colour.
    // Each tile owns an explicit grid cell (data-slot -> grid-column/row) so
    // tiles never auto-flow/repack: an empty slot stays empty, and a dropped
    // tile keeps exactly the cell you leave it in. See placeTile()/slotFromPoint().
    const slot = i || 0, col = (slot % 3) + 1, row = ((slot / 3) | 0) + 1;
    return `
      <button class="tile ${using}" data-launch="${app.id}" data-slot="${slot}"
              style="--col:${app.color};--i:${slot};grid-column:${col};grid-row:${row}">
        ${del}<span class="tile-ic"><span class="tile-glow"></span><span class="tile-dot"></span>${ic(app.glyph, 26)}${img}</span>
        <span class="tile-lbl">${esc(app.name)}</span>
      </button>`;
  }

  // Swipe between home pages; the dots track the current page and jump on tap.
  function wireHomePager() {
    const pager = $('#homePager'); if (!pager) return;
    pager.onscroll = () => {
      const pi = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
      $$('#pageDots .pdot').forEach((d, i) => d.classList.toggle('on', i === pi));
    };
    $$('#pageDots [data-pdot]').forEach(d => d.onclick = () =>
      pager.scrollTo({ left: (+d.dataset.pdot) * pager.clientWidth, behavior: 'smooth' }));
  }

  // Entering edit mode by long-pressing the background (a tile's own
  // long-press lives in enableTileSort, since there it must hand straight
  // into a drag on the SAME pointer session — see the big comment there).
  // This patches the DOM in place (no renderHome) so it's instant and never
  // fights an in-flight gesture; the edit chrome (tile ×, edit bar, jiggle)
  // is CSS-driven off `.editing`, already present and already wired below.
  function enterHomeEditInPlace() {
    if (S.homeEdit) return;
    S.homeEdit = true;
    const body = $('#v-home .home2-body');
    if (body) body.classList.add('editing');
    // These gate on S.homeEdit at call time and were wired once already
    // (false) at the initial render — re-arm them now it's actually true.
    wireWidgetDrag();
    wireClockResize();
    // In edit mode a widget is a draggable resident, not a settings shortcut —
    // drop the tap-to-open handlers bindHome() wired outside edit mode. (The
    // editing CSS also disables pointer events inside widgets, belt & braces.)
    const ck = $('#homeClock'); if (ck) ck.onclick = null;
    const wx = $('#homeWx');    if (wx) wx.onclick = null;
    const dt = $('#v-home .aura-date'); if (dt) dt.onclick = null;
  }

  // The edit-mode chrome (delete ×, edit bar) is always in the DOM and always
  // wired — CSS alone shows/hides it off `.home2-body.editing` — so entering
  // edit mode never needs to rebuild or rebind anything.
  function wireHomeEdit() {
    const pager = $('#homePager');
    if (pager) {
      let px = 0, py = 0, pmoved = false, plp = null;
      pager.addEventListener('pointerdown', e => {
        if (e.target.closest('.tile')) return;   // tiles own their own long-press
        pmoved = false; px = e.clientX; py = e.clientY;
        plp = setTimeout(() => { if (!pmoved) enterHomeEditInPlace(); }, 480);
      });
      pager.addEventListener('pointermove', e => {
        if (Math.hypot(e.clientX - px, e.clientY - py) > 10) { pmoved = true; clearTimeout(plp); }
      });
      pager.addEventListener('pointerup', () => clearTimeout(plp));
      pager.addEventListener('pointercancel', () => clearTimeout(plp));
    }
    $$('#v-home [data-hdel]').forEach(x => x.onclick = e => {
      e.stopPropagation(); e.preventDefault();
      const id = x.dataset.hdel;
      // Empty the slot in place (null), don't filter — otherwise every icon
      // after it slides up a cell instead of the removed one leaving a gap.
      PREF.set('homePages', homePagesIds().map(p => (p || []).map(a => a === id ? null : a)));
      renderHome();
    });
    $$('#v-home [data-hedit]').forEach(b => b.onclick = () => {
      const a = b.dataset.hedit;
      if (a === 'done') { S.homeEdit = false; renderHome(); }
      else if (a === 'style') openStyleSheet();
      else if (a === 'tidy') {
        // Compact: pull every icon up into the earliest open cells (order
        // preserved, widget rows skipped) — clears the gaps left behind by
        // removed icons and by widgets that moved or shrank. Opt-in, because
        // deliberate gaps are a feature; this is the one-tap way out.
        const { pages, widgets } = homeLayout();
        PREF.set('homePages', pages.map((p, pi) => {
          const blocked = blockedSlotSet(widgets, pi);
          const arr = []; let s = 0;
          p.filter(Boolean).forEach(app => {
            while (blocked.has(s)) arr[s++] = null;
            arr[s++] = app.id;
          });
          return arr;
        }));
        renderHome();
        toast('Icons tidied', 'ok', 'check');
      }
      else if (a === 'addpage') {
        const pgs = homePagesIds().slice(); pgs.push([]); PREF.set('homePages', pgs);
        renderHome();
        setTimeout(() => { const pg = $('#homePager'); if (pg) pg.scrollTo({ left: (pgs.length - 1) * pg.clientWidth, behavior: 'smooth' }); }, 40);
        toast('Page added', 'ok', 'check');
      } else if (a === 'wallpaper') openWallpaperSheet();
    });
  }

  // In edit mode a widget (clock hero · focus card · Up next) drags vertically
  // and snaps to a grid ROW — the same slot system the icons use, so a widget
  // can sit anywhere from the top of the page to the bottom and can never
  // land on top of anything: resolveWidgets pushes contested widgets apart
  // (the one you just moved wins the row) and homeLayout's repair pass
  // relocates any icon out of the landing rows.
  function wireWidgetDrag() {
    if (!S.homeEdit) return;
    $$('#v-home .home-widget').forEach(el => {
      el.onpointerdown = e => {
        if (e.target.closest('.clk-resize')) return;   // the size handle wins
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        const grid = el.closest('.tile-grid'); if (!grid) return;
        const cs = getComputedStyle(grid);
        const rowH = (parseFloat(cs.gridAutoRows) || 84) + (parseFloat(cs.rowGap) || 14);
        const id = el.dataset.widget, span = widgetSpan(id);
        const gr = grid.getBoundingClientRect();
        const startRow = Math.max(0, Math.round((el.getBoundingClientRect().top - gr.top) / rowH));
        const rowCap = Math.max(0, Math.round(gr.height / rowH) - span);
        const sy = e.clientY;
        let moved = false, target = startRow;
        const move = ev => {
          if (!moved && Math.abs(ev.clientY - sy) > 6) { moved = true; el.classList.add('dragging'); }
          if (!moved) return;
          el.style.transform = `translateY(${ev.clientY - sy}px)`;
          target = Math.max(0, Math.min(rowCap, Math.round(startRow + (ev.clientY - sy) / rowH)));
        };
        const up = () => {
          el.onpointermove = el.onpointerup = el.onpointercancel = null;
          el.style.transform = ''; el.classList.remove('dragging');
          if (moved) {
            const pos = widgetPos();
            pos[id] = { page: +grid.dataset.page || 0, row: target, seq: Date.now() };
            PREF.set('homeWidgets', pos);
          }
          renderHome();   // re-resolve rows, repair icons, repaint
        };
        el.onpointermove = move; el.onpointerup = up; el.onpointercancel = up;
      };
    });
  }

  // The clock's size handle (bottom-right, edit mode only) — continuous
  // scale, not a preset. The zoom previews live via the CSS var, and the
  // moment the size crosses a grid-row boundary the WHOLE page reflows
  // (renderHome): widgets below slide down to make room, icons shift out of
  // the newly covered cells — nothing overlaps, even mid-drag. Listeners
  // live on window so the reflow (which replaces the handle) can't kill the
  // gesture; the transient scale rides in _clockScaleLive until release.
  function wireClockResize() {
    const handle = $('#clkResize');
    if (!handle || !S.homeEdit) return;
    handle.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation();
      const sx = e.clientX, s0 = clockScale();
      let lastSpan = widgetSpan('clock');
      const scaleAt = ev => Math.max(.7, Math.min(1.8, s0 + (ev.clientX - sx) / 160));
      const move = ev => {
        _clockScaleLive = scaleAt(ev);
        const span = widgetSpan('clock');
        if (span !== lastSpan) { lastSpan = span; renderHome(); return; }
        const hero = $('.aura-hero');
        if (hero) hero.style.setProperty('--clock-scale', _clockScaleLive.toFixed(3));
      };
      const up = ev => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        const sc = scaleAt(ev);
        _clockScaleLive = null;
        PREF.set('clockScale', sc);
        renderHome();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };
  }

  function openWallpaperSheet() {
    const wp = PREF.get('wallpaper', 'petrol');
    const scrim = $('#promptScrim');
    const usingPhoto = !!PREF.get('wallpaperImg', null);
    scrim.innerHTML = `<div class="prompt-card wp-sheet">
      <div class="pc-title">Wallpaper</div>
      <div class="wp-grid">${WALLPAPERS.map(w =>
        `<button class="wp-sw ${!usingPhoto && w.id === wp ? 'on' : ''}" data-wp2="${w.id}" style="background:${w.css}">
           <span class="wp-name">${w.name}</span>${!usingPhoto && w.id === wp ? `<span class="wp-chk">${ic('check',16)}</span>` : ''}</button>`).join('')}</div>
      <button class="pbtn ghost" data-wpphoto style="margin-top:10px">${ic('photo',15)} From Photos</button>
      <button class="pbtn allow" data-wpclose style="margin-top:8px">Done</button>
    </div>`;
    scrim.classList.add('open');
    scrim.querySelectorAll('[data-wp2]').forEach(b => b.onclick = () => { PREF.set('wallpaperImg', null); PREF.set('wallpaper', b.dataset.wp2); applyWallpaper(); openWallpaperSheet(); });
    scrim.querySelector('[data-wpphoto]').onclick = () => openPhotoPicker();
    scrim.querySelector('[data-wpclose]').onclick = () => {
      scrim.classList.remove('open');
      setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200);
    };
  }

  // Long-press home › Style — the quick customization sheet. Accent theme,
  // icon shape, labels and the ambient effect in one place, applied live;
  // the deeper options stay in Personalize. All device-local, via PREF.
  function openStyleSheet() {
    const scrim = $('#promptScrim');
    const close = () => {
      scrim.classList.remove('open');
      setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200);
    };
    const paint = () => {
      const theme = PREF.get('theme', 'teal'), shape = PREF.get('tileShape', 'squircle');
      const fx = PREF.get('fx', 'aurora'), labels = PREF.get('tileLabels', true);
      const sticky = PREF.get('homeSticky', true);
      scrim.innerHTML = `<div class="prompt-card style-sheet">
        <div class="pc-title">Home style</div>
        <div class="ss-lbl">Accent</div>
        <div class="ss-swatches">${THEMES.map(t =>
          `<button class="ss-sw ${t.id === theme ? 'on' : ''}" data-th="${t.id}" style="--sw:${t.accent}" aria-label="${t.name}">${t.id === theme ? ic('check', 14) : ''}</button>`).join('')}</div>
        <div class="ss-lbl">Icon shape</div>
        <div class="seg ss-seg">${TILE_SHAPES.map(s =>
          `<button class="${s.id === shape ? 'on acc' : ''}" data-shape="${s.id}">${s.name}</button>`).join('')}</div>
        <div class="ss-lbl">Ambience</div>
        <div class="ss-fx">${FX.map(f =>
          `<button class="ss-fxc ${f.id === fx ? 'on' : ''}" data-fxpick="${f.id}">${esc(f.name)}</button>`).join('')}</div>
        <button class="ss-row" data-lbls><span>Icon labels</span>
          <span class="switch ${labels ? 'on' : ''}"></span></button>
        <button class="ss-row" data-sticky>
          <span>Sticky layout<small class="ss-sub">Rows glue together — no empty bands</small></span>
          <span class="switch ${sticky ? 'on' : ''}"></span></button>
        <div class="ss-btns">
          <button class="pbtn ghost" data-more>${ic('gear',14)} Personalize</button>
          <button class="pbtn allow" data-close>Done</button>
        </div></div>`;
      scrim.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { PREF.set('theme', b.dataset.th); applyTheme(); paint(); });
      scrim.querySelectorAll('[data-shape]').forEach(b => b.onclick = () => { PREF.set('tileShape', b.dataset.shape); applyIconStyle(); paint(); });
      scrim.querySelectorAll('[data-fxpick]').forEach(b => b.onclick = () => { PREF.set('fx', b.dataset.fxpick); applyEffects(); paint(); });
      scrim.querySelector('[data-lbls]').onclick = () => { PREF.set('tileLabels', !PREF.get('tileLabels', true)); applyIconStyle(); paint(); };
      scrim.querySelector('[data-sticky]').onclick = () => {
        PREF.set('homeSticky', !PREF.get('homeSticky', true));
        renderHome(); paint();
      };
      scrim.querySelector('[data-more]').onclick = () => { close(); S.homeEdit = false; go('personalize'); };
      scrim.querySelector('[data-close]').onclick = close;
    };
    paint();
    scrim.classList.add('open');
  }

  // One human line per built-in app, for the long-press info card — what it
  // is AND what it touches, in the OS's own plain-privacy voice.
  const APP_ABOUT = {
    phone: 'Calls over the cellular modem. The mic is only live during a call.',
    messages: 'SMS conversations — they live in the modem and on this device.',
    contacts: 'Your people, stored only on this device.',
    browser: 'The open web. Every connection it makes shows up in Network.',
    assistant: 'The Aura — on-device intelligence. Nothing leaves without asking.',
    appstore: 'Free & open apps from F-Droid, installed into the Android layer.',
    camera: 'Photos & video. The indicator lights whenever the sensor is live.',
    photos: 'Your pictures, read from ~/Pictures. No cloud, no scanning.',
    music: 'A local player for your own library.',
    maps: 'Maps & navigation. Location is used only while you look.',
    files: 'Everything on the device, encrypted at rest.',
    notes: 'Quick thoughts, kept locally.',
    calc: 'A calculator. It needs nothing and touches nothing.',
    clock: 'Alarms, timers and the home clock widget.',
    calendar: 'Your schedule — the "Up next" widget reads from here.',
    terminal: 'A real shell into the OS. It is your device, after all.',
    sync: 'Device-to-device sync over the local network. No server in between.',
    monitor: 'CPU, memory and processes, honestly reported.',
    settings: 'The whole system — inspectable and reversible.',
  };

  // The app-info card: long-press a home tile (an iOS-style peek). Identity,
  // a plain-language description, what it can access right now, and actions.
  function openAppInfo(app) {
    const scrim = $('#promptScrim');
    const close = () => {
      scrim.onclick = null;
      scrim.classList.remove('open');
      setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200);
    };
    const perms = Sov.perms(app.id) || {};
    const live = Sov.activeSensorsFor(app.id);
    const running = Sov.running().some(r => r.appId === app.id);
    const needs = [...new Set([...(app.uses || []).map(s => SENS2PERM[s]), ...(app.perms || [])])];
    const permName = { camera: 'Camera', mic: 'Microphone', location: 'Location', contacts: 'Contacts', files: 'Files' };
    const chips = [
      ...needs.map(k => `<span class="aic-chip ${(perms[k] || 'ask') === 'allow' ? 'on' : ''}">${esc(permName[k] || k)}${(perms[k] || 'ask') === 'allow' ? ' · allowed' : ''}</span>`),
      app.net ? `<span class="aic-chip net">${ic('globe',11)} Network</span>`
              : `<span class="aic-chip offline">${ic('shieldChk',11)} On-device only</span>`,
    ].join('');
    const about = app.android
      ? 'An Android app in the native Android layer — sandboxed, memory-capped, running on demand.'
      : app.desktop
        ? 'A native Linux application installed on this device — it opens in its own window, outside the shell.'
        : (APP_ABOUT[app.id] || 'A built-in app.');
    scrim.innerHTML = `<div class="prompt-card app-info">
      <div class="aic-head">
        <span class="aic-ic" style="--col:${app.color}">${ic(app.glyph, 30)}</span>
        <span class="aic-t"><span class="aic-name">${esc(app.name)}</span>
        <span class="aic-sub">${esc(app.android ? 'Android · ' + app.pkg : app.desktop ? 'Native Linux app' : (app.cat || 'App') + ' · built-in')}${running ? ' · running' : ''}</span></span>
      </div>
      <div class="aic-about">${esc(about)}</div>
      ${live.length ? `<div class="aic-live">${ic('eye',13)}<span>Using ${live.map(s => ({ mic: 'microphone', cam: 'camera', loc: 'location' }[s])).join(', ')} right now</span></div>` : ''}
      <div class="aic-chips">${chips}</div>
      <div class="aic-actions">
        <button class="pbtn allow" data-ai-open>Open</button>
        <button class="pbtn ghost" data-ai-perms>${ic('shieldChk',14)} Permissions</button>
        <button class="pbtn ghost" data-ai-edit>${ic('grid',14)} Edit home</button>
        <button class="pbtn deny" data-ai-remove>${ic('x',13)} Remove</button>
        ${app.android ? `<button class="pbtn deny" data-ai-uninstall>${ic('trash',13)} Uninstall</button>` : ''}
      </div></div>`;
    scrim.classList.add('open');
    scrim.onclick = e => { if (e.target === scrim) close(); };
    scrim.querySelector('[data-ai-open]').onclick = () => { close(); launch(app.id); };
    scrim.querySelector('[data-ai-perms]').onclick = () => { close(); go('permissions'); };
    scrim.querySelector('[data-ai-edit]').onclick = () => { close(); enterHomeEditInPlace(); };
    scrim.querySelector('[data-ai-remove]').onclick = () => {
      close();
      removeFromHome(app.id);
      renderHome();
      toast(`${esc(app.name)} removed from home`, '', 'x');
    };
    const aiu = scrim.querySelector('[data-ai-uninstall]');
    if (aiu) aiu.onclick = async () => {
      close();
      const ok = await confirmModal(`Uninstall ${esc(app.name)}?`,
        'Removes the app and its data from the Android layer.', 'Uninstall');
      if (!ok) return;
      toast('Uninstalling…', '', 'android');
      const r = await Sov.androidRemove(app.pkg);
      if (r && r.ok) { removeAndroidFromHome(app.pkg); renderHome(); toast(`${esc(app.name)} uninstalled`, 'ok', 'check'); }
      else toast((r && r.error) || 'Could not uninstall', 'alert', 'x');
    };
  }
  // The drawer's per-app menu (long-press or right-click an icon): open it,
  // put it on / take it off the home screen, and — for Android apps, the only
  // kind that CAN be uninstalled — uninstall. Built-ins say so instead.
  function openAppMenu(id) {
    const app = resolveHomeApp(id); if (!app) return;
    const scrim = $('#promptScrim');
    const close = () => {
      scrim.onclick = null;
      scrim.classList.remove('open');
      setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200);
    };
    const onHome = onHomeAlready(id);
    const sub = app.android ? 'Android · ' + app.pkg
      : app.desktop ? 'Native Linux app'
      : (app.cat || 'App') + ' · built-in';
    scrim.innerHTML = `<div class="prompt-card app-info">
      <div class="aic-head">
        <span class="aic-ic" style="--col:${app.color}">${app.iconUrl ? `<img class="aic-img" src="${esc(app.iconUrl)}" onerror="this.remove()" alt="">` : ic(app.glyph, 30)}</span>
        <span class="aic-t"><span class="aic-name">${esc(app.name)}</span>
        <span class="aic-sub">${esc(sub)}</span></span>
      </div>
      <div class="aic-actions">
        <button class="pbtn allow" data-am-open>Open</button>
        ${onHome
          ? `<button class="pbtn ghost" data-am-unhome>${ic('x',13)} Remove from home</button>`
          : `<button class="pbtn ghost" data-am-home>${ic('home',14)} Add to home</button>`}
        ${app.android
          ? `<button class="pbtn deny" data-am-uninstall>${ic('trash',13)} Uninstall</button>`
          : app.desktop
            ? `<button class="pbtn ghost" disabled title="Manage system packages from the Terminal">${ic('cpu',13)} System app</button>`
            : `<button class="pbtn ghost" disabled title="Part of AuraOS">${ic('logo',13)} Built-in</button>`}
      </div></div>`;
    scrim.classList.add('open');
    scrim.onclick = e => { if (e.target === scrim) close(); };
    scrim.querySelector('[data-am-open]').onclick = () => { close(); launch(id); };
    const ah = scrim.querySelector('[data-am-home]');
    if (ah) ah.onclick = () => {
      close();
      // a desktop app is remembered so home can draw its tile without the
      // drawer's async catalog (name, icon-ness, category glyph)
      if (app.desktop) {
        const reg = PREF.get('desktopApps', {});
        reg[app.did] = { name: app.name, icon: !!app.iconUrl, glyph: app.glyph };
        PREF.set('desktopApps', reg);
      }
      addToHome(id);
      toast(`${esc(app.name)} added to home`, 'ok', 'check');
    };
    const rh = scrim.querySelector('[data-am-unhome]');
    if (rh) rh.onclick = () => {
      close();
      removeFromHome(id);
      toast(`${esc(app.name)} removed from home`, '', 'x');
    };
    const un = scrim.querySelector('[data-am-uninstall]');
    if (un) un.onclick = async () => {
      close();
      const ok = await confirmModal(`Uninstall ${esc(app.name)}?`,
        'Removes the app and its data from the Android layer.', 'Uninstall');
      if (!ok) return;
      toast('Uninstalling…', '', 'android');
      const r = await Sov.androidRemove(app.pkg);
      if (r && r.ok) {
        removeAndroidFromHome(app.pkg);
        toast(`${esc(app.name)} uninstalled`, 'ok', 'check');
        if (S.view === 'drawer') renderDrawer('');
        else if (S.view === 'home') renderHome();
      } else toast((r && r.error) || 'Could not uninstall', 'alert', 'x');
    };
  }
  // Long-press (or right-click) → the app menu, on every drawer icon/row.
  // A fired long-press marks the element so the click that follows the
  // pointer-up doesn't ALSO launch the app.
  function wireAppMenus(root) {
    root.querySelectorAll('[data-launch]').forEach(el => {
      let t = null, sx = 0, sy = 0;
      const open = () => { el.dataset.lpDone = '1'; openAppMenu(el.dataset.launch); };
      el.addEventListener('pointerdown', e => {
        sx = e.clientX; sy = e.clientY;
        clearTimeout(t); t = setTimeout(open, 450);
      });
      const cancel = () => clearTimeout(t);
      el.addEventListener('pointermove', e => {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel();
      });
      el.addEventListener('pointerup', cancel);
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('contextmenu', e => { e.preventDefault(); open(); });
    });
  }

  // Dismiss the info card mid-gesture (the peek hands off into a drag).
  function closeAppInfo() {
    const scrim = $('#promptScrim');
    if (!scrim.querySelector('.app-info')) return;
    scrim.onclick = null;
    scrim.classList.remove('open');
    setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200);
  }

  const greetShort = t => {
    const h = parseInt(t.slice(0, 2), 10);
    const d = new Date().getDay();                          // 0 Sun … 6 Sat
    const base = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    if (h < 5) return 'Late night — rest well';
    if (h < 12 && d === 1) return 'Fresh start to the week';   // Monday morning
    if (h >= 17 && d === 5) return 'Happy Friday';             // Friday evening
    if (d === 0 || d === 6) return base + ' · enjoy the weekend';
    return base;
  };

  // Drag-to-rearrange the home tiles. A tap still launches (movement threshold
  // distinguishes tap from drag); a drag reorders with a smooth FLIP animation
  // and persists the new order. This is the "app placement moves on home" bit.
  // ---- fixed-slot home grid helpers ----------------------------------------
  // A home page is a 3-column grid of fixed slots; a tile lives at an explicit
  // slot (data-slot) placed via grid-column/grid-row. Empty slots stay empty —
  // dropping a tile never reflows its neighbours, and gaps are allowed.
  const HOME_COLS = 3;
  const tileSlot = t => +(t.dataset.slot || 0);
  // every real tile on a grid, minus one being dragged (it's out of flow)
  const gridTiles = grid => [...grid.querySelectorAll('.tile')].filter(t => !t.classList.contains('dragging'));
  function placeTile(t, slot) {
    t.dataset.slot = slot;
    t.style.gridColumn = (slot % HOME_COLS) + 1;
    t.style.gridRow = ((slot / HOME_COLS) | 0) + 1;
  }
  const tileAtSlot = (grid, slot) => gridTiles(grid).find(t => tileSlot(t) === slot) || null;
  const maxSlotRow = grid => gridTiles(grid).reduce((m, t) => Math.max(m, (tileSlot(t) / HOME_COLS) | 0), -1);
  // Map a viewport point to a slot index on `grid`. Columns split the width
  // evenly; rows step by the fixed auto-row height + row gap. Droppable rows
  // reach the bottom of the grid's visible area (its .sorting min-height), so
  // you can land a tile anywhere in the open space you actually see — but never
  // more than one fresh row past the last icon, so a drop can't open an absurd
  // gap miles below the content.
  function slotFromPoint(grid, x, y) {
    const r = grid.getBoundingClientRect(), cs = getComputedStyle(grid);
    const rowH = (parseFloat(cs.gridAutoRows) || 84) + (parseFloat(cs.rowGap) || 14);
    let col = Math.floor((x - r.left) / (r.width / HOME_COLS));
    let row = Math.floor((y - r.top) / rowH);
    const maxRow = Math.max(Math.round(r.height / rowH) - 1, maxSlotRow(grid) + 1);
    col = Math.max(0, Math.min(HOME_COLS - 1, col));
    row = Math.max(0, Math.min(maxRow, row));
    return row * HOME_COLS + col;
  }
  // Speculative pages spun up mid-drag by dragging into a screen edge; pruned
  // at drop if nothing landed on them, so an idle hover never litters pages.
  let _dragNewPages = [], _dragNewPagePos = null;
  function addPageDuringDrag(pos) {
    if (_dragNewPages.length) return;   // one speculative page per drag is plenty
    const pager = $('#homePager'); if (!pager) return;
    const section = document.createElement('section');
    section.className = 'home-page';
    section.innerHTML = `<div class="tile-grid" data-page="0"></div>`;
    if (pos === 'start') pager.insertBefore(section, pager.firstElementChild);
    else pager.appendChild(section);
    const grid = section.querySelector('.tile-grid');
    grid._blocked = new Set();          // a fresh page has no widgets on it
    grid.classList.add('sorting');
    enableTileSort(grid);
    _dragNewPages.push(grid);
    _dragNewPagePos = pos;
    $$('#homePager .tile-grid').forEach((g, i) => { g.dataset.page = i; });
    const target = pos === 'start' ? 0 : $$('#homePager .tile-grid').length - 1;
    pager.scrollTo({ left: target * pager.clientWidth, behavior: 'smooth' });
  }
  function finalizeHomePagesAfterDrag() {
    // The common case is a same-page reorder: persist silently and leave the
    // DOM alone so the tile's own settle transition plays out undisturbed.
    // Only a page actually being added (or a speculative one pruned away)
    // needs a full rebuild, for the dots/pager chrome to catch up.
    const pageCountChanged = _dragNewPages.length > 0;
    const keptNew = _dragNewPages.filter(g => gridTiles(g).length);
    _dragNewPages.forEach(g => { if (!gridTiles(g).length) g.closest('.home-page').remove(); });
    // A page prepended at the start shifts every existing page index up one —
    // the widgets' stored page anchors must follow or they'd jump a page left.
    if (keptNew.length && _dragNewPagePos === 'start') {
      const pos = widgetPos();
      Object.values(pos).forEach(p => { if (p && typeof p === 'object') p.page = (p.page || 0) + 1; });
      PREF.set('homeWidgets', pos);
    }
    _dragNewPages = []; _dragNewPagePos = null;
    _overflowed.clear();   // a manual drop = the user owns the layout; nothing flows back
    const grids = $$('#homePager .tile-grid');
    grids.forEach((g, i) => { g.dataset.page = i; });
    // Persist each page as a slot array: index == slot, null == empty cell.
    // Trailing empties are trimmed so we don't store an unbounded tail of nulls.
    PREF.set('homePages', grids.map(g => {
      const arr = [];
      gridTiles(g).forEach(t => { arr[tileSlot(t)] = t.dataset.launch; });
      for (let i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = null;
      while (arr.length && arr[arr.length - 1] == null) arr.pop();
      return arr;
    }));
    if (pageCountChanged) renderHome();
  }

  function enableTileSort(grid) {
    if (!grid) return;
    let suppressClick = false;
    grid.addEventListener('click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
    grid.querySelectorAll('.tile').forEach(tile => {
      tile.addEventListener('pointerdown', e => {
        if (e.button) return;
        const start = { x: e.clientX, y: e.clientY };
        let moved = false, started = false, raf = null, lastEv = null, lastEdge = 0, baseLeft = 0, baseTop = 0;
        const srcGrid = tile.closest('.tile-grid'), srcSlot = tileSlot(tile);
        let hint = null;                       // a soft outline of the target cell
        let dropGrid = srcGrid, dropSlot = srcSlot;   // where a release lands right now

        // The dragged tile is lifted OUT of grid flow (position:fixed, viewport
        // coordinates) the instant the drag begins and follows the pointer 1:1,
        // so it moves freely instead of snapping between cells. Because every
        // tile is placed at an EXPLICIT grid cell (grid-column/row), lifting
        // this one leaves its cell empty and moves nothing else. It is NOT
        // reparented (that's what used to drop pointer capture); it stays a
        // child of its grid until it's committed to a slot on drop. Reordering
        // is computed purely from geometry (slotFromPoint) — no elementFromPoint
        // hit-testing on the moving tile, no sibling reflow.
        const beginDrag = () => {
          started = true;
          _dragNewPages = [];
          const r = tile.getBoundingClientRect();
          baseLeft = r.left; baseTop = r.top;
          tile.classList.add('dragging');
          Object.assign(tile.style, {
            position: 'fixed', left: baseLeft + 'px', top: baseTop + 'px',
            width: r.width + 'px', height: r.height + 'px', margin: '0',
            zIndex: 999, transform: 'scale(1.08)',
          });
          hint = document.createElement('div');
          hint.className = 'slot-hint';
          $$('#homePager .tile-grid').forEach(g => g.classList.add('sorting'));
          try { tile.setPointerCapture(e.pointerId); } catch (_) {}
        };
        const showHint = (g, slot) => {
          if (hint.parentElement !== g) g.appendChild(hint);
          placeTile(hint, slot);
        };
        // One layout pass per animation frame: move the tile to the pointer,
        // then resolve which grid + slot a release would land in and preview it.
        const flush = () => {
          raf = null;
          if (!lastEv || !started) return;
          const ev = lastEv;
          tile.style.left = (baseLeft + ev.clientX - start.x) + 'px';
          tile.style.top = (baseTop + ev.clientY - start.y) + 'px';
          // The dragged tile is pointer-events:none (see .tile.dragging), so
          // this hit-tests the grid UNDERNEATH it, never itself.
          const under = document.elementFromPoint(ev.clientX, ev.clientY);
          const overGrid = (under && under.closest('.tile-grid')) || srcGrid;
          const pager = $('#homePager');
          if (pager) {
            const pr = pager.getBoundingClientRect(), now = Date.now();
            const pages = $$('#homePager .tile-grid'), curIdx = pages.indexOf(overGrid);
            if (now - lastEdge > 550) {
              if (ev.clientX > pr.right - 34) {
                lastEdge = now;
                if (curIdx === pages.length - 1) addPageDuringDrag('end');
                pager.scrollBy({ left: pager.clientWidth, behavior: 'smooth' });
              } else if (ev.clientX < pr.left + 34) {
                lastEdge = now;
                if (curIdx === 0) addPageDuringDrag('start');
                pager.scrollBy({ left: -pager.clientWidth, behavior: 'smooth' });
              }
            }
          }
          dropGrid = overGrid;
          // never land under a widget: snap to the nearest unblocked cell
          dropSlot = freeSlotNear(slotFromPoint(overGrid, ev.clientX, ev.clientY),
                                  overGrid._blocked || new Set());
          showHint(overGrid, dropSlot);
        };
        // In edit mode a small move starts the drag immediately. Not yet in
        // edit mode, a long-press PEEKS the app-info card (identity, access,
        // actions). The pointer stays captured, so sliding on past the
        // threshold dismisses the peek and hands into edit + drag — the same
        // continuous long-press-into-drag gesture as before.
        let infoShown = false;
        let lp = S.homeEdit ? null : setTimeout(() => {
          if (moved) return;   // already turned into a page-swipe
          infoShown = true;
          try { tile.setPointerCapture(e.pointerId); } catch (_) {}
          const app = resolveHomeApp(tile.dataset.launch);
          if (app) openAppInfo(app);
        }, 480);
        const onMove = ev => {
          if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 9) {
            moved = true; clearTimeout(lp);
            if (infoShown) {   // slid out of the peek → rearrange instead
              infoShown = false; closeAppInfo();
              enterHomeEditInPlace();
            }
            if (S.homeEdit && !started) beginDrag();
          }
          if (!started) return;
          lastEv = ev;
          if (!raf) raf = requestAnimationFrame(flush);
        };
        const up = () => {
          clearTimeout(lp);
          tile.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', up);
          if (raf) { cancelAnimationFrame(raf); raf = null; }
          if (!started) {
            // released on the peek: the card stays up; swallow the click that
            // follows so the release doesn't also launch the app underneath
            if (infoShown) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 80); }
            return;
          }
          if (hint) hint.remove();
          // Commit the tile to the target slot. If that cell is taken, the
          // sitting tile swaps back into the source slot — a clean exchange
          // that leaves every OTHER tile exactly where it was (no repack).
          // Resolve the occupant while the tile still carries .dragging so
          // gridTiles() cleanly excludes the one in flight.
          const occupant = tileAtSlot(dropGrid, dropSlot);
          tile.classList.remove('dragging');
          $$('#homePager .tile-grid').forEach(g => g.classList.remove('sorting'));
          if (occupant && occupant !== tile) {
            placeTile(occupant, srcSlot);
            if (occupant.parentElement !== srcGrid) srcGrid.appendChild(occupant);
          }
          const before = tile.getBoundingClientRect();
          Object.assign(tile.style, { position: '', left: '', top: '', width: '', height: '', margin: '', zIndex: '' });
          placeTile(tile, dropSlot);
          if (tile.parentElement !== dropGrid) dropGrid.appendChild(tile);
          // Mini-FLIP: fly from where it was released to the slot it locked into
          // so it settles smoothly instead of teleporting.
          const after = tile.getBoundingClientRect();
          tile.style.transition = 'none';
          tile.style.transform = `translate(${before.left - after.left}px,${before.top - after.top}px) scale(1.08)`;
          requestAnimationFrame(() => {
            tile.style.transition = 'transform .22s var(--spring)';
            tile.style.transform = '';
          });
          setTimeout(() => { tile.style.transition = ''; }, 260);
          finalizeHomePagesAfterDrag();   // persists every page; drops an empty speculative one
          suppressClick = true; setTimeout(() => { suppressClick = false; }, 80);
        };
        tile.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', up);
      });
    });
  }

  /* ======================================================================
     INSIGHT MARGIN — the left-edge privacy/status rail.
     Four thin "paper-divider" tabs (Access · Resources · Network · Privacy)
     that expand into a translucent, blurred panel. Everything is scoped to the
     CURRENT context: the app you're in if one is open, otherwise the device as
     a whole — so opening the Browser shows the Browser's access, connections,
     resources and risk. Permissions toggle right here with a tap; no trip to
     Settings. It replaces the old always-on bottom "live access" ribbon.
     ====================================================================== */
  const INS_SECTIONS = [
    { id: 'access', ic: 'shieldChk', label: 'Access' },
    { id: 'res',    ic: 'cpu',       label: 'Resources' },
    { id: 'net',    ic: 'globe',     label: 'Network' },
    { id: 'sec',    ic: 'eye',       label: 'Privacy' },
  ];
  const INS_CAPS = [
    { key: 'camera',   sensor: 'cam', ic: 'cam',      label: 'Camera' },
    { key: 'mic',      sensor: 'mic', ic: 'mic',      label: 'Microphone' },
    { key: 'location', sensor: 'loc', ic: 'loc',      label: 'Location' },
    { key: 'contacts',              ic: 'contacts', label: 'Contacts' },
    { key: 'files',                 ic: 'files',    label: 'Files' },
    { key: 'network',               ic: 'globe',    label: 'Network' },
  ];
  const SENS2PERM = { cam: 'camera', mic: 'mic', loc: 'location' };
  const PERM2SENS = { camera: 'cam', mic: 'mic', location: 'loc' };
  let _sysStats = null;    // cached Sov.system() reading for the Resources panel
  let _insLast = 'access'; // reopen the margin on the section you last used

  // The app whose frame is open right now (its data drives the margin), else null.
  function insightCtx() { return S.appOpen ? Sov.app(S.appOpen) : null; }
  function insNetlog(app) {
    const all = Sov.netlog();
    return app ? all.filter(n => n.appId === app.id) : all;
  }
  function insightSide() { return PREF.get('insSide', 'left') === 'right' ? 'right' : 'left'; }
  function applyInsightSide() {
    const box = $('#insight'); if (!box) return;
    const right = insightSide() === 'right';
    box.classList.toggle('side-right', right);
    box.classList.toggle('side-left', !right);
  }
  // Where the collapsed handle sits vertically — user-draggable, persisted, and
  // clamped clear of the status bar and helm. Stored as a % of the screen height.
  function applyInsightPos() {
    const box = $('#insight'); if (!box) return;
    const pct = Math.max(12, Math.min(88, PREF.get('insTop', 50)));
    box.style.setProperty('--ins-top', pct + '%');
  }

  function buildInsight() {
    const tabs = INS_SECTIONS.map(s =>
      `<button class="ins-tab" data-ins="${s.id}" aria-label="${s.label}">
         ${ic(s.ic, 18)}<span class="it-dot"></span><span class="it-num"></span></button>`).join('');
    // Collapsed = just a small edge handle (a shortcut); tapping it expands the
    // flyout. So nothing overlays the screen until you ask for it.
    $('#insight').innerHTML = `
      <button class="ins-handle" id="insHandle" aria-label="Privacy &amp; status">
        <span class="ih-grip"></span>${ic('shieldChk', 16)}<span class="ih-dot"></span>
      </button>
      <div class="ins-flyout">
        <div class="ins-rail">${tabs}</div>
        <div class="ins-panel" id="insPanel"></div>
      </div>`;
    // The handle: a tap expands it; a vertical drag repositions it. We tell them
    // apart by distance moved, and suppress the click that follows a real drag.
    const handle = $('#insHandle'), box = $('#insight');
    let dragging = false, movedFar = false, startY = 0;
    handle.addEventListener('pointerdown', e => {
      dragging = true; movedFar = false; startY = e.clientY;
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    handle.addEventListener('pointermove', e => {
      if (!dragging) return;
      if (!movedFar && Math.abs(e.clientY - startY) > 6) { movedFar = true; box.classList.add('dragging'); }
      if (movedFar) {
        const r = device.getBoundingClientRect();
        const pct = Math.max(12, Math.min(88, (e.clientY - r.top) / r.height * 100));
        box.style.setProperty('--ins-top', pct + '%');
      }
    });
    handle.addEventListener('pointerup', () => {
      dragging = false;
      if (movedFar) {
        box.classList.remove('dragging');
        PREF.set('insTop', parseFloat(box.style.getPropertyValue('--ins-top')) || 50);
      }
    });
    handle.onclick = () => {
      if (movedFar) { movedFar = false; return; }   // that was a drag, not a tap
      S.insTab = _insLast; updateInsight();
    };
    $$('#insight [data-ins]').forEach(b => b.onclick = () => {
      S.insTab = (S.insTab === b.dataset.ins) ? null : b.dataset.ins;
      if (S.insTab) _insLast = S.insTab;
      updateInsight();
    });
    const scrim = $('#insScrim');
    if (scrim) scrim.onclick = () => { S.insTab = null; updateInsight(); };
    applyInsightSide();
    applyInsightPos();
    updateInsight();
  }

  // Worst-of status for the collapsed handle: live sensor > warning > idle.
  function insHandleState(app) {
    const active = app ? Sov.activeSensorsFor(app.id).length : Object.keys(Sov.get().sensors).length;
    if (active) return 'live';
    return insWarnings(app).some(w => w.level !== 'ok') ? 'warn' : '';
  }

  function updateInsight() {
    const box = $('#insight'); if (!box) return;
    // Hidden while locked (covers boot too) or if the user hid the handle.
    const hidden = S.locked || PREF.get('insHidden', false);
    box.classList.toggle('hidden', hidden);
    if (hidden) S.insTab = null;
    applyInsightSide();
    const app = insightCtx();
    const hd = box.querySelector('.ih-dot');
    if (hd) hd.className = 'ih-dot' + (insHandleState(app) ? ' ' + insHandleState(app) : '');
    INS_SECTIONS.forEach(s => {
      const tab = $(`#insight [data-ins="${s.id}"]`); if (!tab) return;
      tab.classList.toggle('on', S.insTab === s.id);
      const dot = tab.querySelector('.it-dot'), num = tab.querySelector('.it-num');
      const b = insBadge(s.id, app);
      dot.className = 'it-dot' + (b.dot ? ' ' + b.dot : '');
      num.textContent = b.num || '';
    });
    const open = !!S.insTab && !S.locked;
    box.classList.toggle('open', open);
    const scrim = $('#insScrim'); if (scrim) scrim.classList.toggle('on', open);
    if (open) fillInsight(S.insTab, app);
  }

  function insBadge(sec, app) {
    if (sec === 'access') {
      const n = app ? Sov.activeSensorsFor(app.id).length : Object.keys(Sov.get().sensors).length;
      return { dot: n ? 'live' : '' };
    }
    if (sec === 'net') { const l = insNetlog(app); return { num: l.length || '' }; }
    if (sec === 'sec')  { return { dot: insWarnings(app).some(w => w.level !== 'ok') ? 'warn' : '' }; }
    if (sec === 'res')  {
      const c = _sysStats ? Math.min(100, Math.round(_sysStats.load[0] / (_sysStats.cores || 1) * 100)) : 0;
      return { dot: c >= 85 ? 'warn' : '' };
    }
    return {};
  }

  function fillInsight(sec, app) {
    const panel = $('#insPanel'); if (!panel) return;
    const meta = INS_SECTIONS.find(x => x.id === sec);
    const ctx = app ? esc(app.name) : 'This device';
    let body = '';
    if (sec === 'access') body = insAccessBody(app);
    else if (sec === 'res') { body = insResBody(app); refreshSys(); }
    else if (sec === 'net') body = insNetBody(app);
    else if (sec === 'sec') body = insSecBody(app);
    panel.innerHTML =
      `<div class="ip-head">${ic(meta.ic, 15)}<span class="ip-title">${meta.label}</span>
         <span class="ip-ctx">${ctx}</span></div><div class="ip-body">${body}</div>
       <button class="ins-hide" id="insHide">${ic('x', 12)} Hide this handle</button>`;
    wireInsight(sec, app);
  }

  // ---- Access: per-app permission toggles (or the device-wide live readout) --
  function insAccessBody(app) {
    if (!app) {
      const using = Sov.running().map(r => ({ app: Sov.app(r.appId), sens: Sov.activeSensorsFor(r.appId) }))
        .filter(x => x.app && (x.sens.length || x.app.net));
      const rows = using.length ? using.map(x => `
        <div class="ins-perm">
          <span class="pm-ic" style="color:${x.app.color}">${ic(x.app.glyph, 16)}</span>
          <span class="pm-lbl">${esc(x.app.name)}</span>
          ${x.sens.map(s => `<span class="li-tag ${s}"><span class="dot"></span>${({ mic: 'Mic', cam: 'Cam', loc: 'Loc' }[s])}</span>`).join('')}
          ${x.app.net ? '<span class="li-tag net"><span class="dot"></span>Net</span>' : ''}
        </div>`).join('')
        : `<div class="ins-warn ok"><span class="wn-ic">${ic('shieldChk', 16)}</span><span>Nothing is using your mic, camera, location or network.</span></div>`;
      return `<div class="ins-sec-lead">What has access right now. Open an app to manage its permissions here.</div>${rows}`;
    }
    const perms = Sov.perms(app.id);
    const active = new Set(Sov.activeSensorsFor(app.id));
    const declares = new Set([...(app.uses || []).map(s => SENS2PERM[s]), ...(app.perms || []), ...(app.net ? ['network'] : [])]);
    const rows = INS_CAPS.map(c => ({ c, on: (perms[c.key] || 'ask') === 'allow',
        live: c.sensor && active.has(c.sensor), rel: declares.has(c.key) }))
      .sort((a, b) => (b.rel ? 1 : 0) - (a.rel ? 1 : 0))
      .map(r => `
        <div class="ins-perm" data-perm="${r.c.key}">
          <span class="pm-ic">${ic(r.c.ic, 16)}</span>
          <span class="pm-lbl">${r.c.label}${r.rel ? '' : ' <span class="wn-sub">· not requested</span>'}</span>
          ${r.live ? '<span class="pm-live"></span>' : ''}
          <span class="ins-tgl ${r.on ? 'on' : ''}"></span>
        </div>`).join('');
    return `<div class="ins-sec-lead">Tap a switch to allow or block ${esc(app.name)}. A live dot means it's in use now; blocking cuts it off immediately.</div>${rows}`;
  }

  // ---- Resources: how hard the device is working (system-wide, honestly) -----
  function insResBody(app) {
    const s = _sysStats;
    if (!s) return `<div class="ins-sec-lead">Reading system resources…</div>`;
    const cpu = Math.min(100, Math.round(s.load[0] / (s.cores || 1) * 100));
    const memPct = Math.round(s.mem.used / s.mem.total * 100);
    const swapPct = s.swap && s.swap.total ? Math.round(s.swap.used / s.swap.total * 100) : 0;
    const up = (sec => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
      return h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + 'h ' + m + 'm'; })(s.uptime || 0);
    const cls = p => p >= 90 ? 'crit' : p >= 75 ? 'warn' : '';
    const stat = (lbl, val, pct) => `
      <div class="ins-stat"><div class="st-top"><span>${lbl}</span><b>${val}</b></div>
        <div class="ins-bar ${cls(pct)}"><span style="width:${Math.max(2, pct)}%"></span></div></div>`;
    const lead = app
      ? `System-wide load while <b>${esc(app.name)}</b> is open. Per-app metering arrives with the on-device sandbox.`
      : `How hard your device is working right now.`;
    return `<div class="ins-sec-lead">${lead}</div>
      ${stat('CPU', cpu + '%', cpu)}
      ${stat('Memory', (s.mem.used / 1024).toFixed(1) + ' / ' + (s.mem.total / 1024).toFixed(0) + ' GB', memPct)}
      ${s.swap && s.swap.total ? stat('Swap', swapPct + '%', swapPct) : ''}
      <div class="ins-net"><span class="nt-host" style="font-family:inherit">Uptime</span><span class="nt-ct">${up}</span></div>`;
  }
  async function refreshSys() {
    try { _sysStats = await Sov.system(); } catch (e) { return; }
    if (S.insTab === 'res') { const b = $('#insPanel .ip-body'); if (b) b.innerHTML = insResBody(insightCtx()); }
  }

  // ---- Network: the connection log, scoped to the app, one-tap block ---------
  function insNetBody(app) {
    const all = Sov.netlog();
    const log = app ? all.filter(n => n.appId === app.id) : all;
    if (!log.length) return `<div class="ins-warn ok"><span class="wn-ic">${ic('shieldChk', 16)}</span><span>${app ? esc(app.name) + ' has made no connections.' : 'No network activity logged.'}</span></div>`;
    const rows = log.map(n => {
      const idx = all.indexOf(n), ap = Sov.app(n.appId);
      return `<div class="ins-net ${n.blocked ? 'blocked' : ''}" data-nethost="${idx}">
        <span class="nt-host">${esc(n.host)}</span>
        <span class="nt-ct">${app ? '' : (ap ? esc(ap.name) + ' · ' : '')}${n.count}×${n.when ? ' · ' + esc(n.when) : ''}</span>
        <button class="nt-block">${n.blocked ? 'Blocked' : 'Block'}</button></div>`;
    }).join('');
    return `<div class="ins-sec-lead">${app ? 'Where ' + esc(app.name) + ' connects' : 'Every connection your apps make'} — tap to block a host.</div>${rows}`;
  }

  // ---- Privacy: a plain-language risk read, scoped to the app or the device --
  function insSecBody(app) {
    return `<div class="ins-sec-lead">${app ? 'Privacy &amp; security for ' + esc(app.name) : 'Your device at a glance'}.</div>` +
      insWarnings(app).map(w => `<div class="ins-warn ${w.level}"><span class="wn-ic">${ic(w.ic, 16)}</span>
        <span>${w.text}${w.sub ? `<div class="wn-sub">${w.sub}</div>` : ''}</span></div>`).join('');
  }
  function insWarnings(app) {
    const st = Sov.get(), out = [];
    if (app) {
      const perms = Sov.perms(app.id), active = Sov.activeSensorsFor(app.id);
      if (active.length) out.push({ level: 'warn', ic: 'eye', text: `Using ${active.map(s => ({ mic: 'microphone', cam: 'camera', loc: 'location' }[s])).join(', ')} right now.` });
      const granted = ['camera', 'mic', 'location'].filter(k => (perms[k] || 'ask') === 'allow');
      if (granted.length) out.push({ level: 'warn', ic: 'shield', text: `Standing access to ${granted.map(k => ({ camera: 'camera', mic: 'microphone', location: 'location' }[k])).join(', ')}.`, sub: 'Toggle it off under Access.' });
      const blk = insNetlog(app).filter(n => n.blocked);
      if (blk.length) out.push({ level: 'alert', ic: 'globe', text: `${blk.length} connection${blk.length > 1 ? 's' : ''} blocked.`, sub: blk.map(b => b.host).join(', ') });
      if (!out.length) out.push({ level: 'ok', ic: 'shieldChk', text: `${esc(app.name)} isn't using any sensor, and nothing's flagged.` });
      return out;
    }
    const sensors = Object.keys(st.sensors);
    if (sensors.length) out.push({ level: 'warn', ic: 'eye', text: `${sensors.map(s => ({ mic: 'Microphone', cam: 'Camera', loc: 'Location' }[s])).join(', ')} in use now.` });
    const grants = Object.values(Sov.allPerms()).filter(p => ['camera', 'mic', 'location'].some(k => (p[k] || 'ask') === 'allow')).length;
    if (grants) out.push({ level: 'warn', ic: 'shield', text: `${grants} app${grants > 1 ? 's' : ''} can use a sensor.`, sub: 'Review under Permissions.' });
    const blk = Sov.netlog().filter(n => n.blocked);
    if (blk.length) out.push({ level: 'alert', ic: 'globe', text: `${blk.length} host${blk.length > 1 ? 's' : ''} blocked.`, sub: blk.map(b => b.host).join(', ') });
    out.push({ level: st.vault.unlocked ? 'warn' : 'ok', ic: 'lock', text: `Vault ${st.vault.unlocked ? 'unlocked' : 'locked'}.`, sub: st.disk.encrypted ? 'Disk encrypted · ' + esc(st.disk.algo || 'LUKS2') : '' });
    if (st.net.vpn) out.push({ level: 'ok', ic: 'shieldChk', text: 'VPN active — traffic is tunneled.' });
    return out;
  }

  function wireInsight(sec, app) {
    const panel = $('#insPanel'); if (!panel) return;
    const hide = panel.querySelector('#insHide');
    if (hide) hide.onclick = () => {
      PREF.set('insHidden', true); S.insTab = null; updateInsight();
      toast('Handle hidden — turn it back on in Personalize', '', 'shieldChk');
    };
    if (sec === 'access' && app) {
      panel.querySelectorAll('[data-perm]').forEach(row => {
        row.querySelector('.ins-tgl').onclick = () => {
          const key = row.dataset.perm, next = (Sov.perms(app.id)[key] || 'ask') === 'allow' ? 'deny' : 'allow';
          Sov.setPerm(app.id, key, next);
          const sensor = PERM2SENS[key];
          if (sensor && next === 'deny') Sov.releaseSensor(sensor, app.id);
          if (sensor && next === 'allow' && (app.uses || []).includes(sensor)) Sov.acquireSensor(sensor, app.id);
          toast(`${cap(esc(app.name))} ${next === 'allow' ? 'can use' : 'can no longer use'} ${INS_CAPS.find(c => c.key === key).label.toLowerCase()}`,
                next === 'allow' ? 'ok' : 'warn', next === 'allow' ? 'check' : 'shield');
          fillInsight('access', app); updateInsight();
        };
      });
    }
    if (sec === 'net') {
      panel.querySelectorAll('[data-nethost]').forEach(row => {
        row.querySelector('.nt-block').onclick = () => {
          Sov.blockHost(parseInt(row.dataset.nethost, 10));
          toast('Host blocked', 'warn', 'globe');
          fillInsight('net', app); updateInsight();
        };
      });
    }
  }

  function bindHome() {
    // data-launch on focus card + tiles; bindLaunchers also wires
    // data-nav (All apps) and data-cut (Cut off) via bindNav.
    bindLaunchers($('#v-home'));
    // Widgets open their own settings (the iOS pattern): the clock opens
    // Clock & widgets, the weather reading opens Weather, the date opens the
    // Calendar. Only outside edit mode — there, these gestures drag/resize.
    if (!S.homeEdit) {
      const ck = $('#homeClock'); if (ck) ck.onclick = () => go('pz-clock');
      const wx = $('#homeWx');    if (wx) wx.onclick = () => go('pz-weather');
      const dt = $('#v-home .aura-date'); if (dt) dt.onclick = () => go('calendar');
    }
  }

  /* ======================================================================
     APP DRAWER
     ====================================================================== */
  // The classic icon-brick launcher — the app drawer's tile, for the full A–Z
  // grid one tap from the home screen for people who just want the familiar grid.
  function appIcon(app, cls = '') {
    const using = Sov.activeSensorsFor(app.id).length ? 'using' : '';
    return `
      <button class="app ${using} ${cls}" data-launch="${app.id}">
        <span class="app-ic" style="--tint:${app.color}">
          <span class="use-ring"></span>${ic(app.glyph, 26)}
        </span>
        <span class="app-lbl">${esc(app.name)}</span>
      </button>`;
  }

  // Real installed apps, discovered once from the agent's capability registry
  // and cached. This is what makes Ubuntu's own apps (Software, Text Editor,
  // LibreOffice, …) live inside the OS's launcher.
  let INSTALLED = null, _androidApps = null, _srch = null;
  let _drawerCat = 'All';   // the app library's selected shelf (chips row)
  const catIcon = cats => {
    const c = (cats || []).map(x => x.toLowerCase());
    if (c.some(x => /audio|video|music|player/.test(x))) return 'music';
    if (c.some(x => /network|web|internet/.test(x))) return 'globe';
    if (c.some(x => /graphics|photo|image/.test(x))) return 'photo';
    if (c.some(x => /office|document|text|wordprocessor/.test(x))) return 'note';
    if (c.some(x => /develop|terminal/.test(x))) return 'terminal';
    if (c.some(x => /system|settings/.test(x))) return 'gear';
    if (c.some(x => /utility|calc/.test(x))) return 'grid';
    return 'layers';
  };

  // Spotlight index — the drawer search spans more than app names: it reaches
  // settings pages and quick actions, so one field is a launcher for the whole
  // OS. Each entry runs through the shell's normal nav/launch/action paths.
  let _spotContacts = null;   // contacts folded into spotlight (loaded once, async)
  function spotlightIndex() {
    return [...(_spotContacts || []),
      { label: 'Wi-Fi', sub: 'Networks & connection', icon: 'wifi', kw: 'internet wireless connect network', run: () => go('sys-wifi') },
      { label: 'Bluetooth', sub: 'Devices & radio', icon: 'bt', kw: 'pair headphones', run: () => go('sys-bluetooth') },
      { label: 'Display', sub: 'Brightness', icon: 'sun', kw: 'brightness screen light', run: () => go('sys-display') },
      { label: 'Sound', sub: 'Volume', icon: 'vol', kw: 'volume audio mute loud', run: () => go('sys-sound') },
      { label: 'Date & time', sub: 'Timezone & clock', icon: 'clock', kw: 'timezone', run: () => go('sys-datetime') },
      { label: 'Notifications', sub: 'Do Not Disturb & lock screen', icon: 'bell', kw: 'dnd silence alerts banners lock content', run: () => go('sys-notifications') },
      { label: 'App Store', sub: 'Install free & open apps', icon: 'store', kw: 'install fdroid android download apps', run: () => go('appstore') },
      { label: 'Clock & widgets', sub: 'Home clock style, size & widgets', icon: 'clock', kw: 'widget clock style size up next terminal', run: () => go('pz-clock') },
      { label: 'Wallpaper', sub: 'Backgrounds & the daily image', icon: 'photo', kw: 'background daily image photo contrast', run: () => go('pz-wallpaper') },
      { label: 'Ambience', sub: 'Live effects & Night Light', icon: 'spark', kw: 'effects aurora starfield rain night light motion', run: () => go('pz-fx') },
      { label: 'About', sub: 'Device, OS, hardware', icon: 'info', kw: 'version kernel cpu hostname', run: () => go('sys-about') },
      { label: 'System Monitor', sub: 'CPU, memory, processes', icon: 'chart', kw: 'cpu ram load processes performance', run: () => go('sys-monitor') },
      { label: 'Storage', sub: 'Disks & usage', icon: 'disk', kw: 'disk space filesystem', run: () => go('sys-storage') },
      { label: 'Personalize', sub: 'Wallpaper, home, focus', icon: 'grid', kw: 'wallpaper theme background layout', run: () => go('personalize') },
      { label: 'Permissions', sub: 'What each app can access', icon: 'shieldChk', kw: 'privacy camera mic location allow deny', run: () => go('permissions') },
      { label: 'Network', sub: 'Connections & blocking', icon: 'globe', kw: 'firewall block hosts traffic', run: () => go('network') },
      { label: 'Vault', sub: 'Encrypted storage', icon: 'lock', kw: 'encryption secure', run: () => go('vault') },
      { label: 'AI Engine', sub: 'Local models, memory, trust', icon: 'brain', kw: 'assistant intelligence model', run: () => go('sys-ai') },
      { label: 'Power', sub: 'Restart · Shut down', icon: 'power', kw: 'reboot shutdown off restart', run: () => go('sys-power') },
      { label: 'Lock device', sub: 'Action', icon: 'lock', kw: 'lock secure sleep', run: () => lockDevice() },
      { label: 'New note', sub: 'Action', icon: 'note', kw: 'write jot memo', run: () => go('notes') },
      { label: Sov.notify.dnd() ? 'Turn off Do Not Disturb' : 'Do Not Disturb', sub: 'Action', icon: 'bell', kw: 'silence quiet mute notifications', run: () => { const v = !Sov.notify.dnd(); Sov.notify.dnd(v); toast(v ? 'Do Not Disturb on' : 'Do Not Disturb off', v ? 'warn' : 'ok', 'bell'); renderPane(Sov.get()); } },
      { label: 'Toggle Wi-Fi', sub: 'Action', icon: 'wifi', kw: 'wifi on off internet', run: () => { const v = !Sov.get().net.wifi; Sov.setToggle('wifi', v); toast(`Wi-Fi ${v ? 'on' : 'off'}`, 'ok', 'wifi'); } },
    ];
  }
  // Deep search across your content. Each entry has a run() that opens the right
  // place: notes → that note, events → the calendar on that day, etc.
  function buildDeep(q) {
    const g = [], d = _srch || {};
    const push = (title, icon, entries) => { if (entries.length) g.push({ title, icon, entries }); };
    push('Notes', 'note', (d.notes || []).filter(n => (n.text || '').toLowerCase().includes(q)).slice(0, 6).map(n => ({
      label: ((n.text || '').trim().split('\n')[0] || 'Untitled note').slice(0, 52), sub: 'Note', icon: 'note',
      run: () => { S.pendingNote = n.id; go('notes'); } })));
    push('Events', 'calendar', (d.events || []).filter(e => ((e.title || '') + ' ' + (e.notes || '')).toLowerCase().includes(q)).slice(0, 6).map(e => ({
      label: e.title || 'Event', sub: (e.date || '') + (e.time ? ' · ' + e.time : ''), icon: 'calendar',
      run: () => { _calSel = e.date; _calYM = e.date ? { y: +e.date.slice(0, 4), m: +e.date.slice(5, 7) - 1 } : null; go('calendar'); } })));
    push('Messages', 'msg', (d.sms || []).filter(m => ((m.text || '') + ' ' + (m.number || '')).toLowerCase().includes(q)).slice(0, 6).map(m => ({
      label: m.text || '(no text)', sub: (m.sent ? 'To ' : 'From ') + (m.number || ''), icon: 'msg',
      run: () => launch('messages') })));
    push('Music', 'music', (d.music || []).filter(t => (t.name || '').toLowerCase().includes(q)).slice(0, 6).map(t => ({
      label: t.name, sub: 'Track', icon: 'music', run: () => launch('music') })));
    push('Photos', 'photo', (d.photos || []).filter(x => (x.name || '').toLowerCase().includes(q)).slice(0, 6).map(x => ({
      label: x.name, sub: 'Photo', icon: 'photo', run: () => launch('photos') })));
    // Get apps you don't have yet — one-tap install from the App Store.
    push('Get from App Store', 'store', (d.store || []).filter(a => !a.installed && ((a.name || '') + ' ' + (a.summary || '')).toLowerCase().includes(q)).slice(0, 5).map(a => ({
      label: 'Install ' + a.name, sub: a.summary || a.package, icon: 'store',
      run: async () => {
        toast('Installing ' + a.name + '…', 'good', 'store');
        const r = await Sov.androidStoreInstall(a.package);
        if (r && r.ok) { addAndroidToHome(a.package, a.name); toast(a.name + ' added to home', 'good', 'store'); }
        else toast((r && r.error) || 'Install failed', 'alert', 'x');
      } })));
    // Always offer a web search for the query.
    g.push({ title: 'Web', icon: 'browser', entries: [{
      label: 'Search the web for “' + q + '”', sub: 'Browser', icon: 'browser',
      run: () => { S.pendingBrowse = q; launch('browser'); } }] });
    return g;
  }
  function spotlightMatches(q) {
    if (!q) return [];
    return spotlightIndex().map(e => {
      const l = e.label.toLowerCase();
      let score = 0;
      if (l === q) score = 100; else if (l.startsWith(q)) score = 80;
      else if (l.includes(q)) score = 60; else if ((e.kw || '').includes(q)) score = 40;
      return { e, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.e);
  }

  // Open the universal search (the drawer) with the field focused — from the
  // home search pill or a swipe.
  function openSearch() { S.focusSearch = true; go('drawer'); }

  async function renderDrawer(filter = '') {
    if (S.pendingQuery != null) { filter = S.pendingQuery; S.pendingQuery = null; S.focusSearch = true; }
    if (INSTALLED === null) {
      INSTALLED = [];
      const caps = await Sov.capabilities();
      INSTALLED = (caps && caps.apps) || [];
      if (S.view !== 'drawer') return;   // navigated away while loading
    }
    if (_androidApps === null) {   // installed Android apps, unified into the app list
      _androidApps = [];
      try { _androidApps = await Sov.androidApps(); } catch (e) {}
    }
    if (_srch === null) {   // deep-search content: notes, events, messages, music, photos, store
      _srch = { notes: [], events: [], sms: [], music: [], photos: [], store: [] };
      try { _srch.notes = await Sov.notes.list(); } catch (e) {}
      try { _srch.events = await Sov.calendar.list(); } catch (e) {}
      try { _srch.sms = (await Sov.sms.list()).messages || []; } catch (e) {}
      try { _srch.music = (await Sov.music()).items || []; } catch (e) {}
      try { _srch.photos = (await Sov.photos()).items || []; } catch (e) {}
      try { _srch.store = (await Sov.androidStoreCatalog('')).apps || []; } catch (e) {}
    }
    if (_spotContacts === null) {   // fold contacts into search — call from a search
      _spotContacts = [];
      try {
        _spotContacts = (await Sov.contacts.list()).map(c => ({
          label: c.name || c.number || 'Contact', sub: 'Contact · ' + (c.number || ''), icon: 'contacts',
          kw: ((c.number || '') + ' call message contact ' + (c.name || '')).toLowerCase(),
          run: () => { Sov.phone.dial(c.number); toast('Calling ' + (c.name || c.number) + '…', '', 'phone'); },
        }));
      } catch (e) {}
    }
    const q = filter.trim().toLowerCase();
    const apps = Sov.apps().filter(a => !q || a.name.toLowerCase().includes(q));
    const cats = {};
    apps.forEach(a => { (cats[a.cat] = cats[a.cat] || []).push(a); });
    // A tidy library: alphabetical inside each shelf, and (when not searching)
    // one row of category chips to jump straight to a shelf.
    Object.values(cats).forEach(l => l.sort((a, b) => a.name.localeCompare(b.name)));
    const catNames = Object.keys(cats);
    const hasInst = !!((INSTALLED && INSTALLED.length) || (_androidApps && _androidApps.length));
    const showCat = q ? 'All' : ((_drawerCat === 'Installed' && hasInst) || catNames.includes(_drawerCat) ? _drawerCat : 'All');

    const grid = Object.entries(cats)
      .filter(([cat]) => showCat === 'All' || showCat === cat)
      .map(([cat, list]) => `
          <div class="lx-cat">${esc(cat)}</div>
          <div class="app-grid">${list.map(a => appIcon(a)).join('')}</div>`).join('');

    // real installed apps (deduped against the built-in names). Native Linux and
    // Android apps live in this one list, shown identically — an app's own icon
    // when we have it, a category glyph otherwise. Nothing marks an app "Android".
    // One "Apps" list for everything installed — native Linux apps and Android
    // apps, shown identically (its own icon when we have it). Nothing marks an
    // app "Android"; they're first-class. Android apps come from one source
    // (Sov.androidApps → android:<pkg>), so the raw waydroid.* .desktop entries
    // are filtered out of the native list to avoid showing each app twice.
    const iconRow = (iconUrl, fallbackGlyph) => iconUrl
      ? `<span class="glyph"><img class="app-ico-img" src="${esc(iconUrl)}" onerror="this.remove()" alt=""></span>`
      : `<span class="glyph">${ic(fallbackGlyph, 18)}</span>`;
    const appRow = (attr, iconUrl, glyph, name, sub) => `
      <button class="row tappable" ${attr} style="width:100%;text-align:left">
        ${iconRow(iconUrl, glyph)}
        <span class="rtext"><div class="rtitle">${esc(name)}</div>
          <div class="rsub">${esc(sub)}</div></span>
        <span class="chev">${ic('chev', 16)}</span></button>`;
    const builtinNames = new Set(Sov.apps().map(a => a.name.toLowerCase()));
    const nativeRows = INSTALLED
      .filter(a => !builtinNames.has(a.name.toLowerCase()))
      .filter(a => String(a.id).indexOf('waydroid.') !== 0)   // Android shown via the unified list
      .filter(a => !q || a.name.toLowerCase().includes(q) || (a.comment || '').toLowerCase().includes(q))
      .map(a => appRow(`data-launch="desktop:${esc(a.id)}"`, a.icon ? Sov.appIconUrl(a.id) : null, catIcon(a.categories), a.name, a.comment || a.id));
    const androidRows = (_androidApps || [])
      .filter(a => a && a.package && (!q || (a.name || '').toLowerCase().includes(q)))
      .map(a => appRow(`data-launch="android:${esc(a.package)}"`, Sov.appIconUrl('waydroid.' + a.package), 'android', a.name || a.package, 'App'));
    const allRows = [...nativeRows, ...androidRows];
    const instHTML = allRows.length && (showCat === 'All' || showCat === 'Installed')
      ? `<div class="lx-cat">Installed on this device · ${allRows.length}</div><div class="card">${allRows.join('')}</div>` : '';
    const chipsHTML = q ? '' : `<div class="chips lx-chips">${
      ['All', ...catNames, ...(hasInst ? ['Installed'] : [])].map(c =>
        `<button class="chip ${showCat === c ? 'on' : ''}" data-lxcat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;

    // Deep search: your actual content — notes, events, messages, music, photos.
    // Each result opens the right place.
    const deep = q ? buildDeep(q) : [];
    const deepHTML = deep.map((g, gi) => `
      <div class="lx-cat">${esc(g.title)} · ${g.entries.length}</div>
      <div class="card">${g.entries.map((e, i) => `
        <button class="row tappable" data-deep="${gi}:${i}" style="width:100%;text-align:left">
          <span class="glyph">${ic(e.icon, 18)}</span>
          <span class="rtext"><div class="rtitle">${esc(e.label)}</div>
            <div class="rsub">${esc(e.sub)}</div></span>
          <span class="chev">${ic('chev', 16)}</span></button>`).join('')}</div>`).join('');

    // Spotlight: settings pages + quick actions matching the query.
    const spots = spotlightMatches(q);
    const spotHTML = spots.length ? `
      <div class="lx-cat">Settings &amp; actions · ${spots.length}</div>
      <div class="card">${spots.map((s, i) => `
        <button class="row tappable" data-spot="${i}" style="width:100%;text-align:left">
          <span class="glyph">${ic(s.icon, 18)}</span>
          <span class="rtext"><div class="rtitle">${esc(s.label)}</div>
            <div class="rsub">${esc(s.sub)}</div></span>
          <span class="chev">${ic('chev', 16)}</span></button>`).join('')}</div>` : '';

    const nothing = !grid && !instHTML && !spotHTML && !deepHTML
      ? `<div class="lx-none">Nothing matches “${esc(filter)}”.</div>` : '';

    $('#drawerScroll').innerHTML = `
      <div class="lx-search">${ic('search',18)}
        <input id="lxInput" placeholder="Search apps, contacts, notes, files…" value="${esc(filter)}" autocomplete="off"></div>
      ${chipsHTML}${grid}${instHTML}${deepHTML}<div id="srchFiles"></div>${spotHTML}${nothing}
    `;
    const input = $('#lxInput');
    input.oninput = () => renderDrawer(input.value);
    $('#drawerScroll').querySelectorAll('[data-lxcat]').forEach(b => b.onclick = () => {
      _drawerCat = b.dataset.lxcat; renderDrawer('');
    });
    input.onkeydown = e => e.stopPropagation();
    if (filter) { input.focus(); input.setSelectionRange(filter.length, filter.length); }
    else if (S.focusSearch) { S.focusSearch = false; input.focus(); }
    bindLaunchers($('#v-drawer'));
    wireAppMenus($('#drawerScroll'));   // long-press an icon → add-to-home / uninstall menu
    $('#drawerScroll').querySelectorAll('[data-deep]').forEach(b => b.onclick = () => {
      const [gi, i] = b.dataset.deep.split(':').map(Number); deep[gi].entries[i].run();
    });
    // Files: searched on the agent (async) so typing stays snappy; fill when ready.
    if (q.length >= 2) Sov.files.search(q).then(res => {
      const box = $('#srchFiles'); if (!box || input.value.trim().toLowerCase() !== q) return;
      if (!res.length) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="lx-cat">Files · ${res.length}</div><div class="card">${res.slice(0, 12).map(f => `
        <button class="row tappable" data-file="${esc(f.dir)}" style="width:100%;text-align:left">
          <span class="glyph">${ic('file', 18)}</span>
          <span class="rtext"><div class="rtitle">${esc(f.name)}</div>
            <div class="rsub mono" style="opacity:.6">${esc(f.dir)}</div></span>
          <span class="chev">${ic('chev', 16)}</span></button>`).join('')}</div>`;
      box.querySelectorAll('[data-file]').forEach(b => b.onclick = () => { S.fmPath = b.dataset.file; go('files'); });
    });
    $('#drawerScroll').querySelectorAll('[data-spot]').forEach(b => b.onclick = () => spots[+b.dataset.spot].run());
    // (native Linux apps launch through launch('desktop:…') via data-launch —
    // same path as every other app, so they also get the long-press menu)
  }

  /* ======================================================================
     CONTROL CENTER  (pull-down quick settings + sovereignty controls)
     ====================================================================== */
  // A single notification card — used in both the shade and the lock screen.
  // On the lock screen `locked` hides the body unless the user opted in.
  function notifCardHTML(n, { locked = false } = {}) {
    const app = Sov.app(n.app);
    const col = n.color || (app && app.color) || 'var(--s4)';
    const glyph = (app && app.glyph) || n.icon || 'bell';
    const hideBody = locked && !Sov.notify.showOnLock();
    const body = hideBody
      ? `<div class="nt-body locked">${ic('lock',11)} Content hidden — unlock to view</div>`
      : (n.body ? `<div class="nt-body">${esc(n.body)}</div>` : '');
    const dismiss = locked ? '' : `<button class="nt-x" data-ndismiss="${esc(n.id)}" aria-label="Dismiss">${ic('x',13)}</button>`;
    return `<div class="nt-card${n.seen ? '' : ' fresh'}" ${n.nav && !locked ? `data-nnav="${esc(n.nav)}"` : ''}>
      <span class="nt-badge" style="--tint:${col}">${ic(glyph,14)}</span>
      <div class="nt-main">
        <div class="nt-top"><span class="nt-app">${esc((app && app.name) || n.title || 'System')}</span>
          <span class="nt-when">${fmtWhen(n.ts)}</span></div>
        ${app ? `<div class="nt-title">${esc(n.title)}</div>` : ''}
        ${body}
      </div>${dismiss}</div>`;
  }

  // The pull-down is two separate panels behind one sheet: Notifications and
  // Controls. Pull down on the left half of the pane (or tap the bell) for
  // notifications; the right half for quick settings. Tabs switch in place.
  function ctlTabsHTML() {
    const list = Sov.notify.list();
    const unseen = Sov.notify.unseen();
    return `<div class="ctl-tabs">
      <button class="ctl-tab ${S.ctlTab === 'notifs' ? 'on' : ''}" data-ctltab="notifs">
        ${ic('bell',15)}<span>Notifications</span>${list.length ? `<span class="tab-n${unseen ? ' fresh' : ''}">${list.length}</span>` : ''}</button>
      <button class="ctl-tab ${S.ctlTab === 'controls' ? 'on' : ''}" data-ctltab="controls">
        ${ic('gear',15)}<span>Controls</span></button>
    </div>`;
  }
  function bindCtlTabs() {
    $('#controlBody').querySelectorAll('[data-ctltab]').forEach(b => b.onclick = () => {
      if (S.ctlTab === b.dataset.ctltab) return;
      S.ctlTab = b.dataset.ctltab;
      if (S.ctlTab === 'notifs') { Sov.notify.markAllSeen(); renderPane(Sov.get()); }
      renderControl();
    });
  }

  function renderControl() {
    S.recentsOpen = false;
    if (S.ctlTab === 'notifs') renderNotifPanel();
    else renderControlPanel();
    bindCtlTabs();
  }

  /* ---- Notifications panel ---- */
  function renderNotifPanel() {
    const list = Sov.notify.list();
    const dnd = Sov.notify.dnd();
    $('#controlBody').innerHTML = `
      ${ctlTabsHTML()}
      <div class="nt-shade">
        <div class="nt-head"><span class="eyebrow">${list.length ? 'Notifications · ' + list.length : 'Notifications'}</span>
          <span class="nt-tools">
            <button class="mini-btn ${dnd ? 'danger' : ''}" data-dndq>${dnd ? 'Silenced' : 'Silence'}</button>
            ${list.length ? `<button class="mini-btn" data-nclear>Clear all</button>` : ''}
          </span></div>
        ${list.length
          ? `<div class="nt-list">${list.map(n => notifCardHTML(n)).join('')}</div>`
          : `<div class="nt-empty big">${ic('bell',24)}<span>You're all caught up</span>
               <span class="nt-quiet-sub">Notifications land here — honest about their source, never off-device.</span></div>`}
      </div>`;
    const body = $('#controlBody');
    body.querySelectorAll('[data-ndismiss]').forEach(b => b.onclick = e => {
      e.stopPropagation(); Sov.notify.dismiss(b.dataset.ndismiss); renderControl(); renderPane(Sov.get());
    });
    const clr = body.querySelector('[data-nclear]');
    if (clr) clr.onclick = () => { Sov.notify.clear(); renderControl(); renderPane(Sov.get()); };
    const dq = body.querySelector('[data-dndq]');
    if (dq) dq.onclick = () => {
      const now = !Sov.notify.dnd();
      Sov.notify.dnd(now);
      toast(now ? 'Do Not Disturb on' : 'Do Not Disturb off', now ? 'warn' : 'ok', 'bell');
      renderControl(); renderPane(Sov.get());
    };
    body.querySelectorAll('[data-nnav]').forEach(b => b.onclick = () => {
      closeControl(); go(b.dataset.nnav);
    });
  }

  /* ---- Controls (quick settings) panel ---- */
  function renderControlPanel() {
    const st = Sov.get();
    const t = st.net;
    const tgl = (key, on, icOn, icOff, lbl, stateOn, stateOff, extra = '') => `
      <button class="tgl ${on ? 'on' : ''} ${extra}" data-toggle="${key}">
        <span class="tgl-ic">${ic(on ? icOn : icOff, 22)}</span>
        <span class="tgl-txt"><div class="tgl-lbl">${lbl}</div>
          <div class="tgl-state">${on ? stateOn : stateOff}</div></span>
      </button>`;

    // any sensor class fully killed?
    const perms = Sov.allPerms();
    const killed = k => Sov.apps().every(a => perms[a.id][k] === 'deny');
    const guard = (kind, icOn, icOff, lbl) => {
      const pk = { mic: 'mic', cam: 'camera', loc: 'location' }[kind];
      const armed = killed(pk);
      return `<button class="tgl guard ${armed ? 'armed' : ''}" data-guard="${kind}">
        <span class="tgl-ic">${ic(armed ? icOff : icOn, 22)}</span>
        <span class="tgl-txt"><div class="tgl-lbl">${lbl}</div>
        <div class="tgl-state">${armed ? 'blocked' : 'available'}</div></span></button>`;
    };

    const dnd = Sov.notify.dnd();
    const night = PREF.get('nightlight', false);

    $('#controlBody').innerHTML = `
      ${ctlTabsHTML()}
      <div class="ctl-top">
        <button class="ctl-gear" data-nav="personalize" data-close-control="1">${ic('grid',16)}<span>Personalize</span></button>
        <button class="ctl-gear" data-nav="settings" data-close-control="1">${ic('gear',16)}<span>Settings</span></button>
      </div>
      <div class="toggle-grid">
        ${tgl('wifi', t.wifi && !t.airplane, 'wifi', 'wifiOff', 'Wi-Fi', esc(t.ssid || 'on'), 'off')}
        ${_cellStatus && _cellStatus.present ? tgl('wwan', !!_cellStatus.dataConnected, 'cell', 'cell', 'Mobile data', esc(_cellStatus.tech ? String(_cellStatus.tech).toUpperCase() : 'on'), 'off') : ''}
        ${tgl('bluetooth', t.bluetooth, 'bt', 'bt', 'Bluetooth', 'on', 'off')}
        ${tgl('airplane', t.airplane, 'plane', 'plane', 'Airplane', 'on', 'off')}
        ${tgl('vpn', t.vpn, 'shieldChk', 'shield', 'VPN', 'connected', 'off')}
        ${tgl('dnd', dnd, 'bell', 'bell', 'Do Not Disturb', 'silenced', 'off', 'dnd-tgl')}
        ${tgl('night', night, 'sun', 'sun', 'Night Light', 'warm', 'off', 'night-tgl')}
      </div>

      <div class="slider-block">
        <div class="sb-row"><span class="sb-ic">${ic('sun',20)}</span>
          <input type="range" min="5" max="100" value="${st.brightness}" data-level="brightness"></div>
        <div class="sb-row"><span class="sb-ic">${ic('vol',20)}</span>
          <input type="range" min="0" max="100" value="${st.volume}" data-level="volume"></div>
      </div>

      <div class="section-head"><span class="eyebrow">Sensor guards</span>
        <span class="muted" style="font-size:11px">Cut every app off, instantly</span></div>
      <div class="toggle-grid">
        ${guard('mic', 'mic', 'micOff', 'Microphone')}
        ${guard('cam', 'cam', 'camOff', 'Camera')}
        ${guard('loc', 'loc', 'locOff', 'Location')}
        <button class="tgl" data-nav="permissions" data-close-control="1">
          <span class="tgl-ic">${ic('shieldChk',22)}</span>
          <span class="tgl-txt"><div class="tgl-lbl">Permissions</div>
          <div class="tgl-state">review all</div></span></button>
      </div>

      <div class="ctl-trust">
        <span class="tr-ic">${ic(st.vault.unlocked ? 'shieldChk' : 'lock',22)}</span>
        <span class="tr-txt"><div class="tr-title">${st.disk.encrypted ? 'Storage encrypted' : 'Storage NOT encrypted'}</div>
          <div class="tr-sub">${esc(st.disk.algo)}</div></span>
        <button class="mini-btn" data-nav="vault" data-close-control="1">Vault</button>
      </div>
    `;
    bindControl();
  }

  function bindControl() {
    const body = $('#controlBody');
    body.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
      const k = b.dataset.toggle;
      if (k === 'dnd') {
        const now = !Sov.notify.dnd();
        Sov.notify.dnd(now);
        toast(now ? 'Do Not Disturb on' : 'Do Not Disturb off', now ? 'warn' : 'ok', 'bell');
        renderControl(); renderPane(Sov.get());
        return;
      }
      if (k === 'night') {
        const now = !PREF.get('nightlight', false);
        PREF.set('nightlight', now);
        applyEffects();
        toast(now ? 'Night Light on — warm tint' : 'Night Light off', 'ok', 'sun');
        renderControl();
        return;
      }
      if (k === 'wwan') {
        const cur = !!(_cellStatus && _cellStatus.dataConnected);
        Sov.setToggle('wwan', !cur);
        if (_cellStatus) _cellStatus.dataConnected = !cur;   // optimistic; the watch reconciles
        toast('Mobile data ' + (!cur ? 'on' : 'off'), 'ok', 'cell');
        renderControl();
        return;
      }
      const st = Sov.get();
      const cur = k === 'airplane' ? st.net.airplane : st.net[k];
      Sov.setToggle(k, !cur);
      renderControl();
    });
    body.querySelectorAll('[data-level]').forEach(r => r.oninput = () =>
      Sov.setLevel(r.dataset.level, parseInt(r.value, 10)));
    body.querySelectorAll('[data-guard]').forEach(b => b.onclick = () => {
      const kind = b.dataset.guard;
      const perms = Sov.allPerms();
      const pk = { mic: 'mic', cam: 'camera', loc: 'location' }[kind];
      const armed = Sov.apps().every(a => perms[a.id][pk] === 'deny');
      if (armed) {
        // un-arm: reset that class back to "ask"
        Sov.apps().forEach(a => Sov.setPerm(a.id, pk, 'ask'));
        toast(`${cap(labelFor(kind))} available again — apps must ask`, 'ok', 'shieldChk');
      } else {
        Sov.killSensorClass(kind);
        toast(`${cap(labelFor(kind))} cut off for every app`, 'alert', 'micOff');
      }
      renderControl();
    });
    bindNav(body, () => closeControl());
    wireTileLongPress(body);
  }

  // Long-press a quick-settings tile to jump straight to its full settings
  // page (the classic iOS/Android shortcut) — a quick tap still just toggles.
  const TGL_ROUTE = { wifi: 'sys-wifi', bluetooth: 'sys-bluetooth', vpn: 'network',
    dnd: 'sys-notifications', night: 'pz-fx', wwan: 'sys-wifi', airplane: 'sys-wifi' };
  const GUARD_ROUTE = 'permissions';
  function wireTileLongPress(body) {
    body.querySelectorAll('[data-toggle], [data-guard]').forEach(b => {
      const route = b.dataset.toggle ? TGL_ROUTE[b.dataset.toggle] : GUARD_ROUTE;
      if (!route) return;
      let lp = null, fired = false;
      const start = () => { fired = false; lp = setTimeout(() => { fired = true; closeControl(); go(route); }, 480); };
      const cancel = () => clearTimeout(lp);
      b.addEventListener('pointerdown', start);
      b.addEventListener('pointerup', cancel);
      b.addEventListener('pointercancel', cancel);
      b.addEventListener('pointermove', cancel);
      b.addEventListener('click', e => { if (fired) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    });
  }
  const labelFor = k => ({ mic: 'microphone', cam: 'camera', loc: 'location' }[k]);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function openControl(tab) {
    if (tab) S.ctlTab = tab;
    renderControl();
    $('#control').classList.add('open'); S.controlOpen = true;
    if (S.ctlTab === 'notifs') { Sov.notify.markAllSeen(); renderPane(Sov.get()); }
  }
  function closeControl() { $('#control').classList.remove('open'); S.controlOpen = false; S.recentsOpen = false; }

  /* ======================================================================
     PERMISSIONS SCREEN
     ====================================================================== */
  const PERM_ROWS = [
    { key: 'camera',   ic: 'cam',      name: 'Camera' },
    { key: 'mic',      ic: 'mic',      name: 'Microphone' },
    { key: 'location', ic: 'loc',      name: 'Location' },
    { key: 'contacts', ic: 'contacts', name: 'Contacts' },
    { key: 'files',    ic: 'files',    name: 'Files & media' },
    { key: 'network',  ic: 'globe',    name: 'Network' },
  ];
  function renderPermissions() {
    const apps = Sov.apps();
    const seg = (id, key, val) => {
      const opt = (v, cls, lbl) =>
        `<button class="${val === v ? 'on ' + cls : ''}" data-perm="${id}|${key}|${v}">${lbl}</button>`;
      return `<div class="seg">${opt('allow','allow','Allow')}${opt('ask','ask','Ask')}${opt('deny','deny','Deny')}</div>`;
    };
    const blocks = apps.map(a => {
      const p = Sov.perms(a.id);
      // only show permission rows that are meaningful for this app
      const relevant = PERM_ROWS.filter(r =>
        (a.uses || []).includes({ camera: 'cam', mic: 'mic', location: 'loc' }[r.key]) ||
        (a.perms || []).includes(r.key) ||
        (r.key === 'network' && a.net) || r.key === 'network');
      const rows = (relevant.length ? relevant : PERM_ROWS).map(r => `
        <div class="perm-line"><span class="pl-ic">${ic(r.ic,20)}</span>
          <span class="pl-name">${r.name}</span>${seg(a.id, r.key, p[r.key] || 'ask')}</div>`).join('');
      return `
        <div class="perm-app card">
          <div class="perm-app-head">
            <span class="pa-badge" style="--tint:${a.color}">${ic(a.glyph,18)}</span>
            <div><div class="pa-name">${esc(a.name)}</div>
              <div class="pa-sub">${esc(a.cat.toLowerCase())}</div></div>
          </div>${rows}
        </div>`;
    }).join('');

    $('#screenScroll').innerHTML = `
      <div class="screen-head"><div class="eyebrow">Aura · Privacy</div>
        <div class="h1">Permissions</div>
        <div class="screen-lead">Every app's access to your sensors and data — set once, changeable anytime. Nothing here is granted without you saying so.</div></div>
      ${blocks}
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-perm]').forEach(b => b.onclick = () => {
      const [id, key, v] = b.dataset.perm.split('|');
      Sov.setPerm(id, key, v);
      renderPermissions();
      if (v === 'deny') toast(`${cap(esc(Sov.app(id).name))} can no longer use ${key}`, 'ok', 'check');
    });
  }

  /* ======================================================================
     NETWORK SCREEN
     ====================================================================== */
  function renderNetwork() {
    const log = Sov.netlog();
    const total = log.reduce((s, n) => s + n.count, 0);
    const blocked = log.filter(n => n.blocked).length;
    const hosts = new Set(log.map(n => n.host)).size;

    const items = log.map((n, i) => {
      const app = Sov.app(n.appId) || { name: n.appId, glyph: 'globe', color: '#4A5A6A' };
      return `
        <div class="net-item">
          <div class="ni-top">
            <span class="li-badge" style="width:26px;height:26px;--tint:${app.color}">${ic(app.glyph,14)}</span>
            <span class="ni-app">${esc(app.name)}</span>
            <span class="ni-count">${n.count}×</span>
          </div>
          <div class="net-host ${n.blocked ? 'blocked' : ''}">
            <span>${n.blocked ? '⛔ ' : ''}${esc(n.host)} · ${esc(n.when)} ago</span>
            ${n.blocked
              ? `<span class="mini-btn done">blocked</span>`
              : `<button class="mini-btn danger" data-block="${i}">Block</button>`}
          </div>
        </div>`;
    }).join('');

    $('#screenScroll').innerHTML = `
      <div class="screen-head"><div class="eyebrow">Aura · Transparency</div>
        <div class="h1">Network</div>
        <div class="screen-lead">Every connection your apps make, in the open. If something phones home, you'll see it here — and you can cut it.</div></div>
      <div class="net-summary">
        <div class="net-stat"><div class="ns-num">${total}</div><div class="ns-lbl">Requests</div></div>
        <div class="net-stat"><div class="ns-num">${hosts}</div><div class="ns-lbl">Hosts</div></div>
        <div class="net-stat blocked"><div class="ns-num">${blocked}</div><div class="ns-lbl">Blocked</div></div>
      </div>
      <div class="card" style="margin-top:12px">${items}</div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-block]').forEach(b => b.onclick = () => {
      const host = (log[parseInt(b.dataset.block, 10)] || {}).host || 'A host';
      Sov.blockHost(parseInt(b.dataset.block, 10)); renderNetwork();
      toast('Host blocked — future connections refused', 'alert', 'x');
      Sov.notify.push({ app: 'system', icon: 'shield', color: 'var(--alert)', title: 'Connection blocked',
        body: `${host} can no longer be reached by any app.`, nav: 'network' });
    });
  }

  /* ======================================================================
     VAULT SCREEN
     ====================================================================== */
  function renderVault() {
    const st = Sov.get();
    const v = st.vault;
    $('#screenScroll').innerHTML = `
      <div class="screen-head"><div class="eyebrow">Aura · Data</div>
        <div class="h1">Vault</div>
        <div class="screen-lead">Your photos, files and contacts live in an encrypted volume. Pull the storage chip and it's unreadable — the keys never leave this device.</div></div>
      <div class="vault-hero ${v.unlocked ? '' : 'locked'}">
        <div class="vh-ic">${ic(v.unlocked ? 'unlock' : 'lock', 40)}</div>
        <div class="vh-state">${v.unlocked ? 'Unlocked' : 'Locked'}</div>
        <div class="vh-sub">${v.unlocked
          ? 'Apps you allowed can read and write vault data while the device is unlocked.'
          : 'All vault data is sealed. Unlock the device to access it.'}</div>
      </div>
      <div class="card">
        <div class="row"><span class="glyph">${ic('shieldChk',20)}</span>
          <span class="rtext"><div class="rtitle">Encryption</div>
            <div class="rsub mono">${esc(v.algo)}</div></span></div>
        <div class="row"><span class="glyph">${ic('layers',20)}</span>
          <span class="rtext"><div class="rtitle">Storage used</div>
            <div class="vault-meter"><span style="width:${v.usedPct}%"></span></div>
            <div class="rsub mono">${v.usedPct}% of vault</div></span></div>
        <div class="row"><span class="glyph">${ic('key',20)}</span>
          <span class="rtext"><div class="rtitle">Disk encryption</div>
            <div class="rsub mono">${esc(st.disk.algo)}</div></span>
          <span class="pane-chip" style="color:var(--ok);border-color:var(--ok)">ON</span></div>
      </div>
      <div class="card">
        <button class="row tappable" data-vault-toggle="1" style="width:100%;text-align:left">
          <span class="glyph">${ic(v.unlocked ? 'lock' : 'unlock',20)}</span>
          <span class="rtext"><div class="rtitle">${v.unlocked ? 'Lock vault now' : 'Unlock vault'}</div>
            <div class="rsub">${v.unlocked ? 'Seal data without powering off' : 'Make vault data available'}</div></span>
          <span class="chev">${ic('chev',18)}</span></button>
      </div>
      <div style="height:8px"></div>`;
    const btn = $('#screenScroll').querySelector('[data-vault-toggle]');
    if (btn) btn.onclick = () => {
      const now = !Sov.get().vault.unlocked;
      Sov.setVault(now); renderVault();
      toast(now ? 'Vault unlocked' : 'Vault locked — data sealed', now ? 'ok' : 'warn', now ? 'unlock' : 'lock');
    };
  }

  /* ======================================================================
     SETTINGS SCREEN
     ====================================================================== */
  /* ---- shared helpers for settings / system screens --------------------- */
  const stillOn = id => S.view === id;
  const clearScreenTimer = () => { if (S.screenTimer) { clearInterval(S.screenTimer); S.screenTimer = null; } };
  // Which screens have a floating mini version (a live brick) to pop out into.
  const WM_FLOAT = { terminal: 'terminal', notes: 'notes', files: 'files', 'sys-monitor': 'sysmon' };
  // Desktop-style window controls, on the window itself (not buried in
  // settings): every screen is a maximized window, so it gets minimize (–,
  // drop to home) and — when a floating mini version exists — restore-down
  // (❐, pop out as a live brick over home). Wired once, by delegation.
  const wmCtrlsHTML = brick => `<div class="wm-ctrls">
      ${brick ? `<button class="wm-btn" data-wfloat="${brick}" aria-label="Float on home" title="Float on home">${ic('restore', 13)}</button>` : ''}
      <button class="wm-btn" data-wmin aria-label="Minimize to home" title="Minimize">${ic('minus', 14)}</button></div>`;
  const shead = (eyebrow, title, lead = '') =>
    `<div class="screen-head">${wmCtrlsHTML(WM_FLOAT[S.view])}<div class="eyebrow">${eyebrow}</div><div class="h1">${title}</div>` +
    (lead ? `<div class="screen-lead">${lead}</div>` : '') + `</div>`;
  function floatToBrick(id) {
    const d = lwDef(id); if (!d) return;
    // An app view's DOM may exist exactly once: floating an app that owns the
    // frame TAKES OVER from it — tear the frame down (its close handler runs),
    // then the window mounts the same view fresh over home.
    const aid = id.startsWith('app:') ? id.slice(4) : id;
    if (_frameApp === aid) {
      S.appOpen = null;
      teardownFrameDom();
      $('#appframe').classList.remove('open', 'shown', 'closing');
    }
    lwSet(id, { on: true, min: false, z: lwMaxZ() + 1 });
    goHome();   // the window lives over home; land where it shows
    toast(`${d.name} is floating on home — its × closes it`, '', d.icon);
  }
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-wfloat]');
    if (f) { e.stopPropagation(); floatToBrick(f.dataset.wfloat); return; }
    if (e.target.closest('[data-wmin]')) { e.stopPropagation(); goHome(); }
  });
  // Page capacity follows the viewport: a rotation/resize changes how many
  // rows fit, so home re-lays itself (the overflow pass reflows the pages).
  let _homeResizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(_homeResizeT);
    _homeResizeT = setTimeout(() => {
      if (S.view === 'home' && !S.appOpen && !S.homeEdit && !S.locked) renderHome();
    }, 250);
  });
  const srow = (icn, title, sub, nav, danger) =>
    `<button class="row tappable" style="width:100%;text-align:left" ${nav ? `data-nav="${nav}"` : ''}>
      <span class="glyph"${danger ? ' style="color:var(--alert)"' : ''}>${ic(icn, 20)}</span>
      <span class="rtext"><div class="rtitle"${danger ? ' style="color:var(--alert)"' : ''}>${title}</div>
        <div class="rsub">${sub}</div></span>
      <span class="chev">${ic('chev', 18)}</span></button>`;
  const kv = (k, v) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;
  const meter = (pct, cls = '') =>
    `<div class="meter ${cls}"><span style="width:${Math.max(2, Math.min(100, pct))}%"></span></div>`;
  const loadingCard = () => `<div class="card"><div class="row muted">Reading…</div></div>`;
  const fmtMB = mb => mb < 1024 ? mb + ' MB' : (mb / 1024).toFixed(1) + ' GB';
  const fmtBytes = n => {
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(n < 10 ? 1 : 0) + ' ' + u[i];
  };
  const fmtUptime = s => {
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return [d ? d + 'd' : '', h ? h + 'h' : '', (m || (!d && !h)) ? m + 'm' : ''].filter(Boolean).join(' ');
  };

  function lockDevice() {
    clearScreenTimer(); closeControl();
    if (typeof Aura !== 'undefined') Aura.stop();
    if (S.appOpen) closeAppFrame(true);
    S.locked = true; S.pin = '';
    renderLock();
    $('#lock').classList.remove('hidden');
  }

  /* modal input + confirm (reuse the prompt scrim) */
  function askInput(title, { password = false, label = '', value = '', okLabel = 'OK' } = {}) {
    return new Promise(resolve => {
      const scrim = $('#promptScrim');
      scrim.innerHTML = `<div class="prompt-card">
        <div class="pc-title">${esc(title)}</div>
        ${label ? `<div class="pc-note">${esc(label)}</div>` : ''}
        <input class="modal-input" type="${password ? 'password' : 'text'}" value="${esc(value)}" autocomplete="off" spellcheck="false">
        <div class="prompt-actions"><button class="pbtn" data-x>Cancel</button>
          <button class="pbtn allow" data-ok>${esc(okLabel)}</button></div></div>`;
      scrim.classList.add('open');
      const inp = scrim.querySelector('.modal-input');
      setTimeout(() => inp.focus(), 60);
      const done = v => { scrim.classList.remove('open'); setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200); resolve(v); };
      scrim.querySelector('[data-ok]').onclick = () => done(inp.value);
      scrim.querySelector('[data-x]').onclick = () => done(null);
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); };
    });
  }
  function confirmModal(title, body, okLabel = 'OK') {
    return new Promise(resolve => {
      const scrim = $('#promptScrim');
      scrim.innerHTML = `<div class="prompt-card">
        <div class="pc-title">${esc(title)}</div><div class="pc-body">${esc(body)}</div>
        <div class="prompt-actions"><button class="pbtn" data-x>Cancel</button>
          <button class="pbtn deny" data-ok>${esc(okLabel)}</button></div></div>`;
      scrim.classList.add('open');
      const done = v => { scrim.classList.remove('open'); setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200); resolve(v); };
      scrim.querySelector('[data-ok]').onclick = () => done(true);
      scrim.querySelector('[data-x]').onclick = () => done(false);
    });
  }

  /* ======================================================================
     NOTIFICATIONS SETTINGS — DND, lock-screen content, history
     (exposes Sov.notify's showOnLock switch, which had no UI before)
     ====================================================================== */
  function renderNotifSettings() {
    const dnd = Sov.notify.dnd();
    const showLock = Sov.notify.showOnLock();
    const list = Sov.notify.list();
    $('#screenScroll').innerHTML = `
      ${shead('Device', 'Notifications', 'Notifications are produced on this device and never leave it. Every entry names its source app.')}
      <div class="card">
        <button class="row tappable" data-nf-dnd style="width:100%;text-align:left"><span class="glyph">${ic('bell',20)}</span>
          <span class="rtext"><div class="rtitle">Do Not Disturb</div>
            <div class="rsub">Silence new notifications — the shade still collects them</div></span>
          <span class="switch ${dnd ? 'on' : ''}"></span></button>
        <button class="row tappable" data-nf-lock style="width:100%;text-align:left"><span class="glyph">${ic('lock',20)}</span>
          <span class="rtext"><div class="rtitle">Show content on lock screen</div>
            <div class="rsub">Off keeps the content hidden until you unlock — the aura default</div></span>
          <span class="switch ${showLock ? 'on' : ''}"></span></button>
      </div>
      <div class="section-head"><span class="eyebrow">History</span>
        <span class="muted" style="font-size:11px">${list.length} notification${list.length === 1 ? '' : 's'}</span></div>
      <div class="card">
        ${list.length
          ? `<button class="row tappable" data-nf-clear style="width:100%;text-align:left">
               <span class="glyph" style="color:var(--alert)">${ic('trash',18)}</span>
               <span class="rtext"><div class="rtitle" style="color:var(--alert)">Clear all notifications</div></span></button>`
          : `<div class="row muted">Nothing right now — you're all caught up.</div>`}
      </div>
      <div style="height:8px"></div>`;
    const rerender = () => { if (stillOn('sys-notifications')) renderNotifSettings(); };
    $('#screenScroll').querySelector('[data-nf-dnd]').onclick = () => {
      const now = !Sov.notify.dnd();
      Sov.notify.dnd(now);
      toast(now ? 'Do Not Disturb on' : 'Do Not Disturb off', now ? 'warn' : 'ok', 'bell');
      renderPane(Sov.get()); rerender();
    };
    $('#screenScroll').querySelector('[data-nf-lock]').onclick = () => {
      Sov.notify.showOnLock(!Sov.notify.showOnLock()); rerender();
    };
    const clr = $('#screenScroll').querySelector('[data-nf-clear]');
    if (clr) clr.onclick = () => { Sov.notify.clear(); renderPane(Sov.get()); rerender(); };
  }

  /* ======================================================================
     SETTINGS (hub)
     ====================================================================== */
  function renderSettings() {
    const st = Sov.get();
    $('#screenScroll').innerHTML = `
      ${shead('Aura', 'Settings')}
      <div class="card about-badge">
        <span class="ab-mark" style="color:var(--accent)">${ic('logo',30)}</span>
        <div><div class="ab-name">AuraOS</div>
          <div class="ab-ver">v1.0 · ${st.mode === 'live' ? 'device' : 'preview'}</div></div>
      </div>
      <div class="section-head"><span class="eyebrow">Connectivity</span></div>
      <div class="card">
        ${srow('wifi', 'Wi-Fi', st.net.wifi ? esc(st.net.ssid) : 'Off', 'sys-wifi')}
        ${srow('bt', 'Bluetooth', st.net.bluetooth ? 'On' : 'Off', 'sys-bluetooth')}
      </div>
      <div class="section-head"><span class="eyebrow">Device</span></div>
      <div class="card">
        ${srow('grid', 'Personalize', 'Wallpaper, home layout, focus', 'personalize')}
        ${srow('sun', 'Display', st.brightness + '% brightness', 'sys-display')}
        ${srow('vol', 'Sound', st.volume + '% volume', 'sys-sound')}
        ${srow('bell', 'Notifications', Sov.notify.dnd() ? 'Do Not Disturb on' : 'On', 'sys-notifications')}
        ${srow('clock', 'Date & time', st.time, 'sys-datetime')}
      </div>
      <div class="section-head"><span class="eyebrow">Privacy &amp; security</span></div>
      <div class="card">
        ${srow('shieldChk', 'Permissions', 'What every app can access', 'permissions')}
        ${srow('globe', 'Network', 'Connections &amp; blocking', 'network')}
        ${srow('lock', 'Vault', 'Encrypted storage', 'vault')}
      </div>
      <div class="section-head"><span class="eyebrow">Intelligence</span></div>
      <div class="card">
        ${srow('spark', 'Assistant', 'Ask the on-device AI', 'assistant')}
        ${srow('brain', 'AI Engine', 'Local models, memory, trust', 'sys-ai')}
      </div>
      <div class="section-head"><span class="eyebrow">Apps</span></div>
      <div class="card">
        ${srow('store', 'App Store', 'Install free &amp; open Android apps', 'appstore')}
        ${srow('android', 'Android apps', 'Run Android apps natively · Waydroid', 'sys-android')}
      </div>
      <div class="section-head"><span class="eyebrow">System</span></div>
      <div class="card">
        ${srow('info', 'About', 'Device, OS, hardware', 'sys-about')}
        ${srow('chart', 'System Monitor', 'CPU, memory, processes', 'sys-monitor')}
        ${srow('disk', 'Storage', 'Disks and usage', 'sys-storage')}
      </div>
      <div class="section-head"><span class="eyebrow">Advanced</span></div>
      <div class="card">
        ${srow('terminal', 'Terminal', 'A real Linux shell', 'terminal')}
        ${srow('power', 'Power', 'Restart · Shut down', 'sys-power', true)}
      </div>
      <div class="card" style="margin-top:14px">
        <div class="row"><span class="glyph">${ic('shieldChk',20)}</span>
          <span class="rtext"><div class="rtitle">No account required</div>
          <div class="rsub">This device works fully without signing in to anyone. No telemetry is collected.</div></span></div>
      </div>
      <div style="height:8px"></div>`;
    bindNav($('#screenScroll'));
  }

  /* ======================================================================
     ABOUT
     ====================================================================== */
  async function renderAbout() {
    const id = 'sys-about';
    $('#screenScroll').innerHTML = shead('System', 'About') + loadingCard();
    const s = await Sov.system();
    if (!stillOn(id)) return;
    const memPct = s.mem.total ? Math.round(s.mem.used / s.mem.total * 100) : 0;
    $('#screenScroll').innerHTML = `
      ${shead('System', 'About')}
      <div class="card about-badge">
        <span class="ab-mark" style="color:var(--accent)">${ic('cpu',30)}</span>
        <div><div class="ab-name">${esc(s.board || 'Aura device')}</div>
          <div class="ab-ver">${esc(s.os)}</div></div>
      </div>
      <div class="card">
        ${kv('Hostname', s.hostname)}
        ${kv('Operating system', s.os)}
        ${kv('Kernel', s.kernel)}
        ${kv('Architecture', s.arch)}
        ${kv('Processor', s.cpu)}
        ${kv('CPU cores', s.cores)}
        ${kv('Timezone', s.timezone)}
        ${kv('Uptime', fmtUptime(s.uptime))}
      </div>
      <div class="section-head"><span class="eyebrow">Memory</span>
        <span class="muted mono" style="font-size:11px">${fmtMB(s.mem.used)} / ${fmtMB(s.mem.total)}</span></div>
      <div class="card"><div class="gauge">${meter(memPct)}
        <div class="gauge-lbl mono">${memPct}% used · ${fmtMB(s.mem.avail)} free</div></div></div>
      <div class="card" style="margin-top:10px">${srow('chart', 'System Monitor', 'Live CPU, memory &amp; processes', 'sys-monitor')}</div>
      <div style="height:8px"></div>`;
    bindNav($('#screenScroll'));
  }

  /* ======================================================================
     SYSTEM MONITOR (live)
     ====================================================================== */
  async function renderMonitor() {
    clearScreenTimer();
    await drawMonitor('sys-monitor');
    S.screenTimer = setInterval(() => { if (S.view === 'sys-monitor') drawMonitor('sys-monitor'); }, 2500);
  }
  async function drawMonitor(id) {
    const [s, procs] = await Promise.all([Sov.system(), Sov.processes()]);
    if (!stillOn(id)) return;
    const memPct = s.mem.total ? Math.round(s.mem.used / s.mem.total * 100) : 0;
    const cpuPct = Math.min(100, Math.round((s.load[0] / (s.cores || 1)) * 100));
    const swapPct = s.swap.total ? Math.round(s.swap.used / s.swap.total * 100) : 0;
    const rows = procs.map(p => `
      <div class="proc"><span class="proc-name">${esc(p.name)}</span>
        <span class="proc-metric"><b>${p.cpu.toFixed(1)}%</b><small>cpu</small></span>
        <span class="proc-metric"><b>${p.rss}</b><small>MB</small></span></div>`).join('');
    $('#screenScroll').innerHTML = `
      ${shead('System', 'Monitor', 'Live view of what your device is doing.')}
      <div class="card">
        <div class="gauge"><div class="gauge-top"><span>${ic('cpu',16)} CPU</span><span class="mono">${cpuPct}%</span></div>
          ${meter(cpuPct, cpuPct > 80 ? 'hot' : '')}
          <div class="gauge-lbl mono">load ${s.load.map(x => x.toFixed(2)).join(' · ')} · ${s.cores} cores</div></div>
        <div class="gauge"><div class="gauge-top"><span>${ic('ram',16)} Memory</span><span class="mono">${fmtMB(s.mem.used)} / ${fmtMB(s.mem.total)}</span></div>
          ${meter(memPct, memPct > 85 ? 'hot' : '')}
          <div class="gauge-lbl mono">${memPct}% · ${fmtMB(s.mem.avail)} free</div></div>
        ${s.swap.total ? `<div class="gauge"><div class="gauge-top"><span>${ic('layers',16)} Swap</span><span class="mono">${swapPct}%</span></div>${meter(swapPct)}</div>` : ''}
      </div>
      <div class="section-head"><span class="eyebrow">Top processes</span><span class="muted" style="font-size:11px">by CPU</span></div>
      <div class="card">${rows || '<div class="row muted">No data</div>'}</div>
      <div class="muted mono" style="font-size:11px;text-align:center;padding:12px">live · uptime ${fmtUptime(s.uptime)}</div>`;
  }

  /* ======================================================================
     STORAGE
     ====================================================================== */
  async function renderStorage() {
    const id = 'sys-storage';
    $('#screenScroll').innerHTML = shead('System', 'Storage') + loadingCard();
    const mounts = await Sov.storage();
    if (!stillOn(id)) return;
    const cards = mounts.map(m => {
      const name = m.mount === '/' ? 'System (root)'
        : m.mount.includes('vault') ? 'Vault (encrypted)'
        : m.mount.includes('boot') ? 'Boot firmware' : m.mount;
      return `<div class="card" style="margin-top:10px"><div class="row" style="display:block">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div class="rtitle">${esc(name)}</div><div class="rsub mono">${m.pct}%</div></div>
        ${meter(m.pct, m.pct > 90 ? 'hot' : '')}
        <div class="rsub mono" style="margin-top:6px">${fmtBytes(m.used)} used · ${fmtBytes(m.avail)} free · ${fmtBytes(m.total)} total</div>
        <div class="rsub mono" style="opacity:.55">${esc(m.mount)} · ${esc(m.fs)}</div></div></div>`;
    }).join('');
    $('#screenScroll').innerHTML = shead('System', 'Storage', 'Every filesystem on the device.') +
      (cards || loadingCard()) + '<div style="height:8px"></div>';
  }

  /* ======================================================================
     CALENDAR — a real, on-device event store (month view + day agenda)
     ====================================================================== */
  let _calYM = null, _calSel = null;
  async function renderCalendar() {
    const id = 'calendar';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
    const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
    if (!_calYM) _calYM = { y: now.getFullYear(), m: now.getMonth() };
    if (!_calSel) _calSel = todayIso;
    $('#screenScroll').innerHTML = shead('Tools', 'Calendar') + loadingCard();
    const events = await Sov.calendar.list();
    if (!stillOn(id)) return;
    const byDate = {};
    events.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    Object.values(byDate).forEach(a => a.sort((x, z) => (x.time || '').localeCompare(z.time || '')));
    const { y, m } = _calYM;
    const first = new Date(y, m, 1), start = first.getDay(), days = new Date(y, m + 1, 0).getDate();
    const monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    let cells = '';
    for (let i = 0; i < start; i++) cells += '<div class="cal-cell empty"></div>';
    for (let d = 1; d <= days; d++) {
      const ds = isoOf(y, m, d);
      cells += `<button class="cal-cell ${ds === todayIso ? 'today' : ''} ${ds === _calSel ? 'sel' : ''}" data-day="${ds}">${d}${byDate[ds] ? '<span class="cal-dot"></span>' : ''}</button>`;
    }
    const dayEvents = byDate[_calSel] || [];
    const dayLabel = new Date(_calSel + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#screenScroll').innerHTML = shead('Tools', 'Calendar', 'Your events, kept on the device.') + `
      <div class="cal-head">
        <button class="cal-nav" data-calnav="-1">${ic('back',16)}</button>
        <span class="cal-month">${esc(monthName)}</span>
        <button class="cal-nav" data-calnav="1" style="transform:scaleX(-1)">${ic('back',16)}</button></div>
      <div class="cal-dow">${['S','M','T','W','T','F','S'].map(x => `<span>${x}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <div class="section-head"><span class="eyebrow">${esc(dayLabel)}</span>
        <button class="act" id="calAdd">+ Add</button></div>
      <div class="card">${dayEvents.length ? dayEvents.map(e => `
        <div class="row cal-ev" data-ev="${e.id}"><span class="cal-time">${esc(e.time || '—')}</span>
          <span class="rtext"><div class="rtitle">${esc(e.title || 'Untitled')}</div>${e.notes ? `<div class="rsub">${esc(e.notes)}</div>` : ''}</span></div>`).join('')
        : '<div class="row muted">No events. Tap + to add one.</div>'}</div>
      <div style="height:8px"></div>`;
    $$('#screenScroll [data-day]').forEach(b => b.onclick = () => { _calSel = b.dataset.day; renderCalendar(); });
    $$('#screenScroll [data-calnav]').forEach(b => b.onclick = () => {
      const mm = _calYM.m + parseInt(b.dataset.calnav, 10);
      _calYM = { y: _calYM.y + Math.floor(mm / 12), m: (mm % 12 + 12) % 12 };
      renderCalendar();
    });
    $('#calAdd').onclick = () => editEvent(null, _calSel);
    $$('#screenScroll .cal-ev').forEach(r => r.onclick = () => editEvent(events.find(e => e.id === r.dataset.ev)));
  }
  function editEvent(ev, date) {
    const scrim = $('#promptScrim');
    scrim.innerHTML = `<div class="prompt-card ct-edit">
      <div class="pc-title">${ev ? 'Edit event' : 'New event'}</div>
      <input id="evTitle" class="modal-input" placeholder="Title" value="${ev ? esc(ev.title || '') : ''}">
      <div style="display:flex;gap:8px;margin-top:8px">
        <input id="evDate" class="modal-input" type="date" value="${ev ? esc(ev.date || '') : (date || '')}" style="flex:1">
        <input id="evTime" class="modal-input" type="time" value="${ev ? esc(ev.time || '') : ''}" style="flex:1">
      </div>
      <input id="evNotes" class="modal-input" placeholder="Notes" value="${ev ? esc(ev.notes || '') : ''}" style="margin-top:8px">
      <div class="ce-btns">${ev ? `<button class="pbtn deny" id="evDel">Delete</button>` : ''}<button class="pbtn allow" id="evSave">Save</button></div>
    </div>`;
    scrim.classList.add('open');
    const close = () => { scrim.classList.remove('open'); setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200); };
    ['evTitle', 'evNotes'].forEach(i => { const el = $('#' + i); if (el) el.onkeydown = e => e.stopPropagation(); });
    $('#evSave').onclick = async () => {
      const event = { id: ev && ev.id, title: ($('#evTitle').value || '').trim(), date: $('#evDate').value, time: $('#evTime').value, notes: ($('#evNotes').value || '').trim() };
      if (!event.title || !event.date) { toast('Title and date are required', 'alert', 'x'); return; }
      _calSel = event.date;
      await Sov.calendar.op(ev ? 'update' : 'add', event); _upnext.at = 0; close(); renderCalendar();
    };
    const del = $('#evDel'); if (del) del.onclick = async () => { await Sov.calendar.op('delete', { id: ev.id }); _upnext.at = 0; close(); renderCalendar(); };
  }

  /* ======================================================================
     APP STORE (in-shell F-Droid catalogue)
     A first-class store: browse/search a curated set of free/libre Android
     apps and install with one tap (the APK is resolved live from F-Droid and
     pushed into Waydroid). Any package id installs too — the catalogue is just
     the front page. Direct APK sideload still lives in the Android manager.
     ====================================================================== */
  let _appStore = { q: '', cat: 'All' };

  async function renderAppStore() {
    const id = 'appstore';
    $('#screenScroll').innerHTML = shead('Apps', 'App Store') + loadingCard();
    const data = await Sov.androidStoreCatalog('');
    if (!stillOn(id)) return;

    // Honest degrade: no Android layer → no store.
    if (data && data.available === false && Sov.mode === 'live') {
      $('#screenScroll').innerHTML = shead('Apps', 'App Store') + `
        <div class="card"><div class="row" style="display:block">
          <div class="rtitle">Android layer not installed</div>
          <div class="rsub">${esc(data.reason || 'Waydroid is not available on this device, so Android apps can’t be installed.')}</div>
        </div></div>`;
      return;
    }

    const source = (data && data.source) || 'F-Droid';
    const cats = ['All', ...((data && data.categories) || [])];
    if (!cats.includes(_appStore.cat)) _appStore.cat = 'All';
    const all = (data && data.apps) || [];

    $('#screenScroll').innerHTML = `
      ${shead('Apps', 'App Store', `Install Android apps from ${esc(source)} — free, open, no account.`)}
      <div class="store-search">${ic('search', 18)}
        <input id="stSearch" placeholder="Search apps" value="${esc(_appStore.q)}" autocomplete="off" spellcheck="false"></div>
      <div class="chips" id="stChips">${cats.map(c => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="store-grid" id="stGrid"></div>

      <div class="section-head"><span class="eyebrow">Install by package</span></div>
      <div class="card"><div class="row" style="display:block">
        <div class="rsub" style="margin-bottom:8px">Every app above is verified to install. For the full catalogue, install <b>F-Droid</b> or <b>Aurora Store</b> from the <b>Stores</b> category. Or install any package id directly from ${esc(source)}:</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="stPkg" class="modal-input" placeholder="e.g. org.videolan.vlc" autocomplete="off" spellcheck="false" style="flex:1">
          <button class="mini-btn" id="stPkgGo">Install</button>
        </div>
        <div id="stMsg" class="rsub mono" style="margin-top:8px;opacity:.7"></div>
      </div></div>

      <div class="card" style="margin-top:10px"><div class="row">
        <span class="glyph">${ic('android', 20)}</span>
        <span class="rtext"><div class="rtitle">Sideload an APK</div>
          <div class="rsub">Have an APK file or URL instead? Install it from the Android manager.</div></span>
        <button class="mini-btn ghost" id="stSideload">Open</button>
      </div></div>
      <div style="height:8px"></div>`;

    const doStoreInstall = async (pkg, btn, msgEl) => {
      if (!pkg) return;
      if (btn) { btn.textContent = 'Installing…'; btn.disabled = true; }
      if (msgEl) msgEl.textContent = 'Resolving on ' + source + '…';
      const r = await Sov.androidStoreInstall(pkg);
      if (r && r.ok) {
        const nm = (all.find(x => x.package === pkg) || {}).name || pkg;
        addAndroidToHome(pkg, nm);   // the app lands on the home screen, like a phone
        toast(nm + ' added to home', 'good', 'store');
        Sov.notify.push({ app: 'appstore', title: 'App Store', body: nm + ' installed — on your home screen', icon: 'store' });
        renderAppStore();
      } else {
        toast((r && r.error) || 'Install failed', 'alert', 'x');
        if (msgEl) msgEl.textContent = (r && r.error) || 'Install failed.';
        if (btn) { btn.textContent = 'Install'; btn.disabled = false; }
      }
    };

    // Search + category filter repaint only the grid — the search box keeps focus.
    const paint = () => {
      const q = _appStore.q.trim().toLowerCase();
      const apps = all.filter(a =>
        (_appStore.cat === 'All' || a.category === _appStore.cat) &&
        (!q || (a.name + ' ' + a.summary + ' ' + a.category + ' ' + a.package).toLowerCase().includes(q)));
      $$('#stChips [data-cat]').forEach(b => b.classList.toggle('on', b.dataset.cat === _appStore.cat));
      const grid = $('#stGrid');
      grid.innerHTML = apps.length ? apps.map(a => `
        <div class="store-card">
          <span class="glyph">${ic('android', 22)}</span>
          <span class="sc-meta">
            <div class="rtitle">${esc(a.name)}</div>
            <div class="rsub">${esc(a.summary)}</div>
          </span>
          ${a.installed
            ? `<button class="mini-btn" data-open="${esc(a.package)}">Open</button>`
            : `<button class="mini-btn accent" data-inst="${esc(a.package)}">Install</button>`}
        </div>`).join('')
        : '<div class="row muted">No apps match your search.</div>';
      grid.querySelectorAll('[data-inst]').forEach(b => b.onclick = () => doStoreInstall(b.dataset.inst, b));
      grid.querySelectorAll('[data-open]').forEach(b => b.onclick = async () => {
        const r = await Sov.androidLaunch(b.dataset.open);
        toast(r && r.ok ? 'Opening Android app…' : ((r && r.error) || 'Could not open'),
              r && r.ok ? '' : 'alert', r && r.ok ? 'android' : 'x');
      });
    };
    paint();

    $$('#stChips [data-cat]').forEach(b => b.onclick = () => { _appStore.cat = b.dataset.cat; paint(); });
    const search = $('#stSearch');
    if (search) search.oninput = () => { _appStore.q = search.value; paint(); };

    const pkgGo = $('#stPkgGo'), pkgIn = $('#stPkg'), msg = $('#stMsg');
    if (pkgGo) pkgGo.onclick = () => {
      const v = (pkgIn.value || '').trim();
      if (!v) { msg.textContent = 'Enter a package id first.'; return; }
      doStoreInstall(v, pkgGo, msg);
    };
    const side = $('#stSideload');
    if (side) side.onclick = () => go('sys-android');
  }

  /* ======================================================================
     ANDROID APPS (Waydroid — Native Android Layer)
     Runs Android apps natively while keeping the device light: the heavy
     Android session is off until you open an app and is reclaimed when idle.
     ====================================================================== */
  async function renderAndroid() {
    const id = 'sys-android';
    $('#screenScroll').innerHTML = shead('Apps', 'Android') + loadingCard();
    const [st, apps] = await Promise.all([Sov.androidStatus(), Sov.androidApps()]);
    if (!stillOn(id)) return;

    // Not installed on this device — be honest, don't pretend.
    if (st && st.available === false && Sov.mode === 'live') {
      $('#screenScroll').innerHTML = shead('Apps', 'Android') + `
        <div class="card"><div class="row" style="display:block">
          <div class="rtitle">Android layer not installed</div>
          <div class="rsub">${esc(st.reason || 'Waydroid is not available on this device.')}</div>
        </div></div>`;
      return;
    }
    // Installed but the system image hasn't been fetched yet (first online boot).
    if (st && st.initialized === false) {
      $('#screenScroll').innerHTML = shead('Apps', 'Android') + `
        <div class="card"><div class="row" style="display:block">
          <div class="rtitle">Setting up the Android runtime…</div>
          <div class="rsub">The Android system image is downloaded once on first
            online boot. This screen will fill in when it's ready.</div>
        </div></div>`;
      return;
    }

    const running = !!(st && st.sessionRunning);
    const store = (st && st.store) || {};
    const mem = (st && st.memory) || {};
    const memLine = running
      ? (mem.usedMB != null
          ? `Session running · ${mem.usedMB} MB${mem.capMB ? ' / ' + mem.capMB + ' MB cap' : ''}`
          : 'Session running')
      : 'Session stopped · using no memory';
    const idleMin = Math.round((st && st.idleTimeout || 600) / 60);

    const appRows = apps.length ? apps.map(a => `
      <div class="row" style="width:100%">
        <span class="glyph">${ic('android', 20)}</span>
        <span class="rtext"><div class="rtitle">${esc(a.name)}</div>
          <div class="rsub mono" style="opacity:.6">${esc(a.package)}</div></span>
        <span style="display:flex;gap:6px">
          <button class="mini-btn" data-alaunch="${esc(a.package)}">Open</button>
          <button class="mini-btn danger" data-aremove="${esc(a.package)}">Remove</button>
        </span>
      </div>`).join('')
      : '<div class="row muted">No Android apps installed yet.</div>';

    $('#screenScroll').innerHTML = `
      ${shead('Apps', 'Android', 'Run Android apps natively — kept light and off until you need them.')}
      <div class="card">
        <div class="row" style="display:block">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="rtitle">Android runtime</div>
              <div class="rsub">${memLine}</div></div>
            <button class="mini-btn${running ? ' ghost' : ''}" data-asession="${running ? 'stop' : 'start'}">
              ${running ? 'Stop' : 'Start'}</button>
          </div>
          <div class="rsub" style="margin-top:8px;opacity:.7">
            Idle sessions stop automatically after ${idleMin} min to free memory.</div>
        </div>
      </div>

      <div class="section-head"><span class="eyebrow">App store</span></div>
      <div class="card"><div class="row" style="display:block">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><div class="rtitle">${esc(store.name || 'F-Droid')}</div>
            <div class="rsub">${store.installed
              ? 'Browse and install apps graphically.'
              : 'A free/libre app store — browse and install apps, no account.'}</div></div>
          ${store.installed
            ? `<button class="mini-btn" data-astore="open">Open</button>`
            : `<button class="mini-btn" data-astore="install">Install</button>`}
        </div>
      </div></div>

      <div class="section-head"><span class="eyebrow">Installed apps</span>
        <span class="muted" style="font-size:11px">${apps.length}</span></div>
      <div class="card">${appRows}</div>

      <div class="section-head"><span class="eyebrow">Sideload</span></div>
      <div class="card"><div class="row" style="display:block">
        <div class="rsub" style="margin-bottom:8px">Most apps come from the store above.
          To sideload, install from an APK file path or a URL. Installed apps appear
          in your launcher like any other app.</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="apkSrc" class="modal-input" placeholder="/path/app.apk  or  https://…/app.apk"
            autocomplete="off" spellcheck="false" style="flex:1" />
          <button class="mini-btn" id="apkGo">Install</button>
        </div>
        <div id="apkMsg" class="rsub mono" style="margin-top:8px;opacity:.7"></div>
      </div></div>

      <div class="card" style="margin-top:12px"><div class="row" style="display:block">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div><div class="rtitle">How apps are shown</div>
            <div class="rsub">The compositor shows one surface at a time, so opening an
              Android app hands the screen to Android and returns here when you're
              done — the same model native GUI apps use today.</div></div>
          <button class="mini-btn ghost" id="androidShow" style="flex:none">Full UI</button>
        </div>
        <div class="rsub" style="margin-top:8px;opacity:.7">Open the full Android UI to reach
          Android's own settings — rarely needed; apps launch on their own above.</div>
      </div></div>
      <div style="height:8px"></div>`;

    // ---- wire it up -------------------------------------------------------
    const refresh = () => { if (stillOn(id)) renderAndroid(); };

    $$('[data-alaunch]').forEach(b => b.onclick = async () => {
      const pkg = b.dataset.alaunch;
      b.textContent = 'Opening…'; b.disabled = true;
      const r = await Sov.androidLaunch(pkg);
      if (r && r.ok) {
        toast('Opening Android app…', '', 'android');
        Sov.notify.push({ app: 'android', title: 'Android', body: 'Launching ' + pkg, icon: 'android' });
      } else toast((r && r.error) || 'Could not launch', 'alert', 'x');
      refresh();
    });

    $$('[data-aremove]').forEach(b => b.onclick = async () => {
      const pkg = b.dataset.aremove;
      const r = await Sov.androidRemove(pkg);
      if (r && r.ok) removeAndroidFromHome(pkg);   // clean home tile + drawer too
      toast(r && r.ok ? 'App removed' : ((r && r.error) || 'Remove failed'),
            r && r.ok ? 'warn' : 'alert', r && r.ok ? 'trash' : 'x');
      refresh();
    });

    const sess = $('[data-asession]');
    if (sess) sess.onclick = async () => {
      const action = sess.dataset.asession;
      sess.textContent = action === 'start' ? 'Starting…' : 'Stopping…'; sess.disabled = true;
      await Sov.androidSession(action);
      toast(action === 'start' ? 'Android session started' : 'Android session stopped',
            '', 'android');
      refresh();
    };

    const storeBtn = $('[data-astore]');
    if (storeBtn) storeBtn.onclick = async () => {
      const action = storeBtn.dataset.astore;
      storeBtn.textContent = action === 'install' ? 'Installing…' : 'Opening…'; storeBtn.disabled = true;
      const r = await Sov.androidStore(action);
      if (r && r.ok) toast(action === 'install' ? 'App store installed' : 'Opening app store…', '', 'android');
      else toast((r && r.error) || 'Could not reach the app store', 'alert', 'x');
      refresh();
    };

    const go = $('#apkGo'), src = $('#apkSrc'), msg = $('#apkMsg');
    if (go) go.onclick = async () => {
      const v = (src.value || '').trim();
      if (!v) { msg.textContent = 'Enter an APK path or URL first.'; return; }
      go.textContent = 'Installing…'; go.disabled = true;
      msg.textContent = 'Working… (downloads can take a moment)';
      const r = await Sov.androidInstall(v);
      if (r && r.ok) { toast('App installed', 'good', 'check'); refresh(); }
      else { msg.textContent = (r && r.error) || 'Install failed.'; go.textContent = 'Install'; go.disabled = false; }
    };

    const showBtn = $('#androidShow');
    if (showBtn) showBtn.onclick = async () => {
      showBtn.textContent = 'Opening…'; showBtn.disabled = true;
      const r = await Sov.androidShow();
      if (r && r.ok) toast('Opening full Android UI…', '', 'android');
      else toast((r && r.error) || 'Could not open Android UI', 'alert', 'x');
      refresh();
    };
  }

  /* ======================================================================
     WI-FI
     ====================================================================== */
  async function renderWifi() {
    const id = 'sys-wifi';
    const st = Sov.get();
    $('#screenScroll').innerHTML = shead('Connectivity', 'Wi-Fi') + loadingCard();
    const nets = await Sov.wifiScan();
    if (!stillOn(id)) return;
    const items = nets.map((n, i) => `
      <button class="row tappable" data-wifi="${i}" style="width:100%;text-align:left">
        <span class="glyph">${ic('wifi',20)}</span>
        <span class="rtext"><div class="rtitle">${esc(n.ssid)} ${n.active ? '<span class="badge-on">connected</span>' : ''}</div>
          <div class="rsub mono">${n.security === 'open' ? 'open' : esc(n.security)} · signal ${n.signal}%</div></span>
        ${n.security !== 'open' ? `<span class="glyph">${ic('lock',15)}</span>` : ''}</button>`).join('');
    $('#screenScroll').innerHTML = `
      ${shead('Connectivity', 'Wi-Fi', 'Networks your device can see. Scans are passive — we never force a rescan behind your back.')}
      <div class="card"><div class="row"><span class="glyph">${ic('wifi',20)}</span>
        <span class="rtext"><div class="rtitle">Wi-Fi</div>
          <div class="rsub">${st.net.wifi ? 'Connected to ' + esc(st.net.ssid) : 'Not connected'}</div></span>
        <button class="mini-btn" data-rescan="1">Rescan</button></div></div>
      <div class="section-head"><span class="eyebrow">Available networks</span></div>
      <div class="card">${items || '<div class="row muted">No networks found</div>'}</div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-wifi]').forEach(b => b.onclick = async () => {
      const n = nets[+b.dataset.wifi];
      if (n.active) return;
      let pw = '';
      if (n.security !== 'open') {
        pw = await askInput(`Connect to ${n.ssid}`, { password: true, label: 'Wi-Fi password', okLabel: 'Connect' });
        if (pw === null) return;
      }
      toast('Connecting…', '', 'wifi');
      const r = await Sov.wifiConnect(n.ssid, pw);
      toast(r.ok ? `Connected to ${n.ssid}` : `Couldn't connect`, r.ok ? 'ok' : 'alert', r.ok ? 'check' : 'x');
      if (r.ok) Sov.notify.push({ app: 'settings', icon: 'wifi', title: 'Wi-Fi connected', body: `Connected to ${n.ssid}.`, nav: 'sys-wifi' });
      if (stillOn(id)) renderWifi();
    });
    const rb = $('#screenScroll').querySelector('[data-rescan]');
    if (rb) rb.onclick = () => renderWifi();
  }

  /* ======================================================================
     BLUETOOTH
     ====================================================================== */
  function renderBluetooth() {
    const st = Sov.get();
    $('#screenScroll').innerHTML = `
      ${shead('Connectivity', 'Bluetooth')}
      <div class="card"><button class="row tappable" data-bt style="width:100%;text-align:left">
        <span class="glyph">${ic('bt',20)}</span>
        <span class="rtext"><div class="rtitle">Bluetooth</div><div class="rsub">${st.net.bluetooth ? 'On' : 'Off'}</div></span>
        <span class="pane-chip" style="${st.net.bluetooth ? 'color:var(--ok);border-color:var(--ok)' : ''}">${st.net.bluetooth ? 'ON' : 'OFF'}</span></button></div>
      <div class="card" style="margin-top:10px"><div class="row"><span class="glyph">${ic('info',20)}</span>
        <span class="rtext"><div class="rtitle">Pairing</div>
        <div class="rsub">Device pairing UI lands in v1.1. Toggle the radio here; pair from the Terminal with <span class="mono">bluetoothctl</span> for now.</div></span></div></div>`;
    const b = $('#screenScroll').querySelector('[data-bt]');
    if (b) b.onclick = () => { Sov.setToggle('bluetooth', !Sov.get().net.bluetooth); renderBluetooth(); };
  }

  /* ======================================================================
     DISPLAY / SOUND
     ====================================================================== */
  function renderSlider(id, eyebrow, title, icn, key) {
    const st = Sov.get();
    const val = key === 'brightness' ? st.brightness : st.volume;
    $('#screenScroll').innerHTML = `
      ${shead(eyebrow, title)}
      <div class="slider-block" style="margin-top:14px">
        <div class="sb-row"><span class="sb-ic">${ic(icn,20)}</span>
          <input type="range" min="${key === 'volume' ? 0 : 5}" max="100" value="${val}" data-level="${key}">
          <span class="mono" id="slVal" style="min-width:44px;text-align:right">${val}%</span></div>
      </div>`;
    const r = $('#screenScroll').querySelector('[data-level]');
    r.oninput = () => { Sov.setLevel(key, +r.value); $('#slVal').textContent = r.value + '%'; };
  }
  const renderDisplay = () => renderSlider('sys-display', 'Device', 'Display', 'sun', 'brightness');
  const renderSound = () => renderSlider('sys-sound', 'Device', 'Sound', 'vol', 'volume');

  /* ======================================================================
     DATE & TIME
     ====================================================================== */
  async function renderDatetime() {
    const id = 'sys-datetime';
    const st = Sov.get();
    const tz = await Sov.getTimezone();
    if (!stillOn(id)) return;
    const zones = ['UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York',
      'America/Los_Angeles', 'America/Chicago', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
      'Asia/Dubai', 'Australia/Sydney'];
    if (!zones.includes(tz)) zones.unshift(tz);
    const rows = zones.map(z => `<button class="row tappable" data-tz="${esc(z)}" style="width:100%;text-align:left">
      <span class="glyph">${ic('clock',20)}</span><span class="rtext"><div class="rtitle">${esc(z)}</div></span>
      ${z === tz ? `<span class="glyph" style="color:var(--accent)">${ic('check',18)}</span>` : ''}</button>`).join('');
    $('#screenScroll').innerHTML = `
      ${shead('Device', 'Date &amp; time')}
      <div class="card"><div class="row"><span class="glyph">${ic('clock',20)}</span>
        <span class="rtext"><div class="rtitle" style="font-size:26px;font-family:var(--mono)">${st.time}</div>
          <div class="rsub">${esc(st.date)}</div></span></div></div>
      <div class="section-head"><span class="eyebrow">Timezone</span></div>
      <div class="card">${rows}</div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-tz]').forEach(b => b.onclick = async () => {
      await Sov.setTimezone(b.dataset.tz);
      toast('Timezone set to ' + b.dataset.tz, 'ok', 'check');
      if (stillOn(id)) renderDatetime();
    });
  }

  /* ======================================================================
     POWER
     ====================================================================== */
  function renderPower() {
    $('#screenScroll').innerHTML = `
      ${shead('Advanced', 'Power')}
      <div class="card">
        <button class="row tappable" data-pw="lock" style="width:100%;text-align:left">
          <span class="glyph">${ic('lock',20)}</span>
          <span class="rtext"><div class="rtitle">Lock</div><div class="rsub">Require PIN, keep everything running</div></span></button>
        <button class="row tappable" data-pw="reboot" style="width:100%;text-align:left">
          <span class="glyph">${ic('restart',20)}</span>
          <span class="rtext"><div class="rtitle">Restart</div><div class="rsub">Reboot the device</div></span></button>
        <button class="row tappable" data-pw="poweroff" style="width:100%;text-align:left">
          <span class="glyph" style="color:var(--alert)">${ic('power',20)}</span>
          <span class="rtext"><div class="rtitle" style="color:var(--alert)">Shut down</div><div class="rsub">Power off completely</div></span></button>
      </div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-pw]').forEach(b => b.onclick = async () => {
      const a = b.dataset.pw;
      if (a === 'lock') return lockDevice();
      const ok = await confirmModal(a === 'reboot' ? 'Restart device?' : 'Shut down device?',
        a === 'reboot' ? 'The device will reboot now.' : 'The device will power off now.',
        a === 'reboot' ? 'Restart' : 'Shut down');
      if (!ok) return;
      toast(a === 'reboot' ? 'Restarting…' : 'Shutting down…', 'warn', 'power');
      await Sov.power(a);
    });
  }

  /* ======================================================================
     TERMINAL — a real Linux shell (via the agent's /api/exec)
     ====================================================================== */
  const TERM_USER = 'aura', TERM_HOST = 'aura';
  const cwdShort = c => {
    if (!c) return '~';
    return c.replace(/^\/home\/[^/]+/, '~').replace(/^\/root/, '~') || '/';
  };
  const promptHTML = cwd =>
    `<span class="tp"><span class="tp-user">${TERM_USER}@${TERM_HOST}</span>` +
    `<span class="tp-c">:</span><span class="tp-path">${esc(cwdShort(cwd))}</span>` +
    `<span class="tp-c">$</span>&nbsp;</span>`;

  /* Terminal SESSIONS — each a real, independent shell context (scrollback,
     cwd, history, busy flag), keyed by id in S.termSessions. 'main' is shared
     by the full-screen Terminal app AND the 'terminal' window, so typing in
     either shows up in both: one shell, two windows onto it. Every extra
     window ('term:2', 'term:3', …) owns its own session — commands from
     different sessions run concurrently (the agent's exec is per-call). */
  function termSession(sid) {
    const all = S.termSessions || (S.termSessions = {});
    if (!all[sid]) {
      const live = Sov.get().mode === 'live';
      all[sid] = {
        lines: [
          { t: 'sys', v: 'AuraOS  ·  ' + (live ? 'GNU/Linux shell' : 'preview shell') },
          { t: 'sys', v: 'Type "help" for commands, "clear" to reset.' },
          { t: 'sys', v: '' },
        ],
        cwd: live ? '' : '/home/aura', hist: [], histIdx: 0, busy: false, draft: null,
      };
    }
    return all[sid];
  }
  const winSid = winId => winId === 'terminal' ? 'main' : winId;   // window ↔ session
  function termLinesHTML(T) {
    return T.lines.map(l => {
      if (l.t === 'cmd') return `<div class="tl">${promptHTML(l.cwd)}<span class="tl-cmd">${esc(l.v)}</span></div>`;
      if (l.t === 'sys') return `<div class="tl tl-sys">${esc(l.v)}</div>`;
      return `<div class="tl tl-out">${esc(l.v)}</div>`;
    }).join('');
  }
  function termLiveRowHTML(T, inputClass) {
    return T.busy
      ? `<div class="tl tl-busy"><span>${esc(cwdShort(T.cwd))} · running…</span>
           <button class="term-stop" data-termstop title="Stop (Ctrl+C)">${ic('stop', 10)}<span>stop</span></button></div>`
      : `<div class="tl tl-live">${promptHTML(T.cwd)}<input class="term-in ${inputClass}"
           autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>`;
  }
  // The busy row's stop button — a real Ctrl-C: the agent SIGINTs the whole
  // process group; the pending exec then returns with partial output + ^C.
  // (The agent tracks the most recent command — with several sessions running
  // at once, stop hits the latest one started.)
  function wireTermStop(box, autofocus) {
    const b = box.querySelector('[data-termstop]'); if (!b) return;
    b.onclick = () => { b.disabled = true; Sov.execCancel(); };
    b.onkeydown = e => { if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); b.click(); } };
    if (autofocus) b.focus();
  }
  // Runs one command against a session; redraw() repaints whichever window(s)
  // should reflect it (the caller decides which).
  async function termRunCommand(T, cmd, redraw) {
    T.lines.push({ t: 'cmd', v: cmd, cwd: T.cwd });
    if (cmd.trim()) { T.hist.push(cmd); T.histIdx = T.hist.length; }
    if (cmd.trim() === 'clear') { T.lines = []; redraw(); return; }
    if (!cmd.trim()) { redraw(); return; }   // bare Enter → fresh prompt
    T.busy = true; redraw();
    const r = await Sov.exec(cmd, T.cwd);
    T.busy = false;
    if (r.out === '\x00clear') T.lines = [];
    else if (r.out !== undefined && r.out !== '') T.lines.push({ t: 'out', v: r.out });
    if (r.cwd) T.cwd = r.cwd;
    if (T.lines.length > 300) T.lines = T.lines.slice(-300);
    redraw();
  }
  // Wires history (↑/↓), Tab completion, Ctrl-L/Ctrl-C and Enter on a terminal
  // input scoped to `box` (each window has its own — no shared ids). A redraw
  // replaces the input, so anything mid-typing survives via the session's
  // draft — the freshly created input picks it up here.
  function wireTermInput(T, box, inp, onRedraw) {
    if (T.draft != null) { inp.value = T.draft; T.draft = null; inp.focus(); moveCaretEnd(inp); }
    box.onclick = () => inp.focus();
    box.onscroll = () => { if (box.scrollLeft !== 0) box.scrollLeft = 0; };   // keep the prompt flush-left
    inp.onkeydown = async e => {
      e.stopPropagation();
      const h = T.hist;
      if (e.key === 'ArrowUp') { if (h.length) { T.histIdx = Math.max(0, (T.histIdx ?? h.length) - 1); inp.value = h[T.histIdx] || ''; moveCaretEnd(inp); } return; }
      if (e.key === 'ArrowDown') { T.histIdx = Math.min(h.length, (T.histIdx ?? h.length) + 1); inp.value = h[T.histIdx] || ''; return; }
      if (e.key === 'Tab') { e.preventDefault(); await termComplete(T, inp, onRedraw); return; }
      if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); T.lines = []; onRedraw(); return; }
      if (e.key === 'c' && e.ctrlKey && inp.selectionStart === inp.selectionEnd) {
        // bash reflex: Ctrl-C with nothing selected abandons the line (^C in
        // the scrollback, fresh prompt); with a selection it stays copy.
        e.preventDefault();
        T.lines.push({ t: 'cmd', v: inp.value + '^C', cwd: T.cwd });
        onRedraw(); return;
      }
      if (e.key !== 'Enter') return;
      await termRunCommand(T, inp.value, onRedraw);
    };
  }
  // Tab completion, bash-flavoured: first word → command names, later words →
  // files and directories (dirs keep a trailing /). One match completes it, a
  // common prefix extends to it, anything else prints the candidates — the
  // double-Tab reflex, minus the double.
  async function termComplete(T, inp, onRedraw) {
    if (T.busy) return;
    const caret = inp.selectionStart ?? inp.value.length;
    const before = inp.value.slice(0, caret), after = inp.value.slice(caret);
    const m = before.match(/(^|[\s;|&])([^\s;|&]*)$/);
    const word = m ? m[2] : before;
    if (!word) return;   // a bare Tab on nothing would dump 60 random commands
    const head = before.slice(0, before.length - word.length);
    const isFirst = !/\S/.test(head.split(/[;|&]/).pop());   // start of a (sub)command?
    let list;
    try { list = await Sov.complete(word, isFirst, T.cwd); } catch (e) { return; }
    if (!Array.isArray(list) || !list.length) return;
    const set = new Set(list);
    list = list.filter(x => !set.has(x + '/'));   // a dir shows once, with its slash
    const bsl = s => s.replace(/(\s)/g, '\\$1');  // completed spaces arrive escaped
    let pre = list[0];
    for (const x of list) { let i = 0; while (i < pre.length && pre[i] === x[i]) i++; pre = pre.slice(0, i); }
    if (list.length === 1) {
      const full = bsl(list[0]) + (list[0].endsWith('/') ? '' : ' ');
      inp.value = head + full + after;
      inp.setSelectionRange((head + full).length, (head + full).length);
    } else if (pre.length > word.length) {
      inp.value = head + bsl(pre) + after;
      inp.setSelectionRange((head + bsl(pre)).length, (head + bsl(pre)).length);
    } else {
      T.draft = inp.value;   // survive the redraw that prints the candidates
      T.lines.push({ t: 'sys', v: list.slice(0, 40).join('  ') + (list.length > 40 ? '  …' : '') });
      onRedraw();
    }
  }
  function moveCaretEnd(inp) { setTimeout(() => { const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch (e) {} }, 0); }

  function renderTerminal() {
    drawTerminal();
  }
  function drawTerminal() {
    const T = termSession('main');
    $('#screenScroll').innerHTML = `
      ${shead('System', 'Terminal')}
      <div class="term" id="termBox">${termLinesHTML(T)}${termLiveRowHTML(T, '')}</div>
      <div style="height:8px"></div>`;
    const box = $('#termBox');
    box.scrollTop = box.scrollHeight;
    wireTermStop(box, true);   // busy: focus the stop button so Ctrl+C lands
    const inp = box.querySelector('.term-in');
    if (!inp) return;
    wireTermInput(T, box, inp, () => { if (S.view === 'terminal') drawTerminal(); });
    setTimeout(() => { inp.focus(); box.scrollLeft = 0; box.scrollTop = box.scrollHeight; }, 30);
  }

  /* ---- LIVE BRICKS — real, running mini-apps that float over home ---------
     Phase B of "live tiles" (DEVELOPMENT.md 3.4.2): a small window manager.
     Each brick is a desktop-style window — a title bar with minimize /
     maximize·restore / close, draggable, resizable, always on top of home —
     and each can be STUCK to a snap zone ("brick" of the screen): drag the
     header and release over a zone (a ghost previews the landing, corner pads
     fade in as drop hints), and the window fills that zone and holds it
     across re-mounts and viewport changes. Drag its header again to pop free.
     Click any window to raise it. Everything is real data or honest absence:
       terminal — the SAME session as the Terminal app (one shell, two windows)
       files    — a compact browser over the real filesystem
       sysmon   — live CPU / memory / uptime, straight from /api/system
       notes    — a persistent scratchpad, autosaved into the real Notes store
       music    — a mini player over ~/Music; playback survives the window
     A brick opens from its APP: every app window carries desktop-style
     controls (see wmCtrlsHTML) and the ❐ one pops the app out as its floating
     mini version — no settings page involved. The window's × closes it.
     Home-only for now: bricks hide while an app is open, another screen is
     showing, or the device is locked, and reappear on return. */
  const LW_GAP = 8;                           // breathing room around a snapped window
  const LW_PILL_W = 172, LW_PILL_H = 38;      // a minimized window's title pill
  const LW_ORDER = ['terminal', 'files', 'sysmon', 'notes', 'music'];
  const LW_DEFS = {
    terminal: { name: 'Terminal',   icon: 'terminal', def: { xf: .56, yf: .05, wf: .40, hf: .32 },
      extras: () => termWinExtras(),
      mount: box => lwMountTerminal(box, 'terminal'), onResize: () => redrawTermWin('terminal') },
    files:    { name: 'Files',      icon: 'folder',   def: { xf: .04, yf: .34, wf: .46, hf: .36 },
      mount: box => lwMountFiles(box) },
    sysmon:   { name: 'Monitor',    icon: 'chart',    def: { xf: .52, yf: .42, wf: .44, hf: .30 },
      mount: box => lwMountSysmon(box) },
    notes:    { name: 'Scratchpad', icon: 'note',     def: { xf: .08, yf: .06, wf: .44, hf: .28 },
      mount: box => lwMountNotes(box) },
    music:    { name: 'Music',      icon: 'music',    def: { xf: .30, yf: .60, wf: .40, hf: .22 },
      mount: box => lwMountMusic(box) },
  };
  /* Dynamic app windows — ANY app can float, not just the curated minis:
     window id `app:<appId>` hosts the app's REAL view, the same render/wire
     the full-screen frame uses (Android apps get the same placeholder card
     the frame shows). One-instance rule: an app view's element ids are
     document-global, so floating tears the frame down and opening the frame
     un-floats — exactly one copy of an app's DOM ever exists. */
  // Shared header extras for every terminal window: text size and "+" (spawn
  // another independent shell in its own window).
  const termWinExtras = () => `<button class="lt-ctrl lt-font" data-lwfont="-1" aria-label="Smaller text">A−</button>
    <button class="lt-ctrl lt-font" data-lwfont="1" aria-label="Bigger text">A+</button>
    <button class="lt-ctrl" data-lwnewterm aria-label="New terminal window" title="New terminal">${ic('plus', 13)}</button>`;
  const _lwAppDefs = {};   // per-app def cache (stable identity across renders)
  function lwDef(id) {
    if (LW_DEFS[id]) return LW_DEFS[id];
    if (!id) return null;
    if (id.startsWith('term:')) {          // an extra shell, its own session
      if (_lwAppDefs[id]) return _lwAppDefs[id];
      const n = +id.slice(5) || 2;
      return (_lwAppDefs[id] = {
        name: 'Terminal ' + n, icon: 'terminal',
        def: { xf: .10 + ((n - 2) % 3) * .07, yf: .40 + ((n - 2) % 3) * .06, wf: .40, hf: .32 },
        extras: termWinExtras,
        mount: box => lwMountTerminal(box, id), onResize: () => redrawTermWin(id),
      });
    }
    if (!id.startsWith('app:')) return null;
    if (_lwAppDefs[id]) return _lwAppDefs[id];
    const aid = id.slice(4);
    const app = Sov.app(aid) || resolveHomeApp(aid);
    if (!app) return null;   // uninstalled since — the sync pass scrubs it
    return (_lwAppDefs[id] = {
      name: app.name, icon: app.glyph || 'grid',
      def: { xf: .15, yf: .08, wf: .70, hf: .58 },
      mount: box => {
        const view = APP_VIEWS[app.id];
        box.innerHTML = `<div class="lw-appview">${view ? view.render(app) : placeholderView(app)}</div>`;
        if (view && view.wire) { try { view.wire(app); } catch (e) {} }
        return () => { if (view && view.close) { try { view.close(); } catch (e) {} } };
      },
    });
  }
  // Every window that exists right now: the curated minis, extra terminals,
  // and any floated apps.
  const lwIds = () => [...LW_ORDER,
    ...Object.keys(lwAll()).filter(k => k.startsWith('app:') || k.startsWith('term:'))];
  /* Per-window state, PREF 'liveWins': { id: { on, rect:{xf,yf,wf,hf}|null,
     snap, min, z } }. Rects are FRACTIONS of the brick area so a window holds
     its relative spot across viewport sizes/orientations. One-time migration
     from the single-window era's liveTerm/liveTermRect/liveTermSnap keys. */
  function lwAll() {
    let w = PREF.get('liveWins', null);
    if (!w || typeof w !== 'object') {
      w = {};
      if (PREF.get('liveTerm', false)) w.terminal = {
        on: true, rect: PREF.get('liveTermRect', null),
        snap: PREF.get('liveTermSnap', null), min: PREF.get('liveTermMin', false), z: 1 };
    }
    return w;
  }
  const lwGet = id => Object.assign({ on: false, rect: null, snap: null, min: false, z: 0 }, lwAll()[id] || {});
  function lwSet(id, patch) {
    const all = lwAll();
    all[id] = Object.assign(lwGet(id), patch);
    PREF.set('liveWins', all);
  }
  const lwMaxZ = () => Math.max(0, ...Object.values(lwAll()).map(w => w.z || 0));
  // The snap zones — each a fractional rect of the brick area. Left/right/
  // bottom halves, four quadrants, and full (maximize).
  const LW_ZONES = {
    full:  { xf: 0,  yf: 0,  wf: 1,  hf: 1  },
    left:  { xf: 0,  yf: 0,  wf: .5, hf: 1  },
    right: { xf: .5, yf: 0,  wf: .5, hf: 1  },
    bottom:{ xf: 0,  yf: .5, wf: 1,  hf: .5 },
    tl:    { xf: 0,  yf: 0,  wf: .5, hf: .5 },
    tr:    { xf: .5, yf: 0,  wf: .5, hf: .5 },
    bl:    { xf: 0,  yf: .5, wf: .5, hf: .5 },
    br:    { xf: .5, yf: .5, wf: .5, hf: .5 },
  };
  const LW_ZONE_LABEL = { full: 'Maximize', left: 'Left', right: 'Right', bottom: 'Bottom',
    tl: 'Top-left', tr: 'Top-right', bl: 'Bottom-left', br: 'Bottom-right' };
  const LW_PADS = ['tl', 'tr', 'bl', 'br'];   // corner drop hints, fade in on drag
  // Which zone a pointer at fractional (px,py) targets — a 3×3 feel: corners
  // → quadrants, top-centre → maximize, side/bottom centres → half zones, and
  // the dead centre → no snap (free float).
  function lwZoneAt(px, py) {
    const col = px < 1 / 3 ? 0 : px < 2 / 3 ? 1 : 2;
    const row = py < 1 / 3 ? 0 : py < 2 / 3 ? 1 : 2;
    return [['tl', 'full', 'tr'], ['left', null, 'right'], ['bl', 'bottom', 'br']][row][col];
  }
  const lwBounds = () => $('#liveWins').getBoundingClientRect();
  function lwZoneRect(id, b) {
    const z = LW_ZONES[id]; if (!z) return null;
    return { left: z.xf * b.width + LW_GAP, top: z.yf * b.height + LW_GAP,
      width: z.wf * b.width - LW_GAP * 2, height: z.hf * b.height - LW_GAP * 2 };
  }
  // A window's current pixel rect: its zone if stuck, else its free rect.
  function lwWinRect(id, b) {
    const w = lwGet(id);
    if (w.snap && LW_ZONES[w.snap]) return lwZoneRect(w.snap, b);
    const d = lwDef(id);
    const r = Object.assign({}, (d ? d.def : { xf: .15, yf: .1, wf: .6, hf: .5 }), w.rect || {});
    return { left: r.xf * b.width, top: r.yf * b.height, width: r.wf * b.width, height: r.hf * b.height };
  }
  function lwShouldShow() {
    return !S.locked && S.view === 'home' && !S.appOpen && !S.recentsOpen
      && Object.values(lwAll()).some(w => w.on);
  }
  let _lwDragging = false, _lwResizeBound = false;
  const _lwCleanup = {};   // per-window unmount fns (timers etc.)
  // Mount/unmount + placement only — never re-renders window content on its
  // own, so a live poll (onUpdate ticks every ~2s) can never steal focus out
  // from under typing or clobber a drag.
  function syncLiveBricks() {
    const el = $('#liveWins');
    if (!lwShouldShow()) {
      if (el.firstElementChild) {
        Object.keys(_lwCleanup).forEach(id => { try { _lwCleanup[id](); } catch (e) {} delete _lwCleanup[id]; });
        el.innerHTML = '';
      }
      return;
    }
    if (!el.firstElementChild) el.innerHTML = `
      <div class="lt-pads" aria-hidden="true">${
        LW_PADS.map(id => `<div class="lt-pad lt-pad--${id}" data-pad="${id}"><span></span></div>`).join('')}</div>
      <div class="lt-ghost" aria-hidden="true"><span class="lt-ghost-label"></span></div>`;
    lwIds().forEach(id => {
      const has = el.querySelector(`.lt-win[data-lw="${id}"]`);
      if (!lwDef(id)) {   // a floated app that no longer exists — scrub it
        if (has) lwRemoveWin(id);
        if (lwGet(id).on) lwSet(id, { on: false });
        return;
      }
      if (lwGet(id).on && !has) lwMountWin(id);
      else if (!lwGet(id).on && has) lwRemoveWin(id);
    });
    if (!_lwDragging) lwPositionAll();
    if (!_lwResizeBound) {   // keep zones correct when the viewport changes
      _lwResizeBound = true;
      window.addEventListener('resize', () => { if ($('#liveWins .lt-win') && !_lwDragging) lwPositionAll(); });
    }
  }
  function lwMountWin(id) {
    const d = lwDef(id); if (!d) return;
    $('#liveWins').insertAdjacentHTML('beforeend', `
      <div class="lt-win" data-lw="${id}">
        <header class="lt-head" data-lwgrip>
          <span class="lt-dot" aria-hidden="true"></span>
          <span class="lt-title">${ic(d.icon, 13)}<span>${d.name}</span></span>
          <div class="lt-ctrls">
            ${d.extras ? d.extras() : ''}
            <button class="lt-ctrl" data-lwbtn="min" aria-label="Minimize">${ic('minus', 13)}</button>
            <button class="lt-ctrl" data-lwbtn="max" aria-label="Maximize">${ic('maximize', 12)}</button>
            <button class="lt-ctrl lt-x" data-lwbtn="close" aria-label="Close ${d.name}">${ic('x', 13)}</button>
          </div>
        </header>
        <div class="lt-body" data-lwbody></div>
        <div class="lt-resize" data-lwresize aria-hidden="true">${ic('chev', 11)}</div>
      </div>`);
    const win = $(`#liveWins .lt-win[data-lw="${id}"]`);
    // place before first paint, without the glide transition (a fresh element
    // would otherwise animate in from the corner); the entrance is ltIn
    win.classList.add('lt-moving');
    lwPositionWin(id, win);
    requestAnimationFrame(() => win.classList.remove('lt-moving'));
    const cleanup = d.mount(win.querySelector('[data-lwbody]'));
    if (typeof cleanup === 'function') _lwCleanup[id] = cleanup;
    lwWireWin(id, win);
  }
  function lwRemoveWin(id) {
    if (_lwCleanup[id]) { try { _lwCleanup[id](); } catch (e) {} delete _lwCleanup[id]; }
    const win = $(`#liveWins .lt-win[data-lw="${id}"]`);
    if (win) win.remove();
  }
  function lwPositionAll() {
    $$('#liveWins .lt-win').forEach(w => lwPositionWin(w.dataset.lw, w));
  }
  // Lay one window out from its stored placement (zone, free, or minimized)
  // and sync its chrome (max/restore glyph, docked frame). No content redraw —
  // safe to call anytime without disturbing what the user is typing.
  function lwPositionWin(id, win) {
    win = win || $(`#liveWins .lt-win[data-lw="${id}"]`); if (!win) return;
    const w = lwGet(id), b = lwBounds();
    win.classList.toggle('lt-mini', w.min);
    win.classList.toggle('lt-stuck', !!w.snap && !w.min);
    if (w.snap && !w.min) win.dataset.snap = w.snap; else delete win.dataset.snap;
    win.style.zIndex = 10 + (w.z || 0);
    if (w.min) {
      // minimized windows park as title pills along the bottom edge, in order
      const slot = lwIds().filter(x => lwGet(x).on && lwGet(x).min && $(`#liveWins .lt-win[data-lw="${x}"]`)).indexOf(id);
      win.style.left = (LW_GAP + Math.max(0, slot) * (LW_PILL_W + 8)) + 'px';
      win.style.top = Math.max(0, b.height - LW_PILL_H - LW_GAP) + 'px';
      win.style.width = LW_PILL_W + 'px'; win.style.height = LW_PILL_H + 'px';
    } else {
      const r = lwWinRect(id, b);
      win.style.left = r.left + 'px'; win.style.top = r.top + 'px';
      win.style.width = r.width + 'px'; win.style.height = r.height + 'px';
    }
    const maxb = win.querySelector('[data-lwbtn="max"]');
    if (maxb) { maxb.innerHTML = ic(w.snap === 'full' ? 'restore' : 'maximize', 12);
      maxb.setAttribute('aria-label', w.snap === 'full' ? 'Restore' : 'Maximize'); }
  }
  // Raise on interaction — the tapped window wins the stack.
  function lwRaise(id, win) {
    if (lwGet(id).z !== lwMaxZ() || lwGet(id).z === 0) {
      lwSet(id, { z: lwMaxZ() + 1 });
      win.style.zIndex = 10 + lwGet(id).z;
    }
  }
  function lwPlace(id, snap) {
    lwSet(id, { snap: snap || null, min: false });
    lwPositionAll();   // un-minimizing reflows the pill row too
  }
  function lwWireWin(id, win) {
    const overlay = $('#liveWins'), ghost = overlay.querySelector('.lt-ghost');
    const d = lwDef(id);
    win.addEventListener('pointerdown', () => lwRaise(id, win));
    win.querySelector('[data-lwbtn="close"]').onclick = e => {
      e.stopPropagation();
      lwSet(id, { on: false });
      lwRemoveWin(id);
      if (id.startsWith('term:')) {
        // an extra shell dies with its window — scrollback, cwd, history gone
        if (S.termSessions) delete S.termSessions[id];
        const all = lwAll(); delete all[id]; PREF.set('liveWins', all);
        delete _lwAppDefs[id];
        toast(`${d.name} closed — that shell session has ended`, '', d.icon);
      } else {
        toast(`${d.name} closed — float it again from the app's title bar`, '', d.icon);
      }
    };
    win.querySelector('[data-lwbtn="min"]').onclick = e => {
      e.stopPropagation();
      lwSet(id, { min: !lwGet(id).min });
      lwPositionAll();
    };
    win.querySelector('[data-lwbtn="max"]').onclick = e => {
      e.stopPropagation();
      lwPlace(id, lwGet(id).snap === 'full' ? null : 'full');
    };
    // terminal extras: font-size steppers + "+" (another shell, own window)
    win.querySelectorAll('[data-lwfont]').forEach(bn => bn.onclick = e => {
      e.stopPropagation();
      const px = Math.max(9, Math.min(16, ltFontPx() + +bn.dataset.lwfont));
      PREF.set('ltFontPx', px);
      // every terminal window follows the shared text-size preference
      $$('#liveWins .lt-term').forEach(t => { t.style.fontSize = px + 'px'; });
    });
    const nt = win.querySelector('[data-lwnewterm]');
    if (nt) nt.onclick = e => { e.stopPropagation(); spawnTerminalWin(); };

    // ---- drag the header: move freely, preview/commit a snap zone ----
    const grip = win.querySelector('[data-lwgrip]');
    let dx = 0, dy = 0, startL = 0, startT = 0, zone = null;
    const showGhost = (z, b) => {
      overlay.querySelectorAll('.lt-pad').forEach(p => p.classList.toggle('on', p.dataset.pad === z));
      if (!z) { ghost.classList.remove('on'); return; }
      const r = lwZoneRect(z, b);
      ghost.style.left = r.left + 'px'; ghost.style.top = r.top + 'px';
      ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
      ghost.querySelector('.lt-ghost-label').textContent = LW_ZONE_LABEL[z] || '';
      ghost.classList.add('on');
    };
    const dragMove = e => {
      const b = lwBounds();
      const nl = Math.max(0, Math.min(b.width - win.offsetWidth, startL + (e.clientX - dx)));
      const nt = Math.max(0, Math.min(b.height - win.offsetHeight, startT + (e.clientY - dy)));
      win.style.left = nl + 'px'; win.style.top = nt + 'px';
      zone = lwZoneAt((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
      showGhost(zone, b);
    };
    grip.onpointerdown = e => {
      if (e.target.closest('.lt-ctrl')) return;
      e.preventDefault();
      if (lwGet(id).min) { lwSet(id, { min: false }); lwPositionAll(); return; }   // tap the pill → restore
      const b = lwBounds();
      _lwDragging = true; zone = null;
      win.classList.add('lt-moving'); overlay.classList.add('dragging');
      // popping a stuck window off its zone: become a free window of the last
      // free size, centred under the grab, then drag from there. (Geometry set
      // directly — NOT via lwPositionWin, which would snap it back to the
      // stored free rect instead of the grab point.)
      if (lwGet(id).snap) {
        const fr = Object.assign({}, d.def, lwGet(id).rect || {});
        const w = Math.min(b.width * .92, fr.wf * b.width), h = Math.min(b.height * .92, fr.hf * b.height);
        lwSet(id, { snap: null });
        win.classList.remove('lt-stuck'); delete win.dataset.snap;
        win.querySelector('[data-lwbtn="max"]').innerHTML = ic('maximize', 12);
        win.style.width = w + 'px'; win.style.height = h + 'px';
        win.style.left = Math.max(0, Math.min(b.width - w, e.clientX - b.left - w / 2)) + 'px';
        win.style.top  = Math.max(0, Math.min(b.height - h, e.clientY - b.top - 18)) + 'px';
      }
      dx = e.clientX; dy = e.clientY; startL = win.offsetLeft; startT = win.offsetTop;
      win.setPointerCapture(e.pointerId);
      const up = () => {
        win.removeEventListener('pointermove', dragMove);
        _lwDragging = false;
        win.classList.remove('lt-moving'); overlay.classList.remove('dragging');
        ghost.classList.remove('on');
        overlay.querySelectorAll('.lt-pad').forEach(p => p.classList.remove('on'));
        const b2 = lwBounds();
        if (zone) lwSet(id, { snap: zone });
        else lwSet(id, { snap: null, rect: {
          xf: win.offsetLeft / b2.width, yf: win.offsetTop / b2.height,
          wf: win.offsetWidth / b2.width, hf: win.offsetHeight / b2.height } });
        lwPositionWin(id, win);
      };
      win.addEventListener('pointermove', dragMove);
      win.addEventListener('pointerup', up, { once: true });
    };
    grip.ondblclick = e => {   // desktop reflex: double-click title = (un)maximize
      if (e.target.closest('.lt-ctrl')) return;
      lwPlace(id, lwGet(id).snap === 'full' ? null : 'full');
    };

    // ---- resize from the corner: a stuck window pops free at its current size ----
    const rz = win.querySelector('[data-lwresize]');
    let rw = 0, rh = 0, sx = 0, sy = 0;
    const resizeMove = e => {
      const b = lwBounds();
      const nw = Math.max(160, Math.min(b.width - win.offsetLeft, rw + (e.clientX - sx)));
      const nh = Math.max(120, Math.min(b.height - win.offsetTop, rh + (e.clientY - sy)));
      win.style.width = nw + 'px'; win.style.height = nh + 'px';
    };
    rz.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation();
      if (lwGet(id).min) return;
      if (lwGet(id).snap) { lwSet(id, { snap: null }); win.classList.remove('lt-stuck'); delete win.dataset.snap; }
      _lwDragging = true; win.classList.add('lt-moving');
      sx = e.clientX; sy = e.clientY; rw = win.offsetWidth; rh = win.offsetHeight;
      win.setPointerCapture(e.pointerId);
      const up = () => {
        win.removeEventListener('pointermove', resizeMove);
        _lwDragging = false; win.classList.remove('lt-moving');
        const bb = lwBounds();
        lwSet(id, { rect: {
          xf: win.offsetLeft / bb.width, yf: win.offsetTop / bb.height,
          wf: win.offsetWidth / bb.width, hf: win.offsetHeight / bb.height } });
        lwPositionWin(id, win);
        if (d.onResize) d.onResize();   // e.g. terminal re-fits its scrollback
      };
      win.addEventListener('pointermove', resizeMove);
      win.addEventListener('pointerup', up, { once: true });
    };
  }

  /* ---- brick: Terminal — 'terminal' shares the app's session; every extra
     window (term:2, term:3, …, spawned by the + button) is its OWN shell
     session, independent scrollback/cwd/history, running concurrently. ---- */
  const ltFontPx = () => Math.max(9, Math.min(16, +PREF.get('ltFontPx', 11.5) || 11.5));
  function lwMountTerminal(box, winId) {
    const T = termSession(winSid(winId));
    box.innerHTML = `<div class="term lt-term" style="font-size:${ltFontPx()}px">${termLinesHTML(T)}${termLiveRowHTML(T, 'lt-in')}</div>`;
    const t = box.firstElementChild;
    t.scrollTop = t.scrollHeight;
    wireTermStop(t, false);
    const inp = t.querySelector('.term-in');
    if (inp) wireTermInput(T, t, inp, () => redrawTermWin(winId));
  }
  function redrawTermWin(winId) {
    const t = document.querySelector(`#liveWins .lt-win[data-lw="${winId}"] .lt-term`); if (!t) return;
    const T = termSession(winSid(winId));
    t.innerHTML = termLinesHTML(T) + termLiveRowHTML(T, 'lt-in');
    t.scrollTop = t.scrollHeight;
    wireTermStop(t, false);   // tap to stop; no focus steal from a brick
    const inp = t.querySelector('.term-in');
    if (inp) { wireTermInput(T, t, inp, () => redrawTermWin(winId)); if (!lwGet(winId).min) inp.focus(); }
  }
  // One more shell, in its own window — cascaded a little so they don't stack.
  function spawnTerminalWin() {
    const open = lwIds().filter(x => (x === 'terminal' || x.startsWith('term:')) && lwGet(x).on);
    if (open.length >= 4) { toast('Four terminals is plenty for one screen', '', 'terminal'); return; }
    let n = 2;
    while (lwGet('term:' + n).on) n++;
    lwSet('term:' + n, { on: true, min: false, z: lwMaxZ() + 1 });
    syncLiveBricks();
  }

  /* ---- brick: Monitor — live CPU / memory / uptime, honest and system-wide ---- */
  function lwMountSysmon(box) {
    const paint = async () => {
      let s; try { s = await Sov.system(); } catch (e) { return; }
      if (!box.isConnected) return;
      const cpu = Math.min(100, Math.round(s.load[0] / (s.cores || 1) * 100));
      const memPct = Math.round(s.mem.used / s.mem.total * 100);
      const up = (sec => { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
        return h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + 'h ' + m + 'm'; })(s.uptime || 0);
      const cls = p => p >= 90 ? 'crit' : p >= 75 ? 'warn' : '';
      const stat = (lbl, val, pct) => `
        <div class="ins-stat"><div class="st-top"><span>${lbl}</span><b>${val}</b></div>
          <div class="ins-bar ${cls(pct)}"><span style="width:${Math.max(2, pct)}%"></span></div></div>`;
      box.innerHTML = `<div class="lw-sys">
        ${stat('CPU', cpu + '%', cpu)}
        ${stat('Memory', (s.mem.used / 1024).toFixed(1) + ' / ' + (s.mem.total / 1024).toFixed(0) + ' GB', memPct)}
        <div class="lw-sys-up"><span>Uptime</span><b>${up}</b></div></div>`;
    };
    paint();
    const t = setInterval(paint, 3000);
    return () => clearInterval(t);
  }

  /* ---- brick: Files — a compact browser over the real filesystem. Its own
     cwd (independent of the Files app); folders navigate in place, tapping a
     file hands over to the full Files app at that folder. ---- */
  let _lwFmPath = '';
  function lwMountFiles(box) {
    box.innerHTML = `<div class="lw-fm">
      <div class="lw-fm-bar">
        <button class="lt-ctrl" data-fmup aria-label="Up one folder">${ic('up', 13)}</button>
        <span class="lw-fm-path mono"></span></div>
      <div class="lw-fm-list"><div class="lw-empty">Reading…</div></div></div>`;
    const draw = async () => {
      let d; try { d = await Sov.files.list(_lwFmPath || '', false); } catch (e) { return; }
      if (!box.isConnected) return;
      _lwFmPath = d.path;
      box.querySelector('.lw-fm-path').textContent =
        d.path === (d.home || '/home/aura') ? '~' : (d.path.split('/').pop() || '/');
      const list = box.querySelector('.lw-fm-list');
      list.innerHTML = d.error ? `<div class="lw-empty">${esc(d.error)}</div>`
        : d.entries.length ? d.entries.map(en => {
            const k = fileKind(en.name, en.dir);
            return `<button class="lw-fm-row" data-n="${esc(en.name)}" ${en.dir ? 'data-d="1"' : ''}>
              <span class="lw-fm-ic" style="color:${k.col}">${ic(k.ic, 14)}</span>
              <span class="lw-fm-n">${esc(en.name)}</span>
              ${en.dir ? `<span class="lw-fm-chev">${ic('chev', 12)}</span>` : ''}</button>`;
          }).join('')
        : `<div class="lw-empty">This folder is empty.</div>`;
      const up = box.querySelector('[data-fmup]');
      up.disabled = d.path === '/';
      up.onclick = () => { _lwFmPath = d.parent || '/'; draw(); };
      list.querySelectorAll('.lw-fm-row').forEach(b => b.onclick = () => {
        if (b.dataset.d) { _lwFmPath = fmJoin(d.path, b.dataset.n); draw(); }
        else { S.fmPath = d.path; go('files'); }   // a file → the full app, right here
      });
    };
    draw();
  }

  /* ---- brick: Scratchpad — one persistent quick note, saved into Notes ---- */
  function lwMountNotes(box) {
    box.innerHTML = `<div class="lw-note-wrap">
      <textarea class="lw-note" placeholder="Jot something — it autosaves into Notes."></textarea>
      <span class="lw-note-saved"></span></div>`;
    const ta = box.querySelector('.lw-note');
    ta.onkeydown = e => e.stopPropagation();   // don't let global keys hijack typing
    let noteId = PREF.get('brickNoteId', '');
    (async () => {
      if (!noteId) return;
      try { const n = await Sov.notes.get(noteId); if (n && ta.isConnected && !ta.value) ta.value = n.text || ''; }
      catch (e) { noteId = ''; }
    })();
    let t = null, dirty = false;
    const save = async () => {
      dirty = false;
      try {
        const r = await Sov.notes.save(noteId, ta.value);
        if (r && r.id) { noteId = r.id; PREF.set('brickNoteId', noteId); }
        const s = box.querySelector('.lw-note-saved');
        if (s) { s.textContent = 'Saved'; setTimeout(() => { if (s.isConnected) s.textContent = ''; }, 1200); }
      } catch (e) {}
    };
    ta.oninput = () => { dirty = true; clearTimeout(t); t = setTimeout(save, 600); };
    // unmount FLUSHES a pending save — closing the window mid-sentence must
    // never eat the last keystrokes
    return () => { clearTimeout(t); if (dirty) save(); }
  }

  /* ---- brick: Music — a mini player over ~/Music. The audio element lives
     OUTSIDE the window (module-level), so a track keeps playing when the
     window unmounts (opening an app, locking) — the window is just a face on
     it. Real files or an honest empty state; the full Music app and this
     player pause each other so two songs never fight. ---- */
  let _lwAudio = null, _lwMu = { tracks: null, i: 0 };
  function lwMountMusic(box) {
    box.innerHTML = `<div class="lw-empty">Reading ~/Music…</div>`;
    (async () => {
      if (!_lwMu.tracks) { try { _lwMu.tracks = ((await Sov.music()) || {}).items || []; } catch (e) { _lwMu.tracks = []; } }
      if (!box.isConnected) return;
      const tracks = _lwMu.tracks;
      if (!tracks.length) { box.innerHTML = `<div class="lw-empty">No music yet — add files to ~/Music.</div>`; return; }
      box.innerHTML = `<div class="lw-mu">
        <div class="lw-mu-t" data-mu-title></div>
        <div class="lw-mu-seek" data-mu-seek><span data-mu-fill></span></div>
        <div class="lw-mu-ctrls">
          <button class="lt-ctrl" data-mu="prev" aria-label="Previous">${ic('back', 16)}</button>
          <button class="lt-ctrl lw-mu-play" data-mu="play" aria-label="Play / pause">${ic('play', 18)}</button>
          <button class="lt-ctrl" data-mu="next" aria-label="Next" style="transform:scaleX(-1)">${ic('back', 16)}</button>
        </div></div>`;
      const q = sel => box.querySelector(sel);
      const audio = _lwAudio || (_lwAudio = new Audio());
      const paint = () => {
        const tt = q('[data-mu-title]'); if (!tt) return;
        tt.textContent = tracks[_lwMu.i] ? tracks[_lwMu.i].name : '';
        const pb = q('[data-mu="play"]'); if (pb) pb.innerHTML = ic(audio.src && !audio.paused ? 'stop' : 'play', 18);
        const f = q('[data-mu-fill]');
        if (f) f.style.width = (audio.duration ? audio.currentTime / audio.duration * 100 : 0) + '%';
      };
      const load = (ix, play) => {
        _lwMu.i = ((ix % tracks.length) + tracks.length) % tracks.length;
        audio.src = Sov.audioUrl(tracks[_lwMu.i].rel);
        if (play) { if (_audio) { try { _audio.pause(); } catch (e) {} } audio.play().catch(() => {}); }
        paint();
      };
      // assigned (not addEventListener) so a remount replaces, never stacks;
      // handlers guard on the window being mounted, so playback continuing
      // while unmounted is safe and silent
      audio.ontimeupdate = paint;
      audio.onplay = paint; audio.onpause = paint;
      audio.onended = () => load(_lwMu.i + 1, true);
      q('[data-mu="play"]').onclick = () => {
        if (!audio.src) return load(_lwMu.i, true);
        if (audio.paused) { if (_audio) { try { _audio.pause(); } catch (e) {} } audio.play().catch(() => {}); }
        else audio.pause();
      };
      q('[data-mu="prev"]').onclick = () => load(_lwMu.i - 1, true);
      q('[data-mu="next"]').onclick = () => load(_lwMu.i + 1, true);
      q('[data-mu-seek]').onclick = e => {
        if (!audio.duration) return;
        const b = e.currentTarget.getBoundingClientRect();
        audio.currentTime = (e.clientX - b.left) / b.width * audio.duration;
      };
      paint();
    })();
  }

  /* ======================================================================
     FILES — a real file manager over the session user's own filesystem
     (agent's /api/files/*; a faithful simulation in the browser preview)
     ====================================================================== */
  const fmJoin = (dir, name) => (dir === '/' ? '' : dir.replace(/\/$/, '')) + '/' + name;
  const fmDate = ts => {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  function fileKind(name, isDir) {
    if (isDir) return { ic: 'folder', col: 'var(--accent)' };
    const n = name.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic)$/.test(n)) return { ic: 'photo', col: '#1B9AA8' };
    if (/\.(mp3|flac|wav|ogg|m4a|aac|opus)$/.test(n)) return { ic: 'music', col: '#C0392B' };
    if (/\.(mp4|mkv|mov|webm|avi)$/.test(n)) return { ic: 'photo', col: '#7A5AD6' };
    if (/\.(zip|xz|gz|bz2|tar|img|iso|deb|7z)$/.test(n)) return { ic: 'layers', col: '#8896A6' };
    if (/\.(kdbx|key|pem|gpg|crt)$/.test(n)) return { ic: 'key', col: '#2BA869' };
    if (/\.(txt|md|log|conf|cfg|ini|json|csv|ya?ml|sh|py|js|css|html?|c|h|rs|go|toml)$/.test(n)) return { ic: 'note', col: '#C8A020' };
    if (/\.pdf$/.test(n)) return { ic: 'note', col: '#D6772E' };
    return { ic: 'file', col: '#8896A6' };
  }

  async function renderFiles() {
    $('#screenScroll').innerHTML = shead('Files', 'Files') + loadingCard();
    await drawFiles('files');
  }
  async function drawFiles(id) {
    const data = await Sov.files.list(S.fmPath || '', S.fmHidden);
    if (!stillOn(id)) return;
    S.fmPath = data.path;
    if (data.home) S.fmHome = data.home;
    const H = S.fmHome || '/home/aura';

    const title = data.path === H ? 'Home' : data.path === '/' ? 'Filesystem'
      : (data.path.split('/').pop() || 'Filesystem');

    // breadcrumb
    const parts = data.path.split('/').filter(Boolean);
    let acc = '';
    const crumbs = [`<button class="fm-crumb" data-fmcd="/">/</button>`]
      .concat(parts.map((p, i) => {
        acc += '/' + p;
        return `<span class="fm-sep">${ic('chev', 12)}</span>` +
          `<button class="fm-crumb${i === parts.length - 1 ? ' cur' : ''}" data-fmcd="${esc(acc)}">${esc(p)}</button>`;
      })).join('');

    // quick locations
    const quick = [
      { n: 'Home', p: H, ic: 'home' },
      { n: 'Documents', p: H + '/Documents', ic: 'files' },
      { n: 'Downloads', p: H + '/Downloads', ic: 'layers' },
      { n: 'Pictures', p: H + '/Pictures', ic: 'photo' },
      { n: 'Vault', p: H + '/vault', ic: 'lock' },
      { n: 'Root', p: '/', ic: 'disk' },
    ];
    const quickHTML = quick.map(q =>
      `<button class="fm-chip${data.path === q.p ? ' on' : ''}" data-fmcd="${esc(q.p)}">${ic(q.ic, 15)}<span>${q.n}</span></button>`).join('');

    // rows
    const rows = data.error
      ? `<div class="row muted">${esc(data.error)}</div>`
      : (data.entries.length
        ? data.entries.map(e => {
          const k = fileKind(e.name, e.dir);
          const sub = e.dir ? (e.link ? 'folder · link' : 'folder')
            : `${fmtBytes(e.size)} · ${fmDate(e.mtime)}${e.link ? ' · link' : ''}`;
          return `<button class="row tappable fm-row" data-fmentry="${esc(e.name)}" style="width:100%;text-align:left">
              <span class="glyph" style="color:${k.col}">${ic(k.ic, 20)}</span>
              <span class="rtext"><div class="rtitle">${esc(e.name)}</div>
                <div class="rsub mono">${sub}</div></span>
              ${e.dir ? `<span class="chev">${ic('chev', 18)}</span>` : ''}</button>`;
        }).join('')
        : `<div class="row muted">This folder is empty.</div>`);

    const up = data.path !== '/'
      ? `<button class="mini-btn" data-fmcd="${esc(data.parent)}">${ic('up', 13)} Up</button>` : '';
    const newBtn = data.writable
      ? `<button class="mini-btn" data-fmnew>${ic('folder', 13)} New folder</button>`
      : `<span class="fm-ro">${ic('lock', 12)} read-only</span>`;

    $('#screenScroll').innerHTML = `
      ${shead('Files', esc(title))}
      <div class="fm-crumbwrap">${crumbs}</div>
      <div class="fm-quick">${quickHTML}</div>
      <div class="fm-actions">
        ${up}${newBtn}
        <button class="mini-btn" data-fmhidden>${S.fmHidden ? 'Hide hidden' : 'Show hidden'}</button>
        <button class="mini-btn" data-fmterm>${ic('terminal', 13)} Terminal here</button>
      </div>
      <div class="card fm-list">${rows}</div>
      <div style="height:8px"></div>`;

    const cd = p => { S.fmPath = p; drawFiles(id); };
    $('#screenScroll').querySelectorAll('[data-fmcd]').forEach(b => b.onclick = () => cd(b.dataset.fmcd));
    $('#screenScroll').querySelectorAll('[data-fmentry]').forEach(b => {
      const e = data.entries.find(x => x.name === b.dataset.fmentry);
      b.onclick = () => { if (e.dir) cd(fmJoin(data.path, e.name)); else openFileSheet(e, data.path, id); };
    });
    const nb = $('#screenScroll').querySelector('[data-fmnew]');
    if (nb) nb.onclick = async () => {
      const name = await askInput('New folder', { label: 'Folder name', okLabel: 'Create' });
      if (!name) return;
      const r = await Sov.files.op('mkdir', fmJoin(data.path, name.trim()));
      toast(r.ok ? 'Folder created' : (r.msg || 'Could not create'), r.ok ? 'ok' : 'alert', r.ok ? 'check' : 'x');
      if (stillOn(id)) drawFiles(id);
    };
    $('#screenScroll').querySelector('[data-fmhidden]').onclick = () => { S.fmHidden = !S.fmHidden; drawFiles(id); };
    $('#screenScroll').querySelector('[data-fmterm]').onclick = () => { termSession('main').cwd = data.path; go('terminal'); };
  }

  async function openFileSheet(e, dir, id) {
    const full = fmJoin(dir, e.name);
    const scrim = $('#promptScrim');
    scrim.innerHTML = `<div class="prompt-card fm-sheet"><div class="row muted">Reading…</div></div>`;
    scrim.classList.add('open');
    const rd = await Sov.files.read(full);
    const k = fileKind(e.name, false);
    let preview;
    if (rd.error) preview = `<div class="fm-prev muted">${esc(rd.error)}</div>`;
    else if (rd.binary) preview = `<div class="fm-prev muted">Binary file — ${fmtBytes(rd.size || 0)}. No text preview.</div>`;
    else if (rd.truncated) preview = `<div class="fm-prev muted">${fmtBytes(rd.size || 0)} — larger than the 256 KB preview limit.</div>`;
    else if (!rd.text) preview = `<div class="fm-prev muted">Empty file.</div>`;
    else preview = `<pre class="fm-prev">${esc(rd.text.slice(0, 20000))}${rd.text.length > 20000 ? '\n…' : ''}</pre>`;

    scrim.innerHTML = `<div class="prompt-card fm-sheet">
      <div class="fm-sheet-head"><span class="glyph" style="color:${k.col}">${ic(k.ic, 24)}</span>
        <div class="fm-sheet-id"><div class="pc-title">${esc(e.name)}</div>
          <div class="pc-note mono">${esc(full)}</div></div></div>
      <div class="ai-decl">
        <div><span>Size</span><b>${fmtBytes(e.size || rd.size || 0)}</b></div>
        <div><span>Modified</span><b>${esc(fmDate(e.mtime))}</b></div>
        <div><span>Permissions</span><b class="mono">${esc(e.mode || '—')}</b></div>
      </div>
      ${preview}
      <div class="prompt-actions triple">
        <button class="pbtn deny" data-fmdel>Delete</button>
        <button class="pbtn" data-fmren>Rename</button>
        <button class="pbtn allow" data-fmclose>Close</button></div></div>`;
    const close = () => { scrim.classList.remove('open'); setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200); };
    scrim.querySelector('[data-fmclose]').onclick = close;
    scrim.querySelector('[data-fmren]').onclick = async () => {
      const nn = await askInput('Rename', { label: 'New name', value: e.name, okLabel: 'Rename' });
      if (!nn || nn.trim() === e.name) return;
      const r = await Sov.files.op('rename', full, fmJoin(dir, nn.trim()));
      toast(r.ok ? 'Renamed' : (r.msg || 'Rename failed'), r.ok ? 'ok' : 'alert', r.ok ? 'check' : 'x');
      if (stillOn(id)) drawFiles(id);
    };
    scrim.querySelector('[data-fmdel]').onclick = async () => {
      const ok = await confirmModal(`Delete ${e.name}?`,
        e.dir ? 'This permanently deletes the folder and everything inside it.' : 'This permanently deletes the file.',
        'Delete');
      if (!ok) return;
      const r = await Sov.files.op('delete', full);
      toast(r.ok ? 'Deleted' : (r.msg || 'Delete failed'), r.ok ? 'warn' : 'alert', r.ok ? 'trash' : 'x');
      if (stillOn(id)) drawFiles(id);
    };
  }

  /* ======================================================================
     AI ENGINE (Phase II) — Intelligence, Context, Memory, Activity, Assistant
     Every surface here obeys AI-MANIFEST.md.
     ====================================================================== */
  const fmtWhen = ts => {
    const d = Math.floor(Date.now() / 1000) - ts;
    if (d < 60) return 'just now';
    if (d < 3600) return Math.floor(d / 60) + 'm ago';
    if (d < 86400) return Math.floor(d / 3600) + 'h ago';
    return Math.floor(d / 86400) + 'd ago';
  };

  /* AI-permission consent — a distinct request, separate from app permissions,
     declaring resources · purpose · actions · lifetime (Manifest P7). */
  function askAiPermission(decl) {
    return new Promise(resolve => {
      const scrim = $('#promptScrim');
      scrim.innerHTML = `<div class="prompt-card">
        <div class="pc-ic" style="color:var(--accent);background:color-mix(in srgb, var(--accent) 14%, transparent)">${ic('spark',26)}</div>
        <div class="pc-title">${esc(decl.title)}</div>
        <div class="pc-body">The AI Engine is requesting access. You decide — this is separate from app permissions and revocable anytime.</div>
        <div class="ai-decl">
          <div><span>Uses</span><b>${esc(decl.resources)}</b></div>
          <div><span>Purpose</span><b>${esc(decl.purpose)}</b></div>
          <div><span>Actions</span><b>${esc(decl.actions)}</b></div>
          <div><span>Lifetime</span><b>${esc(decl.lifetime)}</b></div>
        </div>
        <div class="prompt-actions"><button class="pbtn deny" data-x>Don't allow</button>
          <button class="pbtn allow" data-ok>Allow</button></div></div>`;
      scrim.classList.add('open');
      const done = v => { scrim.classList.remove('open'); setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200); resolve(v); };
      scrim.querySelector('[data-ok]').onclick = () => done(true);
      scrim.querySelector('[data-x]').onclick = () => done(false);
    });
  }

  async function renderAI() {
    const id = 'sys-ai';
    $('#screenScroll').innerHTML = shead('Intelligence', 'AI Engine') + loadingCard();
    const st = await Sov.ai.status();
    if (!stillOn(id)) return;
    const b = st.backend;
    const on = st.enabled && !st.killed;
    const trust = ['Observe', 'Recommend', 'Approve', 'Auto'];
    const trustSeg = `<div class="seg trust">${trust.map((t, i) =>
      `<button class="${st.trustLevel === i ? 'on ask' : ''}" data-trust="${i}">${i} · ${t}</button>`).join('')}</div>`;
    $('#screenScroll').innerHTML = `
      ${shead('Intelligence', 'AI Engine', 'A native, on-device intelligence layer — under your control. Off by default; nothing leaves this device unless you allow it.')}
      <div class="card">
        <button class="row tappable" data-ai-enable style="width:100%;text-align:left">
          <span class="glyph" style="color:${on ? 'var(--accent)' : 'var(--text-2)'}">${ic('spark',22)}</span>
          <span class="rtext"><div class="rtitle">Intelligence</div>
            <div class="rsub">${st.killed ? 'Stopped by kill switch' : (on ? 'On · running locally' : 'Off')}</div></span>
          <span class="switch ${on ? 'on' : ''}"></span></button>
      </div>
      ${st.killed ? '' : `
      <div class="card">
        <div class="gauge"><div class="gauge-top"><span>${ic('cpu',16)} Backend</span>
          <span class="mono">${b.available ? esc(b.kind) : 'none'}</span></div>
          <div class="gauge-lbl mono">${b.available ? 'local · ' + esc(b.model || b.models[0] || 'model')
            : 'No local model — install one with: ollama pull llama3.2:1b'}</div></div>
      </div>
      <div class="section-head"><span class="eyebrow">Automation trust</span><span class="muted" style="font-size:11px">You decide, not developers</span></div>
      <div class="card"><div class="row" style="display:block">${trustSeg}
        <div class="rsub" style="margin-top:10px">${['Observe only — never acts.', 'Recommends; you act.', 'Executes after your approval.', 'Executes trusted actions automatically.'][st.trustLevel]}</div></div></div>
      <div class="card">
        <button class="row tappable" data-ai-cloud style="width:100%;text-align:left">
          <span class="glyph">${ic('globe',20)}</span>
          <span class="rtext"><div class="rtitle">Allow cloud models</div>
            <div class="rsub">${st.allowCloud ? 'Cloud may be offered when local can\'t' : 'Local only — cloud never used'}</div></span>
          <span class="switch ${st.allowCloud ? 'on' : ''}"></span></button>
      </div>
      <div class="section-head"><span class="eyebrow">Your data</span></div>
      <div class="card">
        ${srow('spark', 'Assistant', 'Ask the on-device AI', 'assistant')}
        ${srow('memory', 'Memory', st.memoryCount + ' saved · inspect &amp; delete', 'sys-ai-memory')}
        ${srow('eye', 'Activity', st.activityCount + ' events · why it acted', 'sys-ai-activity')}
        ${srow('shieldChk', 'Context access', 'What the AI may read', 'sys-ai-context')}
      </div>`}
      <div class="card" style="margin-top:14px">
        <button class="row tappable" data-ai-kill style="width:100%;text-align:left">
          <span class="glyph" style="color:var(--alert)">${ic('stop',20)}</span>
          <span class="rtext"><div class="rtitle" style="color:var(--alert)">${st.killed ? 'Kill switch is ON' : 'Emergency stop'}</div>
            <div class="rsub">${st.killed ? 'Tap to re-enable the engine' : 'Disable all AI instantly'}</div></span></button>
      </div>
      <div style="height:8px"></div>`;
    bindNav($('#screenScroll'));
    const rerender = () => { if (stillOn(id)) renderAI(); };
    const en = $('#screenScroll').querySelector('[data-ai-enable]');
    if (en) en.onclick = async () => {
      if (!on) {
        const ok = await askAiPermission({ title: 'Turn on the assistant?', resources: 'Your typed prompts',
          purpose: 'Answer your questions on-device', actions: 'Run a local model', lifetime: 'Until you turn it off' });
        if (!ok) return;
        await Sov.ai.setSettings({ enabled: true });
      } else await Sov.ai.setSettings({ enabled: false });
      rerender();
    };
    const kl = $('#screenScroll').querySelector('[data-ai-kill]');
    if (kl) kl.onclick = async () => {
      await Sov.ai.setSettings({ killed: !st.killed });
      toast(st.killed ? 'Kill switch released' : 'AI stopped', 'warn', 'stop'); rerender();
    };
    const cl = $('#screenScroll').querySelector('[data-ai-cloud]');
    if (cl) cl.onclick = async () => { await Sov.ai.setSettings({ allowCloud: !st.allowCloud }); rerender(); };
    $('#screenScroll').querySelectorAll('[data-trust]').forEach(bn =>
      bn.onclick = async () => { await Sov.ai.setSettings({ trustLevel: +bn.dataset.trust }); rerender(); });
  }

  async function renderAIContext() {
    const id = 'sys-ai-context';
    $('#screenScroll').innerHTML = shead('Intelligence', 'Context access') + loadingCard();
    const st = await Sov.ai.status();
    if (!stillOn(id)) return;
    const perms = st.perms || {};
    const SRC = [{ k: 'files', ic: 'files', n: 'Files & documents' }, { k: 'calendar', ic: 'clock', n: 'Calendar' },
      { k: 'location', ic: 'loc', n: 'Location' }, { k: 'photos', ic: 'photo', n: 'Photos' }, { k: 'messages', ic: 'msg', n: 'Messages' }];
    const seg = (k, val) => {
      const o = (v, cls, l) => `<button class="${val === v ? 'on ' + cls : ''}" data-aiperm="${k}|${v}">${l}</button>`;
      return `<div class="seg">${o('allow', 'allow', 'Allow')}${o('ask', 'ask', 'Ask')}${o('deny', 'deny', 'Deny')}</div>`;
    };
    $('#screenScroll').innerHTML = `
      ${shead('Intelligence', 'Context access', 'The assistant is context-aware, not surveillance-aware. Each source is authorized independently and defaults to off. No permanent unrestricted access exists.')}
      <div class="card">${SRC.map(s => `<div class="perm-line"><span class="pl-ic">${ic(s.ic,20)}</span>
        <span class="pl-name">${s.n}</span>${seg(s.k, perms[s.k] || 'deny')}</div>`).join('')}</div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-aiperm]').forEach(b => b.onclick = async () => {
      const [k, v] = b.dataset.aiperm.split('|');
      await Sov.ai.setPerm(k, v);
      if (stillOn(id)) renderAIContext();
    });
  }

  async function renderAIMemory() {
    const id = 'sys-ai-memory';
    $('#screenScroll').innerHTML = shead('Intelligence', 'Memory') + loadingCard();
    const [mem, aiStat] = await Promise.all([Sov.ai.memory(), Sov.ai.status()]);
    if (!stillOn(id)) return;
    const mp = (aiStat && aiStat.memory) || {};
    const vaultRow = mp.encrypted ? `<div class="row"><span class="glyph" style="color:var(--good,#4ade80)">${ic('lock', 18)}</span>
      <span class="rtext"><div class="rtitle" style="font-size:13px">${mp.available ? 'Encrypted in the Vault' : 'Sealed — Vault locked'}</div>
        <div class="rsub">${mp.fscrypt ? 'fscrypt (AES-256-XTS) + ' : ''}app-layer envelope encryption. Only you, when unlocked.</div></span></div>` : '';
    const items = mem.length ? mem.map(m => `<div class="row"><span class="glyph">${ic('memory',18)}</span>
      <span class="rtext"><div class="rtitle" style="font-size:13px">${esc(m.text)}</div>
        <div class="rsub mono">${fmtWhen(m.ts)}</div></span>
      <button class="mini-btn danger" data-delmem="${esc(m.id)}">Delete</button></div>`).join('')
      : '<div class="row muted">No memories yet.</div>';
    $('#screenScroll').innerHTML = `
      ${shead('Intelligence', 'Memory', 'Memory belongs to you: local, editable, and yours to delete. Nothing here is hidden.')}
      ${vaultRow ? `<div class="card">${vaultRow}</div>` : ''}
      <div class="card" style="margin-top:${vaultRow ? '10px' : '0'}">${items}</div>
      <div class="card" style="margin-top:10px">
        <button class="row tappable" data-addmem style="width:100%;text-align:left"><span class="glyph">${ic('spark',18)}</span>
          <span class="rtext"><div class="rtitle">Add a memory</div><div class="rsub">Tell the assistant something to remember</div></span></button>
        ${mem.length ? `<button class="row tappable" data-clearmem style="width:100%;text-align:left"><span class="glyph" style="color:var(--alert)">${ic('trash',18)}</span>
          <span class="rtext"><div class="rtitle" style="color:var(--alert)">Delete all memories</div></span></button>` : ''}
      </div><div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-delmem]').forEach(b => b.onclick = async () => {
      await Sov.ai.delMemory(b.dataset.delmem); if (stillOn(id)) renderAIMemory();
    });
    const add = $('#screenScroll').querySelector('[data-addmem]');
    if (add) add.onclick = async () => {
      const t = await askInput('Add a memory', { label: 'What should the assistant remember?', okLabel: 'Save' });
      if (t) { await Sov.ai.addMemory(t); toast('Saved to memory', 'ok', 'check'); if (stillOn(id)) renderAIMemory(); }
    };
    const clr = $('#screenScroll').querySelector('[data-clearmem]');
    if (clr) clr.onclick = async () => {
      const ok = await confirmModal('Delete all memories?', 'This permanently removes everything the assistant remembers.', 'Delete all');
      if (ok) { await Sov.ai.clearMemory(); if (stillOn(id)) renderAIMemory(); }
    };
  }

  async function renderAIActivity() {
    const id = 'sys-ai-activity';
    $('#screenScroll').innerHTML = shead('Intelligence', 'Activity') + loadingCard();
    const act = await Sov.ai.activity();
    if (!stillOn(id)) return;
    const kindIc = { chat: 'spark', power: 'spark', kill: 'stop', permission: 'shieldChk', memory: 'memory', settings: 'gear' };
    const items = act.length ? act.map(a => `<div class="row"><span class="glyph">${ic(kindIc[a.kind] || 'eye',18)}</span>
      <span class="rtext"><div class="rtitle" style="font-size:13px">${esc(a.summary)}</div>
        <div class="rsub">${esc(a.why)}</div>
        <div class="rsub mono" style="opacity:.6">${fmtWhen(a.ts)}</div></span></div>`).join('')
      : '<div class="row muted">Nothing yet. The assistant logs everything it does here.</div>';
    $('#screenScroll').innerHTML = `
      ${shead('Intelligence', 'Activity', 'Every AI action is explainable. This is the honest log of what the assistant did, and why.')}
      <div class="card">${items}</div>
      ${act.length ? `<div class="card" style="margin-top:10px"><button class="row tappable" data-clearact style="width:100%;text-align:left">
        <span class="glyph" style="color:var(--alert)">${ic('trash',18)}</span>
        <span class="rtext"><div class="rtitle" style="color:var(--alert)">Clear activity log</div></span></button></div>` : ''}
      <div style="height:8px"></div>`;
    const c = $('#screenScroll').querySelector('[data-clearact]');
    if (c) c.onclick = async () => { await Sov.ai.clearActivity(); if (stillOn(id)) renderAIActivity(); };
  }

  async function renderAssistant() {
    const id = 'assistant';
    if (S.chat === undefined) S.chat = [];
    $('#screenScroll').innerHTML = shead('Intelligence', 'Assistant') + loadingCard();
    const st = await Sov.ai.status();
    if (!stillOn(id)) return;
    drawAssistant(st);
  }
  function drawAssistant(st) {
    const on = st.enabled && !st.killed;
    if (!on) {
      $('#screenScroll').innerHTML = `
        ${shead('Intelligence', 'Assistant')}
        <div class="card" style="margin-top:16px"><div class="row" style="display:block;text-align:center;padding:26px">
          <div style="color:var(--accent);margin-bottom:12px">${ic('spark',40)}</div>
          <div class="rtitle" style="font-size:17px">${st.killed ? 'Intelligence is stopped' : 'Intelligence is off'}</div>
          <div class="rsub" style="margin:8px 0 18px">${st.killed ? 'The kill switch is engaged.' : 'The on-device assistant is off by default. Turn it on to begin — nothing leaves your device.'}</div>
          <button class="pbtn allow" data-ai-on style="display:inline-block;padding:11px 22px">${st.killed ? 'Open settings' : 'Turn on the assistant'}</button>
        </div></div>`;
      const b = $('#screenScroll').querySelector('[data-ai-on]');
      if (b) b.onclick = async () => {
        if (st.killed) return go('sys-ai');
        const ok = await askAiPermission({ title: 'Turn on the assistant?', resources: 'Your typed prompts',
          purpose: 'Answer your questions on-device', actions: 'Run a local model', lifetime: 'Until you turn it off' });
        if (!ok) return;
        await Sov.ai.setSettings({ enabled: true }); renderAssistant();
      };
      return;
    }
    const b = st.backend;
    const badge = b.available
      ? `<span class="ai-badge">${ic('shieldChk',12)} local · ${esc(b.model || 'model')}</span>`
      : `<span class="ai-badge warn">${ic('info',12)} no local model</span>`;
    const bubbles = S.chat.length
      ? S.chat.map(m => `<div class="msg ${m.role}">${m.role === 'ai' ? `<span class="msg-ic">${ic('spark',14)}</span>` : ''}<div class="msg-body">${esc(m.text)}</div></div>`).join('')
      : `<div class="chat-empty">Ask anything — it runs on-device.${b.available ? '' : ' Install a local model for real answers: <span class="mono">ollama pull llama3.2:1b</span>.'}</div>`;
    $('#screenScroll').innerHTML = `
      ${shead('Intelligence', 'Assistant')}
      <div class="assist-bar">${badge}<button class="mini-btn" data-ai-settings>Settings</button></div>
      <div class="chat" id="chatOut">${bubbles}</div>
      <div class="term-input"><span class="term-prompt">${ic('spark',15)}</span>
        <input id="chatIn" autocomplete="off" placeholder="Ask the assistant…"></div>
      <div style="height:8px"></div>`;
    const co = $('#chatOut'); co.scrollTop = co.scrollHeight;
    $('#screenScroll').querySelector('[data-ai-settings]').onclick = () => go('sys-ai');
    const inp = $('#chatIn'); setTimeout(() => inp.focus(), 50);
    inp.onkeydown = async e => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      const q = inp.value.trim(); if (!q) return;
      S.chat.push({ role: 'user', text: q }); inp.value = '';
      const aiIdx = S.chat.push({ role: 'ai', text: '…' }) - 1;
      drawAssistant(st);
      // Stream tokens straight into the last AI bubble — no full re-render per
      // token (keeps the input focused and the view from flickering).
      const paintDelta = acc => {
        S.chat[aiIdx].text = acc;
        if (S.view !== 'assistant') return;
        const bodies = $('#chatOut').querySelectorAll('.msg.ai .msg-body');
        const bb = bodies[bodies.length - 1];
        if (!bb) return;
        // if it's shaping up as a tool call (raw JSON), don't show the JSON — the
        // action + confirmation replaces it a moment later.
        const looksTool = /^\s*\{[\s\S]*"(function|name)"/.test(acc);
        bb.textContent = looksTool ? '…' : acc;
        const co = $('#chatOut'); co.scrollTop = co.scrollHeight;
      };
      const r = await Sov.ai.chatStream(q, true, paintDelta);
      if (r.ok && r.plan && r.plan.length) S.chat[aiIdx].text = await handlePlan(r.plan, r.trustLevel);
      else if (r.ok) S.chat[aiIdx].text = r.text || S.chat[aiIdx].text || '(no reply)';
      else if (r.reason === 'no-backend') S.chat[aiIdx].text = r.message;
      else if (r.reason === 'disabled' || r.reason === 'killed') { S.chat.pop(); return renderAssistant(); }
      else S.chat[aiIdx].text = r.message || 'Something went wrong.';
      if (S.view === 'assistant') drawAssistant(st);
    };
  }

  /* ======================================================================
     AI ACTIONS — the resident proposes a PLAN, the OS adjudicates, the agent
     runs it. A model's plan is a *proposal*, never an act (AI-MANIFEST P2): at
     trust < 3 the user sees a plan card and approves the steps; at trust 3
     trusted steps auto-run. Every step is logged (P8) and reversible where it
     makes sense — one Undo reverts the whole plan (P9). Nothing here maps a
     keyword to an action: the model composed these steps by reasoning over the
     capability catalog; the shell only knows how to *perform* each capability.
     ====================================================================== */
  const clampPct = v => Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  const AI_ACTIONS = {
    open_app:         { icon: 'grid',  verb: a => `Open ${cap(String(a.name || 'an app'))}` },
    set_brightness:   { icon: 'sun',   verb: a => `Set brightness to ${clampPct(a.percent)}%` },
    set_volume:       { icon: 'vol',   verb: a => `Set volume to ${clampPct(a.percent)}%` },
    set_dnd:          { icon: 'vol',   verb: a => a.on === false ? 'Turn off silent mode' : 'Silence the phone' },
    play_music:       { icon: 'music', verb: a => a.mood ? `Play ${cap(String(a.mood))} music` : 'Play music' },
    toggle_wifi:      { icon: 'wifi',  verb: a => `Turn Wi-Fi ${a.on ? 'on' : 'off'}` },
    toggle_bluetooth: { icon: 'bt',    verb: a => `Turn Bluetooth ${a.on ? 'on' : 'off'}` },
    open_settings:    { icon: 'gear',  verb: a => `Open ${String(a.screen || 'settings')} settings` },
    create_note:      { icon: 'note',  verb: () => `Save a note` },
    lock_device:      { icon: 'lock',  verb: () => `Lock the device` },
    create_event:     { icon: 'calendar', verb: a => `Add “${cap(String(a.title || 'event'))}”${a.date ? ' · ' + a.date : ''}${a.time ? ' ' + a.time : ''}` },
    send_sms:         { icon: 'msg',   verb: a => `Text ${cap(String(a.to || 'someone'))}${a.text ? ': “' + String(a.text).slice(0, 40) + '”' : ''}` },
    call_contact:     { icon: 'phone', verb: a => `Call ${cap(String(a.to || 'someone'))}` },
    search:           { icon: 'search',verb: a => `Search for “${String(a.query || '')}”` },
    web_search:       { icon: 'browser', verb: a => `Search the web for “${String(a.query || '')}”` },
  };
  const SETTINGS_ROUTE = { wifi: 'sys-wifi', display: 'sys-display', sound: 'sys-sound',
    permissions: 'permissions', network: 'network', about: 'sys-about',
    personalize: 'personalize', power: 'sys-power', android: 'sys-android' };

  async function resolveApp(name) {
    const q = String(name || '').toLowerCase().replace(/\bapp\b/, '').trim();
    if (!q) return null;
    const built = Sov.apps().find(a => a.name.toLowerCase() === q || a.id === q)
      || Sov.apps().find(a => a.name.toLowerCase().includes(q));
    if (built) return { id: built.id, name: built.name, desktop: false };
    if (INSTALLED === null) { const c = await Sov.capabilities(); INSTALLED = (c && c.apps) || []; }
    const real = INSTALLED.find(a => a.name.toLowerCase() === q)
      || INSTALLED.find(a => a.name.toLowerCase().includes(q));
    return real ? { id: real.id, name: real.name, desktop: true } : null;
  }

  // A proposed plan → adjudication → execution. One or many steps.
  async function handlePlan(plan, trustLevel) {
    const steps = (plan || []).filter(s => AI_ACTIONS[s.name]);
    if (!steps.length) return "I proposed something I don't know how to do yet.";
    let chosen = steps;
    if ((trustLevel || 1) < 3) {                       // observe/recommend/approve → confirm
      chosen = await planCard(steps);
      if (!chosen || !chosen.length) {
        Sov.ai.logAction('Declined a proposal', 'The resident proposed a plan; you declined.', false);
        return steps.length > 1 ? "No problem — I'll leave things as they are."
                                : `No problem — I won't ${steps[0] && lc(AI_ACTIONS[steps[0].name].verb(steps[0].args || {}))}.`;
      }
    }
    return runPlan(chosen);
  }

  const lc = s => s ? s[0].toLowerCase() + s.slice(1) : s;

  // The plan card: a plain-language, per-step consent surface. Each step is
  // on by default; the user can drop any of them, then run what's left.
  function planCard(steps) {
    return new Promise(resolve => {
      const scrim = $('#promptScrim');
      const single = steps.length === 1;
      const rows = steps.map((s, i) => {
        const spec = AI_ACTIONS[s.name];
        return `<label class="plan-step">
          <input type="checkbox" data-step="${i}" checked>
          <span class="ps-ic">${ic(spec.icon, 18)}</span>
          <span class="ps-text"><span class="ps-desc">${esc(spec.verb(s.args || {}))}</span>
            ${s.why ? `<span class="ps-why">${esc(s.why)}</span>` : ''}</span>
          <span class="ps-check">${ic('check', 15)}</span></label>`;
      }).join('');
      scrim.innerHTML = `
        <div class="prompt-card plan">
          <div class="pc-ic" style="color:var(--accent);background:color-mix(in srgb, var(--accent) 14%, transparent)">${ic('spark', 24)}</div>
          <div class="pc-title">${single ? 'Let the Aura do this?' : 'Here’s what I can do'}</div>
          ${single ? '' : `<div class="pc-sub">Pick what you’d like — I’ll only do those.</div>`}
          <div class="plan-steps">${rows}</div>
          <div class="pc-note">The resident proposed this. Nothing happens unless you allow it — and you can undo it.</div>
          <div class="prompt-actions"><button class="pbtn" data-x>Not now</button>
            <button class="pbtn allow" data-ok>${single ? 'Do it' : 'Do it'}</button></div>
        </div>`;
      scrim.classList.add('open');
      steps.forEach((s, i) => {
        const cb = scrim.querySelector(`[data-step="${i}"]`);
        const row = cb.closest('.plan-step');
        const sync = () => row.classList.toggle('off', !cb.checked);
        cb.onchange = sync; sync();
      });
      const done = v => { scrim.classList.remove('open'); setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200); resolve(v); };
      scrim.querySelector('[data-ok]').onclick = () =>
        done(steps.filter((_, i) => scrim.querySelector(`[data-step="${i}"]`).checked));
      scrim.querySelector('[data-x]').onclick = () => done(null);
    });
  }

  // Execute an approved plan step-by-step, in order; collect a single Undo that
  // reverts every reversible step. Returns a short spoken summary for the chat.
  async function runPlan(steps) {
    const dones = [], undos = [];
    for (const step of steps) {
      const res = await executeStep(step);
      if (res && res.desc) dones.push(res.desc);
      if (res && res.undo) undos.push(res.undo);
    }
    if (!dones.length) return "I couldn't complete that.";
    Sov.ai.logAction(dones.join('; '), 'You approved this plan.', undos.length > 0);
    const undoAll = undos.length ? { label: 'Undo', fn: () => { undos.reverse().forEach(u => u()); toast('Undone', '', 'restart'); } } : null;
    toast(dones.length > 1 ? `Done — ${dones.length} steps` : `${dones[0]} — done`, 'ok', 'check', undoAll);
    return dones.length > 1
      ? `Done — ${dones.map(lc).join(', ')}.`
      : `Done — ${lc(dones[0])}.`;
  }

  // Perform ONE capability. This is the OS-authority layer: the only place a
  // proposal becomes a real effect. Returns { desc, undo? } or null.
  async function executeStep(step) {
    const a = step.args || {}; const spec = AI_ACTIONS[step.name];
    const desc = spec ? spec.verb(a) : step.name;
    switch (step.name) {
      case 'open_app': {
        const hit = await resolveApp(a.name);
        if (!hit) return { desc: null };
        if (hit.desktop) { Sov.launchDesktop(hit.id); toast('Opening ' + hit.name + '…', '', 'grid'); }
        else launch(hit.id);
        return { desc: `Open ${hit.name}` };
      }
      case 'set_brightness': { const p = Sov.get().brightness, v = clampPct(a.percent); Sov.setLevel('brightness', v); return { desc, undo: () => Sov.setLevel('brightness', p) }; }
      case 'set_volume':     { const p = Sov.get().volume, v = clampPct(a.percent); Sov.setLevel('volume', v); return { desc, undo: () => Sov.setLevel('volume', p) }; }
      case 'set_dnd':        { const p = Sov.get().volume, on = a.on !== false; Sov.setLevel('volume', on ? 0 : Math.max(35, p)); return { desc, undo: () => Sov.setLevel('volume', p) }; }
      case 'play_music':     { const hit = await resolveApp('music'); if (hit) { hit.desktop ? Sov.launchDesktop(hit.id) : launch(hit.id); } return { desc }; }
      case 'toggle_wifi':      { const p = Sov.get().net.wifi; Sov.setToggle('wifi', !!a.on); return { desc, undo: () => Sov.setToggle('wifi', p) }; }
      case 'toggle_bluetooth': { const p = Sov.get().net.bluetooth; Sov.setToggle('bluetooth', !!a.on); return { desc, undo: () => Sov.setToggle('bluetooth', p) }; }
      case 'open_settings':  { go(SETTINGS_ROUTE[String(a.screen || '').toLowerCase()] || 'settings'); return { desc }; }
      case 'create_note':    { await Sov.notes.save('', a.text || ''); return { desc }; }
      case 'lock_device':    { lockDevice(); return { desc }; }
      case 'create_event': {
        const date = normalizeDate(a.date);
        const events = await Sov.calendar.op('add', { title: a.title || 'Event', date, time: a.time || '' });
        _srch = null;                                   // refresh deep-search cache
        const added = events && events[events.length - 1];
        return { desc: `Add “${a.title || 'event'}”`, undo: added ? () => Sov.calendar.op('delete', { id: added.id }) : null };
      }
      case 'send_sms': {
        const c = await resolveContact(a.to); const num = c ? c.number : a.to;
        if (!num || !a.text) return { desc: null };
        await Sov.sms.send(num, a.text);
        return { desc: `Text ${c ? c.name : num}` };
      }
      case 'call_contact': {
        const c = await resolveContact(a.to); const num = c ? c.number : a.to;
        if (!num) return { desc: null };
        await Sov.phone.dial(num);
        return { desc: `Call ${c ? c.name : num}` };
      }
      case 'search':     { S.pendingQuery = a.query || ''; go('drawer'); return { desc: `Search for “${a.query || ''}”` }; }
      case 'web_search': { S.pendingBrowse = a.query || ''; launch('browser'); return { desc: `Search the web for “${a.query || ''}”` }; }
    }
    return { desc: null };
  }

  // Resolve a contact name (or a raw number) to a stored contact, for the AI's
  // send_sms / call_contact actions.
  async function resolveContact(nameOrNumber) {
    const q = String(nameOrNumber || '').trim().toLowerCase();
    if (!q) return null;
    const list = await Sov.contacts.list();
    return list.find(c => (c.name || '').toLowerCase() === q)
      || list.find(c => (c.name || '').toLowerCase().includes(q)) || null;
  }
  // Normalize an AI-supplied date to YYYY-MM-DD (accepts today/tomorrow too).
  function normalizeDate(d) {
    const s = String(d || '').trim().toLowerCase();
    const iso = n => { const dt = new Date(); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); };
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (s === 'tomorrow') return iso(1);
    if (s === 'today' || !s) return iso(0);
    return iso(0);
  }

  // ---- proactive suggestion on the home screen --------------------------
  // The single calm surface for the resident's initiative: at most one thing it
  // has learned the user tends to do *now*. A proposal — Do it / Dismiss. It is
  // off entirely while intelligence is off (suggest() returns null), and a
  // dismissal is honoured for the rest of the day.
  let _lastSuggestAt = 0;
  async function maybeSuggest() {
    const slot = $('#suggestSlot'); if (!slot) return;
    if (Date.now() - _lastSuggestAt < 12000) return;   // don't hammer on re-render
    _lastSuggestAt = Date.now();
    let res; try { res = await Sov.ai.suggest(); } catch (e) { return; }
    if (S.view !== 'home') return;
    const sug = res && res.suggestion, step = sug && sug.plan && sug.plan[0];
    // The action suggestion (time-sensitive, one-shot) owns the slot; only when
    // there is none do we offer the calmer home-layout proposal — one card at a time.
    if (!sug || !step || !AI_ACTIONS[step.name]) return maybeHomeProposal(slot);
    const spec = AI_ACTIONS[step.name];
    slot.innerHTML = `
      <div class="suggest-card" id="suggestCard">
        <span class="sg-ic">${ic(spec.icon, 20)}</span>
        <div class="sg-text">
          <div class="sg-eyebrow">${ic('spark', 11)} A gentle suggestion</div>
          <div class="sg-title">${esc(spec.verb(step.args || {}))}?</div>
          <div class="sg-why">${esc(sug.why || '')}</div>
        </div>
        <div class="sg-acts">
          <button class="sg-no" data-sg-no>Not now</button>
          <button class="sg-yes" data-sg-yes>Do it</button>
        </div>
      </div>`;
    const card = $('#suggestCard');
    card.querySelector('[data-sg-yes]').onclick = async () => {
      Sov.ai.suggestFeedback(sug.id, true);
      card.classList.add('accepted'); setTimeout(() => card.remove(), 180);
      await runPlan(sug.plan);
    };
    card.querySelector('[data-sg-no]').onclick = () => {
      Sov.ai.suggestFeedback(sug.id, false);
      card.classList.add('dismissed'); setTimeout(() => card.remove(), 220);
    };
  }

  // ---- home-layout proposal (P13) ---------------------------------------
  // From what the resident has learned about this part of the day, gently
  // propose a home arrangement — which app leads and their order. A PROPOSAL
  // only: accepting writes the user's OWN layout store (the same one a drag
  // writes), so a later drag always overrides it (P10/P13). Every reason is
  // shown in plain language (P8) and the choice is logged.
  async function maybeHomeProposal(slot) {
    slot = slot || $('#suggestSlot'); if (!slot) return;
    // send the layout the user actually sees, so the Engine diffs against reality
    const cur = homeLayout(), focus = cur.focus.id;
    const order = homePagesIds().reduce((a, p) => a.concat(p || []), []).filter(id => id !== focus);
    let res; try { res = await Sov.ai.homeProposal(focus, order); } catch (e) { return; }
    if (!res || !res.proposal || S.view !== 'home') return;
    const p = res.proposal;
    const why = (p.changes || []).slice(0, 3).map(c =>
      `<div class="sg-why">${ic('spark', 10)} ${esc(c.why)}</div>`).join('') || `<div class="sg-why">${esc(p.why || '')}</div>`;
    slot.innerHTML = `
      <div class="suggest-card" id="suggestCard">
        <span class="sg-ic">${ic('grid', 20)}</span>
        <div class="sg-text">
          <div class="sg-eyebrow">${ic('spark', 11)} A gentle suggestion</div>
          <div class="sg-title">${esc(p.why || 'Rearrange your home for now?')}</div>
          ${why}
        </div>
        <div class="sg-acts">
          <button class="sg-no" data-sg-no>Not now</button>
          <button class="sg-yes" data-sg-yes>Rearrange</button>
        </div>
      </div>`;
    const card = $('#suggestCard');
    card.querySelector('[data-sg-yes]').onclick = () => {
      // the user's own act, into the user's own store — a drag can still undo it
      PREF.set('focus', p.focus);
      PREF.set('homePages', [p.order || []]);
      Sov.ai.homeFeedback(p.id, true, { focus: p.focus, order: p.order });
      card.classList.add('accepted'); setTimeout(() => card.remove(), 180);
      renderHome();
      toast('Home rearranged — drag any tile to change it', 'ok', 'check');
    };
    card.querySelector('[data-sg-no]').onclick = () => {
      Sov.ai.homeFeedback(p.id, false);
      card.classList.add('dismissed'); setTimeout(() => card.remove(), 220);
    };
  }

  /* ======================================================================
     LIVE WALLPAPER GALLERY — its own page: the recent Bing images of the
     day. The first one is "Today" (auto-rotates daily, the default); picking
     any other pins it until you change your mind. Images come through the
     agent (/api/wallpaper/image), never straight from the shell.
     ====================================================================== */
  async function renderWpGallery() {
    const id = 'wp-gallery';
    $('#screenScroll').innerHTML = shead('Personalize', 'Live wallpaper') + loadingCard();
    const r = await Sov.wallpaperList();
    if (!stillOn(id)) return;
    if (!r || !r.available) {
      $('#screenScroll').innerHTML = shead('Personalize', 'Live wallpaper',
        'The most recent Bing images of the day — pick one for home & lock.') + `
        <div class="card"><div class="row"><span class="glyph">${ic('info',18)}</span>
          <span class="rtext"><div class="rtitle">Gallery unavailable</div>
          <div class="rsub">${esc((r && r.error) || 'The image service could not be reached.')}</div></span></div></div>`;
      return;
    }
    const pick = PREF.get('liveWpPick', null);
    const liveOn = PREF.get('liveWallpaper', false);
    const day = d => d && d.length === 8
      ? new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00`)
          .toLocaleDateString([], { month: 'short', day: 'numeric' })
      : '';
    const isOn = (img, i) => liveOn && (pick ? pick.urlbase === img.urlbase : i === 0);
    $('#screenScroll').innerHTML = shead('Personalize', 'Live wallpaper',
      'The most recent Bing images of the day. “Today” follows the rotation; any other pick is pinned until you change it.') + `
      <div class="wpg-grid">${r.images.map((img, i) => `
        <button class="wpg-item ${isOn(img, i) ? 'on' : ''}" data-wpg="${i}">
          <img loading="lazy" src="${Sov.wallpaperImageUrlFor(img.urlbase, 'thumb')}" alt="">
          ${i === 0 ? `<span class="wl-daily">Today · auto</span>` : ''}
          ${isOn(img, i) ? `<span class="wp-chk">${ic('check',14)}</span>` : ''}
          <span class="wpg-lbl"><span class="wl-day">${esc(day(img.date))}</span>${esc(img.title || 'Untitled')}</span>
        </button>`).join('')}</div>
      <div class="pa-note" style="margin-top:10px">${esc(r.source || '')} · fetched by the agent, cached on-device</div>
      <div style="height:8px"></div>`;
    $$('#screenScroll [data-wpg]').forEach(b => b.onclick = async () => {
      const img = r.images[+b.dataset.wpg];
      PREF.set('liveWpPick', +b.dataset.wpg === 0 ? null
        : { urlbase: img.urlbase, title: img.title, copyright: img.copyright, date: img.date });
      PREF.set('liveWallpaper', true);   // choosing an image is choosing the feature
      await applyWallpaper();
      if (stillOn(id)) renderWpGallery();
      toast(+b.dataset.wpg === 0 ? 'Following today’s image' : 'Wallpaper pinned', 'ok', 'check');
    });
  }

  /* ======================================================================
     PERSONALIZE — wallpaper, home focus, and which apps sit on home
     ====================================================================== */
  /* ----------------------------------------------------------------------
     Personalize is a HUB of small sub-pages (it outgrew one screen): each
     row below opens its own page, and the row's subtitle shows the current
     choice at a glance. Back returns to the hub. All device-local.
     ---------------------------------------------------------------------- */
  const pzRow = (nav, icon, title, sub) => `
    <button class="row tappable" data-nav="${nav}" style="width:100%;text-align:left">
      <span class="glyph">${ic(icon, 18)}</span>
      <span class="rtext"><div class="rtitle">${title}</div><div class="rsub">${sub}</div></span>
      <span class="chev">${ic('chev', 16)}</span></button>`;

  function renderPersonalize() {
    const theme = THEMES.find(t => t.id === PREF.get('theme', 'teal')) || THEMES[0];
    const fx = FX.find(f => f.id === PREF.get('fx', 'aurora')) || FX[0];
    const wxPlace = PREF.get('wxPlace', null);
    const pick = PREF.get('liveWpPick', null);
    const wpName = PREF.get('liveWallpaper', false)
      ? (pick ? `Pinned: ${pick.title || 'an image'}` : 'Daily Bing image')
      : (PREF.get('wallpaperImg', null) ? 'Your photo'
         : (WALLPAPERS.find(w => w.id === PREF.get('wallpaper', 'petrol')) || WALLPAPERS[0]).name);
    const focusApp = Sov.app(PREF.get('focus', null) || (HOME_CFG || Sov._homeCfgSync()).focus || 'assistant');
    $('#screenScroll').innerHTML = `
      ${shead('Device', 'Personalize', 'Make it yours — nothing here leaves the device.')}
      <div class="section-head"><span class="eyebrow">Look &amp; feel</span></div>
      <div class="card">
        ${pzRow('pz-look', 'sun', 'Appearance',
          esc(`${theme.name} · ${cap(PREF.get('uiTheme', 'dark'))} menus · ${cap(PREF.get('glass', 'glass'))} surfaces`))}
        ${pzRow('pz-wallpaper', 'photo', 'Wallpaper',
          esc(wpName + (wpScrim() ? ` · contrast ${wpScrim()}%` : '')))}
        ${pzRow('pz-fx', 'spark', 'Ambience',
          esc(`${fx.name} · ${cap(PREF.get('fxLevel', 'calm'))}${PREF.get('nightlight', false) ? ' · Night Light' : ''}`))}
        ${pzRow('pz-weather', 'cloud', 'Weather',
          PREF.get('weatherOn', false) ? esc(wxPlace ? wxPlace.name : 'On — pick a place') : 'Off — nothing is fetched')}
      </div>
      <div class="section-head"><span class="eyebrow">Home screen</span></div>
      <div class="card">
        ${pzRow('pz-clock', 'clock', 'Clock & widgets',
          esc(`${(CLOCK_STYLES.find(c => c.id === clockStyle()) || {}).name || 'Aura'} clock · Up next ${PREF.get('upnext', true) ? 'on' : 'off'}`))}
        ${pzRow('pz-icons', 'grid', 'Icons',
          esc(`${(TILE_SHAPES.find(t => t.id === PREF.get('tileShape', 'squircle')) || {}).name || 'Squircle'} · labels ${PREF.get('tileLabels', true) ? 'on' : 'off'}`))}
        ${pzRow('pz-apps', 'home', 'Apps & pages',
          esc(`${homePagesIds().length} page${homePagesIds().length > 1 ? 's' : ''} · focus: ${(focusApp || {}).name || '—'}`))}
      </div>
      <div style="height:8px"></div>`;
    bindNav($('#screenScroll'));
  }

  // ---- Personalize › Appearance: color theme, menu theme, surfaces, handle --
  function renderPzLook() {
    const theme = PREF.get('theme', 'teal');
    const insSide = PREF.get('insSide', 'left');
    const insHidden = PREF.get('insHidden', false);
    $('#screenScroll').innerHTML = `
      ${shead('Personalize', 'Appearance', 'Color, menu theme and how surfaces are built.')}
      <div class="section-head"><span class="eyebrow">Color theme</span>
        <span class="muted" style="font-size:11px">tints the UI and the Aura</span></div>
      <div class="th-grid">${THEMES.map(t => `
        <button class="th-chip ${t.id === theme ? 'on' : ''}" data-th="${t.id}" style="--c:${t.accent}">
          <span class="th-dot" aria-hidden="true"></span>
          <span class="th-name">${t.name}</span></button>`).join('')}</div>
      <div class="section-head"><span class="eyebrow">Menus &amp; surfaces</span>
        <span class="muted" style="font-size:11px">home &amp; lock keep the night look</span></div>
      <div class="card">
        <div class="row"><span class="glyph">${ic('sun',18)}</span>
          <span class="rtext"><div class="rtitle">Menu theme</div><div class="rsub">Menus, settings &amp; apps</div></span>
          <div class="seg">${['dark','light'].map(m =>
            `<button class="${(PREF.get('uiTheme','dark')) === m ? 'on acc' : ''}" data-uitheme="${m}">${cap(m)}</button>`).join('')}</div></div>
        <div class="row"><span class="glyph">${ic('layers',18)}</span>
          <span class="rtext"><div class="rtitle">Surfaces</div><div class="rsub">Frosted is liquid glass; Solid is fully opaque</div></span>
          <div class="seg">${GLASS_MODES.map(g =>
            `<button class="${(PREF.get('glass','glass')) === g.id ? 'on acc' : ''}" data-glassmode="${g.id}">${g.name}</button>`).join('')}</div></div>
      </div>
      <div class="section-head"><span class="eyebrow">Typeface</span>
        <span class="muted" style="font-size:11px">the whole system's font</span></div>
      <div class="font-grid">${FONTS.map(f => `
        <button class="font-chip ${f.id === fontFace() ? 'on' : ''}" data-font="${f.id}" style="font-family:${f.stack}">
          <span class="fc-ag">Ag</span>
          <span class="fc-meta"><span class="fc-name">${f.name}</span><span class="fc-sub">${f.sub}</span></span>
        </button>`).join('')}</div>
      <div class="card">
        <div class="row"><span class="glyph">${ic('search',18)}</span>
          <span class="rtext"><div class="rtitle">Text size</div><div class="rsub">Menus, apps, lock &amp; controls</div></span>
          <div class="seg">${FONT_SIZES.map(s =>
            `<button class="${s.id === fontSizeId() ? 'on acc' : ''}" data-fontsize="${s.id}">${s.name}</button>`).join('')}</div></div>
      </div>
      <div class="section-head"><span class="eyebrow">Insight margin</span>
        <span class="muted" style="font-size:11px">privacy &amp; status handle</span></div>
      <div class="card">
        <button class="row tappable" data-insshow style="width:100%;text-align:left"><span class="glyph">${ic('shieldChk',18)}</span>
          <span class="rtext"><div class="rtitle">Show handle</div>
            <div class="rsub">The privacy &amp; status shortcut on screen · drag it up or down</div></span>
          <span class="switch ${insHidden ? '' : 'on'}"></span></button>
        <div class="row"><span class="glyph">${ic('layers',18)}</span>
          <span class="rtext"><div class="rtitle">Screen side</div>
            <div class="rsub">Which edge the handle lives on</div></span>
          <div class="seg">${['left','right'].map(sd =>
            `<button class="${insSide === sd ? 'on acc' : ''}" data-insside="${sd}">${cap(sd)}</button>`).join('')}</div></div></div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-th]').forEach(b => b.onclick = () => {
      PREF.set('theme', b.dataset.th); applyTheme(); renderPzLook();
    });
    $('#screenScroll').querySelectorAll('[data-uitheme]').forEach(b => b.onclick = () => {
      PREF.set('uiTheme', b.dataset.uitheme); applyAppearance(); renderPzLook();
    });
    $('#screenScroll').querySelectorAll('[data-glassmode]').forEach(b => b.onclick = () => {
      PREF.set('glass', b.dataset.glassmode); applyAppearance(); renderPzLook();
    });
    $('#screenScroll').querySelectorAll('[data-font]').forEach(b => b.onclick = () => {
      PREF.set('fontFace', b.dataset.font); applyFont(); renderPzLook();
    });
    $('#screenScroll').querySelectorAll('[data-fontsize]').forEach(b => b.onclick = () => {
      PREF.set('fontSize', b.dataset.fontsize); applyFont(); renderPzLook();
    });
    $('#screenScroll').querySelectorAll('[data-insside]').forEach(b => b.onclick = () => {
      PREF.set('insSide', b.dataset.insside); applyInsightSide(); updateInsight(); renderPzLook();
    });
    const isw = $('#screenScroll').querySelector('[data-insshow]');
    if (isw) isw.onclick = () => {
      PREF.set('insHidden', !PREF.get('insHidden', false)); updateInsight(); renderPzLook();
    };
  }

  // ---- Personalize › Wallpaper: presets, photos, the live daily + contrast --
  function renderPzWallpaper() {
    const wp = PREF.get('wallpaper', 'petrol');
    const liveWp = PREF.get('liveWallpaper', false);
    $('#screenScroll').innerHTML = `
      ${shead('Personalize', 'Wallpaper', 'Behind home and the lock screen alike.')}
      <div class="wp-grid">${WALLPAPERS.map(w =>
        `<button class="wp-sw ${!liveWp && w.id === wp ? 'on' : ''}" data-wp="${w.id}" style="background:${w.css}">
           <span class="wp-name">${w.name}</span>${!liveWp && w.id === wp ? `<span class="wp-chk">${ic('check',16)}</span>` : ''}</button>`).join('')}</div>
      <button class="mini-btn" id="wpFromPhotos" style="margin-top:10px">${ic('photo',14)} Choose from Photos</button>
      <div class="section-head"><span class="eyebrow">Live wallpaper</span>
        <span class="muted" style="font-size:11px">uses the network, only while on</span></div>
      <div class="card">
        <button class="row tappable" data-livewp style="width:100%;text-align:left"><span class="glyph">${ic('globe',18)}</span>
          <span class="rtext"><div class="rtitle">Daily wallpaper</div>
            <div class="rsub">${liveWp
              ? (_wpDaily ? (_wpDaily.available
                  ? esc(`${_wpDaily.pinned ? 'Pinned' : 'Today'}: ${_wpDaily.copyright || _wpDaily.title || 'Bing Image of the Day'}`)
                  : esc(_wpDaily.error || 'Not available right now.')) : 'Fetching today’s image…')
              : 'One Bing photo a day, on home &amp; lock'}</div></span>
          <span class="switch ${liveWp ? 'on' : ''}"></span></button>
        <button class="row tappable" data-nav="wp-gallery" style="width:100%;text-align:left"><span class="glyph">${ic('photo',18)}</span>
          <span class="rtext"><div class="rtitle">Gallery</div>
            <div class="rsub">${(() => { const p = PREF.get('liveWpPick', null);
              return p ? esc(`Pinned: ${p.title || 'an image'}`) : 'Browse the recent images · today’s is the default'; })()}</div></span>
          <span class="chev">${ic('chev',16)}</span></button>
      </div>
      <div class="section-head"><span class="eyebrow">Legibility</span></div>
      <div class="card">
        <div class="slider-block" style="margin-top:0;background:none;border:none;box-shadow:none">
          <div class="rtitle" style="font-size:13.5px">Wallpaper contrast</div>
          <div class="rsub" style="margin:2px 0 10px">A dark fill under home &amp; lock so text stays readable on a light image</div>
          <div class="sb-row"><span class="sb-ic">${ic('sun',16)}</span>
            <input type="range" min="0" max="70" value="${wpScrim()}" data-wpscrim>
            <span class="mono" id="wpScrimVal" style="width:38px;text-align:right">${wpScrim()}%</span></div>
        </div>
      </div>
      <div style="height:8px"></div>`;
    bindNav($('#screenScroll'));
    $('#screenScroll').querySelectorAll('[data-wp]').forEach(b => b.onclick = () => {
      PREF.set('wallpaperImg', null); PREF.set('wallpaper', b.dataset.wp);
      PREF.set('liveWallpaper', false);   // picking a preset turns the live one off
      applyWallpaper(); renderPzWallpaper();
    });
    const wfp = $('#wpFromPhotos'); if (wfp) wfp.onclick = () => openPhotoPicker();
    const lwp = $('#screenScroll').querySelector('[data-livewp]');
    if (lwp) lwp.onclick = async () => {
      PREF.set('liveWallpaper', !PREF.get('liveWallpaper', false));
      renderPzWallpaper();                    // switch flips immediately…
      await applyWallpaper();                 // …then the fetch reports honestly
      if (stillOn('pz-wallpaper')) renderPzWallpaper();
    };
    const wps = $('#screenScroll').querySelector('[data-wpscrim]');
    if (wps) wps.oninput = () => {
      PREF.set('wpScrim', +wps.value); applyAppearance();
      const v = $('#wpScrimVal'); if (v) v.textContent = `${wps.value}%`;
    };
  }

  // ---- Personalize › Ambience: live effects, motion, night light ------------
  function renderPzFx() {
    const fx = PREF.get('fx', 'aurora');
    const lvl = PREF.get('fxLevel', 'calm');
    const night = PREF.get('nightlight', false);
    $('#screenScroll').innerHTML = `
      ${shead('Personalize', 'Ambience', 'The living layer behind home and lock — rendered on-device.')}
      <div class="fx-grid">${FX.map(f => `
        <button class="fx-chip ${f.id === fx ? 'on' : ''}" data-fx="${f.id}">
          <span class="fx-prev" data-p="${f.id}" aria-hidden="true"></span>
          <span class="fx-name">${f.name}</span><span class="fx-sub">${f.sub}</span>
          ${f.id === fx ? `<span class="wp-chk">${ic('check',14)}</span>` : ''}</button>`).join('')}</div>
      <div class="card" style="margin-top:10px">
        <div class="row"><span class="glyph">${ic('spark',18)}</span>
          <span class="rtext"><div class="rtitle">Motion</div><div class="rsub">How alive the ambience feels</div></span>
          <div class="seg fxlvl">${FX_LEVELS.map(l =>
            `<button class="${l.id === lvl ? 'on acc' : ''}" data-fxlvl="${l.id}">${l.name}</button>`).join('')}</div></div>
        <button class="row tappable" data-nl style="width:100%;text-align:left"><span class="glyph">${ic('sun',18)}</span>
          <span class="rtext"><div class="rtitle">Night Light</div><div class="rsub">Warm tint across the whole screen</div></span>
          <span class="switch ${night ? 'on' : ''}"></span></button>
      </div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-fx]').forEach(b => b.onclick = () => {
      PREF.set('fx', b.dataset.fx); applyEffects(); renderPzFx();
      if (b.dataset.fx === 'weather' && !weatherOn())
        toast('Turn on Live weather (Personalize › Weather) to let the sky drive this', '', 'sun');
    });
    $('#screenScroll').querySelectorAll('[data-fxlvl]').forEach(b => b.onclick = () => {
      PREF.set('fxLevel', b.dataset.fxlvl); applyEffects(); renderPzFx();
    });
    const nl = $('#screenScroll').querySelector('[data-nl]');
    if (nl) nl.onclick = () => {
      PREF.set('nightlight', !PREF.get('nightlight', false)); applyEffects(); renderPzFx();
    };
  }

  // ---- Personalize › Weather: the live reading and its place ----------------
  function renderPzWeather() {
    const wxPlace = PREF.get('wxPlace', null);
    $('#screenScroll').innerHTML = `
      ${shead('Personalize', 'Weather', 'Open-Meteo, via the agent — it asks only while this is on.')}
      <div class="card">
        <button class="row tappable" data-wxtgl style="width:100%;text-align:left"><span class="glyph">${ic('sun',18)}</span>
          <span class="rtext"><div class="rtitle">Live weather</div>
            <div class="rsub">Conditions for your chosen place, on home &amp; lock — never your GPS</div></span>
          <span class="switch ${PREF.get('weatherOn', false) ? 'on' : ''}"></span></button>
        <button class="row tappable" data-wxplace style="width:100%;text-align:left"><span class="glyph">${ic('map',18)}</span>
          <span class="rtext"><div class="rtitle">Place</div>
            <div class="rsub">${wxPlace ? esc(wxPlace.name + (wxPlace.country ? ' · ' + wxPlace.country : '')) : 'Not set — pick a city'}</div></span>
          <span class="chev">${ic('chev',16)}</span></button>
        ${weatherOn() && _wx.data
          ? `<div class="row"><span class="glyph">${ic(_wx.data.available ? wxIcon(_wx.data) : 'info',18)}</span>
              <span class="rtext"><div class="rtitle">${_wx.data.available ? esc(wxReading(_wx.data)) : 'No reading'}</div>
              <div class="rsub">${_wx.data.available
                ? esc(`H ${Math.round(_wx.data.hi)}° · L ${Math.round(_wx.data.lo)}° · wind ${Math.round(_wx.data.wind)} km/h${_wx.data.sim ? ' · simulated' : ''}`)
                : esc(_wx.data.error || 'The weather service could not be reached.')}</div></span></div>`
          : ''}
      </div>
      <div class="pa-note" style="margin-top:10px">Tip: the “Match the sky” ambience (Personalize › Ambience) follows this reading.</div>
      <div style="height:8px"></div>`;
    const wxt = $('#screenScroll').querySelector('[data-wxtgl]');
    if (wxt) wxt.onclick = async () => {
      const on = !PREF.get('weatherOn', false);
      PREF.set('weatherOn', on);
      renderPzWeather();
      if (on && !PREF.get('wxPlace', null)) return openPlacePicker();
      await refreshWeather(true);
      if (stillOn('pz-weather')) renderPzWeather();
    };
    const wxp = $('#screenScroll').querySelector('[data-wxplace]');
    if (wxp) wxp.onclick = () => openPlacePicker();
  }

  // ---- Personalize › Clock & widgets ----------------------------------------
  function renderPzClock() {
    $('#screenScroll').innerHTML = `
      ${shead('Personalize', 'Clock & widgets', 'The home clock is a widget — style it, place it, size it.')}
      <div class="clk-grid">${CLOCK_STYLES.map(c => `
        <button class="clk-chip ${c.id === clockStyle() ? 'on' : ''}" data-clk="${c.id}">
          <span class="clk-prev cw-${c.id}" aria-hidden="true">${clockInner(c.id, '9:41')}</span>
          <span class="clk-name">${c.name}</span><span class="clk-sub">${c.sub}</span>
          ${c.id === clockStyle() ? `<span class="wp-chk">${ic('check',14)}</span>` : ''}</button>`).join('')}</div>
      <div class="card" style="margin-top:10px">
        <div class="row"><span class="glyph">${ic('layers',18)}</span>
          <span class="rtext"><div class="rtitle">Position</div><div class="rsub">Or drag the clock itself while editing home</div></span>
          <div class="seg">${['left','center','right'].map(a =>
            `<button class="${a === clockAlign() ? 'on acc' : ''}" data-clkalign="${a}">${cap(a)}</button>`).join('')}</div></div>
        <div class="row"><span class="glyph">${ic('sun',18)}</span>
          <span class="rtext"><div class="rtitle">Size</div><div class="rsub">Or drag its corner handle while editing home</div></span>
          <div class="seg">${[['small',.85],['regular',1],['large',1.3]].map(([n,v]) =>
            `<button class="${Math.abs(clockScale()-v)<.03 ? 'on acc' : ''}" data-clkscale="${v}">${cap(n)}</button>`).join('')}</div></div>
        ${PREF.get('homeWidgets', null) || PREF.get('clockScale', null) || PREF.get('clockFree', false) ? `<button class="row tappable" data-clkreset style="width:100%;text-align:left"><span class="glyph">${ic('restart',18)}</span>
          <span class="rtext"><div class="rtitle">Reset position &amp; size</div><div class="rsub">Back to the top row · drag widgets while editing home to place them on any row</div></span></button>` : ''}
      </div>
      <div class="section-head"><span class="eyebrow">Home widgets</span>
        <span class="muted" style="font-size:11px">real data, or nothing at all</span></div>
      <div class="card">
        <button class="row tappable" data-upnexttgl style="width:100%;text-align:left"><span class="glyph">${ic('calendar',18)}</span>
          <span class="rtext"><div class="rtitle">Up next</div><div class="rsub">Your next calendar event on home — hidden when nothing is scheduled</div></span>
          <span class="switch ${PREF.get('upnext', true) ? 'on' : ''}"></span></button>
      </div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-clk]').forEach(b => b.onclick = () => {
      PREF.set('clockStyle', b.dataset.clk); renderPzClock(); toast('Clock style set', 'ok', 'check');
    });
    $('#screenScroll').querySelectorAll('[data-clkalign]').forEach(b => b.onclick = () => {
      PREF.set('clockAlign', b.dataset.clkalign); renderPzClock();
    });
    $('#screenScroll').querySelectorAll('[data-clkscale]').forEach(b => b.onclick = () => {
      PREF.set('clockScale', +b.dataset.clkscale); renderPzClock();
    });
    const ckr = $('#screenScroll').querySelector('[data-clkreset]');
    if (ckr) ckr.onclick = () => {
      PREF.set('homeWidgets', null); PREF.set('clockScale', null);
      // clear the legacy free-float keys too, so the migration never resurrects them
      PREF.set('clockFree', false); PREF.set('clockY', 0); PREF.set('clockPX', 50); PREF.set('clockPY', 15);
      renderHome(); renderPzClock(); toast('Widgets reset', 'ok', 'check');
    };
    const unx = $('#screenScroll').querySelector('[data-upnexttgl]');
    if (unx) unx.onclick = () => { PREF.set('upnext', !PREF.get('upnext', true)); renderPzClock(); };
  }

  // ---- Personalize › Icons ---------------------------------------------------
  function renderPzIcons() {
    $('#screenScroll').innerHTML = `
      ${shead('Personalize', 'Icons', 'The shape language of app icons — home and drawer alike.')}
      <div class="card">
        <div class="row"><span class="glyph">${ic('grid',18)}</span>
          <span class="rtext"><div class="rtitle">Shape</div><div class="rsub">How app icons are cut</div></span>
          <div class="seg">${TILE_SHAPES.map(t =>
            `<button class="${t.id === PREF.get('tileShape', 'squircle') ? 'on acc' : ''}" data-tileshape="${t.id}">${t.name}</button>`).join('')}</div></div>
        <button class="row tappable" data-tilelbl style="width:100%;text-align:left"><span class="glyph">${ic('list',18)}</span>
          <span class="rtext"><div class="rtitle">Labels</div><div class="rsub">App names under home tiles</div></span>
          <span class="switch ${PREF.get('tileLabels', true) ? 'on' : ''}"></span></button>
      </div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-tileshape]').forEach(b => b.onclick = () => {
      PREF.set('tileShape', b.dataset.tileshape); applyIconStyle(); renderPzIcons();
    });
    const tlb = $('#screenScroll').querySelector('[data-tilelbl]');
    if (tlb) tlb.onclick = () => { PREF.set('tileLabels', !PREF.get('tileLabels', true)); applyIconStyle(); renderPzIcons(); };
  }

  // ---- Personalize › Apps & pages --------------------------------------------
  function renderPzApps() {
    const apps = Sov.apps();
    const cfg = HOME_CFG || Sov._homeCfgSync();
    const focus = PREF.get('focus', null) || cfg.focus || 'assistant';
    const hPages = homePagesIds();
    const pageOf = id => { for (let i = 0; i < hPages.length; i++) if ((hPages[i] || []).includes(id)) return i; return -1; };
    const focusRow = `<div class="row"><span class="pa-badge" style="--tint:${(apps.find(a=>a.id===focus)||{}).color||'var(--accent)'}">${ic((apps.find(a=>a.id===focus)||{}).glyph||'spark',16)}</span>
        <span class="rtext"><div class="rtitle">Suggested app</div><div class="rsub">Shown large at the top of home</div></span>
        <select class="sel" id="focusSel">${apps.map(a => `<option value="${a.id}" ${a.id === focus ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>`;
    const appRows = apps.map(a => {
      if (a.id === focus) return `<div class="row"><span class="pa-badge" style="--tint:${a.color}">${ic(a.glyph,16)}</span>
        <span class="rtext"><div class="rtitle">${esc(a.name)}</div><div class="rsub" style="color:var(--accent)">home focus</div></span></div>`;
      const pi = pageOf(a.id);
      const opts = hPages.map((_, i) => `<option value="${i}" ${pi === i ? 'selected' : ''}>Page ${i + 1}</option>`).join('')
        + `<option value="-1" ${pi < 0 ? 'selected' : ''}>Off home</option>`;
      return `<div class="row"><span class="pa-badge" style="--tint:${a.color}">${ic(a.glyph,16)}</span>
        <span class="rtext"><div class="rtitle">${esc(a.name)}</div></span>
        <select class="sel" data-appage="${a.id}">${opts}</select></div>`;
    }).join('');
    $('#screenScroll').innerHTML = `
      ${shead('Personalize', 'Apps & pages', 'What sits on home, and where.')}
      <div class="section-head"><span class="eyebrow">Home focus</span></div>
      <div class="card">${focusRow}</div>
      <div class="section-head"><span class="eyebrow">Home pages</span>
        <button class="act" id="addPage">+ Add page</button></div>
      <div class="pa-note">${hPages.length} page${hPages.length > 1 ? 's' : ''} · assign each app to a page or take it off home · swipe between pages on the home screen, drag tiles to reorder</div>
      <div class="card">${appRows}</div>
      <div style="height:8px"></div>`;
    // Pages are fixed-slot arrays (index == grid cell, null == a kept gap), so
    // removing an app must empty its slot IN PLACE — filtering would shift
    // every later icon up a cell and scramble the user's arrangement.
    const emptySlot = (pgs, id) => pgs.map(p => (p || []).map(x => x === id ? null : x));
    $('#focusSel').onchange = e => {
      PREF.set('focus', e.target.value);
      // the focus is the hero card, so pull it out of the page grids
      PREF.set('homePages', emptySlot(homePagesIds(), e.target.value));
      renderPzApps();
      toast('Home focus set', 'ok', 'check');
    };
    $('#screenScroll').querySelectorAll('[data-appage]').forEach(s => s.onchange = () => {
      const id = s.dataset.appage, target = parseInt(s.value, 10);
      const pgs = emptySlot(homePagesIds(), id);   // off its old slot, gap kept
      if (target >= 0) {
        while (pgs.length <= target) pgs.push([]);
        const pg = pgs[target], gap = pg.indexOf(null);   // fill a gap before growing
        if (gap !== -1) pg[gap] = id; else pg.push(id);
      }
      PREF.set('homePages', pgs); renderPzApps();
    });
    const ap = $('#addPage');
    if (ap) ap.onclick = () => {
      const pgs = homePagesIds().slice(); pgs.push([]); PREF.set('homePages', pgs);
      renderPzApps(); toast('Page added', 'ok', 'check');
    };
  }

  /* ======================================================================
     CLOCK — a native app, opens inside the shell (world clock + stopwatch)
     ====================================================================== */
  const WORLD = [
    { city: 'London', tz: 'Europe/London' }, { city: 'New York', tz: 'America/New_York' },
    { city: 'Los Angeles', tz: 'America/Los_Angeles' }, { city: 'Tokyo', tz: 'Asia/Tokyo' },
    { city: 'Dubai', tz: 'Asia/Dubai' }, { city: 'Sydney', tz: 'Australia/Sydney' },
  ];
  const fmtTZ = tz => {
    try { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }); }
    catch (e) { return '--:--'; }
  };
  function swText() {
    const sw = S.clock.sw;
    const ms = sw.elapsed + (sw.running ? performance.now() - sw.start : 0);
    const t = Math.floor(ms / 1000), cs = Math.floor((ms % 1000) / 10);
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }
  /* ---- Timer: counts down on its own clock, so it keeps running and fires
     its notification even when you leave the Clock app. ---- */
  const fmtClock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const fmtDur = s => {
    const m = Math.round(s / 60);
    return s % 60 === 0 ? `${m}-minute` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  let _timerInt = null;
  function timerTick() {
    if (_timerInt) return;
    _timerInt = setInterval(() => {
      const tm = S.timer;
      if (!tm || !tm.running) { clearInterval(_timerInt); _timerInt = null; return; }
      const rem = Math.max(0, tm.endAt - Date.now());
      tm.remaining = Math.ceil(rem / 1000);
      if (rem <= 0) {
        tm.running = false; tm.remaining = 0;
        clearInterval(_timerInt); _timerInt = null;
        Sov.notify.push({ app: 'clock', icon: 'clock', title: 'Timer finished',
          body: `Your ${fmtDur(tm.duration)} timer is done.`, nav: 'clock' });
        toast('Timer finished', 'warn', 'clock');
        timerBeep();
      }
      if (S.view === 'clock') drawClock();
    }, 250);
  }
  function timerBeep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = new AC(); const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.start(); o.stop(ctx.currentTime + 0.55);
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 800);
    } catch (e) {}
  }
  function timerSet(sec) { S.timer = { duration: sec, remaining: sec, running: false, endAt: 0 }; drawClock(); }
  function timerToggle() {
    const tm = S.timer; if (!tm || tm.remaining <= 0) return;
    if (tm.running) { tm.remaining = Math.max(0, Math.ceil((tm.endAt - Date.now()) / 1000)); tm.running = false; }
    else { tm.running = true; tm.endAt = Date.now() + tm.remaining * 1000; timerTick(); }
    drawClock();
  }
  function timerReset() { if (S.timer) { S.timer.running = false; S.timer.remaining = S.timer.duration; } drawClock(); }

  function renderClock() {
    clearScreenTimer();
    if (!S.clock) S.clock = { sw: { running: false, start: 0, elapsed: 0 } };
    drawClock();
    S.screenTimer = setInterval(() => { if (S.view === 'clock') drawClock(); }, 200);
  }
  function drawClock() {
    const st = Sov.get();
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const sw = S.clock.sw;
    $('#screenScroll').innerHTML = `
      ${shead('Clock', 'Clock')}
      <div class="clock-hero"><div class="clock-big mono">${now}</div>
        <div class="clock-sub">${esc(st.date)}${tz ? ' · ' + esc(tz) : ''}</div></div>
      <div class="section-head"><span class="eyebrow">World clock</span></div>
      <div class="card">${WORLD.map(w => `
        <div class="row"><span class="glyph">${ic('clock', 18)}</span>
          <span class="rtext"><div class="rtitle">${w.city}</div>
            <div class="rsub mono">${esc(w.tz.split('/')[0])}</div></span>
          <span class="mono" style="font-size:19px;color:var(--text-0)">${fmtTZ(w.tz)}</span></div>`).join('')}</div>
      <div class="section-head"><span class="eyebrow">Timer</span></div>
      <div class="card"><div class="sw-wrap">
        ${(() => {
          const tm = S.timer;
          const shown = tm ? tm.remaining : 0;
          const presets = [60, 180, 300, 600];
          const chips = presets.map(p => `<button class="tm-chip ${tm && tm.duration === p && !tm.running ? 'on' : ''}" data-tset="${p}">${p / 60}m</button>`).join('');
          const running = tm && tm.running;
          const has = tm && tm.remaining > 0;
          const done = tm && tm.duration > 0 && tm.remaining === 0 && !tm.running;
          return `
            <div class="tm-time mono ${running ? 'run' : ''} ${done ? 'done' : ''}">${fmtClock(shown)}</div>
            <div class="tm-chips">${chips}</div>
            <div class="sw-btns">
              <button class="pbtn" data-tm="reset" ${tm ? '' : 'disabled'}>Reset</button>
              <button class="pbtn allow" data-tm="toggle" ${has ? '' : 'disabled'}>${running ? 'Pause' : (done ? 'Done' : 'Start')}</button>
            </div>`;
        })()}
      </div></div>
      <div class="section-head"><span class="eyebrow">Stopwatch</span></div>
      <div class="card"><div class="sw-wrap">
        <div class="sw-time mono">${swText()}</div>
        <div class="sw-btns">
          <button class="pbtn" data-sw="reset">Reset</button>
          <button class="pbtn allow" data-sw="toggle">${sw.running ? 'Stop' : 'Start'}</button>
        </div></div></div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-tset]').forEach(b => b.onclick = () => timerSet(+b.dataset.tset));
    $('#screenScroll').querySelectorAll('[data-tm]').forEach(b => b.onclick = () =>
      b.dataset.tm === 'toggle' ? timerToggle() : timerReset());
    $('#screenScroll').querySelectorAll('[data-sw]').forEach(b => b.onclick = () => {
      if (b.dataset.sw === 'toggle') {
        if (sw.running) { sw.elapsed += performance.now() - sw.start; sw.running = false; }
        else { sw.start = performance.now(); sw.running = true; }
      } else { sw.running = false; sw.elapsed = 0; }
      drawClock();
    });
  }

  /* ======================================================================
     NOTES — a native app, real plain-text files via the agent
     ====================================================================== */
  async function renderNotes() {
    const id = 'notes';
    $('#screenScroll').innerHTML = shead('Notes', 'Notes') + loadingCard();
    const notes = await Sov.notes.list();
    if (!stillOn(id)) return;
    const items = notes.length ? notes.map(n => `
      <button class="row tappable" data-note="${esc(n.id)}" style="width:100%;text-align:left">
        <span class="glyph">${ic('note', 18)}</span>
        <span class="rtext"><div class="rtitle">${esc(n.title || 'Untitled')}</div>
          <div class="rsub">${esc((n.preview || '').replace(/\n/g, ' ').replace(/^#\s*/, '')) || 'Empty note'}</div></span>
        <span class="chev">${ic('chev', 18)}</span></button>`).join('')
      : '<div class="row muted">No notes yet — create one below.</div>';
    $('#screenScroll').innerHTML = `
      ${shead('Notes', 'Notes', 'Plain-text notes, stored on the device.')}
      <div class="card">${items}</div>
      <div class="card" style="margin-top:10px"><button class="row tappable" data-note-new style="width:100%;text-align:left">
        <span class="glyph" style="color:var(--accent)">${ic('note', 18)}</span>
        <span class="rtext"><div class="rtitle">New note</div></span>
        <span class="chev">${ic('chev', 18)}</span></button></div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-note]').forEach(b => b.onclick = () => openNote(b.dataset.note));
    const nn = $('#screenScroll').querySelector('[data-note-new]');
    if (nn) nn.onclick = () => openNote('');
    if (S.pendingNote != null) { const id = S.pendingNote; S.pendingNote = null; openNote(id); }   // deep-search jump
  }
  async function openNote(nid) {
    const data = nid ? await Sov.notes.get(nid) : { id: '', text: '' };
    if (!stillOn('notes')) return;
    S.noteId = nid || '';
    $('#screenScroll').innerHTML = `
      ${shead('Notes', nid ? 'Edit note' : 'New note')}
      <div class="note-editbar">
        <button class="mini-btn" data-note-back>${ic('back', 13)} Notes</button>
        <span class="note-saved" id="noteSaved"></span>
        ${nid ? `<button class="mini-btn danger" data-note-del>${ic('trash', 13)} Delete</button>` : ''}
      </div>
      <textarea id="noteArea" class="note-area" placeholder="Write here…">${esc(data.text)}</textarea>
      <div style="height:8px"></div>`;
    const area = $('#noteArea');
    setTimeout(() => area.focus(), 50);
    area.onkeydown = e => e.stopPropagation();   // don't let global keys hijack typing
    let t;
    const save = async () => {
      const r = await Sov.notes.save(S.noteId, area.value);
      if (r && r.id) S.noteId = r.id;
      const s = $('#noteSaved'); if (s) { s.textContent = 'Saved'; setTimeout(() => { if ($('#noteSaved')) $('#noteSaved').textContent = ''; }, 1200); }
    };
    area.oninput = () => { clearTimeout(t); t = setTimeout(save, 500); };   // autosave
    $('#screenScroll').querySelector('[data-note-back]').onclick = async () => { clearTimeout(t); await save(); renderNotes(); };
    const del = $('#screenScroll').querySelector('[data-note-del]');
    if (del) del.onclick = async () => {
      const ok = await confirmModal('Delete note?', 'This permanently removes the note from the device.', 'Delete');
      if (ok) { clearTimeout(t); await Sov.notes.del(S.noteId); toast('Note deleted', 'warn', 'trash'); renderNotes(); }
    };
  }

  /* ======================================================================
     CALCULATOR — a native app, opens inside the shell. Plain arithmetic,
     evaluated by hand (never eval()), with full keyboard support.
     ====================================================================== */
  // Format a JS number for the display: trim float noise, keep it readable,
  // fall back to exponential only for genuinely huge/tiny magnitudes.
  function calcFmt(n) {
    if (!isFinite(n)) return 'Error';
    if (n === 0) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e12 || abs < 1e-9) return n.toExponential(6).replace(/\.?0+e/, 'e');
    let s = (Math.round(n * 1e10) / 1e10).toString();
    if (s.length > 12 && s.includes('.')) s = n.toPrecision(11).replace(/\.?0+$/, '');
    return s;
  }
  function calcApply(a, b, op) {
    switch (op) { case '+': return a + b; case '-': return a - b;
      case '*': return a * b; case '/': return b === 0 ? NaN : a / b; }
    return b;
  }
  function calcPress(k) {
    const c = S.calc;
    if (c.display === 'Error' && k !== 'clear') c.display = '0', c.prev = null, c.op = null, c.fresh = true;
    if (/^[0-9]$/.test(k)) {
      c.display = c.fresh ? k : (c.display === '0' ? k : c.display + k);
      c.fresh = false;
    } else if (k === '.') {
      if (c.fresh) { c.display = '0.'; c.fresh = false; }
      else if (!c.display.includes('.')) c.display += '.';
    } else if (k === 'clear') {
      c.display = '0'; c.prev = null; c.op = null; c.fresh = true; c.expr = '';
    } else if (k === 'back') {
      if (!c.fresh) { c.display = c.display.length > 1 ? c.display.slice(0, -1) : '0'; if (c.display === '') c.display = '0'; }
    } else if (k === 'neg') {
      if (c.display !== '0') c.display = c.display.startsWith('-') ? c.display.slice(1) : '-' + c.display;
    } else if (k === 'pct') {
      c.display = calcFmt(parseFloat(c.display) / 100); c.fresh = true;
    } else if (k === '+' || k === '-' || k === '*' || k === '/') {
      if (c.op && !c.fresh) { const r = calcApply(c.prev, parseFloat(c.display), c.op); c.display = calcFmt(r); c.prev = r; }
      else c.prev = parseFloat(c.display);
      c.op = k; c.fresh = true; c.expr = `${calcFmt(c.prev)} ${calcSym(k)}`;
    } else if (k === '=') {
      if (c.op != null && c.prev != null) {
        const r = calcApply(c.prev, parseFloat(c.display), c.op);
        c.expr = `${calcFmt(c.prev)} ${calcSym(c.op)} ${c.display} =`;
        c.display = calcFmt(r); c.op = null; c.prev = null; c.fresh = true;
      }
    }
    drawCalc();
  }
  const calcSym = op => ({ '+': '+', '-': '−', '*': '×', '/': '÷' }[op] || op);
  function renderCalc() {
    if (!S.calc) S.calc = { display: '0', prev: null, op: null, fresh: true, expr: '' };
    drawCalc();
  }
  function drawCalc() {
    const c = S.calc;
    const keys = [
      ['clear', 'C', 'fn'], ['neg', '±', 'fn'], ['pct', '%', 'fn'], ['/', '÷', 'op'],
      ['7', '7', ''], ['8', '8', ''], ['9', '9', ''], ['*', '×', 'op'],
      ['4', '4', ''], ['5', '5', ''], ['6', '6', ''], ['-', '−', 'op'],
      ['1', '1', ''], ['2', '2', ''], ['3', '3', ''], ['+', '+', 'op'],
      ['0', '0', 'zero'], ['.', '.', ''], ['=', '=', 'eq'],
    ];
    $('#screenScroll').innerHTML = `
      ${shead('Calculator', 'Calculator')}
      <div class="calc-wrap">
        <div class="calc-screen">
          <div class="calc-expr mono">${esc(c.expr || '')}&nbsp;</div>
          <div class="calc-display mono ${c.display === 'Error' ? 'err' : ''}">${esc(c.display)}</div>
        </div>
        <div class="calc-pad">
          ${keys.map(([k, label, cls]) => `<button class="ckey ${cls} ${c.op === k && c.fresh ? 'active' : ''}" data-ck="${esc(k)}">${label}</button>`).join('')}
        </div>
      </div>
      <div style="height:8px"></div>`;
    $('#screenScroll').querySelectorAll('[data-ck]').forEach(b => b.onclick = () => calcPress(b.dataset.ck));
  }

  /* ======================================================================
     ROUTER
     ====================================================================== */
  const SCREENS = {
    calc:           { render: renderCalc },
    permissions:   { render: renderPermissions },
    clock:          { render: renderClock },
    notes:          { render: renderNotes },
    network:       { render: renderNetwork },
    vault:         { render: renderVault },
    settings:      { render: renderSettings },
    personalize:    { render: renderPersonalize },
    'pz-look':      { render: renderPzLook },
    'pz-wallpaper': { render: renderPzWallpaper },
    'pz-fx':        { render: renderPzFx },
    'pz-weather':   { render: renderPzWeather },
    'pz-clock':     { render: renderPzClock },
    'pz-icons':     { render: renderPzIcons },
    'pz-apps':      { render: renderPzApps },
    'wp-gallery':   { render: renderWpGallery },
    'sys-about':    { render: renderAbout },
    'sys-monitor':  { render: renderMonitor },
    'sys-storage':  { render: renderStorage },
    'sys-android':  { render: renderAndroid },
    appstore:       { render: renderAppStore },
    calendar:       { render: renderCalendar },
    'sys-wifi':     { render: renderWifi },
    'sys-bluetooth':{ render: renderBluetooth },
    'sys-display':  { render: renderDisplay },
    'sys-sound':    { render: renderSound },
    'sys-datetime': { render: renderDatetime },
    'sys-notifications': { render: renderNotifSettings },
    'sys-power':    { render: renderPower },
    terminal:       { render: renderTerminal },
    files:          { render: renderFiles },
    'sys-ai':         { render: renderAI },
    'sys-ai-context': { render: renderAIContext },
    'sys-ai-memory':  { render: renderAIMemory },
    'sys-ai-activity':{ render: renderAIActivity },
    assistant:        { render: renderAssistant },
  };

  function go(view, { push = true } = {}) {
    clearScreenTimer();
    if (S.appOpen) closeAppFrame(true);
    if (view === S.view) { /* re-render */ }
    else if (push && S.view !== view) S.history.push(S.view);

    S.view = view;
    if (view === 'home')       { _animateHome = true; renderHome(); }
    else if (view === 'drawer') renderDrawer('');
    else if (SCREENS[view])     SCREENS[view].render();

    const target = view === 'home' ? 'v-home' : view === 'drawer' ? 'v-drawer' : 'v-screen';
    $$('.view').forEach(v => v.classList.toggle('active', v.id === target));
    // On home the pane + helm sit on the wallpaper, so (in the light menu
    // theme) they keep the night look there — this class is the hook.
    $('#device').classList.toggle('on-wallpaper', view === 'home');
    if (view !== 'home') syncLiveBricks();   // home's own render already synced it
    $('#screenScroll').parentElement.scrollTop = 0;
    // directional motion: forward pushes slide in from the right, back from the left
    const stage = $('#stage');
    if (stage) {
      stage.classList.remove('nav-fwd', 'nav-back');
      void stage.offsetWidth;                       // restart the animation
      stage.classList.add(view === 'home' ? 'nav-back' : (push ? 'nav-fwd' : 'nav-back'));
    }
    updateHelm();
  }

  function goHome() {
    S.history = [];
    closeControl();
    if (S.recentsOpen) closeRecents();
    if (S.homeEdit) S.homeEdit = false;   // the home button also finishes editing
    if (S.appOpen) closeAppFrame(true);
    go('home', { push: false });
  }

  function back() {
    if (S.recentsOpen)  return closeRecents();
    if (S.controlOpen) return closeControl();
    if (S.appOpen)     return closeAppFrame();
    const prev = S.history.pop();
    go(prev || 'home', { push: false });
  }

  /* generic nav binding: elements with data-nav="view" */
  function bindNav(root, before) {
    root.querySelectorAll('[data-nav]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      if (b.dataset.closeControl) closeControl();
      if (before) before();
      go(b.dataset.nav);
    });
    root.querySelectorAll('[data-cut]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const id = b.dataset.cut;
      Sov.activeSensorsFor(id).forEach(k => Sov.releaseSensor(k, id));
      toast(`Cut ${esc(Sov.app(id).name)} off from your sensors`, 'alert', 'micOff');
      if (S.view === 'home') renderHome();
    });
  }

  /* ======================================================================
     APP LAUNCH + PERMISSION FLOW ("ask once per app")
     ====================================================================== */
  function bindLaunchers(root) {
    root.querySelectorAll('[data-launch]').forEach(b =>
      b.onclick = () => {
        // a long-press that opened the app menu already consumed this gesture
        if (b.dataset.lpDone) { delete b.dataset.lpDone; return; }
        launch(b.dataset.launch);
      });
    bindNav(root);
  }

  // Apps that are built into the shell itself open as full screens, not the
  // sandboxed-app placeholder frame.
  const BUILTIN_SCREEN = { terminal: 'terminal', settings: 'settings', monitor: 'sys-monitor',
    assistant: 'assistant', files: 'files', clock: 'clock', notes: 'notes', calc: 'calc',
    appstore: 'appstore', calendar: 'calendar' };

  async function launch(id) {
    if (S.homeEdit) return;          // in edit mode, taps rearrange — they don't launch
    if (id && id.indexOf('android:') === 0) {   // an Android app tile on home
      const a = resolveHomeApp(id);
      const r = await Sov.androidLaunch(a.pkg);
      if (r && r.ok) { openAppFrame(a); toast('Opening Android app…', '', 'android'); }
      else toast((r && r.error) || 'Could not open', 'alert', 'x');
      return;
    }
    if (id && id.indexOf('desktop:') === 0) {   // a native Linux app (agent registry)
      const a = resolveHomeApp(id);
      toast('Launching ' + ((a && a.name) || 'app') + '…', '', (a && a.glyph) || 'grid');
      const r = await Sov.launchDesktop(id.slice(8));
      if (!r || !r.ok) toast("Couldn't launch " + ((a && a.name) || 'app'), 'alert', 'x');
      return;
    }
    const app = Sov.app(id);
    if (!app) return;
    if (BUILTIN_SCREEN[id]) return go(BUILTIN_SCREEN[id]);

    // Determine what this app wants that isn't already decided.
    const wants = [];
    const sensMap = { cam: 'camera', mic: 'mic', loc: 'location' };
    (app.uses || []).forEach(s => wants.push({ key: sensMap[s], sensor: s }));
    (app.perms || []).forEach(k => wants.push({ key: k }));

    const perms = Sov.perms(id);
    const toAsk = wants.filter(w => (perms[w.key] || 'ask') === 'ask');

    for (const w of toAsk) {
      const decision = await askPermission(app, w.key);
      if (decision === 'allow' || decision === 'once') {
        Sov.setPerm(id, w.key, decision === 'allow' ? 'allow' : 'ask');
      } else {
        Sov.setPerm(id, w.key, 'deny');
      }
    }

    await Sov.launch(id, false);   // run in-phone; never spawn a desktop app on the host
    // acquire any granted sensors so the trust ribbon lights up honestly
    const now = Sov.perms(id);
    (app.uses || []).forEach(s => { if (now[sensMap[s]] !== 'deny') Sov.acquireSensor(s, id); });
    if (S.view === 'home') renderHome();
    openAppFrame(app);
  }

  /* portal-style permission prompt; resolves 'allow' | 'once' | 'deny' */
  function askPermission(app, key) {
    return new Promise(resolve => {
      const meta = {
        camera:   { ic: 'cam',      col: 'var(--sig-cam)', noun: 'your camera',     why: 'to take photos or video' },
        mic:      { ic: 'mic',      col: 'var(--sig-mic)', noun: 'your microphone', why: 'to record or make calls' },
        location: { ic: 'loc',      col: 'var(--sig-loc)', noun: 'your location',   why: 'to show where you are' },
        contacts: { ic: 'contacts', col: 'var(--accent)',  noun: 'your contacts',   why: 'to find people you know' },
        files:    { ic: 'files',    col: 'var(--accent)',  noun: 'your files',      why: 'to open and save documents' },
        network:  { ic: 'globe',    col: 'var(--accent)',  noun: 'the network',     why: 'to connect to the internet' },
      }[key];
      const scrim = $('#promptScrim');
      const isSensor = ['camera', 'mic', 'location'].includes(key);
      scrim.innerHTML = `
        <div class="prompt-card">
          <div class="pc-ic" style="color:${meta.col};background:color-mix(in srgb, ${meta.col} 14%, transparent)">${ic(meta.ic,26)}</div>
          <div class="pc-title">Allow ${esc(app.name)} to use ${meta.noun}?</div>
          <div class="pc-body"><b>${esc(app.name)}</b> is asking ${meta.why}. You decide — this choice is remembered and you can change it anytime in Permissions.</div>
          <div class="pc-note">${isSensor ? 'While in use, a colored dot stays on screen the whole time.' : 'Access only while the app is open.'}</div>
          <div class="prompt-actions ${isSensor ? 'triple' : ''}">
            <button class="pbtn deny" data-d="deny">Don't allow</button>
            ${isSensor ? `<button class="pbtn once" data-d="once">Only this time</button>` : ''}
            <button class="pbtn allow" data-d="allow">Allow</button>
          </div>
        </div>`;
      scrim.classList.add('open');
      scrim.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
        scrim.classList.remove('open');
        setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200);
        resolve(b.dataset.d);
      });
    });
  }

  /* ======================================================================
     APP FRAME
     ====================================================================== */
  // Each catalog app has an in-phone view (it runs INSIDE the phone — never a
  // desktop app on the host). Browser is a real iframe, Camera a real webcam,
  // Maps a real OSM embed; the rest are functional in-phone experiences.
  let _camStream = null, _musicTimer = null, _phTimer = null, _msTimer = null, _phNum = '', _audio = null;
  const APP_VIEWS = {
    browser:  { render: browserView,  wire: wireBrowser },
    camera:   { render: cameraView,   wire: wireCamera,  close: stopCam },
    maps:     { render: mapsView,     wire: wireMaps },
    music:    { render: musicView,    wire: wireMusic,   close: () => { clearInterval(_musicTimer); if (_audio) { try { _audio.pause(); } catch (e) {} _audio = null; } } },
    phone:    { render: phoneView,    wire: wirePhone,     close: () => clearInterval(_phTimer) },
    messages: { render: messagesView, wire: wireMessages,  close: () => clearInterval(_msTimer) },
    contacts: { render: contactsView, wire: wireContacts },
    photos:   { render: photosView,   wire: wirePhotos },
  };
  function placeholderView(app) {
    const note = app.android ? 'Handed to the Android runtime (Waydroid).' : 'Running inside AuraOS.';
    const iconUrl = app.android && app.pkg && Sov.appIconUrl ? Sov.appIconUrl('waydroid.' + app.pkg) : null;
    const badge = iconUrl ? `<img class="af-badge-img" src="${esc(iconUrl)}" onerror="this.remove()" alt="">` : ic(app.glyph, 30);
    return `<div class="af-placeholder">
      <div class="af-badge" style="--tint:${app.color}">${badge}</div>
      <div class="af-name">${esc(app.name)}</div>
      <div class="af-note">${note}</div></div>`;
  }

  // Multitasking: the foreground app keeps its live DOM while backgrounded, so
  // reopening it RESUMES exactly where you left off (scroll, tab, a half-typed
  // message). Only one app holds the live frame at a time (its views use global
  // ids); opening a different app tears the previous one down. A real teardown
  // (Close from recents) stops its camera/audio and releases sensors.
  let _frameApp = null;
  function teardownFrameDom() {
    snapApp();   // keep a card-sized memory of the screen for recents
    const view = _frameApp && APP_VIEWS[_frameApp];
    if (view && view.close) { try { view.close(); } catch (e) {} }
    $('#appframe').innerHTML = '';
    _frameApp = null;
  }
  function openAppFrame(app) {
    const af = $('#appframe');
    // One instance per app: if this app is floating as a window, the frame
    // takes over — close the window (its cleanup runs) and open full-screen.
    const fid = 'app:' + app.id;
    if (lwGet(fid).on) { lwRemoveWin(fid); lwSet(fid, { on: false }); }
    const resume = _frameApp === app.id && af.firstElementChild;   // same app still loaded
    if (_frameApp && _frameApp !== app.id) teardownFrameDom();      // one live frame
    if (!resume) {
      _frameApp = app.id;
      const view = APP_VIEWS[app.id];
      af.innerHTML = `
        <div class="af-app">
          <div class="af-bar">
            <button class="af-nav" id="afBack" aria-label="Back">${ic('back',18)}</button>
            <span class="af-title"><span class="af-dot" style="background:${app.color}"></span>${esc(app.name)}</span>
            <button class="af-nav" data-wfloat="${LW_DEFS[app.id] ? app.id : 'app:' + app.id}" aria-label="Float on home" title="Float on home">${ic('restore',15)}</button>
            <button class="af-nav" id="afHome" aria-label="Home">${ic('home',16)}</button>
          </div>
          <div class="af-view" id="afView">${view ? view.render(app) : placeholderView(app)}</div>
        </div>`;
      $('#afBack').onclick = () => back();
      $('#afHome').onclick = () => goHome();
      if (view && view.wire) { try { view.wire(app); } catch (e) {} }
    }
    S.appOpen = app.id;
    af.classList.remove('closing');
    af.classList.add('open');
    requestAnimationFrame(() => af.classList.add('shown'));   // animate up + in
    updateHelm();
    updateInsight();   // margin now reflects THIS app's access, net, resources
    syncLiveBricks();
  }
  function closeAppFrame(silent) {
    // Background (don't destroy): the frame hides but its DOM + state live on, so
    // reopening resumes. Sensors keep running in the background (honest) —
    // teardown only happens on a real Close (recents) or a permission cut-off.
    snapApp();   // its recents card shows the screen as you left it
    const af = $('#appframe');
    af.classList.remove('shown');
    af.classList.add('closing');
    setTimeout(() => { if (!S.appOpen) af.classList.remove('open', 'closing'); }, 200);
    S.appOpen = null;
    if (!silent && S.view === 'home') renderHome();
    updateHelm();
    updateInsight();   // back to device-wide context
  }

  /* ---- Browser — a real iframe with a start page + address bar ------------ */
  const BR_BOOKMARKS = [
    { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
    { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org' },
    { name: 'MDN', url: 'https://developer.mozilla.org' },
    { name: 'Hacker News', url: 'https://news.ycombinator.com' },
    { name: 'example.com', url: 'https://example.com' },
  ];
  function browserView() {
    return `
      <div class="br-bar">
        <button class="br-btn" id="brBack">${ic('back',15)}</button>
        <button class="br-btn" id="brReload">${ic('restart',14)}</button>
        <input id="brUrl" class="br-url" placeholder="Search or enter address" autocomplete="off" spellcheck="false">
        <button class="br-btn go" id="brGo">${ic('search',14)}</button>
      </div>
      <div class="br-stage">
        <iframe id="brFrame" class="br-frame" referrerpolicy="no-referrer"></iframe>
        <div class="br-start" id="brStart">
          <div class="br-logo">${ic('browser',34)}</div>
          <div class="br-h">AuraOS Browser</div>
          <div class="br-sub">Type a URL or search — pages open right here in the phone.</div>
          <div class="br-marks">${BR_BOOKMARKS.map(b => `<button class="br-mark" data-url="${b.url}">${esc(b.name)}</button>`).join('')}</div>
          <div class="br-note">Some sites decline to be embedded — their choice, same as any browser.</div>
        </div>
      </div>`;
  }
  function wireBrowser() {
    const frame = $('#brFrame'), url = $('#brUrl'), start = $('#brStart');
    const norm = v => {
      v = (v || '').trim(); if (!v) return null;
      if (/^https?:\/\//i.test(v)) return v;
      if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return 'https://' + v;
      return 'https://duckduckgo.com/?q=' + encodeURIComponent(v);
    };
    const goURL = v => { const u = norm(v); if (!u) return; start.style.display = 'none'; frame.src = u; if (url) url.value = u; };
    $('#brGo').onclick = () => goURL(url.value);
    url.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') goURL(url.value); };
    $('#brReload').onclick = () => { if (frame.src) { const s = frame.src; frame.src = 'about:blank'; setTimeout(() => { frame.src = s; }, 30); } };
    $('#brBack').onclick = () => { try { frame.contentWindow.history.back(); } catch (_) { start.style.display = ''; frame.removeAttribute('src'); } };
    $$('#brStart [data-url]').forEach(b => b.onclick = () => goURL(b.dataset.url));
    if (S.pendingBrowse) { const bq = S.pendingBrowse; S.pendingBrowse = null; goURL(bq); }   // from search
  }

  /* ---- Camera — the real webcam via getUserMedia (lights the sensor dot) -- */
  function stopCam() { if (_camStream) { _camStream.getTracks().forEach(t => t.stop()); _camStream = null; } }
  function cameraView() {
    return `
      <div class="cam-stage">
        <video id="camVideo" class="cam-video" autoplay playsinline muted></video>
        <canvas id="camShot" class="cam-shot"></canvas>
        <div id="camMsg" class="cam-msg"></div>
      </div>
      <div class="cam-controls">
        <button class="cam-shutter" id="camSnap" aria-label="Capture"></button>
        <button class="mini-btn ghost" id="camReset" style="display:none">Retake</button>
      </div>`;
  }
  async function wireCamera() {
    const v = $('#camVideo'), c = $('#camShot'), msg = $('#camMsg'), snap = $('#camSnap'), reset = $('#camReset');
    try {
      _camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (!S.appOpen) { stopCam(); return; }   // closed while we were asking
      v.srcObject = _camStream;
    } catch (e) {
      if (msg) { msg.textContent = 'No camera available (or access was declined).'; msg.classList.add('show'); }
      return;
    }
    snap.onclick = async () => {
      if (!v.videoWidth) return;
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      c.classList.add('show'); reset.style.display = '';
      const r = await Sov.savePhoto(c.toDataURL('image/jpeg', 0.92));
      toast(r && r.ok ? 'Saved to Photos' : 'Photo captured', 'ok', 'check');
    };
    reset.onclick = () => { c.classList.remove('show'); reset.style.display = 'none'; };
  }

  /* ---- Maps — real OSM, centred on your GPS fix (A7670E GNSS) ------------- */
  function mapsView() { return `<iframe class="maps-frame" id="mapsFrame" referrerpolicy="no-referrer"></iframe>`; }
  async function wireMaps() {
    const f = $('#mapsFrame'); if (!f) return;
    let lat = 51.5024, lon = -0.1348;          // sensible default until we have a fix
    try { const loc = await Sov.location(); if (loc && loc.fix) { lat = loc.fix.lat; lon = loc.fix.lon; } } catch (e) {}
    const d = 0.01;
    f.src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
  }

  /* ---- Music — a functional in-phone player (simulated playback) ---------- */
  const MUSIC = [
    { title: 'Petrol Dawn', artist: 'Aura', len: 214, col: '#1B82A8' },
    { title: 'Signal Bloom', artist: 'Aura', len: 187, col: '#5A3AD6' },
    { title: 'Night Light', artist: 'Aura', len: 241, col: '#C0392B' },
    { title: 'Quiet Cores', artist: 'Aura', len: 168, col: '#2BA869' },
  ];
  const muDur = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const MU_COLS = ['#1B82A8', '#5A3AD6', '#C0392B', '#2BA869', '#C8A020', '#1B9AA8'];
  let _mu = { i: 0, pos: 0, playing: false };
  function musicView() { return `<div class="mu-wrap" id="muWrap"></div>`; }
  async function wireMusic() {
    const wrap = $('#muWrap'); if (!wrap) return;
    if (_lwAudio) { try { _lwAudio.pause(); } catch (e) {} }   // one song at a time: the app takes over from the brick
    const r = await Sov.music();
    const tracks = (r && r.items) || [];
    if (!tracks.length) return wireMusicDemo(wrap);   // no ~/Music files → demo player
    const fmt = s => isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
    let i = 0;
    wrap.innerHTML = `
      <audio id="muAudio"></audio>
      <div class="mu-art" id="muArt">${ic('music',52)}</div>
      <div class="mu-title" id="muTitle"></div>
      <div class="mu-artist">${tracks.length} track${tracks.length > 1 ? 's' : ''} · your library</div>
      <div class="mu-seek" id="muSeek"><div class="mu-fill" id="muFill"></div></div>
      <div class="mu-time"><span id="muCur">0:00</span><span id="muLen">0:00</span></div>
      <div class="mu-ctrls">
        <button class="mu-btn" id="muPrev">${ic('back',20)}</button>
        <button class="mu-play" id="muPlay">${ic('play',24)}</button>
        <button class="mu-btn" id="muNext" style="transform:scaleX(-1)">${ic('back',20)}</button>
      </div>
      <div class="mu-list" id="muList">${tracks.map((t, ix) => `<button class="mu-row" data-tr="${ix}"><span class="mu-dot" style="background:${MU_COLS[ix % MU_COLS.length]}"></span><span class="mu-rt">${esc(t.name)}</span></button>`).join('')}</div>`;
    const audio = $('#muAudio'); _audio = audio;
    const load = (ix, play) => {
      i = ix; audio.src = Sov.audioUrl(tracks[i].rel);
      $('#muTitle').textContent = tracks[i].name;
      $('#muArt').style.setProperty('--c', MU_COLS[i % MU_COLS.length]);
      $$('#muList [data-tr]').forEach(b => b.classList.toggle('on', +b.dataset.tr === i));
      if (play) audio.play().catch(() => {});
    };
    audio.ontimeupdate = () => {
      $('#muCur').textContent = fmt(audio.currentTime);
      if (audio.duration) { $('#muLen').textContent = fmt(audio.duration); $('#muFill').style.width = (audio.currentTime / audio.duration * 100) + '%'; }
    };
    audio.onended = () => load((i + 1) % tracks.length, true);
    audio.onplay = () => { $('#muPlay').innerHTML = ic('stop', 24); };
    audio.onpause = () => { $('#muPlay').innerHTML = ic('play', 24); };
    $('#muPlay').onclick = () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };
    $('#muPrev').onclick = () => load((i - 1 + tracks.length) % tracks.length, true);
    $('#muNext').onclick = () => load((i + 1) % tracks.length, true);
    $('#muSeek').onclick = e => { if (audio.duration) { const b = e.currentTarget.getBoundingClientRect(); audio.currentTime = (e.clientX - b.left) / b.width * audio.duration; } };
    $$('#muList [data-tr]').forEach(b => b.onclick = () => load(+b.dataset.tr, true));
    load(0, false);
  }
  // Demo player (no real files present) — the simulated library, still explorable.
  function wireMusicDemo(wrap) {
    _mu = { i: 0, pos: 0, playing: false };
    wrap.innerHTML = `
      <div class="mu-art" id="muArt" style="--c:${MUSIC[0].col}">${ic('music',52)}</div>
      <div class="mu-title" id="muTitle">${esc(MUSIC[0].title)}</div>
      <div class="mu-artist" id="muArtist">${esc(MUSIC[0].artist)} · demo</div>
      <div class="mu-seek"><div class="mu-fill" id="muFill"></div></div>
      <div class="mu-time"><span id="muCur">0:00</span><span id="muLen">${muDur(MUSIC[0].len)}</span></div>
      <div class="mu-ctrls">
        <button class="mu-btn" id="muPrev">${ic('back',20)}</button>
        <button class="mu-play" id="muPlay">${ic('play',24)}</button>
        <button class="mu-btn" id="muNext" style="transform:scaleX(-1)">${ic('back',20)}</button>
      </div>
      <div class="mu-list" id="muList">${MUSIC.map((m, i) => `<button class="mu-row" data-tr="${i}"><span class="mu-dot" style="background:${m.col}"></span><span class="mu-rt">${esc(m.title)}</span><span class="mu-rl">${muDur(m.len)}</span></button>`).join('')}</div>`;
    const paint = () => {
      const t = MUSIC[_mu.i];
      $('#muArt').style.setProperty('--c', t.col);
      $('#muTitle').textContent = t.title; $('#muArtist').textContent = t.artist + ' · demo';
      $('#muLen').textContent = muDur(t.len); $('#muCur').textContent = muDur(Math.floor(_mu.pos));
      $('#muFill').style.width = (_mu.pos / t.len * 100) + '%';
      $('#muPlay').innerHTML = ic(_mu.playing ? 'stop' : 'play', 24);
      $$('#muList [data-tr]').forEach(b => b.classList.toggle('on', +b.dataset.tr === _mu.i));
    };
    clearInterval(_musicTimer);
    _musicTimer = setInterval(() => {
      if (!_mu.playing) return;
      _mu.pos += 1;
      if (_mu.pos >= MUSIC[_mu.i].len) { _mu.i = (_mu.i + 1) % MUSIC.length; _mu.pos = 0; }
      paint();
    }, 1000);
    $('#muPlay').onclick = () => { _mu.playing = !_mu.playing; paint(); };
    $('#muPrev').onclick = () => { _mu.i = (_mu.i - 1 + MUSIC.length) % MUSIC.length; _mu.pos = 0; paint(); };
    $('#muNext').onclick = () => { _mu.i = (_mu.i + 1) % MUSIC.length; _mu.pos = 0; paint(); };
    $$('#muList [data-tr]').forEach(b => b.onclick = () => { _mu.i = +b.dataset.tr; _mu.pos = 0; _mu.playing = true; paint(); });
    paint();
  }

  /* ---- Phone — a real dialer + in-call UI (SIMCom A7670E via ModemManager) - */
  function phoneView() { return `<div class="ph-wrap" id="phWrap"></div>`; }
  async function wirePhone() {
    const st = await Sov.phone.status();
    const wrap = $('#phWrap'); if (!wrap) return;
    if (st && st.present === false && Sov.mode === 'live') {
      wrap.innerHTML = `<div class="af-placeholder"><div class="af-name">No cellular modem</div>
        <div class="af-note">${esc(st.reason || 'Insert a SIM and connect the A7670E.')}</div></div>`;
      return;
    }
    let mode = '';
    const keys = ['1','2','3','4','5','6','7','8','9','*','0','#'];
    const sub = { '2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ' };
    const paintKeypad = () => {
      wrap.innerHTML = `
        <div class="ph-status">${st && st.operator ? esc(st.operator) : '—'}${st && st.signal != null ? ' · ' + st.signal + '%' : ''}${st && st.tech ? ' · ' + esc(String(st.tech).toUpperCase()) : ''}</div>
        <div class="ph-num" id="phNum">${esc(_phNum)}</div>
        <div class="ph-pad">${keys.map(k => `<button class="ph-key" data-k="${k}"><span class="ph-d">${k}</span><span class="ph-s">${sub[k] || ''}</span></button>`).join('')}</div>
        <div class="ph-actions"><button class="ph-del" id="phDel">${ic('back',18)}</button><button class="ph-call" id="phCall">${ic('phone',24)}</button><span style="width:44px"></span></div>`;
      $$('#phWrap [data-k]').forEach(b => b.onclick = () => { _phNum += b.dataset.k; $('#phNum').textContent = _phNum; });
      $('#phDel').onclick = () => { _phNum = _phNum.slice(0, -1); $('#phNum').textContent = _phNum; };
      $('#phCall').onclick = async () => { if (!_phNum) return; const r = await Sov.phone.dial(_phNum); if (!(r && r.ok)) toast((r && r.error) || 'Call failed', 'alert', 'x'); };
    };
    const paintCall = call => {
      const incoming = call.direction === 'incoming' && call.state !== 'active';
      wrap.innerHTML = `
        <div class="ph-incall">
          <div class="ph-cnum">${esc(call.number || 'Unknown')}</div>
          <div class="ph-cstate">${incoming ? 'Incoming call' : (call.state === 'active' ? 'On call' : cap(call.state || 'Calling'))}</div>
          <div class="ph-cbtns">
            ${incoming ? `<button class="ph-answer" id="phAns">${ic('phone',24)}</button>` : ''}
            <button class="ph-end" id="phEnd">${ic('phone',24)}</button>
          </div></div>`;
      const a = $('#phAns'); if (a) a.onclick = () => Sov.phone.answer();
      $('#phEnd').onclick = async () => { await Sov.phone.hangup(); _phNum = ''; };
    };
    const refresh = async () => {
      if (S.appOpen !== 'phone') return;
      const s = await Sov.phone.state();
      const call = s && s.calls && s.calls.find(c => c.state !== 'terminated');
      if (call) { mode = 'call'; paintCall(call); }
      else if (mode !== 'keypad') { mode = 'keypad'; paintKeypad(); }
    };
    mode = 'keypad'; paintKeypad();
    clearInterval(_phTimer); _phTimer = setInterval(refresh, 2000); refresh();
  }

  /* ---- Messages — real SMS over the A7670E (ModemManager) ------------------ */
  function messagesView() { return `<div class="ms-wrap" id="msWrap"></div>`; }
  async function wireMessages() {
    const render = async () => {
      const r = await Sov.sms.list();
      const wrap = $('#msWrap'); if (!wrap) return;
      if (r && r.present === false && Sov.mode === 'live') {
        wrap.innerHTML = `<div class="af-placeholder"><div class="af-name">No messages</div>
          <div class="af-note">Insert a SIM and connect the A7670E.</div></div>`;
        return;
      }
      const msgs = (r && r.messages) || [];
      wrap.innerHTML = `
        <div class="ms-thread" id="msThread">${msgs.length
          ? msgs.map(m => `<div class="ms-${m.sent ? 'out' : 'in'}"><span class="ms-meta">${esc(m.number || '')}</span>${esc(m.text || '')}</div>`).join('')
          : '<div class="row muted" style="padding:24px;text-align:center">No messages yet.</div>'}</div>
        <div class="ms-compose">
          <input id="msTo" class="ms-to" placeholder="To (number)" autocomplete="off">
          <input id="msIn" placeholder="Message" autocomplete="off">
          <button class="mini-btn" id="msSend">Send</button>
        </div>`;
      const send = async () => {
        const to = ($('#msTo').value || '').trim(), tx = ($('#msIn').value || '').trim();
        if (!to || !tx) { toast('Enter a number and a message', 'alert', 'x'); return; }
        const rr = await Sov.sms.send(to, tx);
        if (rr && rr.ok) { $('#msIn').value = ''; toast('Message sent', 'ok', 'check'); render(); }
        else toast((rr && rr.error) || 'Send failed', 'alert', 'x');
      };
      $('#msSend').onclick = send;
      $('#msIn').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') send(); };
      $('#msTo').onkeydown = e => e.stopPropagation();
      const th = $('#msThread'); if (th) th.scrollTop = th.scrollHeight;
    };
    await render();
    clearInterval(_msTimer); _msTimer = setInterval(() => { if (S.appOpen === 'messages') render(); }, 5000);
  }

  /* ---- Contacts — a real, editable local store ---------------------------- */
  const CT_COLS = ['#1B82A8', '#5A3AD6', '#C0392B', '#2BA869', '#C8A020', '#1B9AA8', '#7A5AD6', '#D6772E'];
  function contactsView() { return `<div class="ct-wrap" id="ctWrap"></div>`; }
  async function wireContacts() {
    const wrap = $('#ctWrap'); if (!wrap) return;
    const render = async () => {
      const list = (await Sov.contacts.list()).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      wrap.innerHTML = `
        <div class="ct-list">${list.length ? list.map((c, ix) => {
          const initials = (c.name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
          return `<div class="ct-row" data-id="${c.id}">
            <span class="ct-av" style="background:linear-gradient(140deg, ${CT_COLS[ix % CT_COLS.length]}, ${CT_COLS[(ix + 4) % CT_COLS.length]})">${esc(initials || '?')}</span>
            <span class="ct-info"><span class="ct-name">${esc(c.name || '—')}</span><span class="ct-num">${esc(c.number || '')}</span></span>
            <span class="ct-call" data-callid="${c.id}">${ic('phone',15)}</span></div>`;
        }).join('') : '<div class="ct-empty">No contacts yet — tap + to add one.</div>'}</div>
        <button class="ct-add" id="ctAdd" aria-label="Add contact">${ic('x',22)}</button>`;
      $$('#ctWrap [data-callid]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const c = list.find(x => x.id === b.dataset.callid); if (!c) return;
        Sov.phone.dial(c.number); toast('Calling ' + (c.name || c.number) + '…', '', 'phone');
      });
      $$('#ctWrap .ct-row').forEach(r => r.onclick = () => editContact(list.find(x => x.id === r.dataset.id), render));
      $('#ctAdd').onclick = () => editContact(null, render);
    };
    await render();
  }
  function editContact(c, done) {
    const scrim = $('#promptScrim');
    scrim.innerHTML = `<div class="prompt-card ct-edit">
      <div class="pc-title">${c ? 'Edit contact' : 'New contact'}</div>
      <input id="ceName" class="modal-input" placeholder="Name" value="${c ? esc(c.name || '') : ''}">
      <input id="ceNum" class="modal-input" placeholder="Number" value="${c ? esc(c.number || '') : ''}" style="margin-top:8px">
      <div class="ce-btns">${c ? `<button class="pbtn deny" id="ceDel">Delete</button>` : ''}<button class="pbtn allow" id="ceSave">Save</button></div>
    </div>`;
    scrim.classList.add('open');
    const close = () => { scrim.classList.remove('open'); setTimeout(() => { if (!scrim.classList.contains('open')) scrim.innerHTML = ''; }, 200); };
    ['ceName', 'ceNum'].forEach(id => { const el = $('#' + id); if (el) el.onkeydown = e => e.stopPropagation(); });
    $('#ceSave').onclick = async () => {
      const name = ($('#ceName').value || '').trim(), number = ($('#ceNum').value || '').trim();
      if (!name && !number) { close(); return; }
      await Sov.contacts.op(c ? 'update' : 'add', { id: c && c.id, name, number });
      close(); done();
    };
    const del = $('#ceDel'); if (del) del.onclick = async () => { await Sov.contacts.op('delete', { id: c.id }); close(); done(); };
  }

  /* ---- Photos — a modern gallery of your real ~/Pictures ------------------ */
  function photosView() { return `<div class="pg-wrap" id="pgWrap"></div>`; }
  async function wirePhotos() {
    const wrap = $('#pgWrap'); if (!wrap) return;
    const r = await Sov.photos();
    const items = (r && r.items) || [];
    if (items.length) {
      wrap.innerHTML = `
        <div class="pg-head">${items.length} photo${items.length > 1 ? 's' : ''}</div>
        <div class="pg-grid">${items.map((it, i) => `<button class="pg-tile" data-i="${i}"><img loading="lazy" src="${Sov.photoUrl(it.rel)}" alt="${esc(it.name)}"></button>`).join('')}</div>
        <div class="pg-view" id="pgView"><button class="pg-close" id="pgClose">${ic('x',20)}</button><img id="pgImg" alt=""></div>`;
      const view = $('#pgView'), img = $('#pgImg');
      $$('#pgWrap .pg-tile').forEach(t => t.onclick = () => { img.src = Sov.photoUrl(items[+t.dataset.i].rel); view.classList.add('show'); });
      $('#pgClose').onclick = () => view.classList.remove('show');
    } else {
      const cols = ['#1B82A8', '#5A3AD6', '#C0392B', '#2BA869', '#C8A020', '#1B9AA8', '#2E7FD6', '#7A5AD6', '#D6772E'];
      wrap.innerHTML = `
        <div class="pg-empty"><div class="pg-empty-ic">${ic('photo',30)}</div>
          <div class="pg-empty-h">Your photos live here</div>
          <div class="pg-empty-s">Add images to <b>~/Pictures</b> on the device and they appear in this gallery.</div></div>
        <div class="pg-grid demo">${cols.map(c => `<div class="pg-tile" style="background:linear-gradient(135deg, ${c}, ${c}55)"></div>`).join('')}</div>`;
    }
  }

  /* ======================================================================
     TOAST
     ====================================================================== */
  let toastT;
  function toast(msg, kind = '', icon = 'info', action = null) {
    const t = $('#toast');
    t.className = kind || '';   // classList.add('') throws, so set className directly
    t.innerHTML = `<span class="t-ic">${ic(icon,16)}</span><span>${msg}</span>` +
      (action ? `<button class="t-act">${esc(action.label)}</button>` : '');
    t.classList.add('show');
    if (action) t.querySelector('.t-act').onclick = () => { t.classList.remove('show'); action.fn(); };
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), action ? 5200 : 2600);
  }

  /* ======================================================================
     LOCK SCREEN
     ====================================================================== */
  // The passcode pad is its own sheet, presented and dismissed like iOS's —
  // it slides up over the lock screen on demand rather than sitting there
  // permanently, and slides back down (not just vanishing) on cancel or a
  // correct code. S.pinSheetOpen tracks it; renderLock() reapplies it across
  // the ~2s status re-renders so an open sheet doesn't get silently dropped.
  function renderLock() {
    const st = Sov.get();
    const dots = [0, 1, 2, 3].map(i => `<span class="ld ${i < S.pin.length ? 'f' : ''}"></span>`).join('');
    const key = (v, cls = '', extra = '') => `<button class="key ${cls}" ${extra}>${v}</button>`;
    const notifs = Sov.notify.list().slice(0, 5);
    const lockNotifs = notifs.length
      ? `<div class="lock-nhead">${notifs.length} notification${notifs.length > 1 ? 's' : ''}</div>
         <div class="lock-notifs">${notifs.map(n => notifCardHTML(n, { locked: true })).join('')}</div>`
      : '';
    $('#lock').innerHTML = `
      <div class="home2-aura" aria-hidden="true"></div>
      <div class="lock-top">
        <div class="lock-clock">${st.time}</div>
        <div class="lock-date">${esc(st.date)}</div>
        ${weatherOn() && _wx.data && _wx.data.available
          ? `<div class="lock-wx">${ic(wxIcon(_wx.data), 13)}<span>${esc(wxReading(_wx.data))}</span></div>` : ''}
        <div class="lock-status">${ic('shieldChk',13)}<span>Encrypted &amp; sealed</span></div>
      </div>
      <div class="lock-mid">${lockNotifs}</div>
      <button class="lock-wake" id="lockWake" aria-label="Enter passcode">
        <span class="lw-chev">${ic('chev',16)}</span><span>Swipe up to unlock</span>
      </button>
      <div class="pin-scrim" id="pinScrim"></div>
      <div class="pin-sheet" id="pinSheet">
        <div class="pin-body">
          <div class="lock-hint">${ic('lock',12)}<span>Enter passcode</span></div>
          <div class="lock-dots" id="lockDots">${dots}</div>
          <div class="keypad">
            ${[1,2,3,4,5,6,7,8,9].map(n => key(n,'','data-k="'+n+'"')).join('')}
            <button class="key fn" data-k="clear">Clear</button>
            ${key(0,'','data-k="0"')}
            <button class="key fn" data-k="back">⌫</button>
          </div>
        </div>
        <button class="pin-cancel" id="pinCancel">Cancel</button>
      </div>`;
    $('#lock').querySelectorAll('[data-k]').forEach(b => b.onclick = () => onKey(b.dataset.k));
    $('#lockWake').onclick = openPinSheet;
    $('#pinScrim').onclick = closePinSheet;
    $('#pinCancel').onclick = closePinSheet;
    // a drag down anywhere on the cover (not the keys) also dismisses it
    wirePinSheetDrag();
    if (S.pinSheetOpen) {
      $('#pinSheet').classList.add('open');
      $('#pinScrim').classList.add('show');
    }
  }
  function openPinSheet() {
    S.pinSheetOpen = true;
    $('#pinSheet').classList.add('open');
    $('#pinScrim').classList.add('show');
  }
  function closePinSheet() {
    S.pinSheetOpen = false;
    S.pin = '';
    $('#pinSheet').classList.remove('open');
    $('#pinScrim').classList.remove('show');
  }
  function wirePinSheetDrag() {
    const sheet = $('#pinSheet');
    if (!sheet) return;
    sheet.onpointerdown = e => {
      if (e.target.closest('.key, .pin-cancel')) return;   // keys & Cancel own their taps
      e.preventDefault();
      try { sheet.setPointerCapture(e.pointerId); } catch (_) {}
      const sy = e.clientY;
      sheet.style.transition = 'none';
      const move = ev => {
        const dy = Math.max(0, ev.clientY - sy);   // only downward (closing) drags
        sheet.style.transform = `translateY(${dy}px)`;
      };
      const up = ev => {
        sheet.onpointermove = sheet.onpointerup = sheet.onpointercancel = null;
        sheet.style.transition = ''; sheet.style.transform = '';
        if ((ev.clientY - sy) > 130) closePinSheet();   // a real downward fling → dismiss
      };
      sheet.onpointermove = move; sheet.onpointerup = up; sheet.onpointercancel = up;
    };
  }
  async function onKey(k) {
    if (k === 'clear') { S.pin = ''; return renderLock(); }
    if (k === 'back')  { S.pin = S.pin.slice(0, -1); return renderLock(); }
    if (S.pin.length >= 6) return;
    S.pin += k;
    renderLock();
    if (S.pin.length === 4) {
      const ok = await Sov.unlock(S.pin);
      if (ok) {
        const d = $('#lockDots'); if (d) d.classList.add('ok');   // a beat of green success before the sheet closes
        setTimeout(() => { closePinSheet(); unlockDevice(); }, 260);
      } else {
        const d = $('#lockDots'); d.classList.add('err');
        setTimeout(() => { S.pin = ''; renderLock(); }, 450);
      }
    }
  }
  function unlockDevice() {
    S.locked = false;
    S.pinSheetOpen = false;
    $('#lock').classList.add('hidden');
    if (typeof Aura !== 'undefined') Aura.start();   // wake the orb Aura
    goHome();
    updateInsight();   // reveal the margin once we're past the lock screen
  }

  /* ======================================================================
     LIVE UPDATE PLUMBING
     ====================================================================== */
  // Emit a single low-battery notification when we cross 15% on battery, and
  // re-arm only after the device is charged back above 30% — no nagging.
  let _lowBattArmed = true;
  function batteryWatch(st) {
    const b = st.battery;
    if (!b) return;
    if (b.charging || b.level > 30) _lowBattArmed = true;
    else if (_lowBattArmed && b.level <= 15) {
      _lowBattArmed = false;
      Sov.notify.push({ app: 'system', icon: 'batt', color: 'var(--warn)', title: 'Battery low',
        body: `${b.level}% remaining. Consider plugging in.` });
    }
  }

  function onUpdate(st) {
    renderPane(st);
    batteryWatch(st);
    updateHelm();
    // the orb Aura reflects live sensor use on every screen
    if (!S.locked && typeof Aura !== 'undefined') Aura.setSensors(activeSensorKinds());
    // refresh the honest surfaces if visible — patch in place, don't rebuild
    if (!S.locked && S.view === 'home' && !S.appOpen) {
      paintHomeClock(st);
      paintUpNext();   // 60s-cached; only touches the DOM when the event changes
      const as = $('#auraStatus'); if (as) as.innerHTML = auraStatusHTML();
      bindHome();
      $$('#v-home [data-launch]').forEach(el =>
        el.classList.toggle('using', Sov.activeSensorsFor(el.dataset.launch).length > 0));
    }
    if (S.controlOpen) { /* toggles reflect state on next open; live sliders ok */ }
    if (S.locked) renderLock();
    updateInsight();   // the left margin refreshes in every context (home + apps)
    $('#agentBadge').classList.toggle('live', st.mode === 'live');
    $('#agentBadge').textContent = st.mode === 'live' ? 'LIVE' : 'SIM';
  }

  /* ======================================================================
     GESTURES + GLOBAL BINDINGS
     ====================================================================== */
  function bindGlobal() {
    // #homeOrb is driven by wireOrb() (tap = home, long-press = radial menu).
    $('#helmBack').onclick = () => { if (!S.locked) back(); };
    $('#helmAct').onclick = () => { if (!S.locked) toggleActivity(); };

    // pull-down from the status pane: two zones, two panels. The left half
    // (time / date) drops Notifications; the right half (status cluster) drops
    // Controls — same split as tapping. The bell always opens Notifications.
    let sy = null, sx = null;
    const pane = $('#pane');
    const zoneFor = x => {
      const r = pane.getBoundingClientRect();
      return (x - r.left) < r.width / 2 ? 'notifs' : 'controls';
    };
    const startPull = (x, y) => { if (!S.locked && !S.appOpen) { sx = x; sy = y; } };
    const movePull = y => {
      if (sy == null) return;
      if (y - sy > 46) { openControl(zoneFor(sx)); sy = null; }
    };
    pane.addEventListener('mousedown', e => startPull(e.clientX, e.clientY));
    pane.addEventListener('mousemove', e => movePull(e.clientY));
    window.addEventListener('mouseup', () => sy = null);
    pane.addEventListener('touchstart', e => startPull(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    pane.addEventListener('touchmove', e => movePull(e.touches[0].clientY), { passive: true });

    // Swipe up from the bottom edge → home. The button-free gesture that makes
    // the whole thing feel like a phone. A mostly-vertical swipe of 70px+ that
    // starts in the bottom strip goes home (works over any screen or app).
    let gy = null, gx = null;
    const gStart = (x, y, target) => {
      if (S.locked || S.controlOpen || _radialOpen) return;
      if (target && target.closest && target.closest('#helm')) return;   // orb owns helm gestures
      if (y >= window.innerHeight - 48) { gx = x; gy = y; }
    };
    const gMove = (x, y) => {
      if (gy == null || _radialOpen) return;
      if (gy - y > 70) { const dx = Math.abs(x - gx); gy = null; if (dx < 100) goHome(); }
    };
    window.addEventListener('touchstart', e => gStart(e.touches[0].clientX, e.touches[0].clientY, e.target), { passive: true });
    window.addEventListener('touchmove', e => gMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    window.addEventListener('touchend', () => { gy = null; });
    window.addEventListener('mousedown', e => gStart(e.clientX, e.clientY, e.target));
    window.addEventListener('mousemove', e => { if (e.buttons) gMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { gy = null; });
    // tapping the pane also opens the matching panel (discoverable for mouse users)
    pane.addEventListener('click', e => {
      if (S.locked || S.appOpen || S.controlOpen) return;
      openControl(e.target.closest('.pane-notif') ? 'notifs' : zoneFor(e.clientX));
    });

    // click above control (its rounded bottom) or grip closes it
    $('#control').addEventListener('click', e => { if (e.target.id === 'control') closeControl(); });
    $('.ctl-grip') && ($('.ctl-grip').onclick = () => closeControl());

    // Escape / swipe up on control to dismiss
    document.addEventListener('keydown', e => {
      // Calculator keyboard input, when it's the active screen.
      if (S.view === 'calc' && !S.locked && !S.controlOpen && !S.appOpen) {
        const K = { '*': '*', 'x': '*', '/': '/', '+': '+', '-': '-', '=': '=', 'Enter': '=',
          'Backspace': 'back', 'Delete': 'clear', 'c': 'clear', 'C': 'clear', '%': 'pct', '.': '.', ',': '.' };
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); return calcPress(e.key); }
        if (K[e.key] !== undefined && e.key !== 'Escape') { e.preventDefault(); return calcPress(K[e.key]); }
      }
      if (e.key === 'Escape') { if (S.controlOpen) closeControl(); else if (!S.locked) back(); }
    });
  }

  /* Recents — a real task switcher. Each running session is a swipeable card
     carrying a miniature of the app's actual last screen (a sanitized snapshot
     of its live DOM, taken when it goes to the background — no screenshots, no
     canvas tricks, nothing leaves the shell). Tap a card to bring that session
     back to the foreground; × ends it for real (sensors released, DOM dropped). */
  const _shots = {};   // appId → sanitized HTML of its last visible screen
  // The snapshot is display-only: strip element ids (so the miniature can never
  // shadow the live view's selectors) and neutralize iframes (a preview must
  // not reload pages or touch the network).
  const snapClean = html => String(html || '')
    .replace(/\sid="[^"]*"/g, '')
    .replace(/<iframe\b[^>]*>/gi, '<div class="shot-blank">')
    .replace(/<\/iframe>/gi, '</div>');
  function snapApp() {
    if (!_frameApp) return;
    const v = $('#afView');
    if (v && v.innerHTML) _shots[_frameApp] = snapClean(v.innerHTML);
  }

  const _ago = since => {
    const m = Math.max(0, Math.round((Date.now() - (since || Date.now())) / 60000));
    return m < 1 ? 'just now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  function toggleActivity() {
    if (S.recentsOpen) return closeRecents();
    openRecents();
  }
  function openRecents() {
    const running = Sov.running();
    if (!running.length) return toast('No apps running', '', 'layers');
    snapApp();   // the foreground app poses for its card too
    S.recentsOpen = true;
    renderRecents(running);
    const rc = $('#recents');
    rc.classList.add('open');
    requestAnimationFrame(() => rc.classList.add('shown'));
    syncLiveBricks();
  }
  function closeRecents() {
    S.recentsOpen = false;
    syncLiveBricks();
    const rc = $('#recents');
    rc.classList.remove('shown');
    setTimeout(() => { if (!S.recentsOpen) { rc.classList.remove('open'); rc.innerHTML = ''; } }, 220);
  }
  function renderRecents(running) {
    const cards = running.map((r, i) => {
      const a = Sov.app(r.appId) || resolveHomeApp(r.appId);   // resolve android:<pkg> too
      if (!a) return '';
      const sens = Sov.activeSensorsFor(a.id);
      const shot = _shots[a.id];
      const dots = sens.map(s => `<span class="rc-dot ${s}" title="${cap(labelFor(s))} in use"></span>`).join('');
      const meta = sens.length
        ? sens.map(s => cap(labelFor(s))).join(' · ') + ' in use'
        : `Open · ${_ago(r.since)}`;
      return `
        <article class="rc-card ${a.id === _frameApp && S.appOpen ? 'fg' : ''}" data-open="${a.id}" style="--col:${a.color};--i:${i}">
          <header class="rc-head">
            <span class="rc-badge">${ic(a.glyph, 14)}</span>
            <span class="rc-name">${esc(a.name)}</span>${dots}
            <button class="rc-x" data-kill="${a.id}" aria-label="Close ${esc(a.name)}">${ic('x', 12)}</button>
          </header>
          <div class="rc-shot">
            ${shot ? `<div class="rc-shot-inner" aria-hidden="true">${shot}</div>`
                   : `<div class="rc-ghost" aria-hidden="true">${ic(a.glyph, 46)}</div>`}
            <div class="rc-veil"></div>
          </div>
          <footer class="rc-meta ${sens.length ? 'live' : ''}">${esc(meta)}</footer>
        </article>`;
    }).join('');
    $('#recents').innerHTML = `
      <div class="rc-top"><span class="eyebrow">Recents</span><span class="rc-count">${running.length} running</span></div>
      <div class="rc-rail">${cards}</div>
      <div class="rc-actions"><button class="rc-clear" data-clearall>${ic('x',13)}<span>Clear all</span></button></div>`;

    $$('#recents .rc-card').forEach(card => card.onclick = e => {
      if (e.target.closest('[data-kill]')) return;
      const id = card.dataset.open;
      closeRecents();
      const a = Sov.app(id) || resolveHomeApp(id);
      // The foreground session (its DOM is still live) resumes directly;
      // anything else goes through the normal launch flow.
      if (id === _frameApp && a) openAppFrame(a); else launch(id);
    });
    $$('#recents [data-kill]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const id = b.dataset.kill;
      if (id === _frameApp) teardownFrameDom();   // real close → stop camera/audio, drop DOM
      Sov.closeApp(id); delete _shots[id];
      const rn = Sov.running();
      if (rn.length) renderRecents(rn); else { closeRecents(); if (S.view === 'home') renderHome(); }
      updateHelm();
    });
    const ca = $('#recents [data-clearall]');
    if (ca) ca.onclick = () => {
      teardownFrameDom();
      Sov.running().forEach(r => { Sov.closeApp(r.appId); delete _shots[r.appId]; });
      closeRecents();
      if (S.appOpen) closeAppFrame(true);
      if (S.view === 'home') renderHome();
      updateHelm();
      toast('All apps closed', 'ok', 'check');
    };
    // land the rail on the foreground card, if there is one
    const fg = $('#recents .rc-card.fg');
    if (fg) fg.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  /* ======================================================================
     BOOT
     ====================================================================== */
  // A device with a blank notification shade feels broken; seed a couple of
  // gentle, honest first-run notifications once (never again after that).
  function seedNotifications() {
    if (PREF.get('notifSeeded', false)) return;
    PREF.set('notifSeeded', true);
    Sov.notify.push({ app: 'settings', title: 'Welcome to Aura',
      body: 'Pull down on the left for notifications, on the right for controls. Everything here stays on your device.', nav: 'settings' });
    Sov.notify.push({ app: 'system', icon: 'shieldChk', color: 'var(--ok)', title: 'Private by default',
      body: 'No account, no telemetry. A colored dot appears whenever an app uses your mic, camera or location.' });
  }

  // React to notification changes anywhere: keep the pane badge honest and
  // refresh whichever notification surface is currently on screen.
  function onNotify() {
    renderPane(Sov.get());
    if (S.controlOpen && !S.recentsOpen) renderControl();
    if (S.locked) renderLock();
  }

  // Background cellular watch: turn new incoming SMS and calls into real
  // notifications, even when the Phone/Messages apps aren't open. Live only, and
  // it seeds on first read so existing messages don't all fire at once.
  let _seenSms = null, _cellStatus = null;
  const _seenCalls = new Set();
  async function startModemWatch() {
    const pull = async () => { try { _cellStatus = await Sov.phone.status(); } catch (e) {} };
    await pull();
    setInterval(async () => {
      await pull();                       // keep the status-bar cellular chip fresh
      if (Sov.mode !== 'live' || S.locked) return;
      try {
        const r = await Sov.sms.list();
        if (r && r.present && Array.isArray(r.messages)) {
          const ids = new Set(r.messages.map(m => m.id));
          if (_seenSms === null) _seenSms = ids;   // seed, don't notify the backlog
          else {
            r.messages.filter(m => !m.sent && m.unread && !_seenSms.has(m.id)).forEach(m =>
              Sov.notify.push({ app: 'messages', title: 'Message · ' + (m.number || ''), body: m.text || '', icon: 'msg' }));
            _seenSms = ids;
          }
        }
      } catch (e) {}
      try {
        const s = await Sov.phone.state();
        const calls = (s && s.calls) || [];
        calls.filter(c => c.direction === 'incoming' && ['ringing', 'waiting'].includes(c.state)).forEach(c => {
          if (!_seenCalls.has(c.id)) {
            _seenCalls.add(c.id);
            Sov.notify.push({ app: 'phone', title: 'Incoming call', body: c.number || 'Unknown', icon: 'phone' });
            if (S.appOpen !== 'phone') toast('Incoming call — ' + (c.number || 'Unknown'), '', 'phone');
          }
        });
        const active = new Set(calls.map(c => c.id));
        [..._seenCalls].forEach(id => { if (!active.has(id)) _seenCalls.delete(id); });
      } catch (e) {}
    }, 8000);
  }

  /* ======================================================================
     THE ORB — the Aura's home. A tap goes home; a long-press opens a radial
     menu you drag the Aura to (Assistant · Search · Apps · Recents), or tap.
     ====================================================================== */
  const RADIAL = [
    { label: 'Assistant', icon: 'spark',  run: () => launch('assistant') },
    { label: 'Search',    icon: 'search', run: () => openSearch() },
    { label: 'Apps',      icon: 'grid',   run: () => go('drawer') },
    { label: 'Recents',   icon: 'layers', run: () => toggleActivity() },
  ];
  const RADIAL_POS = [[-80, -46], [-28, -84], [28, -84], [80, -46]];
  let _radialOpen = false, _radialSel = -1, _orbLP = null;

  function openRadial() {
    _radialOpen = true; _radialSel = -1;
    const rad = $('#radial'); if (!rad) return;
    rad.innerHTML = `<div class="rad-scrim"></div>` + RADIAL.map((o, i) =>
      `<button class="rad-opt" data-ro="${i}" style="--dx:${RADIAL_POS[i][0]}px;--dy:${RADIAL_POS[i][1]}px">
         <span class="rad-ic">${ic(o.icon, 20)}</span><span class="rad-lbl">${esc(o.label)}</span></button>`).join('');
    rad.classList.add('open');
    rad.querySelector('.rad-scrim').onclick = () => closeRadial(false);
    rad.querySelectorAll('[data-ro]').forEach(b => b.onclick = () => { _radialSel = +b.dataset.ro; closeRadial(true); });
    if (typeof Aura !== 'undefined') Aura.bloom();
  }
  function closeRadial(trigger) {
    const rad = $('#radial'); if (!rad) return;
    if (trigger && _radialSel >= 0 && RADIAL[_radialSel]) RADIAL[_radialSel].run();
    _radialOpen = false; _radialSel = -1;
    rad.classList.remove('open');
    setTimeout(() => { if (!_radialOpen) rad.innerHTML = ''; }, 220);
  }
  function radialSelect(x, y) {
    const orb = $('#homeOrb').getBoundingClientRect();
    const cx = orb.left + orb.width / 2, cy = orb.top + orb.height / 2;
    let best = -1, bestD = 1e9;
    RADIAL_POS.forEach((p, i) => { const d = Math.hypot(x - (cx + p[0]), y - (cy + p[1])); if (d < bestD) { bestD = d; best = i; } });
    _radialSel = (Math.hypot(x - cx, y - cy) > 24 && bestD < 74) ? best : -1;
    $$('#radial .rad-opt').forEach((el, i) => el.classList.toggle('sel', i === _radialSel));
    if (typeof Aura !== 'undefined' && _radialSel >= 0) Aura.attend();
  }
  function wireOrb() {
    const orb = $('#homeOrb'); if (!orb) return;
    let sx = 0, sy = 0, longPressed = false, downAt = 0;
    orb.addEventListener('pointerdown', e => {
      if (S.locked) return;
      sx = e.clientX; sy = e.clientY; longPressed = false; downAt = Date.now();
      try { orb.setPointerCapture(e.pointerId); } catch (_) {}
      if (typeof Aura !== 'undefined') Aura.bloom();
      clearTimeout(_orbLP);
      _orbLP = setTimeout(() => { longPressed = true; openRadial(); }, 300);
    });
    orb.addEventListener('pointermove', e => {
      if (longPressed) { radialSelect(e.clientX, e.clientY); return; }
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 16) clearTimeout(_orbLP);   // a swipe, not a hold
    });
    const end = () => {
      clearTimeout(_orbLP);
      if (_radialOpen) { if (_radialSel >= 0) closeRadial(true); /* else keep open to tap */ }
      else if (!longPressed && Date.now() - downAt < 500) goHome();   // a tap
      longPressed = false;
    };
    orb.addEventListener('pointerup', end);
    orb.addEventListener('pointercancel', () => { clearTimeout(_orbLP); if (_radialOpen) closeRadial(false); longPressed = false; });
  }

  async function boot() {
    bindGlobal();
    $('#device').classList.add('on-wallpaper');   // we boot onto home
    applyWallpaper();
    applyTheme();
    applyEffects();
    applyIconStyle();
    applyAppearance();
    applyFont();
    refreshWeather();   // no-op unless the user enabled Live weather
    // keep the reading current while enabled (refreshWeather itself is
    // 15-min-cached, so this costs nothing extra between refreshes)
    setInterval(() => { if (weatherOn()) refreshWeather(); }, 5 * 60000);
    seedNotifications();
    Sov.notify.subscribe(onNotify);
    Sov.onUpdate(onUpdate);
    document.addEventListener('visibilitychange', () => {
      if (typeof Aura === 'undefined') return;
      if (document.hidden) Aura.stop();
      else if (!S.locked) Aura.start();   // the orb Aura runs on every screen
    });
    renderLock();
    renderPane(Sov.get());
    buildInsight();                      // the left privacy/status margin
    mountAura();                         // the Aura lives in the home orb, persistently
    wireOrb();                           // tap = home · long-press = radial menu
    if (S.locked && typeof Aura !== 'undefined') Aura.stop();
    startModemWatch();                   // incoming call/SMS → notifications (live)
    HOME_CFG = await Sov.homeConfig();   // load the layout config before first home render
    await Sov._probe();
    onUpdate(Sov.get());
    // brief boot splash, then lock screen
    setTimeout(() => {
      $('#boot').classList.add('hidden');
      setTimeout(() => $('#boot').remove(), 600);
    }, 1200);
  }

  boot();
})();
