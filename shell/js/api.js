/* ============================================================================
   Aura Shell — system bridge
   ----------------------------------------------------------------------------
   The shell talks to the device through one small API. On real hardware that
   API is served by aura-agent (localhost:8787), which reads /sys, drives
   nmcli/brightness, launches apps, and owns the permission + network stores.

   When the agent isn't reachable (opened in a plain browser on a VM or for
   design review), we fall back to a faithful in-memory SIMULATION so the whole
   shell is fully explorable — clock ticks, battery drains, launching an app
   triggers a real "ask once" permission prompt, sensors light the trust ribbon,
   the network log grows. Same data contract either way.
   ============================================================================ */

const Sov = (() => {
  const AGENT = 'http://127.0.0.1:8787';
  let mode = 'sim';                 // 'live' once the agent answers
  const listeners = new Set();

  // Per-boot session token the agent injects into the shell HTML (window.
  // __AURA_TOKEN__). Attached to every /api/* call so the agent can tell the
  // legitimate shell from any other local process. Absent in pure-sim (opened
  // from file:// or a plain static server) — then there's no agent to talk to.
  const TOKEN = (typeof window !== 'undefined' && window.__AURA_TOKEN__) || '';
  const authHeaders = () => (TOKEN ? { 'X-Aura-Token': TOKEN } : {});

  /* ---- Home layout: cached config + built-in fallback -------------------- */
  let _homeCfg = null;
  const DEFAULT_HOME = {
    version: 1, generatedBy: 'fallback', focus: 'assistant', greeting: null,
    ambient: { hue: 191, density: 1, motion: 1 },
    clusters: {
      core: { angle: 270 }, comms: { angle: 205 }, explore: { angle: 330 },
      capture: { angle: 70 }, make: { angle: 135 },
    },
    nodes: [
      { app: 'assistant', cluster: 'core', weight: 1.5 },
      { app: 'phone', cluster: 'comms', weight: 1.0 },
      { app: 'messages', cluster: 'comms', weight: 0.95 },
      { app: 'browser', cluster: 'explore', weight: 1.05 },
      { app: 'maps', cluster: 'explore', weight: 0.9 },
      { app: 'camera', cluster: 'capture', weight: 0.95 },
      { app: 'photos', cluster: 'capture', weight: 0.85 },
      { app: 'music', cluster: 'capture', weight: 0.8 },
      { app: 'notes', cluster: 'make', weight: 0.85 },
      { app: 'files', cluster: 'make', weight: 0.8 },
      { app: 'settings', cluster: 'make', weight: 0.7 },
    ],
    links: [
      ['assistant', 'phone'], ['assistant', 'browser'], ['assistant', 'notes'],
      ['assistant', 'camera'], ['phone', 'messages'], ['browser', 'maps'],
      ['camera', 'photos'], ['photos', 'music'], ['notes', 'files'], ['files', 'settings'],
    ],
  };

  /* ---- App catalogue (shared by sim + live; live agent maps id→exec) ---- */
  const APPS = [
    { id: 'phone',    name: 'Phone',    glyph: 'phone',   color: '#2BA869', cat: 'Essentials', fav: true,  uses: ['mic'] },
    { id: 'messages', name: 'Messages', glyph: 'msg',     color: '#2E7FD6', cat: 'Essentials', fav: true },
    { id: 'contacts', name: 'Contacts', glyph: 'contacts',color: '#7A5AD6', cat: 'Essentials', fav: true,  perms: ['contacts'] },
    { id: 'browser',  name: 'Browser',  glyph: 'browser', color: '#D6772E', cat: 'Essentials', fav: true,  net: true },
    { id: 'assistant',name: 'Assistant',glyph: 'spark',   color: '#5A3AD6', cat: 'Essentials', fav: true },
    { id: 'appstore', name: 'App Store', glyph: 'store',   color: '#2BA869', cat: 'Essentials', fav: true,  net: true },
    { id: 'camera',   name: 'Camera',   glyph: 'cam',     color: '#C0392B', cat: 'Media', uses: ['cam','mic'] },
    { id: 'photos',   name: 'Photos',   glyph: 'photo',   color: '#1B9AA8', cat: 'Media', perms: ['files'] },
    { id: 'music',    name: 'Music',    glyph: 'music',   color: '#C0392B', cat: 'Media' },
    { id: 'maps',     name: 'Maps',     glyph: 'map',     color: '#2BA869', cat: 'Media', uses: ['loc'], net: true },
    { id: 'files',    name: 'Files',    glyph: 'files',   color: '#8896A6', cat: 'Tools', perms: ['files'] },
    { id: 'notes',    name: 'Notes',    glyph: 'note',    color: '#C8A020', cat: 'Tools' },
    { id: 'calc',     name: 'Calculator',glyph:'calc',    color: '#4A5A6A', cat: 'Tools' },
    { id: 'clock',    name: 'Clock',    glyph: 'clock',   color: '#2E7FD6', cat: 'Tools' },
    { id: 'calendar', name: 'Calendar', glyph: 'calendar',color: '#C0392B', cat: 'Tools' },
    { id: 'terminal', name: 'Terminal', glyph: 'terminal',color: '#1B2D3A', cat: 'System', net: true },
    { id: 'sync',     name: 'Sync',     glyph: 'sync',    color: '#1B82A8', cat: 'System', net: true },
    { id: 'monitor',  name: 'System',   glyph: 'chart',   color: '#1B6E5A', cat: 'System' },
    { id: 'settings', name: 'Settings', glyph: 'gear',    color: '#3A4A5A', cat: 'System' },
  ];

  /* ---- Simulated device state --------------------------------------------- */
  const sim = {
    battery: { level: 78, charging: false },
    net: { wifi: true, ssid: 'home-mesh', strength: 3, bluetooth: false, airplane: false, vpn: false },
    brightness: 72,
    volume: 45,
    sensors: { mic: null, cam: null, loc: null },  // holds appId while active
    vault: { unlocked: true, usedPct: 34, algo: 'fscrypt · AES-256-XTS' },
    disk: { encrypted: true, algo: 'LUKS2 · aes-xts-plain64' },
    running: [],                                    // [{appId, since}]
    perms: {},                                      // appId -> {key: 'allow'|'ask'|'deny'}
    netlog: [
      { appId: 'sync',    host: 'device-b.local',     count: 42, blocked: false, when: '2m' },
      { appId: 'browser', host: 'duckduckgo.com',      count: 17, blocked: false, when: '5m' },
      { appId: 'maps',    host: 'tile.osm.org',        count: 8,  blocked: false, when: '11m' },
      { appId: 'messages',host: 'push.telemetry.net',  count: 1,  blocked: true,  when: '1h' },
    ],
  };
  // default permission posture: sensitive perms start at "ask"
  APPS.forEach(a => {
    sim.perms[a.id] = { camera: 'ask', mic: 'ask', location: 'ask', contacts: 'ask', files: 'ask', network: 'allow' };
  });

  function emit() { const st = snapshot(); listeners.forEach(fn => { try { fn(st); } catch (e) {} }); }

  function snapshot() {
    const now = new Date();
    const activeSensors = {};
    for (const k of ['mic', 'cam', 'loc']) if (sim.sensors[k]) activeSensors[k] = sim.sensors[k];
    return {
      mode,
      time: fmtTime(now), date: fmtDate(now), stamp: now.getTime(),
      battery: { ...sim.battery },
      net: { ...sim.net },
      brightness: sim.brightness,
      volume: sim.volume,
      sensors: activeSensors,                 // {mic:'camera', cam:'camera', loc:'maps'}
      vault: { ...sim.vault },
      disk: { ...sim.disk },
      running: sim.running.map(r => ({ ...r })),
      apps: APPS.map(a => ({ ...a })),
    };
  }

  /* ---- Formatting --------------------------------------------------------- */
  function fmtTime(d) {
    let h = d.getHours(), m = d.getMinutes();
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function fmtDate(d) {
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  /* ---- Live-agent probe + status merge ------------------------------------ */
  // In live mode the device's real state (battery, wifi, brightness, volume,
  // vault, disk) comes from the agent; we merge only the keys it actually
  // reports and leave shell-tracked state (running apps, per-app sensor holds)
  // alone, since those are driven by the shell's own launch/permission flow.
  function mergeStatus(s) {
    if (!s) return;
    if (s.battery)    Object.assign(sim.battery, s.battery);
    if (s.net)        Object.assign(sim.net, s.net);
    if (typeof s.brightness === 'number') sim.brightness = s.brightness;
    if (typeof s.volume === 'number')     sim.volume = s.volume;
    if (s.vault)      Object.assign(sim.vault, s.vault);
    if (s.disk)       Object.assign(sim.disk, s.disk);
    emit();
  }

  // Talking to the agent over loopback is *usually* instant, but a browser
  // pooling keep-alive connections to Python's http.server occasionally throws a
  // transient "NetworkError" (a reused socket the server had reaped). curl never
  // sees it because it never reuses. So we retry on a thrown network error —
  // but NOT on a real timeout (the request genuinely took too long), and callers
  // that must never double-fire (a shell command) can pass tries:1.
  async function fetchJSON(path, { method = 'GET', body, timeout = 5000, tries = 3 } = {}) {
    for (let i = 0; i < tries; i++) {
      try {
        const opts = { method, signal: AbortSignal.timeout(timeout), headers: authHeaders() };
        if (body !== undefined) {
          opts.headers['content-type'] = 'application/json';
          opts.body = JSON.stringify(body);
        }
        const r = await fetch(AGENT + path, opts);
        return r.ok ? await r.json() : null;      // an HTTP error status isn't retried
      } catch (e) {
        if (e && e.name === 'TimeoutError') return null;   // genuine timeout — don't retry
        if (i === tries - 1) return null;                  // out of attempts
        await new Promise(res => setTimeout(res, 90 * (i + 1)));   // 90ms, 180ms backoff
      }
    }
    return null;
  }

  async function getJSON(path) {
    // 3.5s (not 1.2s): under heavy CPU load — e.g. a local model mid-inference —
    // even a cheap status read can lag. A tight abort here just churns the
    // browser's connection pool and knocks out the very request we're waiting on.
    return fetchJSON(path, { timeout: 3500, tries: 3 });
  }

  // While the assistant is mid-inference the CPU is saturated; the 2s status
  // poll would abort and poison the connection pool. Pause it during a chat.
  let aiBusy = false;

  async function probe() {
    const s = await getJSON('/api/status');
    if (s) {
      mode = 'live';
      // seed the stores the shell reads synchronously
      const p = await getJSON('/api/permissions'); if (p) Object.assign(sim.perms, p);
      const n = await getJSON('/api/netlog');      if (Array.isArray(n)) sim.netlog = n;
      mergeStatus(s);
      startPoll();
      return true;
    }
    mode = 'sim';
    return false;
  }

  let polling = false;
  function startPoll() {
    if (polling) return; polling = true;
    setInterval(async () => {
      if (mode !== 'live' || aiBusy) return;
      mergeStatus(await getJSON('/api/status'));
    }, 2000);
  }

  /* ---- Actions ------------------------------------------------------------ */
  // `timeout` is per-call: quick UI actions (toggles, permission writes) want a
  // snappy cap, but genuinely long operations — local AI inference, a shell
  // command, joining a Wi-Fi network — must be allowed to take their time. The
  // old fixed 3s cap silently aborted all of those and made them look broken.
  async function post(path, body, timeout = 5000, tries = 3) {
    if (mode !== 'live') return null;
    return fetchJSON(path, { method: 'POST', body: body || {}, timeout, tries });
  }

  /* ---- Android layer (Waydroid) — sim mirror -----------------------------
     In preview/sim mode there's no real container, so we model an initialized,
     idle runtime with a couple of light F-Droid apps. Live mode replaces all of
     this with the agent's /api/android/* answers. Same data shape either way. */
  const simAndroid = {
    initialized: true, sessionRunning: false, idleTimeout: 600, storeInstalled: true,
    apps: [
      { name: 'F-Droid', package: 'org.fdroid.fdroid' },
      { name: 'NewPipe', package: 'org.schabi.newpipe' },
    ],
    // A representative slice of the agent's F-Droid catalogue so the App Store
    // is fully browsable in a plain-browser preview (live mode replaces this).
    catalog: [
      { package: 'org.mozilla.fennec_fdroid', name: 'Firefox', summary: 'Private, open web browser', category: 'Internet' },
      { package: 'com.wireguard.android', name: 'WireGuard', summary: 'Fast, modern, secure VPN', category: 'Internet' },
      { package: 'im.vector.app', name: 'Element', summary: 'Secure Matrix chat & calls', category: 'Internet' },
      { package: 'org.videolan.vlc', name: 'VLC', summary: 'Plays almost any media', category: 'Multimedia' },
      { package: 'org.schabi.newpipe', name: 'NewPipe', summary: 'Lightweight YouTube frontend', category: 'Multimedia' },
      { package: 'net.osmand.plus', name: 'OsmAnd~', summary: 'Offline maps & navigation', category: 'Navigation' },
      { package: 'app.organicmaps', name: 'Organic Maps', summary: 'Fast offline maps, no tracking', category: 'Navigation' },
      { package: 'com.x8bit.bitwarden', name: 'Bitwarden', summary: 'Open-source password manager', category: 'Security' },
      { package: 'com.beemdevelopment.aegis', name: 'Aegis', summary: '2-factor authenticator', category: 'Security' },
      { package: 'com.aurora.store', name: 'Aurora Store', summary: 'Install Play Store apps, no account', category: 'System' },
      { package: 'com.termux', name: 'Termux', summary: 'A Linux terminal & environment', category: 'System' },
      { package: 'net.gsantner.markor', name: 'Markor', summary: 'Markdown notes & to-dos', category: 'Writing' },
    ],
  };

  // Cellular (A7670E) sim state — a registered modem so Phone/Messages are
  // fully explorable in the browser preview; live mode uses ModemManager.
  const simModem = {
    call: null,
    sms: [
      { id: 's1', number: '+1 555 0142', text: 'Landing in 20 — see you at the gate.', sent: false, unread: true, time: '' },
      { id: 's2', number: '+1 555 0173', text: 'Thanks for the update!', sent: true, unread: false, time: '' },
    ],
  };
  // Contacts sim store (editable) — live mode uses the agent's persisted store.
  let simContacts = [
    { id: 'c1', name: 'Ada Lovelace', number: '+1 555 0110' },
    { id: 'c2', name: 'Alan Turing', number: '+1 555 0127' },
    { id: 'c3', name: 'Grace Hopper', number: '+1 555 0143' },
    { id: 'c4', name: 'Linus Torvalds', number: '+1 555 0168' },
  ];
  // Calendar sim store (live mode uses the agent's persisted store).
  const _today = new Date();
  const _iso = d => d.toISOString().slice(0, 10);
  let simCal = [
    { id: 'e1', title: 'Team sync', date: _iso(_today), time: '10:00', notes: '' },
    { id: 'e2', title: 'Flash the Pi image', date: _iso(new Date(_today.getTime() + 2 * 864e5)), time: '15:30', notes: '' },
  ];

  const api = {
    onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get() { return snapshot(); },
    get mode() { return mode; },
    apps() { return APPS.map(a => ({ ...a })); },
    app(id) { const a = APPS.find(x => x.id === id); return a ? { ...a } : null; },

    /* ---- Notifications — a real system notification service ------------
       Classic OS notifications, done the Aura way: local-only, every
       entry names its source, its content is hidden on the lock screen
       unless you opt in, and Do Not Disturb is one tap. Persisted per-device
       (localStorage) so the list survives a reload, like a real device. This
       lives in the bridge so it's one service every screen shares; today the
       shell is the only producer, but the same push() is what an agent event
       channel (roadmap 4.8.1) will call when it lands. */
    notify: (() => {
      const KEY = 'sov.notif.v1', DKEY = 'sov.notif.dnd', LKEY = 'sov.notif.lockContent';
      const subs = new Set();
      let list = [];
      try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { list = []; }
      const flag = (k, v, d) => {
        if (v === undefined) { try { const s = localStorage.getItem(k); return s == null ? d : s === '1'; } catch (e) { return d; } }
        try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {}
        return v;
      };
      const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 60))); } catch (e) {} };
      const fire = () => { save(); subs.forEach(fn => { try { fn(list.slice()); } catch (e) {} }); };
      return {
        subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
        list() { return list.slice(); },
        unseen() { return list.reduce((n, x) => n + (x.seen ? 0 : 1), 0); },
        push(n) {
          const item = {
            id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            app: n.app || 'system', title: n.title || '', body: n.body || '',
            icon: n.icon || 'bell', color: n.color || null, nav: n.nav || null,
            ts: Math.floor(Date.now() / 1000), seen: false,
          };
          list.unshift(item);
          if (list.length > 60) list.length = 60;
          fire();
          return item;
        },
        dismiss(id) { const before = list.length; list = list.filter(n => n.id !== id); if (list.length !== before) fire(); },
        clear() { if (list.length) { list = []; fire(); } },
        markAllSeen() { let ch = false; for (const n of list) if (!n.seen) { n.seen = true; ch = true; } if (ch) fire(); },
        dnd(v) { return flag(DKEY, v, false); },
        showOnLock(v) { return flag(LKEY, v, false); },
      };
    })(),

    /* ---- Home layout config -------------------------------------------- */
    // Served as a static file by the agent (and by any http server). In Phase
    // II the AI Engine rewrites it from time of day + learned routine; the
    // shell only renders whatever config it finds. Falls back to a built-in
    // default so the home screen is never empty, even offline / from file://.
    async homeConfig() {
      if (_homeCfg) return _homeCfg;
      try {
        const r = await fetch('home.config.json', { cache: 'no-store' });
        if (r.ok) { _homeCfg = await r.json(); return _homeCfg; }
      } catch (e) {}
      _homeCfg = DEFAULT_HOME;
      return _homeCfg;
    },
    // Synchronous access for render paths — returns whatever's cached (the
    // agent/file config once homeConfig() has run) or the built-in fallback.
    _homeCfgSync() { return _homeCfg || DEFAULT_HOME; },

    perms(id) { return { ...(sim.perms[id] || {}) }; },
    allPerms() { const o = {}; for (const a of APPS) o[a.id] = { ...sim.perms[a.id] }; return o; },
    setPerm(id, key, val) {
      sim.perms[id] = sim.perms[id] || {};
      sim.perms[id][key] = val;
      post('/api/permission', { app: id, key, value: val });
      // revoking a permission that is live cuts it immediately
      if (val === 'deny') {
        for (const s of ['mic', 'cam', 'loc']) {
          const map = { mic: 'mic', cam: 'camera', loc: 'location' };
          if (sim.sensors[s] === id && key === map[s]) sim.sensors[s] = null;
        }
      }
      emit();
    },

    netlog() { return sim.netlog.map(n => ({ ...n })); },
    blockHost(idx) {
      if (sim.netlog[idx]) { sim.netlog[idx].blocked = true; post('/api/block', { host: sim.netlog[idx].host }); emit(); }
    },

    running() { return sim.running.map(r => ({ ...r })); },
    isRunning(id) { return sim.running.some(r => r.appId === id); },

    // hostLaunch=false → the app runs *inside* the shell (in-phone app view), so
    // we do NOT ask the agent to spawn a desktop app on the host machine. We keep
    // the running/recents bookkeeping and (live) let the AI observe the launch.
    async launch(id, hostLaunch = true) {
      const app = this.app(id);
      if (!app) return { ok: false };
      if (hostLaunch) await post('/api/launch', { app: id });
      else if (mode === 'live') post('/api/ai/observe', { event: 'open_app', data: { name: id } }, 8000, 1);
      // Live: the agent observes the launch for routine-learning. Sim: mirror it
      // here so the browser preview learns from behaviour too (same data shape).
      if (mode !== 'live') SIMAI.observe('open_app', { name: id });
      if (!this.isRunning(id)) sim.running.unshift({ appId: id, since: Date.now() });
      emit();
      return { ok: true, app };
    },
    closeApp(id) {
      sim.running = sim.running.filter(r => r.appId !== id);
      for (const s of ['mic', 'cam', 'loc']) if (sim.sensors[s] === id) sim.sensors[s] = null;
      post('/api/close', { app: id });
      emit();
    },

    /* ---- Android apps (Waydroid) --------------------------------------------
       The agent keeps the heavy Android session off until it's needed and
       reclaims its RAM when idle, so these are thin controls over that. In sim
       mode we answer from simAndroid so the whole panel is explorable offline. */
    async androidStatus() {
      if (mode === 'live') {
        const s = await getJSON('/api/android/status');
        if (s) return s;   // includes the honest {available:false} when not installed
      }
      // sim (or a transient live fetch miss): show an explorable, idle runtime
      return { available: true, initialized: simAndroid.initialized,
               sessionRunning: simAndroid.sessionRunning, containerRunning: true,
               idleTimeout: simAndroid.idleTimeout, sim: true, memory: {},
               store: { package: 'org.fdroid.fdroid', name: 'F-Droid',
                        installed: simAndroid.storeInstalled } };
    },
    async androidStore(action) {
      if (mode === 'live') return post('/api/android/store', { action }, 180000, 1);
      if (action === 'install') { simAndroid.storeInstalled = true; return { ok: true, sim: true }; }
      return { ok: true, sim: true };   // open
    },
    async androidApps() {
      if (mode === 'live') {
        const r = await getJSON('/api/android/apps');
        if (r) return r.apps || [];
      }
      return simAndroid.apps.map(a => ({ ...a }));
    },
    async androidLaunch(pkg) {
      if (mode === 'live') return post('/api/android/launch', { package: pkg }, 20000, 1);
      simAndroid.sessionRunning = true;                 // sim: starting the session
      emit();
      return { ok: true, package: pkg, sim: true };
    },
    async androidInstall(source) {
      // install can download + push an APK — allow real time, never retry-fire
      if (mode === 'live') return post('/api/android/install', { source }, 180000, 1);
      const name = String(source).split('/').pop().replace(/\.apk$/i, '') || 'App';
      simAndroid.apps.push({ name, package: 'sim.' + name.toLowerCase() });
      return { ok: true, sim: true };
    },
    async androidRemove(pkg) {
      if (mode === 'live') return post('/api/android/remove', { package: pkg }, 30000, 1);
      simAndroid.apps = simAndroid.apps.filter(a => a.package !== pkg);
      return { ok: true, sim: true };
    },
    async androidSession(action) {
      if (mode === 'live') return post('/api/android/session', { action }, 25000, 1);
      simAndroid.sessionRunning = (action === 'start');
      emit();
      return { ok: true, sim: true };
    },
    // Hand the screen to the full Android UI (Android's own settings/homescreen).
    // An escape hatch — the everyday path is launching individual apps.
    async androidShow() {
      if (mode === 'live') return post('/api/android/show', {}, 20000, 1);
      simAndroid.sessionRunning = true;                 // sim: session comes up
      emit();
      return { ok: true, sim: true };
    },
    // The in-shell F-Droid App Store: browse the catalogue (instant, no APK
    // download) and install by package id (resolves + pulls the APK live).
    async androidStoreCatalog(query) {
      if (mode === 'live') {
        const r = await getJSON('/api/android/store/catalog' +
          (query ? '?q=' + encodeURIComponent(query) : ''));
        if (r) return r;
      }
      const installed = new Set(simAndroid.apps.map(a => a.package));
      const q = (query || '').trim().toLowerCase();
      const apps = simAndroid.catalog
        .filter(a => !q || (a.name + ' ' + a.summary + ' ' + a.category + ' ' + a.package).toLowerCase().includes(q))
        .map(a => ({ ...a, installed: installed.has(a.package) }));
      const categories = [...new Set(simAndroid.catalog.map(a => a.category))].sort();
      return { available: true, source: 'F-Droid', categories, apps, sim: true };
    },
    async androidStoreInstall(pkg) {
      // resolves the APK from F-Droid then installs — allow real time, no retry
      if (mode === 'live') return post('/api/android/store/install', { package: pkg }, 180000, 1);
      const hit = simAndroid.catalog.find(a => a.package === pkg);
      if (hit && !simAndroid.apps.some(a => a.package === pkg)) {
        simAndroid.apps.push({ name: hit.name, package: hit.package });
      }
      return { ok: true, sim: true };
    },

    /* ---- Cellular modem (A7670E): phone · SMS · GPS -------------------------
       Live goes through the agent → ModemManager. In sim we model a registered
       modem so the Phone/Messages apps are fully explorable in the browser. */
    phone: {
      async status() {
        if (mode === 'live') { const s = await getJSON('/api/phone/status'); if (s) return s; }
        return { available: true, present: true, state: 'registered', operator: 'AuraNet',
                 tech: 'lte', signal: 82, number: '+1 555 0100', dataConnected: true, sim: true };
      },
      async dial(number) {
        if (mode === 'live') return post('/api/phone/dial', { number }, 30000, 1);
        simModem.call = { number, state: 'dialing', direction: 'outgoing' };
        setTimeout(() => { if (simModem.call) simModem.call.state = 'active'; }, 1200);
        return { ok: true, sim: true };
      },
      async answer() { if (mode === 'live') return post('/api/phone/answer', {}, 20000, 1);
        if (simModem.call) simModem.call.state = 'active'; return { ok: true, sim: true }; },
      async hangup() { if (mode === 'live') return post('/api/phone/hangup', {}, 20000, 1);
        simModem.call = null; return { ok: true, sim: true }; },
      async state() {
        if (mode === 'live') { const s = await getJSON('/api/phone/state'); if (s) return s; }
        return { available: true, calls: simModem.call ? [simModem.call] : [], sim: true };
      },
    },
    sms: {
      async list() {
        if (mode === 'live') { const s = await getJSON('/api/sms'); if (s) return s; }
        return { available: true, present: true, messages: simModem.sms.map(m => ({ ...m })) };
      },
      async send(number, text) {
        if (mode === 'live') return post('/api/sms/send', { number, text }, 45000, 1);
        simModem.sms.push({ id: 's' + Date.now(), number, text, sent: true, unread: false, time: '' });
        return { ok: true, sim: true };
      },
    },
    async location() {
      if (mode === 'live') { const s = await getJSON('/api/location'); if (s) return s; }
      return { available: true, present: true, fix: { lat: 51.5024, lon: -0.1348, alt: '11' }, sim: true };
    },

    // called by shell when an app actually acquires a sensor (after grant)
    acquireSensor(kind, appId) {          // kind: 'mic' | 'cam' | 'loc'
      sim.sensors[kind] = appId; emit();
    },
    releaseSensor(kind, appId) {
      if (sim.sensors[kind] === appId) { sim.sensors[kind] = null; emit(); }
    },
    activeSensorsFor(appId) {
      return ['mic', 'cam', 'loc'].filter(k => sim.sensors[k] === appId);
    },

    // control-center toggles
    setToggle(key, val) {
      if (key === 'airplane') {
        sim.net.airplane = val;
        if (val) { sim.net.wifi = false; sim.net.bluetooth = false; }
      } else if (key in sim.net) {
        sim.net[key] = val;
        if (val && sim.net.airplane) sim.net.airplane = false;
      }
      post('/api/toggle', { key, value: val });
      if (mode !== 'live' && (key === 'wifi' || key === 'bluetooth')) SIMAI.observe('toggle_' + key, { on: val });
      emit();
    },
    setLevel(key, val) {              // brightness / volume
      sim[key] = val; post('/api/level', { key, value: val });
      if (mode !== 'live' && (key === 'brightness' || key === 'volume')) SIMAI.observe('set_' + key, { percent: val });
      emit();
    },
    setVault(unlocked) { sim.vault.unlocked = unlocked; post('/api/vault', { unlocked }); emit(); },

    // privacy master kill: force-deny a sensor class for everything, now
    killSensorClass(kind) {           // 'mic'|'cam'|'loc'
      const map = { mic: 'mic', cam: 'cam', loc: 'loc' };
      sim.sensors[map[kind]] = null;
      const pk = { mic: 'mic', cam: 'camera', loc: 'location' }[kind];
      for (const a of APPS) { sim.perms[a.id][pk] = 'deny'; }
      post('/api/kill', { kind });
      emit();
    },

    async unlock(pin) {
      if (mode === 'live') { const r = await post('/api/unlock', { pin }); return r ? r.ok : false; }
      return String(pin).length >= 4;      // sim: any 4+ digits
    },

    /* ---- Linux system integration -------------------------------------- */
    async system()    { return (mode === 'live' && await getJSON('/api/system'))    || SIM.system(); },
    async processes() { return (mode === 'live' && await getJSON('/api/processes')) || SIM.processes(); },
    async storage()   { return (mode === 'live' && await getJSON('/api/storage'))   || SIM.storage(); },
    async wifiScan()  { return (mode === 'live' && await getJSON('/api/wifi'))       || SIM.wifi(); },
    async wifiConnect(ssid, password) {
      if (mode === 'live') { const r = await post('/api/wifi/connect', { ssid, password }, 30000); return r || { ok: false }; }
      sim.net.wifi = true; sim.net.ssid = ssid; sim.net.airplane = false; emit();
      return { ok: true, msg: 'connected (preview)' };
    },
    async power(action) {
      if (mode === 'live') { await post('/api/power', { action }); return { ok: true }; }
      return { ok: true, msg: 'preview' };   // sim: no-op
    },
    async exec(cmd, cwd) {
      // tries:1 — a shell command must never be silently re-run by a retry.
      if (mode === 'live') { const r = await post('/api/exec', { cmd, cwd }, 25000, 1); if (r) return r; }
      return SIM.exec(cmd, cwd);
    },
    async getTimezone() {
      if (mode === 'live') { const r = await getJSON('/api/timezone'); if (r) return r.timezone; }
      return sim.timezone;
    },
    async setTimezone(tz) {
      if (mode === 'live') { const r = await post('/api/timezone', { timezone: tz }); return r ? r.timezone : tz; }
      sim.timezone = tz; return tz;
    },

    /* ---- Files — a real file manager (agent-backed; sim in the browser) --- */
    files: {
      async list(path, hidden) {
        if (mode === 'live') {
          const r = await getJSON('/api/files/list?path=' + encodeURIComponent(path || '') + (hidden ? '&hidden=1' : ''));
          if (r) return r;
        }
        return SIMFILES.list(path, hidden);
      },
      async read(path) {
        if (mode === 'live') { const r = await getJSON('/api/files/read?path=' + encodeURIComponent(path || '')); if (r) return r; }
        return SIMFILES.read(path);
      },
      async search(q) {   // deep search: filename search under HOME
        if (mode === 'live') { const r = await getJSON('/api/files/search?q=' + encodeURIComponent(q || '')); if (r) return r.results || []; }
        return [];
      },
      async op(op, path, dest) {
        if (mode === 'live') { const r = await post('/api/files/op', { op, path, dest }); if (r) return r; }
        return SIMFILES.op(op, path, dest);
      },
    },

    /* ---- Capability registry: real installed apps + system functions ----- */
    async capabilities() {
      if (mode === 'live') { const r = await getJSON('/api/capabilities'); if (r) return r; }
      return SIMCAPS;
    },
    async launchDesktop(id) {   // launch a real installed .desktop app
      if (mode === 'live') { const r = await post('/api/launch', { app: id, desktop: true }); return r || { ok: false }; }
      return { ok: true };      // sim: pretend-launch
    },
    // URL for an installed app's own icon (native or Android alike). Live only —
    // the token rides as a query param so it works as an <img src>. null in sim.
    appIconUrl(id) {
      if (mode !== 'live' || !TOKEN) return null;
      return AGENT + '/api/appicon?id=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(TOKEN);
    },

    /* ---- Media (Photos ~/Pictures, Music ~/Music) + Contacts ---------------
       Live reads real files from the device via the agent; the token rides the
       URL so <img>/<audio> load. In sim we return null lists so the apps show
       their designed empty/demo state. */
    async photos() {
      if (mode === 'live') { const r = await getJSON('/api/photos'); if (r) return r; }
      return { available: false, items: [], sim: true };
    },
    photoUrl(rel) {
      if (mode !== 'live' || !TOKEN) return null;
      return AGENT + '/api/photo?rel=' + encodeURIComponent(rel) + '&t=' + encodeURIComponent(TOKEN);
    },
    async savePhoto(dataUrl) {   // a captured photo (data: URL) → ~/Pictures
      if (mode === 'live') return post('/api/photo/save', { data: dataUrl }, 20000, 1);
      return { ok: true, sim: true };
    },
    async music() {
      if (mode === 'live') { const r = await getJSON('/api/music'); if (r) return r; }
      return { available: false, items: [], sim: true };
    },
    audioUrl(rel) {
      if (mode !== 'live' || !TOKEN) return null;
      return AGENT + '/api/audio?rel=' + encodeURIComponent(rel) + '&t=' + encodeURIComponent(TOKEN);
    },
    contacts: {
      async list() {
        if (mode === 'live') { const r = await getJSON('/api/contacts'); if (r) return r.contacts || []; }
        return simContacts.map(c => ({ ...c }));
      },
      async op(action, contact) {
        if (mode === 'live') { const r = await post('/api/contacts', { action, contact }, 8000, 1); return (r && r.contacts) || []; }
        if (action === 'add') simContacts.push({ id: 'c' + Date.now(), name: contact.name || '', number: contact.number || '' });
        else if (action === 'update') { const x = simContacts.find(s => s.id === contact.id); if (x) { x.name = contact.name; x.number = contact.number; } }
        else if (action === 'delete') simContacts = simContacts.filter(s => s.id !== contact.id);
        return simContacts.map(c => ({ ...c }));
      },
    },
    calendar: {
      async list() {
        if (mode === 'live') { const r = await getJSON('/api/calendar'); if (r) return r.events || []; }
        return simCal.map(e => ({ ...e }));
      },
      async op(action, event) {
        if (mode === 'live') { const r = await post('/api/calendar', { action, event }, 8000, 1); return (r && r.events) || []; }
        if (action === 'add') simCal.push({ id: 'e' + Date.now(), title: event.title || '', date: event.date || '', time: event.time || '', notes: event.notes || '' });
        else if (action === 'update') { const x = simCal.find(s => s.id === event.id); if (x) Object.assign(x, { title: event.title, date: event.date, time: event.time, notes: event.notes }); }
        else if (action === 'delete') simCal = simCal.filter(s => s.id !== event.id);
        return simCal.map(e => ({ ...e }));
      },
    },

    /* ---- Live services (opt-in) — daily wallpaper + weather ---------------
       All egress goes through the agent (the one door). The shell calls these
       only while the user's Personalize toggle is on. SIM: weather/geocode
       answer with plausible canned data (same shape) so the whole flow is
       explorable offline; the wallpaper image honestly can't exist without
       the agent, so it degrades with a plain reason instead of pretending. */
    async wallpaperDaily() {
      if (mode === 'live') {
        const r = await getJSON('/api/wallpaper/daily'); if (r) return r;
        return { available: false, error: 'The agent did not answer.' };
      }
      return { available: false, sim: true,
               error: 'Live wallpaper needs the device agent — in simulation nothing leaves this page.' };
    },
    wallpaperImageUrl(d) {
      if (mode !== 'live' || !TOKEN) return null;
      return AGENT + '/api/wallpaper/image?t=' + encodeURIComponent(TOKEN) + (d ? '&d=' + encodeURIComponent(d) : '');
    },
    async wallpaperList() {
      if (mode === 'live') {
        const r = await getJSON('/api/wallpaper/list'); if (r) return r;
        return { available: false, images: [], error: 'The agent did not answer.' };
      }
      return { available: false, sim: true, images: [],
               error: 'The gallery needs the device agent — in simulation nothing leaves this page.' };
    },
    wallpaperImageUrlFor(urlbase, sz) {
      if (mode !== 'live' || !TOKEN || !urlbase) return null;
      return AGENT + '/api/wallpaper/image?id=' + encodeURIComponent(urlbase)
        + '&sz=' + encodeURIComponent(sz || 'full') + '&t=' + encodeURIComponent(TOKEN);
    },
    async weather(lat, lon) {
      if (mode === 'live') {
        const r = await getJSON(`/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
        if (r) return r;
        return { available: false, error: 'The agent did not answer.' };
      }
      return { available: true, sim: true, source: 'SIM', temp: 18.2, feels: 17.1,
               humidity: 62, wind: 11, code: 2, isDay: true, label: 'Partly cloudy', hi: 21, lo: 12 };
    },
    async geocode(q) {
      if (mode === 'live') {
        const r = await getJSON('/api/geocode?q=' + encodeURIComponent(q || ''));
        if (r) return r;
        return { available: false, results: [], error: 'The agent did not answer.' };
      }
      const name = (q || '').trim();
      if (name.length < 2) return { available: true, sim: true, results: [] };
      const cap = name.charAt(0).toUpperCase() + name.slice(1);
      return { available: true, sim: true, results: [
        { name: cap, admin: 'Simulated', country: 'SIM', lat: 48.8567, lon: 2.3510 },
        { name: cap + ' Springs', admin: 'Simulated', country: 'SIM', lat: 52.52, lon: 13.405 },
      ] };
    },

    /* ---- Notes — a native app backed by real files on the device --------- */
    notes: {
      async list()      { if (mode === 'live') { const r = await getJSON('/api/notes'); if (r) return r; } return SIMNOTES.list(); },
      async get(id)     { if (mode === 'live') { const r = await getJSON('/api/notes/get?id=' + encodeURIComponent(id)); if (r) return r; } return SIMNOTES.get(id); },
      async save(id, t) { if (mode === 'live') { const r = await post('/api/notes/save', { id, text: t }); if (r) return r; } return SIMNOTES.save(id, t); },
      async del(id)     { if (mode === 'live') { const r = await post('/api/notes/del', { id }); if (r) return r; } return SIMNOTES.del(id); },
    },

    /* ---- AI Engine (Phase II) — apps reach intelligence only through here -- */
    ai: {
      async status()        { return (mode === 'live' && await getJSON('/api/ai/status'))     || SIMAI.status(); },
      async chat(p, useMem) {
        if (mode === 'live') {
          aiBusy = true;   // pause the status poll so it doesn't fight for the pool
          try {
            // Local inference can take many seconds — give it a real budget.
            const r = await post('/api/ai/chat', { prompt: p, useMemory: useMem }, 180000);
            if (r) return r;
            // A null here means the request itself failed (timed out / agent gone).
            // Report that honestly instead of quietly faking a simulated reply.
            return { ok: false, reason: 'error',
                     message: 'The model didn’t answer in time — it may still be warming up. Give it a moment and try again.' };
          } finally { aiBusy = false; }
        }
        return SIMAI.chat(p);
      },
      // Streamed chat: onDelta(fullTextSoFar) is called as tokens arrive, so the
      // UI renders the answer live and the connection never idles long enough to
      // be timed out. Resolves to the same shape as chat() when finished.
      async chatStream(p, useMem, onDelta) {
        if (mode !== 'live') {
          const r = SIMAI.chat(p);
          if (r.ok && onDelta) onDelta(r.text);
          return r;
        }
        aiBusy = true;
        try {
          // The stream can hit the transient reused-socket NetworkError at connect
          // OR mid-read. Wrap the whole operation in a retry — the action is never
          // run server-side, so re-issuing the request is safe.
          for (let attempt = 0; attempt < 3; attempt++) {
            let acc = '';
            try {
              const resp = await fetch(AGENT + '/api/ai/chat', {
                method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ prompt: p, useMemory: useMem, stream: true }),
                signal: AbortSignal.timeout(300000),
              });
              if (!resp.ok || !resp.body) {
                const j = await resp.json().catch(() => null);
                return j || { ok: false, reason: 'error', message: 'The assistant could not start.' };
              }
              const reader = resp.body.getReader(), dec = new TextDecoder();
              let buf = '', final = null;
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                let nl;
                while ((nl = buf.indexOf('\n')) >= 0) {
                  const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
                  if (!line) continue;
                  let evt; try { evt = JSON.parse(line); } catch (e) { continue; }
                  if (evt.delta !== undefined) { acc += evt.delta; onDelta && onDelta(acc); }
                  else if (evt.plan) final = { ok: true, plan: evt.plan, trustLevel: evt.trustLevel, text: acc };
                  else if (evt.action) final = { ok: true, plan: [evt.action], trustLevel: evt.trustLevel, text: acc };  // back-compat: single action → 1-step plan
                  else if (evt.done) final = { ok: true, text: evt.text || acc, ranLocally: true, model: evt.model };
                  else if (evt.error) final = { ok: false, reason: evt.error, message: evt.message, canCloud: evt.canCloud };
                }
              }
              return final || { ok: true, text: acc, ranLocally: true };
            } catch (e) {
              if ((e && e.name === 'TimeoutError') || attempt === 2) {
                return { ok: false, reason: 'error',
                         message: 'The assistant is unreachable right now — try again in a moment.' };
              }
              if (onDelta) onDelta('');   // clear any partial paint before retrying
              await new Promise(res => setTimeout(res, 160 * (attempt + 1)));
            }
          }
        } finally { aiBusy = false; }
      },
      async setSettings(pt) { return (mode === 'live' && await post('/api/ai/settings', pt))  || SIMAI.setSettings(pt); },
      async setPerm(src, v) { return (mode === 'live' && await post('/api/ai/permission', { source: src, value: v })) || SIMAI.setPerm(src, v); },
      async memory()        { return (mode === 'live' && await getJSON('/api/ai/memory'))     || SIMAI.memory(); },
      async addMemory(t)    { return (mode === 'live' && await post('/api/ai/memory/add', { text: t }, 5000, 1)) || SIMAI.addMemory(t); },
      async delMemory(id)   { return (mode === 'live' && await post('/api/ai/memory/del', { id })) || SIMAI.delMemory(id); },
      async clearMemory()   { return (mode === 'live' && await post('/api/ai/memory/clear', {})) || SIMAI.clearMemory(); },
      async activity()      { return (mode === 'live' && await getJSON('/api/ai/activity'))   || SIMAI.activity(); },
      async clearActivity() { return (mode === 'live' && await post('/api/ai/activity/clear', {})) || SIMAI.clearActivity(); },
      async logAction(summary, why, undoable) { if (mode === 'live') return post('/api/ai/log', { kind: 'action', summary, why, undoable: !!undoable }); return SIMAI.logAction(summary, why); },

      /* ---- experiential memory: observe → learn routines → suggest -------- */
      // The resident learns from what actually happens. The agent auto-observes
      // launches/toggles/levels; the shell reports the steps the agent can't see
      // (an assistant-run play_music / set_dnd / create_note). No-op while off.
      async observe(action, args, source) {
        if (mode === 'live') return post('/api/ai/observe', { action, args: args || {}, source: source || 'user' }, 4000, 1);
        return SIMAI.observe(action, args, source);
      },
      async episodes()      { return (mode === 'live' && await getJSON('/api/ai/episodes'))   || SIMAI.episodes(); },
      async clearEpisodes() { return (mode === 'live' && await post('/api/ai/episodes/clear', {})) || SIMAI.clearEpisodes(); },
      async routines()      { return (mode === 'live' && await getJSON('/api/ai/routines'))   || SIMAI.routines(); },
      // The single proactive surface: at most one thing the resident has learned
      // the user tends to do *now*. Returns { suggestion: {...} | null }.
      async suggest()       { return (mode === 'live' && await getJSON('/api/ai/suggest'))    || SIMAI.suggest(); },
      async suggestFeedback(id, accept) {
        if (mode === 'live') return post('/api/ai/suggest/feedback', { id, accept: !!accept }, 4000, 1);
        return SIMAI.suggestFeedback(id, accept);
      },
      // A gentle home-layout proposal from learned routine + time of day. The
      // shell sends the user's CURRENT focus + order so the Engine diffs against
      // reality and never nags. Returns { proposal: {...} | null }. Applying an
      // accepted layout is the shell's own job (into the user's layout store), so
      // the user's choice always wins.
      async homeProposal(focus, order) {
        const qs = '?focus=' + encodeURIComponent(focus || '') +
                   '&order=' + encodeURIComponent((order || []).join(','));
        return (mode === 'live' && await getJSON('/api/ai/home/proposal' + qs)) || SIMAI.homeProposal(focus, order);
      },
      async homeFeedback(id, accept, applied) {
        if (mode === 'live') return post('/api/ai/home/feedback', { id, accept: !!accept, applied }, 4000, 1);
        return SIMAI.homeFeedback(id, accept, applied);
      },
    },
  };

  /* ---- Simulation for the system/Linux surfaces (browser preview) -------- */
  sim.timezone = 'UTC';
  const bootStamp = Date.now();
  const SIM = {
    system() {
      const t = sim.mem_used || 2600;
      return {
        hostname: 'aura', os: 'AuraOS · Ubuntu 24.04 (preview)',
        kernel: '6.8.0-1010-raspi', arch: 'aarch64',
        cpu: 'Broadcom BCM2712 · Cortex-A76', cores: 4,
        board: 'Raspberry Pi 5 Model B Rev 1.0',
        mem: { total: 8192, used: t, avail: 8192 - t },
        swap: { total: 2048, used: 96 },
        uptime: Math.floor((Date.now() - bootStamp) / 1000) + 4820,
        load: [0.42, 0.35, 0.28], timezone: sim.timezone,
      };
    },
    processes() {
      return [
        { pid: 812, name: 'aura-shell', cpu: 6.4, mem: 4.1, rss: 336 },
        { pid: 640, name: 'aura-agent', cpu: 2.1, mem: 1.2, rss: 98 },
        { pid: 331, name: 'cog',             cpu: 5.0, mem: 6.8, rss: 557 },
        { pid: 210, name: 'NetworkManager',  cpu: 0.6, mem: 0.9, rss: 74 },
        { pid: 155, name: 'systemd',         cpu: 0.2, mem: 0.5, rss: 41 },
        { pid: 402, name: 'syncthing',       cpu: 1.1, mem: 2.3, rss: 188 },
        { pid: 190, name: 'wpa_supplicant',  cpu: 0.1, mem: 0.3, rss: 24 },
        { pid: 733, name: 'pipewire',        cpu: 0.4, mem: 0.6, rss: 49 },
      ].map(p => ({ ...p, cpu: +(p.cpu + (Math.random() * 1.4 - 0.7)).toFixed(1) }))
       .sort((a, b) => b.cpu - a.cpu);
    },
    storage() {
      return [
        { fs: '/dev/mapper/aura', mount: '/', total: 62_000_000_000, used: 18_600_000_000, avail: 43_400_000_000, pct: 30 },
        { fs: 'vault', mount: '/home/aura/vault', total: 48_000_000_000, used: 16_300_000_000, avail: 31_700_000_000, pct: 34 },
        { fs: '/dev/mmcblk0p1', mount: '/boot/firmware', total: 512_000_000, used: 84_000_000, avail: 428_000_000, pct: 17 },
      ];
    },
    wifi() {
      return [
        { ssid: sim.net.ssid || 'home-mesh', signal: 88, security: 'WPA2', active: sim.net.wifi },
        { ssid: 'home-mesh-5G', signal: 72, security: 'WPA2', active: false },
        { ssid: 'Neighbour_2.4', signal: 47, security: 'WPA2', active: false },
        { ssid: 'CoffeeShop Free', signal: 31, security: 'open', active: false },
      ];
    },
    exec(cmd, cwd) {
      cwd = cwd || '/home/aura';
      const c = (cmd || '').trim();
      const done = (out, ncwd) => ({ out, cwd: ncwd || cwd, rc: 0 });
      if (!c) return done('');
      const [bin, ...rest] = c.split(/\s+/);
      const arg = rest.join(' ');
      switch (bin) {
        case 'help': return done('Aura preview shell (a real bash runs on the device).\nAvailable here: help clear ls pwd cd cat echo whoami id hostname uname\n                date uptime free df ps env');
        case 'clear': return { out: '\x00clear', cwd, rc: 0 };
        case 'whoami': return done('aura');
        case 'id': return done('uid=1000(aura) gid=1000(aura) groups=1000(aura),27(sudo),44(video),20(dialout)');
        case 'hostname': return done('aura');
        case 'pwd': return done(cwd);
        case 'uname': return done(/(-a|-all)/.test(arg)
          ? 'Linux aura 6.8.0-1010-raspi #10 SMP PREEMPT aarch64 GNU/Linux'
          : (arg.includes('-r') ? '6.8.0-1010-raspi' : 'Linux'));
        case 'echo': return done(arg.replace(/\$USER/g, 'aura').replace(/\$HOSTNAME/g, 'aura').replace(/\$PWD/g, cwd).replace(/["']/g, ''));
        case 'date': return done(new Date().toString());
        case 'uptime': { const s = SIM.system().uptime; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
          return done(` ${new Date().toTimeString().slice(0, 5)} up ${h}:${String(m).padStart(2, '0')},  1 user,  load average: 0.42, 0.35, 0.28`); }
        case 'free': return done('               total        used        free      shared  buff/cache   available\nMem:            8192        2600        3892         112        1700        5592\nSwap:           2048          96        1952');
        case 'df': return done('Filesystem       Size  Used Avail Use% Mounted on\n/dev/mapper/sov   58G   18G   40G  31% /\nvault             45G   16G   29G  34% /home/aura/vault\n/dev/mmcblk0p1   511M   84M  427M  17% /boot/firmware');
        case 'ps': return done('    PID TTY          TIME CMD\n    812 ?        00:00:06 aura-shell\n    640 ?        00:00:02 aura-agent\n    331 ?        00:00:05 cog\n    402 ?        00:00:01 syncthing');
        case 'env':
        case 'printenv': return done(`USER=aura\nHOME=/home/aura\nSHELL=/bin/bash\nPWD=${cwd}\nHOSTNAME=aura\nLANG=en_US.UTF-8`);
        case 'cat': return arg ? done(`cat: ${arg}: No such file or directory`) : done('');
        case 'ls': return /-l/.test(arg)
          ? done('total 20\ndrwxr-xr-x 2 aura aura 4096 Documents\ndrwxr-xr-x 2 aura aura 4096 Downloads\ndrwxr-xr-x 2 aura aura 4096 Pictures\ndrwx------ 2 aura aura 4096 vault\n-rw-r--r-- 1 aura aura  220 notes.txt')
          : done('Documents  Downloads  Pictures  notes.txt  vault');
        case 'cd': {
          const target = arg || '/home/aura';
          let ncwd = target === '~' ? '/home/aura'
            : target.startsWith('/') ? target
            : (cwd.replace(/\/$/, '') + '/' + target);
          ncwd = ncwd.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '') || '/';
          return done('', ncwd);
        }
        default: return { out: `${bin}: command not found`, cwd, rc: 127 };
      }
    },
  };

  /* ---- File manager simulation (browser preview) ------------------------- */
  // A small, faithful in-memory filesystem so the Files app is fully explorable
  // without the agent. On a real device this is replaced by the user's actual
  // filesystem, read through /api/files/*.
  const simFiles = {
    home: '/home/aura',
    dirs: {
      '/': ['boot', 'etc', 'home', 'opt', 'tmp', 'usr', 'var'],
      '/boot': ['firmware', 'config.txt'],
      '/etc': ['os-release', 'hostname', 'fstab'],
      '/opt': ['aura'],
      '/opt/aura': ['shell', 'agent', 'aura-agent.py'],
      '/tmp': [],
      '/usr': ['bin', 'lib', 'share'],
      '/var': ['log'],
      '/home': ['aura'],
      '/home/aura': ['Documents', 'Downloads', 'Music', 'Pictures', 'Projects', 'vault', 'notes.txt', 'todo.md', '.bashrc', '.profile'],
      '/home/aura/Documents': ['manifesto.txt', 'budget.csv', 'letter-to-self.txt'],
      '/home/aura/Downloads': ['ubuntu-24.04-arm64.img.xz', 'aura-os.img', 'bcm2712-datasheet.pdf'],
      '/home/aura/Music': ['ambient-loop.flac', 'field-recording.wav'],
      '/home/aura/Pictures': ['sunrise.jpg', 'pi5-board.png', 'shell-home.png'],
      '/home/aura/Projects': ['aura-os'],
      '/home/aura/Projects/aura-os': ['agent', 'shell', 'build.sh', 'README.md'],
      '/home/aura/Projects/aura-os/shell': ['index.html', 'auraos.css'],
      '/home/aura/Projects/aura-os/agent': ['aura-agent.py', 'ai_engine.py'],
      '/home/aura/vault': ['recovery-codes.txt', 'keys.kdbx'],
    },
    files: {
      '/home/aura/notes.txt': 'The OS is the final authority.\nApps reach the system only through the agent — never directly.\n',
      '/home/aura/todo.md': '# To do\n\n- [x] Aura Shell v1.0\n- [x] AI Engine v0 (off by default)\n- [x] File manager\n- [ ] Wire the sensor ribbon to xdg-desktop-portal\n- [ ] Make the assistant act under consent\n',
      '/home/aura/.bashrc': '# ~/.bashrc\nexport PS1="\\u@\\h:\\w\\$ "\nalias ll="ls -la"\n',
      '/home/aura/.profile': '# ~/.profile — sourced at login\n',
      '/home/aura/Documents/manifesto.txt': 'Privacy. Capability. Transparency. User Sovereignty.\nFour equal pillars, none sacrificed for another.\n',
      '/home/aura/Documents/budget.csv': 'item,cost\nRaspberry Pi 5,80\nNVMe HAT,20\nCase,15\n',
      '/home/aura/Documents/letter-to-self.txt': 'Remember why you started this.\n',
      '/home/aura/vault/recovery-codes.txt': '(On a real device this lives in the encrypted vault.)\n',
      '/home/aura/Projects/aura-os/README.md': '# AuraOS\n\nA privacy-first mobile Linux OS for the Raspberry Pi 5.\n',
      '/home/aura/Projects/aura-os/build.sh': '#!/usr/bin/env bash\nset -euo pipefail\n# builds the LUKS-encrypted arm64 image\n',
    },
  };
  const sfJoin = (dir, name) => (dir === '/' ? '' : dir) + '/' + name;
  const sfParent = p => { if (!p || p === '/') return '/'; const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
  function sfFakeSize(name) {
    if (/\.(img|xz|iso)$/i.test(name)) return 1_400_000_000 + name.length * 7_000_000;
    if (/\.pdf$/i.test(name)) return 2_600_000;
    if (/\.(flac|wav)$/i.test(name)) return 38_000_000;
    if (/\.(jpg|jpeg|png)$/i.test(name)) return 2_400_000 + name.length * 40_000;
    if (/\.kdbx$/i.test(name)) return 12_800;
    return 400 + name.length * 37;
  }
  function sfEntry(dir, name) {
    const full = sfJoin(dir, name);
    const isDir = !!simFiles.dirs[full];
    const content = simFiles.files[full];
    const size = isDir ? 0 : (content !== undefined ? content.length : sfFakeSize(name));
    const mtime = Math.floor(Date.now() / 1000) - 3600 * 30 - name.length * 137;
    return { name, dir: isDir, link: false, size, mtime, mode: isDir ? 'drwxr-xr-x' : '-rw-r--r--' };
  }
  const SIMFILES = {
    list(path, hidden) {
      path = path || simFiles.home;
      const kids = simFiles.dirs[path];
      if (!kids) return { path, parent: sfParent(path), home: simFiles.home, entries: [], writable: false, error: 'not a directory' };
      let entries = kids.map(n => sfEntry(path, n));
      if (!hidden) entries = entries.filter(e => !e.name.startsWith('.'));
      entries.sort((a, b) => (a.dir !== b.dir) ? (a.dir ? -1 : 1) : a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      const writable = path === simFiles.home || path.startsWith(simFiles.home + '/');
      return { path, parent: sfParent(path), home: simFiles.home, entries, writable };
    },
    read(path) {
      if (simFiles.dirs[path]) return { path, error: 'not a regular file' };
      const c = simFiles.files[path];
      if (c !== undefined) return { path, size: c.length, binary: false, text: c };
      const name = path.split('/').pop();
      if (/\.(img|xz|iso|pdf|flac|wav|jpg|jpeg|png|kdbx)$/i.test(name))
        return { path, size: sfFakeSize(name), binary: true, text: '' };
      return { path, size: 0, binary: false, text: '' };
    },
    op(op, path, dest) {
      const parent = sfParent(path), name = path.split('/').pop(), kids = simFiles.dirs[parent];
      if (op === 'mkdir' || op === 'newfile') {
        if (!kids) return { ok: false, msg: 'no such directory' };
        if (kids.includes(name)) return { ok: false, msg: 'already exists' };
        kids.push(name);
        if (op === 'mkdir') simFiles.dirs[path] = []; else simFiles.files[path] = '';
      } else if (op === 'rename') {
        const dname = dest.split('/').pop();
        if (kids && kids.includes(dname)) return { ok: false, msg: 'target name already exists' };
        if (kids) kids[kids.indexOf(name)] = dname;
        if (simFiles.files[path] !== undefined) { simFiles.files[dest] = simFiles.files[path]; delete simFiles.files[path]; }
        if (simFiles.dirs[path]) { simFiles.dirs[dest] = simFiles.dirs[path]; delete simFiles.dirs[path]; }
      } else if (op === 'delete') {
        if (path === simFiles.home || path === '/') return { ok: false, msg: 'refusing to delete a protected directory' };
        if (kids) kids.splice(kids.indexOf(name), 1);
        delete simFiles.files[path]; delete simFiles.dirs[path];
      } else return { ok: false, msg: 'unknown operation' };
      return { ok: true };
    },
  };

  /* ---- Capability + notes simulation (browser preview) ------------------- */
  // A small set of "installed" apps so the drawer's discovery is explorable
  // without the agent. On a real device this is replaced by the live scan.
  const SIMCAPS = {
    apps: [
      { id: 'org.gnome.Clocks',     name: 'Clocks',      comment: 'World clocks, alarms, stopwatch', categories: ['Utility'] },
      { id: 'org.gnome.TextEditor', name: 'Text Editor', comment: 'Edit plain-text files',           categories: ['Utility'] },
      { id: 'org.gnome.Software',   name: 'Software',     comment: 'Install and update applications', categories: ['System'] },
      { id: 'org.gnome.Calculator', name: 'Calculator',  comment: 'Do sums and conversions',          categories: ['Utility'] },
      { id: 'firefox',              name: 'Firefox',     comment: 'Browse the web',                   categories: ['Network'] },
      { id: 'org.gnome.Nautilus',   name: 'Files',       comment: 'Browse your files',                categories: ['System'] },
      { id: 'org.gnome.Settings',   name: 'Settings',    comment: 'Configure the system',             categories: ['Settings'] },
      { id: 'libreoffice-writer',   name: 'LibreOffice Writer', comment: 'Write documents',            categories: ['Office'] },
      // Android apps appear here exactly like native ones — same shape, no label.
      { id: 'waydroid.org.thoughtcrime.securesms', name: 'Signal', comment: 'Private messaging', categories: ['Network'] },
      { id: 'waydroid.org.schabi.newpipe',         name: 'NewPipe', comment: 'Lightweight video', categories: ['AudioVideo'] },
    ],
    functions: [
      { id: 'launch_app', desc: 'Open an installed application' },
      { id: 'set_brightness', desc: 'Set screen brightness' },
      { id: 'set_volume', desc: 'Set output volume' },
      { id: 'toggle_wifi', desc: 'Turn Wi-Fi on or off' },
    ],
    generated: 0,
  };
  let simNotes = [{
    id: 'welcome', title: 'Welcome to Notes',
    preview: 'Your notes live on the device, in plain text.',
    text: '# Welcome to Notes\n\nYour notes live on the device, in plain text.\nNothing here leaves it.\n',
    mtime: Math.floor(Date.now() / 1000),
  }];
  const SIMNOTES = {
    list() { return simNotes.map(n => ({ id: n.id, title: n.title, preview: n.preview, mtime: n.mtime })); },
    get(id) { const n = simNotes.find(x => x.id === id); return { id, text: n ? n.text : '' }; },
    save(id, text) {
      id = id || ('n' + Date.now());
      const title = ((text.split('\n').find(l => l.trim()) || 'Untitled').replace(/^#\s*/, '')).slice(0, 80);
      const n = simNotes.find(x => x.id === id);
      const preview = text.trim().slice(0, 140), mtime = Math.floor(Date.now() / 1000);
      if (n) Object.assign(n, { text, title, preview, mtime });
      else simNotes.unshift({ id, title, preview, text, mtime });
      return { ok: true, id };
    },
    del(id) { simNotes = simNotes.filter(x => x.id !== id); return { ok: true }; },
  };

  /* ---- AI Engine simulation (browser preview) ---------------------------- */
  const simAI = {
    settings: { enabled: false, killed: false, trustLevel: 1, allowCloud: false, provider: 'ollama', model: 'llama3.2:3b' },
    perms: { files: 'deny', calendar: 'deny', location: 'deny', photos: 'deny', messages: 'deny' },
    memory: [], activity: [], episodes: [], dismissed: [],
  };
  function simLog(kind, summary, why) {
    simAI.activity.unshift({ id: 'a' + Date.now() + simAI.activity.length, ts: Math.floor(Date.now() / 1000), kind, summary, why, undoable: false });
    simAI.activity = simAI.activity.slice(0, 200);
  }
  // Preview-only plan composer (NO model in the browser). It stands in for the
  // real path, where the local model reasons over the capability catalog. It is
  // deliberately small — enough to demo intent→plan composition and multi-step
  // "wind down" plans without Ollama. On a device this whole function is unused.
  function simComposePlan(p) {
    const s = p.toLowerCase(); const steps = []; let m;
    const wind = /\b(sleep|bed|good ?night|wind ?down|tired)\b/.test(s);
    const focus = /\b(focus|work|study|concentrate|deep ?work)\b/.test(s);
    if (wind) { steps.push({ name: 'set_dnd', args: { on: true }, why: 'quiet the phone for rest' });
      steps.push({ name: 'set_brightness', args: { percent: 12 }, why: 'ease the light' });
      steps.push({ name: 'play_music', args: { mood: 'sleep' }, why: 'something calm to drift off to' }); return steps; }
    if (focus) { steps.push({ name: 'set_dnd', args: { on: true }, why: 'no interruptions' });
      steps.push({ name: 'set_brightness', args: { percent: 80 }, why: 'a bright, alert screen' }); return steps; }
    if ((m = s.match(/bright\w*\D*(\d{1,3})/)) || (m = s.match(/(\d{1,3})\s*%?\s*bright/))) return [{ name: 'set_brightness', args: { percent: +m[1] } }];
    if ((m = s.match(/volume\D*(\d{1,3})/)) || (m = s.match(/(\d{1,3})\s*%?\s*volume/))) return [{ name: 'set_volume', args: { percent: +m[1] } }];
    if (/\b(silen|mute|quiet|do not disturb|dnd)\b/.test(s)) return [{ name: 'set_dnd', args: { on: !/off|unmute/.test(s) } }];
    if (/\bmusic\b|\bplay\b/.test(s)) return [{ name: 'play_music', args: {} }];
    if (/wi-?fi/.test(s) && /(on|off|enable|disable)/.test(s)) return [{ name: 'toggle_wifi', args: { on: /(on|enable)/.test(s) && !/off|disable/.test(s) } }];
    if (/bluetooth/.test(s) && /(on|off|enable|disable)/.test(s)) return [{ name: 'toggle_bluetooth', args: { on: /(on|enable)/.test(s) && !/off|disable/.test(s) } }];
    if (/lock (the )?(device|phone|screen)/.test(s)) return [{ name: 'lock_device', args: {} }];
    if ((m = p.match(/note[:\s-]+(.+)/i)) && m[1]) return [{ name: 'create_note', args: { text: m[1].trim() } }];
    if ((m = s.match(/open (?:the )?(.+?)(?: app)?$/))) return [{ name: 'open_app', args: { name: m[1].trim() } }];
    return [];
  }
  const CAP_VERB = {
    open_app: 'opens an app', set_brightness: 'changes the brightness', set_volume: 'changes the volume',
    set_dnd: 'silences the phone', play_music: 'plays music', toggle_wifi: 'toggles Wi-Fi',
    toggle_bluetooth: 'toggles Bluetooth', open_settings: 'opens settings', create_note: 'writes a note', lock_device: 'locks the phone',
  };
  function simSig(action, args) {
    const parts = [];
    Object.keys(args || {}).sort().forEach(k => {
      const v = args[k];
      if (typeof v === 'boolean') parts.push(k + '=' + v);
      else if (typeof v === 'string' && v.trim()) parts.push(k + '=' + v.trim().toLowerCase().slice(0, 24));
    });
    return action + '|' + parts.join(',');
  }
  const SIMAI = {
    status() {
      const s = simAI.settings;
      return {
        enabled: s.enabled, killed: s.killed, trustLevel: s.trustLevel, allowCloud: s.allowCloud,
        provider: s.provider,
        backend: { available: true, kind: 'preview', models: ['llama3.2:3b (simulated)'], model: 'llama3.2:3b (simulated)' },
        memoryCount: simAI.memory.length, activityCount: simAI.activity.length,
        episodeCount: simAI.episodes.length, routineCount: this.routines().length, perms: { ...simAI.perms },
        memory: { vault: true, available: true, encrypted: true,
                  envelope: 'HMAC-SHA256 PRF-CTR · encrypt-then-MAC · scrypt KDF', fscrypt: false },
      };
    },
    setSettings(pt) {
      const s = simAI.settings;
      ['enabled', 'killed', 'allowCloud'].forEach(k => { if (k in pt) s[k] = !!pt[k]; });
      if ('trustLevel' in pt) s.trustLevel = Math.max(0, Math.min(3, pt.trustLevel | 0));
      if (s.killed) s.enabled = false;
      if (pt.killed) simLog('kill', 'AI Engine emergency-stopped', 'You engaged the kill switch.');
      else if ('enabled' in pt) simLog('power', 'Intelligence turned ' + (s.enabled ? 'on' : 'off'), 'You changed whether the AI Engine is active.');
      return this.status();
    },
    setPerm(src, v) {
      if (src in simAI.perms && ['allow', 'ask', 'deny'].includes(v)) {
        simAI.perms[src] = v;
        simLog('permission', `${src} access set to ${v}`, `You changed whether the assistant may use your ${src}.`);
      }
      return { ...simAI.perms };
    },
    chat(prompt) {
      const s = simAI.settings;
      if (s.killed) return { ok: false, reason: 'killed' };
      if (!s.enabled) return { ok: false, reason: 'disabled' };
      prompt = (prompt || '').trim();
      if (!prompt) return { ok: false, reason: 'empty' };
      simLog('chat', prompt.slice(0, 60), 'You asked: ' + prompt.slice(0, 120));
      // preview: compose a plan so the intent→plan flow is demoable
      const plan = (s.trustLevel ?? 1) >= 1 ? simComposePlan(prompt) : [];
      if (plan.length) return { ok: true, plan, trustLevel: s.trustLevel };
      const canned = `(preview) I'm the on-device assistant. On a real device a local model answers this fully — nothing leaves your device. You said: “${prompt}”.`;
      return { ok: true, text: canned, ranLocally: true, model: 'llama3.2:3b (simulated)' };
    },
    memory() { return simAI.memory.map(m => ({ ...m })); },
    addMemory(t) { t = (t || '').trim(); if (t) { simAI.memory.unshift({ id: 'm' + Date.now(), text: t, ts: Math.floor(Date.now() / 1000), tags: [] }); simLog('memory', 'Saved a memory', 'You asked to remember: ' + t.slice(0, 80)); } return this.memory(); },
    delMemory(id) { simAI.memory = simAI.memory.filter(m => m.id !== id); return this.memory(); },
    clearMemory() { simAI.memory = []; simLog('memory', 'Cleared all memories', 'You deleted the assistant\'s memory.'); return []; },
    activity() { return simAI.activity.map(a => ({ ...a })); },
    clearActivity() { simAI.activity = []; return []; },
    logAction(summary, why) { simLog('action', summary, why); return { ok: true }; },

    /* ---- experiential memory (browser preview) --------------------------- */
    observe(action, args, source) {
      if (!simAI.settings.enabled || !CAP_VERB[action]) return { ok: true };
      const d = new Date(), sc = {};
      Object.keys(args || {}).forEach(k => { const v = args[k]; if (['boolean', 'number', 'string'].includes(typeof v)) sc[k] = v; });
      simAI.episodes.unshift({ id: 'e' + Date.now() + Math.random(), ts: Math.floor(d.getTime() / 1000),
        hour: d.getHours(), min: d.getMinutes(), dow: (d.getDay() + 6) % 7, action, args: sc, sig: simSig(action, sc), source: source || 'user' });
      simAI.episodes = simAI.episodes.slice(0, 3000);
      return { ok: true };
    },
    episodes() { return simAI.episodes.map(e => ({ ...e })); },
    clearEpisodes() { simAI.episodes = []; return []; },
    routines(minCount = 3, minDays = 2) {
      const groups = {};
      simAI.episodes.forEach(e => { (groups[e.sig] = groups[e.sig] || []).push(e); });
      const out = [];
      Object.entries(groups).forEach(([sig, evs]) => {
        if (evs.length < minCount) return;
        const days = new Set(evs.map(e => Math.floor(e.ts / 86400)));
        if (days.size < minDays) return;
        const hc = {}; evs.forEach(e => { hc[e.hour] = (hc[e.hour] || 0) + 1; });
        const hour = +Object.entries(hc).sort((a, b) => b[1] - a[1])[0][0];
        const inH = evs.filter(e => e.hour === hour);
        const min = Math.round(inH.reduce((s, e) => s + e.min, 0) / inH.length);
        const action = evs[0].action, args = evs[0].args || {};
        let verb = CAP_VERB[action] || action; if (action === 'open_app') verb = 'opens ' + String(args.name || 'an app');
        out.push({ id: sig, action, args, hour, min, count: evs.length, days: days.size,
          dows: [...new Set(evs.map(e => e.dow))].sort(), confidence: Math.min(1, evs.length / 6),
          phrase: `usually ${verb} around ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}` });
      });
      return out.sort((a, b) => b.confidence - a.confidence || b.count - a.count);
    },
    suggest() {
      if (!simAI.settings.enabled) return { suggestion: null };
      const d = new Date(), now = d.getHours() * 60 + d.getMinutes(), dow = (d.getDay() + 6) % 7;
      const today = Math.floor(d.getTime() / 1000 / 86400);
      const done = new Set(simAI.episodes.filter(e => Math.floor(e.ts / 86400) === today).map(e => e.sig));
      const dis = new Set(simAI.dismissed.filter(x => x.day === today).map(x => x.id));
      let best = null;
      this.routines().forEach(r => {
        if (done.has(r.id) || dis.has(r.id)) return;
        const wd = r.dows.length && r.dows.every(x => x < 5), we = r.dows.length && r.dows.every(x => x >= 5);
        if (wd && dow >= 5) return; if (we && dow < 5) return;
        const rmin = r.hour * 60 + r.min, delta = now - rmin;
        if (delta < -40 || delta > 20) return;
        if (!best || r.confidence > best.confidence) best = r;
      });
      if (!best) return { suggestion: null };
      const hhmm = String(best.hour).padStart(2, '0') + ':' + String(best.min).padStart(2, '0');
      const why = `You often do this around ${hhmm} — seen ${best.count} times over ${best.days} days.`;
      return { suggestion: { id: best.id, why, confidence: best.confidence, plan: [{ name: best.action, args: best.args, why }] } };
    },
    suggestFeedback(id, accept) {
      if (!accept) { const today = Math.floor(Date.now() / 1000 / 86400); simAI.dismissed.push({ id, day: today }); }
      return { ok: true };
    },
    homeProposal(focus, order) {
      if (!simAI.settings.enabled) return { proposal: null };
      const d = new Date(), hour = d.getHours(), dow = (d.getDay() + 6) % 7;
      const today = Math.floor(d.getTime() / 1000 / 86400), pid = 'home-' + today;
      if (simAI.dismissed.some(x => x.day === today && x.id === pid)) return { proposal: null };
      const dp = h => (h >= 5 && h < 11) ? 'morning' : (h < 14) ? 'midday' : (h < 18) ? 'afternoon' : (h < 23) ? 'evening' : 'night';
      const part = dp(hour), curFocus = focus || '', curOrder = (order || []).filter(Boolean);
      const ranked = [], seen = new Set();
      this.routines().forEach(r => {
        if (r.action !== 'open_app' || r.confidence < 0.5) return;
        const app = String((r.args || {}).name || '').trim().toLowerCase();
        if (!app || app === 'assistant' || seen.has(app) || dp(r.hour) !== part) return;
        const wd = r.dows.length && r.dows.every(x => x < 5), we = r.dows.length && r.dows.every(x => x >= 5);
        if ((wd && dow >= 5) || (we && dow < 5)) return;
        seen.add(app); ranked.push([app, r]);
      });
      if (!ranked.length) return { proposal: null };
      const f = ranked[0][0];
      const featured = ranked.map(x => x[0]).filter(a => a !== f);
      const order2 = featured.concat(curOrder.filter(a => a !== f && !featured.includes(a)));
      if (f === curFocus && JSON.stringify(order2) === JSON.stringify(curOrder)) return { proposal: null };
      const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
      const why = (app, r) => `You usually open ${cap(app)} around ${String(r.hour).padStart(2, '0')}:${String(r.min).padStart(2, '0')} — seen ${r.count} times over ${r.days} days.`;
      const lead = ranked.slice(0, 2).map(x => cap(x[0])).join(' and ');
      return { proposal: { id: pid, focus: f, order: order2, why: `Your ${part} usually starts with ${lead}.`,
        confidence: ranked[0][1].confidence, changes: ranked.map(([app, r]) => ({ app, why: why(app, r) })) } };
    },
    homeFeedback(id, accept, applied) {
      if (accept) {
        const f = applied && applied.focus ? ` Home now opens on ${applied.focus}.` : '';
        simLog('home', 'Applied a home layout suggestion', 'You accepted a home layout the resident proposed from your routine; you can rearrange any tile at any time.' + f);
      } else {
        simAI.dismissed.push({ id, day: Math.floor(Date.now() / 1000 / 86400) });
        simLog('home', 'Dismissed a home layout suggestion', 'You dismissed a proposed home layout; it won\'t come back today.');
      }
      return { ok: true };
    },
  };

  /* ---- Simulation clocks (only meaningful in sim mode) -------------------- */
  setInterval(() => emit(), 1000 * 20);            // clock refresh
  setInterval(() => {                               // battery drift
    if (mode !== 'sim') return;
    if (sim.net.airplane) return;
    if (sim.battery.charging) sim.battery.level = Math.min(100, sim.battery.level + 1);
    else if (sim.battery.level > 1) sim.battery.level -= (Math.random() < 0.3 ? 1 : 0);
  }, 1000 * 45);

  api._probe = probe;
  return api;
})();
