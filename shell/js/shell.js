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
    ctlTab: 'controls',   // which pull-down panel is showing: 'notifs' | 'controls'
    insTab: null,         // which insight-margin section is expanded (or null)
    homeEdit: false,      // iOS/Android-style home edit mode (long-press to enter)
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
  ];
  function applyWallpaper() {
    const img = PREF.get('wallpaperImg', null);
    const url = img && Sov.photoUrl ? Sov.photoUrl(img) : null;
    if (url) {   // a photo from ~/Pictures wins over the gradient presets
      document.documentElement.style.setProperty('--wallpaper', `center / cover no-repeat url("${url}")`);
      return;
    }
    const w = WALLPAPERS.find(x => x.id === PREF.get('wallpaper', 'petrol')) || WALLPAPERS[0];
    document.documentElement.style.setProperty('--wallpaper', w.css);
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
    { id: 'aurora', name: 'Aurora',    sub: 'Breathing pools of light' },
    { id: 'stars',  name: 'Starfield', sub: 'A quiet night sky' },
    { id: 'drift',  name: 'Drift',     sub: 'Slow color currents' },
    { id: 'off',    name: 'Minimal',   sub: 'No ambient layer' },
  ];
  const FX_LEVELS = [
    { id: 'still', name: 'Still' }, { id: 'calm', name: 'Calm' }, { id: 'vivid', name: 'Vivid' },
  ];
  function applyEffects() {
    const root = document.documentElement;
    root.dataset.fx = PREF.get('fx', 'aurora');
    root.dataset.fxLevel = PREF.get('fxLevel', 'calm');
    $('#device').classList.toggle('nightlight', PREF.get('nightlight', false));
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
      <button class="home-orb" id="homeOrb" aria-label="Home"></button>
      <button class="helm-activity" id="helmAct"><span class="actcount" id="actCount">0</span></button>
    </div>
    <div id="appframe"></div>
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
  // A home tile id is either a built-in app id, or "android:<package>" for an
  // Android app installed from the App Store — resolve either to a tile object.
  function resolveHomeApp(id) {
    if (id && id.indexOf('android:') === 0) {
      const pkg = id.slice(8), names = PREF.get('androidApps', {});
      return { id, pkg, android: true, name: names[pkg] || pkg, glyph: 'android', color: '#2BA869' };
    }
    return Sov.app(id);
  }
  // Put a freshly-installed Android app onto the home screen (last page), the way
  // a phone drops a new app on your home screen.
  function addAndroidToHome(pkg, name) {
    const id = 'android:' + pkg;
    const names = PREF.get('androidApps', {}); names[pkg] = name || pkg; PREF.set('androidApps', names);
    const pgs = homePagesIds().map(p => (p || []).slice());
    if (!pgs.length) pgs.push([]);
    if (!pgs.some(p => p.includes(id))) { pgs[pgs.length - 1].push(id); PREF.set('homePages', pgs); }
  }
  function homeLayout() {
    const cfg = HOME_CFG || Sov._homeCfgSync();
    const apps = Sov.apps();
    const byId = id => apps.find(a => a.id === id);
    const focus = byId(PREF.get('focus', null) || cfg.focus) || byId('assistant') || apps[0];
    const seen = new Set([focus.id]);
    let pages = homePagesIds().map(ids =>
      (ids || []).map(resolveHomeApp).filter(a => a && !seen.has(a.id) && (seen.add(a.id), true)));
    if (!pages.length) pages = [[]];
    if (pages.every(p => !p.length)) pages[0] = apps.filter(a => a.id !== focus.id);
    return { cfg, focus, pages };
  }

  function renderHome() {
    const st = Sov.get();
    HOME_CFG = HOME_CFG || Sov._homeCfgSync();
    const { cfg, focus, pages } = homeLayout();
    // The Aura *is* the assistant's presence, so a separate "assistant" focus
    // card would be redundant — show a focus card only for another suggested app.
    const showFocus = focus.id !== 'assistant';

    $('#v-home').innerHTML = `
      <div class="home2-aura" aria-hidden="true"></div>
      <div class="home2-body ${S.homeEdit ? 'editing' : ''}">
        <section class="aura-hero">
          <canvas class="aura-canvas" id="auraCanvas" aria-label="Aura — your on-device companion"></canvas>
          <div class="aura-time" id="homeClock">${st.time}</div>
          <div class="aura-date">${esc(st.date)} · ${esc(cfg.greeting || greetShort(st.time))}</div>
          <button class="aura-status" id="auraStatus" data-nav="permissions">${auraStatusHTML()}</button>
        </section>
        <div id="suggestSlot"></div>
        ${showFocus ? focusCardHTML(focus, cfg) : ''}
        <div class="home-pager" id="homePager">${pages.map((ps, pi) =>
          `<section class="home-page"><div class="tile-grid" data-page="${pi}">${ps.map(homeTile).join('')}</div></section>`).join('')}</div>
        ${pages.length > 1 ? `<div class="page-dots" id="pageDots">${pages.map((_, pi) =>
          `<button class="pdot ${pi === 0 ? 'on' : ''}" data-pdot="${pi}" aria-label="Page ${pi + 1}"></button>`).join('')}</div>` : ''}
        ${S.homeEdit
          ? `<div class="home-edit-bar">
               <button class="heb-btn" data-hedit="wallpaper">${ic('sun',15)}<span>Wallpaper</span></button>
               <button class="heb-btn" data-hedit="addpage">${ic('grid',15)}<span>Add page</span></button>
               <button class="heb-btn done" data-hedit="done">Done</button>
             </div>`
          : `<button class="all-apps-btn" data-nav="drawer">${ic('grid',16)} All apps</button>`}
        <div style="height:4px"></div>
      </div>`;

    bindHome();
    $$('#homePager .tile-grid').forEach(g => enableTileSort(g));
    wireHomePager();
    wireHomeEdit();
    mountAura();
    maybeSuggest();   // the resident may gently offer a learned routine (async)
  }

  const activeSensorKinds = () => Object.keys(Sov.get().sensors);   // 'mic'|'cam'|'loc'
  function auraStatusHTML() {
    const kinds = activeSensorKinds();
    if (!kinds.length) return `<span class="as-dot calm"></span><span>Private · the Aura is watching over you</span>`;
    const label = { mic: 'Microphone', cam: 'Camera', loc: 'Location' };
    const cls = kinds.includes('cam') ? 'cam' : kinds.includes('mic') ? 'mic' : 'loc';
    return `<span class="as-dot ${cls}"></span><span>${esc(kinds.map(k => label[k]).join(' · '))} in use right now</span>`;
  }
  function mountAura() {
    const cvs = $('#auraCanvas'); if (!cvs || typeof Aura === 'undefined') return;
    Aura.mount(cvs, { onTap: () => { if (!S.locked && S.view === 'home' && !S.appOpen) launch('assistant'); } });
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

  function homeTile(app) {
    const using = Sov.activeSensorsFor(app.id).length ? 'using' : '';
    const del = S.homeEdit ? `<span class="tile-x" data-hdel="${app.id}" aria-label="Remove">${ic('x', 11)}</span>` : '';
    // Android apps show their own real icon when we can resolve it; else a glyph.
    const iconUrl = app.android && Sov.appIconUrl ? Sov.appIconUrl('waydroid.' + app.pkg) : null;
    const img = iconUrl ? `<img class="tile-img" src="${iconUrl}" onerror="this.remove()" alt="">` : '';
    return `
      <button class="tile ${using}" data-launch="${app.id}" style="--col:${app.color}">
        ${del}<span class="tile-ic"><span class="tile-dot"></span>${ic(app.glyph, 24)}${img}</span>
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

  // Home edit mode — iOS/Android-style. Long-press a tile (or the background)
  // to enter; tiles jiggle, an × removes them, a toolbar adds pages / changes
  // wallpaper. A quick horizontal move is a page-swipe (we suppress the launch
  // click), so swipe and drag no longer fight.
  function wireHomeEdit() {
    const enter = () => { if (!S.homeEdit) { S.homeEdit = true; renderHome(); } };
    $$('#homePager .tile').forEach(t => {
      let sx = 0, sy = 0, moved = false, lp = null;
      t.addEventListener('pointerdown', e => {
        moved = false; sx = e.clientX; sy = e.clientY;
        lp = setTimeout(() => { if (!moved) enter(); }, 480);
      });
      t.addEventListener('pointermove', e => {
        if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { moved = true; clearTimeout(lp); }
      });
      t.addEventListener('pointerup', () => clearTimeout(lp));
      t.addEventListener('pointercancel', () => clearTimeout(lp));
      t.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    });
    const pager = $('#homePager');
    if (pager) {
      let px = 0, py = 0, pmoved = false, plp = null;
      pager.addEventListener('pointerdown', e => {
        if (e.target.closest('.tile')) return;   // tiles own their long-press
        pmoved = false; px = e.clientX; py = e.clientY;
        plp = setTimeout(() => { if (!pmoved) enter(); }, 480);
      });
      pager.addEventListener('pointermove', e => {
        if (Math.hypot(e.clientX - px, e.clientY - py) > 10) { pmoved = true; clearTimeout(plp); }
      });
      pager.addEventListener('pointerup', () => clearTimeout(plp));
      pager.addEventListener('pointercancel', () => clearTimeout(plp));
    }
    if (!S.homeEdit) return;
    $$('#v-home [data-hdel]').forEach(x => x.onclick = e => {
      e.stopPropagation(); e.preventDefault();
      const id = x.dataset.hdel;
      PREF.set('homePages', homePagesIds().map(p => (p || []).filter(a => a !== id)));
      renderHome();
    });
    $$('#v-home [data-hedit]').forEach(b => b.onclick = () => {
      const a = b.dataset.hedit;
      if (a === 'done') { S.homeEdit = false; renderHome(); }
      else if (a === 'addpage') {
        const pgs = homePagesIds().slice(); pgs.push([]); PREF.set('homePages', pgs);
        renderHome();
        setTimeout(() => { const pg = $('#homePager'); if (pg) pg.scrollTo({ left: (pgs.length - 1) * pg.clientWidth, behavior: 'smooth' }); }, 40);
        toast('Page added', 'ok', 'check');
      } else if (a === 'wallpaper') openWallpaperSheet();
    });
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

  const greetShort = t => {
    const h = parseInt(t.slice(0, 2), 10);
    return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  };

  // Drag-to-rearrange the home tiles. A tap still launches (movement threshold
  // distinguishes tap from drag); a drag reorders with a smooth FLIP animation
  // and persists the new order. This is the "app placement moves on home" bit.
  function flipReorder(grid, mutate) {
    const kids = [...grid.children];
    const before = new Map(kids.map(el => [el, el.getBoundingClientRect()]));
    mutate();
    for (const el of grid.children) {
      if (el.classList.contains('dragging')) continue;
      const b = before.get(el); if (!b) continue;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (dx || dy) {
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px,${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform .18s var(--ease)';
          el.style.transform = '';
        });
      }
    }
  }
  function enableTileSort(grid) {
    if (!grid) return;
    let suppressClick = false;
    grid.addEventListener('click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
    grid.querySelectorAll('.tile').forEach(tile => {
      tile.addEventListener('pointerdown', e => {
        if (e.button) return;
        if (!S.homeEdit) return;   // drag-to-arrange only in edit mode; else swipe pages freely
        const start = { x: e.clientX, y: e.clientY }; let started = false, lastEdge = 0;
        const move = ev => {
          const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
          if (!started) {
            if (Math.hypot(dx, dy) < 9) return;      // still a tap
            started = true;
            tile.classList.add('dragging');
            $$('#homePager .tile-grid').forEach(g => g.classList.add('sorting'));
            try { tile.setPointerCapture(ev.pointerId); } catch (_) {}
          }
          tile.style.transform = `translate(${dx}px,${dy}px) scale(1.08)`;
          // near a page edge → glide to the adjacent page so you can drop there
          const pager = $('#homePager');
          if (pager) {
            const pr = pager.getBoundingClientRect(), now = Date.now();
            if (now - lastEdge > 550) {
              if (ev.clientX < pr.left + 34) { pager.scrollBy({ left: -pager.clientWidth, behavior: 'smooth' }); lastEdge = now; }
              else if (ev.clientX > pr.right - 34) { pager.scrollBy({ left: pager.clientWidth, behavior: 'smooth' }); lastEdge = now; }
            }
          }
          tile.style.pointerEvents = 'none';
          const under = document.elementFromPoint(ev.clientX, ev.clientY);
          tile.style.pointerEvents = '';
          const overTile = under && under.closest('.tile');
          const overGrid = under && under.closest('.tile-grid');
          if (overTile && overTile !== tile) {                       // reorder / cross-page insert
            const g = overTile.parentElement, r = overTile.getBoundingClientRect();
            const after = ev.clientY > r.top + r.height / 2 || ev.clientX > r.left + r.width / 2;
            flipReorder(g, () => g.insertBefore(tile, after ? overTile.nextSibling : overTile));
            tile.style.transform = `translate(${dx}px,${dy}px) scale(1.08)`;
          } else if (overGrid && overGrid !== tile.parentElement) {   // move to another page's empty area
            flipReorder(overGrid, () => overGrid.appendChild(tile));
            tile.style.transform = `translate(${dx}px,${dy}px) scale(1.08)`;
          }
        };
        const up = () => {
          tile.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (!started) return;
          tile.classList.remove('dragging');
          $$('#homePager .tile-grid').forEach(g => g.classList.remove('sorting'));
          tile.style.transition = 'transform .18s var(--ease)';
          tile.style.transform = '';
          setTimeout(() => { tile.style.transition = ''; }, 200);
          // persist every page (a drag may have moved the tile across pages)
          const pgs = homePagesIds().slice();
          $$('#homePager .tile-grid').forEach(g => {
            const pi = parseInt(g.dataset.page, 10);
            if (!isNaN(pi)) pgs[pi] = [...g.querySelectorAll('.tile')].map(t => t.dataset.launch);
          });
          PREF.set('homePages', pgs);
          suppressClick = true; setTimeout(() => { suppressClick = false; }, 80);
        };
        tile.addEventListener('pointermove', move);
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
  let INSTALLED = null;
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

  async function renderDrawer(filter = '') {
    if (INSTALLED === null) {
      INSTALLED = [];
      const caps = await Sov.capabilities();
      INSTALLED = (caps && caps.apps) || [];
      if (S.view !== 'drawer') return;   // navigated away while loading
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

    const grid = Object.entries(cats).map(([cat, list]) => `
          <div class="lx-cat">${esc(cat)}</div>
          <div class="app-grid">${list.map(a => appIcon(a)).join('')}</div>`).join('');

    // real installed apps (deduped against the built-in names). Native Linux and
    // Android apps live in this one list, shown identically — an app's own icon
    // when we have it, a category glyph otherwise. Nothing marks an app "Android".
    const iconSpan = a => {
      const url = a.icon ? Sov.appIconUrl(a.id) : null;
      return url
        ? `<span class="glyph"><img class="app-ico-img" src="${esc(url)}" alt=""></span>`
        : `<span class="glyph">${ic(catIcon(a.categories), 18)}</span>`;
    };
    const builtinNames = new Set(Sov.apps().map(a => a.name.toLowerCase()));
    const inst = INSTALLED
      .filter(a => !builtinNames.has(a.name.toLowerCase()))
      .filter(a => !q || a.name.toLowerCase().includes(q) || (a.comment || '').toLowerCase().includes(q));
    const instHTML = inst.length ? `
      <div class="lx-cat">Apps · ${inst.length}</div>
      <div class="card">${inst.map(a => `
        <button class="row tappable" data-desktop="${esc(a.id)}" style="width:100%;text-align:left">
          ${iconSpan(a)}
          <span class="rtext"><div class="rtitle">${esc(a.name)}</div>
            <div class="rsub">${esc(a.comment || a.id)}</div></span>
          <span class="chev">${ic('chev', 16)}</span></button>`).join('')}</div>` : '';

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

    const nothing = !grid && !instHTML && !spotHTML
      ? `<div class="lx-none">Nothing matches “${esc(filter)}”.</div>` : '';

    $('#drawerScroll').innerHTML = `
      <div class="lx-search">${ic('search',18)}
        <input id="lxInput" placeholder="Search apps, settings, actions" value="${esc(filter)}" autocomplete="off"></div>
      ${spotHTML}${grid}${nothing}${instHTML}
    `;
    const input = $('#lxInput');
    input.oninput = () => renderDrawer(input.value);
    input.onkeydown = e => e.stopPropagation();
    if (filter) { input.focus(); input.setSelectionRange(filter.length, filter.length); }
    bindLaunchers($('#v-drawer'));
    $('#drawerScroll').querySelectorAll('[data-spot]').forEach(b => b.onclick = () => spots[+b.dataset.spot].run());
    // launch real installed apps through the agent (best-effort GUI launch)
    $('#drawerScroll').querySelectorAll('[data-desktop]').forEach(b => b.onclick = async () => {
      const name = b.querySelector('.rtitle').textContent;
      toast('Launching ' + name + '…', '', 'grid');
      const r = await Sov.launchDesktop(b.dataset.desktop);
      if (!r || !r.ok) toast("Couldn't launch " + name, 'alert', 'x');
    });
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
        ${guard('cam', 'cam', 'micOff', 'Camera')}
        ${guard('loc', 'loc', 'loc', 'Location')}
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
  const shead = (eyebrow, title, lead = '') =>
    `<div class="screen-head"><div class="eyebrow">${eyebrow}</div><div class="h1">${title}</div>` +
    (lead ? `<div class="screen-lead">${lead}</div>` : '') + `</div>`;
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
      <div class="section-head"><span class="eyebrow">Intelligence</span></div>
      <div class="card">
        ${srow('spark', 'Assistant', 'Ask the on-device AI', 'assistant')}
        ${srow('brain', 'AI Engine', 'Local models, memory, trust', 'sys-ai')}
      </div>
      <div class="section-head"><span class="eyebrow">Apps</span></div>
      <div class="card">
        ${srow('android', 'Android apps', 'Run Android apps natively · Waydroid', 'sys-android')}
      </div>
      <div class="section-head"><span class="eyebrow">System</span></div>
      <div class="card">
        ${srow('info', 'About', 'Device, OS, hardware', 'sys-about')}
        ${srow('chart', 'System Monitor', 'CPU, memory, processes', 'sys-monitor')}
        ${srow('disk', 'Storage', 'Disks and usage', 'sys-storage')}
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
        ${srow('clock', 'Date & time', st.time, 'sys-datetime')}
      </div>
      <div class="section-head"><span class="eyebrow">Privacy &amp; security</span></div>
      <div class="card">
        ${srow('shieldChk', 'Permissions', 'What every app can access', 'permissions')}
        ${srow('globe', 'Network', 'Connections &amp; blocking', 'network')}
        ${srow('lock', 'Vault', 'Encrypted storage', 'vault')}
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
      await Sov.calendar.op(ev ? 'update' : 'add', event); close(); renderCalendar();
    };
    const del = $('#evDel'); if (del) del.onclick = async () => { await Sov.calendar.op('delete', { id: ev.id }); close(); renderCalendar(); };
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
      const r = await Sov.androidRemove(b.dataset.aremove);
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

  function renderTerminal() {
    if (S.termLines === undefined) {
      const live = Sov.get().mode === 'live';
      S.termLines = [
        { t: 'sys', v: 'AuraOS  ·  ' + (live ? 'GNU/Linux shell' : 'preview shell') },
        { t: 'sys', v: 'Type "help" for commands, "clear" to reset.' },
        { t: 'sys', v: '' },
      ];
    }
    if (!S.termCwd) S.termCwd = Sov.get().mode === 'live' ? '' : '/home/aura';
    drawTerminal();
  }

  function drawTerminal() {
    const scroll = S.termLines.map(l => {
      if (l.t === 'cmd') return `<div class="tl">${promptHTML(l.cwd)}<span class="tl-cmd">${esc(l.v)}</span></div>`;
      if (l.t === 'sys') return `<div class="tl tl-sys">${esc(l.v)}</div>`;
      return `<div class="tl tl-out">${esc(l.v)}</div>`;
    }).join('');
    const liveRow = S.termBusy
      ? `<div class="tl tl-busy">${esc(cwdShort(S.termCwd))} · running…</div>`
      : `<div class="tl tl-live">${promptHTML(S.termCwd)}<input id="termIn" class="term-in"
           autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>`;
    $('#screenScroll').innerHTML = `
      ${shead('System', 'Terminal')}
      <div class="term" id="termBox">${scroll}${liveRow}</div>
      <div style="height:8px"></div>`;
    const box = $('#termBox');
    box.onclick = () => { const i = $('#termIn'); if (i) i.focus(); };
    // Focusing the inline input makes the browser scroll this (overflow-hidden)
    // box horizontally to reveal the caret, pushing the prompt off-screen. Pin
    // horizontal scroll to 0 so the prompt is always flush-left, like a real TTY.
    box.onscroll = () => { if (box.scrollLeft !== 0) box.scrollLeft = 0; };
    box.scrollTop = box.scrollHeight;
    const inp = $('#termIn');
    if (!inp) return;
    setTimeout(() => { inp.focus(); box.scrollLeft = 0; box.scrollTop = box.scrollHeight; }, 30);
    inp.onkeydown = async e => {
      e.stopPropagation();
      const h = S.termHist || (S.termHist = []);
      if (e.key === 'ArrowUp') { if (h.length) { S.termHistIdx = Math.max(0, (S.termHistIdx ?? h.length) - 1); inp.value = h[S.termHistIdx] || ''; moveCaretEnd(inp); } return; }
      if (e.key === 'ArrowDown') { S.termHistIdx = Math.min(h.length, (S.termHistIdx ?? h.length) + 1); inp.value = h[S.termHistIdx] || ''; return; }
      if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); S.termLines = []; drawTerminal(); return; }
      if (e.key !== 'Enter') return;
      const cmd = inp.value;
      // echo the command into the scrollback exactly as a real shell would
      S.termLines.push({ t: 'cmd', v: cmd, cwd: S.termCwd });
      if (cmd.trim()) { h.push(cmd); S.termHistIdx = h.length; }
      if (cmd.trim() === 'clear') { S.termLines = []; drawTerminal(); return; }
      if (!cmd.trim()) { drawTerminal(); return; }   // bare Enter → fresh prompt
      S.termBusy = true; drawTerminal();
      const r = await Sov.exec(cmd, S.termCwd);
      S.termBusy = false;
      if (r.out === '\x00clear') S.termLines = [];
      else if (r.out !== undefined && r.out !== '') S.termLines.push({ t: 'out', v: r.out });
      if (r.cwd) S.termCwd = r.cwd;
      if (S.termLines.length > 300) S.termLines = S.termLines.slice(-300);
      if (S.view === 'terminal') drawTerminal();
    };
  }
  function moveCaretEnd(inp) { setTimeout(() => { const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch (e) {} }, 0); }

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
    $('#screenScroll').querySelector('[data-fmterm]').onclick = () => { S.termCwd = data.path; go('terminal'); };
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
    const mem = await Sov.ai.memory();
    if (!stillOn(id)) return;
    const items = mem.length ? mem.map(m => `<div class="row"><span class="glyph">${ic('memory',18)}</span>
      <span class="rtext"><div class="rtitle" style="font-size:13px">${esc(m.text)}</div>
        <div class="rsub mono">${fmtWhen(m.ts)}</div></span>
      <button class="mini-btn danger" data-delmem="${esc(m.id)}">Delete</button></div>`).join('')
      : '<div class="row muted">No memories yet.</div>';
    $('#screenScroll').innerHTML = `
      ${shead('Intelligence', 'Memory', 'Memory belongs to you: local, editable, and yours to delete. Nothing here is hidden.')}
      <div class="card">${items}</div>
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
    }
    return { desc: null };
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
    if (!res || !res.suggestion || S.view !== 'home') return;
    const sug = res.suggestion, step = sug.plan && sug.plan[0];
    if (!step || !AI_ACTIONS[step.name]) return;
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

  /* ======================================================================
     PERSONALIZE — wallpaper, home focus, and which apps sit on home
     ====================================================================== */
  function renderPersonalize() {
    const apps = Sov.apps();
    const cfg = HOME_CFG || Sov._homeCfgSync();
    const wp = PREF.get('wallpaper', 'petrol');
    const focus = PREF.get('focus', null) || cfg.focus || 'assistant';
    const hPages = homePagesIds();
    const pageOf = id => { for (let i = 0; i < hPages.length; i++) if ((hPages[i] || []).includes(id)) return i; return -1; };

    const swatches = WALLPAPERS.map(w =>
      `<button class="wp-sw ${w.id === wp ? 'on' : ''}" data-wp="${w.id}" style="background:${w.css}">
         <span class="wp-name">${w.name}</span>${w.id === wp ? `<span class="wp-chk">${ic('check',16)}</span>` : ''}</button>`).join('');

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

    const fx = PREF.get('fx', 'aurora');
    const lvl = PREF.get('fxLevel', 'calm');
    const night = PREF.get('nightlight', false);
    const fxChips = FX.map(f => `
      <button class="fx-chip ${f.id === fx ? 'on' : ''}" data-fx="${f.id}">
        <span class="fx-prev" data-p="${f.id}" aria-hidden="true"></span>
        <span class="fx-name">${f.name}</span><span class="fx-sub">${f.sub}</span>
        ${f.id === fx ? `<span class="wp-chk">${ic('check',14)}</span>` : ''}</button>`).join('');
    const lvlSeg = `<div class="seg fxlvl">${FX_LEVELS.map(l =>
      `<button class="${l.id === lvl ? 'on acc' : ''}" data-fxlvl="${l.id}">${l.name}</button>`).join('')}</div>`;

    const insSide = PREF.get('insSide', 'left');
    const insHidden = PREF.get('insHidden', false);
    const theme = PREF.get('theme', 'teal');
    const themeChips = THEMES.map(t => `
      <button class="th-chip ${t.id === theme ? 'on' : ''}" data-th="${t.id}" style="--c:${t.accent}">
        <span class="th-dot" aria-hidden="true"></span>
        <span class="th-name">${t.name}</span></button>`).join('');

    $('#screenScroll').innerHTML = `
      ${shead('Device', 'Personalize', 'Make it yours — nothing here leaves the device.')}
      <div class="section-head"><span class="eyebrow">Color theme</span>
        <span class="muted" style="font-size:11px">tints the UI and the Aura</span></div>
      <div class="th-grid">${themeChips}</div>
      <div class="section-head"><span class="eyebrow">Wallpaper</span></div>
      <div class="wp-grid">${swatches}</div>
      <button class="mini-btn" id="wpFromPhotos" style="margin-top:10px">${ic('photo',14)} Choose from Photos</button>
      <div class="section-head"><span class="eyebrow">Live effects</span>
        <span class="muted" style="font-size:11px">ambient · rendered on-device</span></div>
      <div class="fx-grid">${fxChips}</div>
      <div class="card" style="margin-top:10px">
        <div class="row"><span class="glyph">${ic('spark',18)}</span>
          <span class="rtext"><div class="rtitle">Motion</div><div class="rsub">How alive the ambience feels</div></span>${lvlSeg}</div>
        <button class="row tappable" data-nl style="width:100%;text-align:left"><span class="glyph">${ic('sun',18)}</span>
          <span class="rtext"><div class="rtitle">Night Light</div><div class="rsub">Warm tint across the whole screen</div></span>
          <span class="switch ${night ? 'on' : ''}"></span></button>
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
      <div class="section-head"><span class="eyebrow">Home focus</span></div>
      <div class="card">${focusRow}</div>
      <div class="section-head"><span class="eyebrow">Home pages</span>
        <button class="act" id="addPage">+ Add page</button></div>
      <div class="pa-note">${hPages.length} page${hPages.length > 1 ? 's' : ''} · assign each app to a page or take it off home · swipe between pages on the home screen, drag tiles to reorder</div>
      <div class="card">${appRows}</div>
      <div style="height:8px"></div>`;

    $('#screenScroll').querySelectorAll('[data-wp]').forEach(b => b.onclick = () => {
      PREF.set('wallpaperImg', null); PREF.set('wallpaper', b.dataset.wp); applyWallpaper(); renderPersonalize();
    });
    const wfp = $('#wpFromPhotos'); if (wfp) wfp.onclick = () => openPhotoPicker();
    $('#screenScroll').querySelectorAll('[data-th]').forEach(b => b.onclick = () => {
      PREF.set('theme', b.dataset.th); applyTheme(); renderPersonalize();
    });
    $('#screenScroll').querySelectorAll('[data-fx]').forEach(b => b.onclick = () => {
      PREF.set('fx', b.dataset.fx); applyEffects(); renderPersonalize();
    });
    $('#screenScroll').querySelectorAll('[data-fxlvl]').forEach(b => b.onclick = () => {
      PREF.set('fxLevel', b.dataset.fxlvl); applyEffects(); renderPersonalize();
    });
    const nl = $('#screenScroll').querySelector('[data-nl]');
    if (nl) nl.onclick = () => {
      PREF.set('nightlight', !PREF.get('nightlight', false)); applyEffects(); renderPersonalize();
    };
    $('#screenScroll').querySelectorAll('[data-insside]').forEach(b => b.onclick = () => {
      PREF.set('insSide', b.dataset.insside); applyInsightSide(); updateInsight(); renderPersonalize();
    });
    const isw = $('#screenScroll').querySelector('[data-insshow]');
    if (isw) isw.onclick = () => {
      PREF.set('insHidden', !PREF.get('insHidden', false)); updateInsight(); renderPersonalize();
    };
    $('#focusSel').onchange = e => {
      PREF.set('focus', e.target.value);
      // the focus is the hero card, so pull it out of the page grids
      const pgs = homePagesIds().map(p => (p || []).filter(id => id !== e.target.value));
      PREF.set('homePages', pgs);
      renderPersonalize();
      toast('Home focus set', 'ok', 'check');
    };
    $('#screenScroll').querySelectorAll('[data-appage]').forEach(s => s.onchange = () => {
      const id = s.dataset.appage, target = parseInt(s.value, 10);
      let pgs = homePagesIds().map(p => (p || []).filter(x => x !== id));   // off every page
      if (target >= 0) { while (pgs.length <= target) pgs.push([]); pgs[target].push(id); }
      PREF.set('homePages', pgs); renderPersonalize();
    });
    const ap = $('#addPage');
    if (ap) ap.onclick = () => {
      const pgs = homePagesIds().slice(); pgs.push([]); PREF.set('homePages', pgs);
      renderPersonalize(); toast('Page added', 'ok', 'check');
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
    if (S.view === 'home' && view !== 'home' && typeof Aura !== 'undefined') Aura.stop();
    if (S.appOpen) closeAppFrame(true);
    if (view === S.view) { /* re-render */ }
    else if (push && S.view !== view) S.history.push(S.view);

    S.view = view;
    if (view === 'home')       renderHome();
    else if (view === 'drawer') renderDrawer('');
    else if (SCREENS[view])     SCREENS[view].render();

    const target = view === 'home' ? 'v-home' : view === 'drawer' ? 'v-drawer' : 'v-screen';
    $$('.view').forEach(v => v.classList.toggle('active', v.id === target));
    $('#screenScroll').parentElement.scrollTop = 0;
    updateHelm();
  }

  function goHome() {
    S.history = [];
    closeControl();
    if (S.homeEdit) S.homeEdit = false;   // the home button also finishes editing
    if (S.appOpen) closeAppFrame(true);
    go('home', { push: false });
  }

  function back() {
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
      b.onclick = () => launch(b.dataset.launch));
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
    return `<div class="af-placeholder">
      <div class="af-badge" style="--tint:${app.color}">${ic(app.glyph,30)}</div>
      <div class="af-name">${esc(app.name)}</div>
      <div class="af-note">${note}</div></div>`;
  }

  function openAppFrame(app) {
    S.appOpen = app.id;
    const view = APP_VIEWS[app.id];
    $('#appframe').innerHTML = `
      <div class="af-app">
        <div class="af-bar">
          <button class="af-nav" id="afBack" aria-label="Back">${ic('back',18)}</button>
          <span class="af-title"><span class="af-dot" style="background:${app.color}"></span>${esc(app.name)}</span>
          <button class="af-nav" id="afHome" aria-label="Home">${ic('home',16)}</button>
        </div>
        <div class="af-view" id="afView">${view ? view.render(app) : placeholderView(app)}</div>
      </div>`;
    $('#afBack').onclick = () => back();
    $('#afHome').onclick = () => goHome();
    if (view && view.wire) { try { view.wire(app); } catch (e) {} }
    $('#appframe').classList.add('open');
    if (typeof Aura !== 'undefined') Aura.stop();   // home is covered
    updateHelm();
    updateInsight();   // margin now reflects THIS app's access, net, resources
  }
  function closeAppFrame(silent) {
    // Backgrounding an app does NOT release its sensors — a running app can keep
    // using mic/camera/location in the background. Sensors release only when the
    // app is actually closed (recents), cut off, or its permission is revoked.
    const id = S.appOpen, view = id && APP_VIEWS[id];
    if (view && view.close) { try { view.close(); } catch (e) {} }
    $('#appframe').classList.remove('open');
    $('#appframe').innerHTML = '';   // tear down iframes / video cleanly
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
  function renderLock() {
    const st = Sov.get();
    const dots = [0, 1, 2, 3].map(i => `<span class="ld ${i < S.pin.length ? 'f' : ''}"></span>`).join('');
    const key = (v, cls = '', extra = '') => `<button class="key ${cls}" ${extra}>${v}</button>`;
    const notifs = Sov.notify.list().slice(0, 4);
    const lockNotifs = notifs.length
      ? `<div class="lock-notifs">${notifs.map(n => notifCardHTML(n, { locked: true })).join('')}</div>`
      : '';
    $('#lock').innerHTML = `
      <div class="home2-aura" aria-hidden="true"></div>
      <div class="lock-clock">${st.time}</div>
      <div class="lock-date">${esc(st.date)}</div>
      <div class="lock-status">${ic('shieldChk',14)} Encrypted &amp; sealed</div>
      ${lockNotifs}
      <div class="lock-spacer"></div>
      <div class="lock-hint">Enter PIN to unlock</div>
      <div class="lock-dots" id="lockDots">${dots}</div>
      <div class="keypad">
        ${[1,2,3,4,5,6,7,8,9].map(n => key(n,'','data-k="'+n+'"')).join('')}
        <button class="key fn" data-k="clear">Clear</button>
        ${key(0,'','data-k="0"')}
        <button class="key fn" data-k="back">⌫</button>
      </div>`;
    $('#lock').querySelectorAll('[data-k]').forEach(b => b.onclick = () => onKey(b.dataset.k));
  }
  async function onKey(k) {
    if (k === 'clear') { S.pin = ''; return renderLock(); }
    if (k === 'back')  { S.pin = S.pin.slice(0, -1); return renderLock(); }
    if (S.pin.length >= 6) return;
    S.pin += k;
    renderLock();
    if (S.pin.length === 4) {
      const ok = await Sov.unlock(S.pin);
      if (ok) unlockDevice();
      else {
        const d = $('#lockDots'); d.classList.add('err');
        setTimeout(() => { S.pin = ''; renderLock(); }, 450);
      }
    }
  }
  function unlockDevice() {
    S.locked = false;
    $('#lock').classList.add('hidden');
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
    // refresh the honest surfaces if visible — patch in place, don't rebuild
    if (!S.locked && S.view === 'home' && !S.appOpen) {
      const clk = $('#homeClock'); if (clk) clk.textContent = st.time;
      const as = $('#auraStatus'); if (as) as.innerHTML = auraStatusHTML();
      if (typeof Aura !== 'undefined') Aura.setSensors(activeSensorKinds());
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
    $('#homeOrb').onclick = () => { if (S.locked) return; goHome(); };
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

  function toggleActivity() {
    const running = Sov.running();
    if (!running.length) return toast('No apps running', '', 'layers');
    // simple recents: show a control-like sheet listing running apps
    renderControlRecents(running);
    $('#control').classList.add('open'); S.controlOpen = true;
  }
  function renderControlRecents(running) {
    S.recentsOpen = true;
    const items = running.map(r => {
      const a = Sov.app(r.appId);
      const sens = Sov.activeSensorsFor(a.id);
      return `<div class="row">
        <span class="li-badge" style="--tint:${a.color}">${ic(a.glyph,16)}</span>
        <span class="rtext"><div class="rtitle">${esc(a.name)}</div>
        <div class="rsub">${sens.length ? sens.map(s=>cap(labelFor(s))).join(' · ') : 'running'}</div></span>
        <button class="mini-btn danger" data-kill="${a.id}">Close</button></div>`;
    }).join('');
    $('#controlBody').innerHTML = `
      <div class="section-head"><span class="eyebrow">Running apps</span>
        <button class="act" data-nav="__control">Quick settings ›</button></div>
      <div class="card">${items}</div>`;
    $('#controlBody').querySelectorAll('[data-kill]').forEach(b => b.onclick = () => {
      Sov.closeApp(b.dataset.kill);
      const rn = Sov.running();
      if (rn.length) renderControlRecents(rn); else { closeControl(); if (S.view==='home') renderHome(); }
      updateHelm();
    });
    $('#controlBody').querySelector('[data-nav="__control"]').onclick = () => { S.ctlTab = 'controls'; renderControl(); };
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

  async function boot() {
    bindGlobal();
    applyWallpaper();
    applyTheme();
    applyEffects();
    seedNotifications();
    Sov.notify.subscribe(onNotify);
    Sov.onUpdate(onUpdate);
    document.addEventListener('visibilitychange', () => {
      if (typeof Aura === 'undefined') return;
      if (document.hidden) Aura.stop();
      else if (!S.locked && S.view === 'home' && !S.appOpen) Aura.start();
    });
    renderLock();
    renderPane(Sov.get());
    buildInsight();                      // the left privacy/status margin
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
