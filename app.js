/* Ambassador Club Thun – App (v1.3) */
'use strict';
const CFG = window.AC_CONFIG;
const sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const $app = document.getElementById('app');
const S = { me: null, admin: false, members: [], byId: {}, roles: [], showPast: false, vorstandTab: 'aktuell', installEvt: null, filter: 'alle' };
try { S.filter = localStorage.getItem('ac_filter') || 'alle'; } catch { /* */ }
const TZ = 'Europe/Zurich';
const KINDS = ['Lunch', 'Nachtessen', 'Anlass', 'Ausflug', 'Generalversammlung', 'Vorstand', 'Andere'];
const DEFAULT_LOC = 'Restaurant Krone, Thun';
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/* ---------- helpers ---------- */
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const appBase = () => CFG.appUrl || (location.origin + location.pathname);
const fullName = (m) => m ? [m.vorname, m.nachname].filter(Boolean).join(' ') : '–';
const sortName = (a, b) => ((a.nachname || '') + (a.vorname || '')).localeCompare((b.nachname || '') + (b.vorname || ''), 'de');
const initials = (m) => ((m.vorname || '')[0] || '') + ((m.nachname || '')[0] || '');
const fmt = (iso, o) => new Date(iso).toLocaleString('de-CH', { timeZone: TZ, ...o });
const fDate = (iso) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const fTime = (iso) => fmt(iso, { hour: '2-digit', minute: '2-digit' });
const fDay = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fDM = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-CH', { day: 'numeric', month: 'long' }) : '';
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const ageOf = (gd) => { const t = today(); return +t.slice(0, 4) - +gd.slice(0, 4) - (t.slice(5) < gd.slice(5) ? 1 : 0); };
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocalInput = (v) => v ? new Date(v).toISOString() : null;
const val = (id) => { const el = document.getElementById(id); if (!el) return null; if (el.type === 'checkbox') return el.checked; const v = el.value.trim(); return v === '' ? null : v; };
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2200); }
function err(e) { console.error(e); toast('Fehler: ' + (e?.message || e)); }
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Kopiert'); } catch { prompt('Kopieren:', text); } }
function download(name, text, type) { const b = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const csv = (rows) => '﻿' + rows.map((r) => r.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');

/* Kategorie eines Anlasses: über Titel-Präfix */
const CAT = { club: 'AC Thun', regio: 'Regio', nat: 'National / Int.' };
const catOf = (e) => /^Regio:/i.test(e.title) ? 'regio' : /^(National|International):/i.test(e.title) ? 'nat' : 'club';
const catLabel = (e) => /^International:/i.test(e.title) ? 'International' : /^National:/i.test(e.title) ? 'National' : /^Regio:/i.test(e.title) ? 'Regio' : '';
const evTitle = (e) => e.title.replace(/^(Regio|National|International):\s*/i, '');

const ICON = {
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.6c2.5.2 4.3 1.9 5 5.4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21h16v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 16c2 1.3 4 1.3 5.3 0s4-1.3 5.4 0 4 1.3 5.3 0M12 11V7"/><path d="M12 3.5c.8.9 1 1.8 0 2.5-1-.7-.8-1.6 0-2.5z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
};

/* ---------- layout ---------- */
function shell(title, body, opt = {}) {
  const tab = opt.tab || '';
  const t = (id, label, icon) => `<a href="#/${id}" class="${tab === id ? 'on' : ''}">${ICON[icon]}${label}</a>`;
  $app.innerHTML = `
  <header class="top">
    <a class="back" style="display:${opt.back ? 'block' : 'none'}" href="javascript:history.back()">‹</a>
    <img src="icons/logo.png" alt="">
    <div><div class="t">${h(title)}</div><div class="s">${h(CFG.clubName)}</div></div>
  </header>
  <main>${body}</main>
  <nav class="tabs">${t('programm', 'Programm', 'cal')}${t('mitglieder', 'Mitglieder', 'users')}${t('vorstand', 'Vorstand', 'star')}${t('geburtstage', 'Geburtstage', 'cake')}${t('mehr', 'Mehr', 'menu')}</nav>`;
  window.scrollTo(0, 0);
}
const loading = () => { const m = $app.querySelector('main'); if (m) m.innerHTML = '<div class="empty">Laden…</div>'; };

/* ---------- auth ---------- */
async function loginWithCode(code) {
  const r = await fetch(CFG.supabaseUrl + '/functions/v1/login-code', {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey }, body: JSON.stringify({ code }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token_hash) throw new Error(j.error || 'Code ungültig');
  let { error } = await sb.auth.verifyOtp({ token_hash: j.token_hash, type: 'magiclink' });
  if (error) ({ error } = await sb.auth.verifyOtp({ token_hash: j.token_hash, type: 'email' }));
  if (error) throw error;
}

function renderLogin(msg) {
  $app.innerHTML = `
  <div class="login"><div class="box">
    <img src="icons/logo.png" alt="Logo">
    <h1>${h(CFG.clubName)}</h1>
    <p class="muted">Melde dich mit deinem persönlichen Code an.</p>
    ${msg ? `<div class="card" style="background:var(--no-bg);color:var(--no)">${h(msg)}</div>` : ''}
    <input id="code" class="code" placeholder="XXXX-XXXX-XXXX" autocomplete="one-time-code" autocapitalize="characters">
    <button class="btn p block" id="go" style="margin-top:10px">Anmelden</button>
    <details style="margin-top:26px;text-align:left"><summary class="muted small">Kein Code zur Hand? Link per E-Mail anfordern ›</summary>
      <label>E-Mail-Adresse (wie im Club hinterlegt)</label>
      <input id="mail" type="email" autocomplete="email">
      <button class="btn block" id="mailgo" style="margin-top:8px">Login-Link senden</button>
    </details>
  </div></div>`;
  const go = async () => {
    const c = document.getElementById('code').value;
    document.getElementById('go').disabled = true;
    try { await loginWithCode(c); rememberCode(c.toUpperCase().replace(/[^0-9A-Z]/g, '')); await start(); } catch (e) { renderLogin(e.message); }
  };
  document.getElementById('go').onclick = go;
  document.getElementById('code').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  document.getElementById('mailgo').onclick = async () => {
    const email = document.getElementById('mail').value.trim();
    if (!email) return;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: appBase() } });
    if (error) return toast(error.message);
    toast('Falls die Adresse hinterlegt ist, kommt gleich eine E-Mail.');
  };
}

async function loadBase() {
  const [mid, adm, members, roles] = await Promise.all([
    q(sb.rpc('my_member_id')), q(sb.rpc('is_admin')),
    q(sb.from('members').select('*').order('nachname')), q(sb.from('board_roles').select('*').order('sort')),
  ]);
  S.admin = !!adm;
  S.members = members; S.byId = Object.fromEntries(members.map((m) => [m.id, m]));
  S.roles = roles;
  S.me = mid ? S.byId[mid] : null;
}

function rememberCode(c) {
  try { localStorage.setItem('ac_code', c); } catch { /* */ }
  const want = '?code=' + c;
  if (location.search !== want) history.replaceState(null, '', location.pathname + want + (location.hash || '#/programm'));
}

async function start() {
  // Code bleibt in der Adresse (?code=…) und im Gerät gespeichert. So bleibt das Login auch beim
  // «Zum Home-Bildschirm» erhalten (iPhone: Web-App hat eigenen Speicher, übernimmt aber die Adresse).
  const norm = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const code = norm(new URLSearchParams(location.search).get('code'));
  let stored = ''; try { stored = localStorage.getItem('ac_code') || ''; } catch { /* */ }
  if (/access_token|error_description/.test(location.hash)) {
    await new Promise((r) => setTimeout(r, 300));
    history.replaceState(null, '', location.pathname + location.search + '#/programm');
  }
  let { data: { session } } = await sb.auth.getSession();
  const useCode = code || (!session ? stored : '');
  if (useCode && (!session || useCode !== stored)) {
    try {
      await sb.auth.signOut({ scope: 'local' }); await loginWithCode(useCode);
      rememberCode(useCode);
      ({ data: { session } } = await sb.auth.getSession());
    } catch (e) {
      try { localStorage.removeItem('ac_code'); } catch { /* */ }
      history.replaceState(null, '', location.pathname + '#/programm');
      return renderLogin(e.message);
    }
  } else if (code || (session && stored)) rememberCode(code || stored);
  if (!location.hash || location.hash === '#') history.replaceState(null, '', location.pathname + location.search + '#/programm');
  if (!session) return renderLogin();
  try { await loadBase(); } catch (e) { return renderLogin(e.message); }
  if (!S.me) {
    await sb.auth.signOut();
    return renderLogin('Für dieses Login ist kein aktives Mitglied hinterlegt. Bitte den persönlichen Code verwenden oder beim Vorstand melden.');
  }
  route();
}

/* ---------- router ---------- */
const routes = [
  [/^$|^programm$/, viewProgramm], [/^event\/(.+)$/, viewEvent],
  [/^mitglieder$/, viewMembers], [/^m\/(.+)$/, viewMember],
  [/^vorstand$/, viewVorstand], [/^geburtstage$/, viewBirthdays],
  [/^mehr$/, viewMore], [/^profil$/, viewProfile], [/^kalender$/, viewCalendar], [/^link$/, viewMyLink], [/^installieren$/, viewInstall], [/^bald\/(.+)$/, viewSoon],
  [/^admin$/, viewAdmin], [/^admin\/mitglieder$/, viewAdminMembers], [/^admin\/m\/(.+)$/, viewAdminMember],
  [/^admin\/event\/(.+)$/, viewAdminEvent], [/^admin\/serie$/, viewAdminSeries], [/^admin\/import$/, viewAdminImport],
  [/^admin\/codes$/, viewAdminCodes], [/^admin\/vorstand$/, viewAdminBoard], [/^admin\/term\/(.+)$/, viewAdminTerm],
];
async function route() {
  if (!S.me) return;
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      if (path.startsWith('admin') && !S.admin) { location.hash = '#/programm'; return; }
      try { await fn(...m.slice(1)); } catch (e) { err(e); }
      return;
    }
  }
  location.hash = '#/programm';
}
window.addEventListener('hashchange', route);

/* ---------- Programm ---------- */
async function viewProgramm() {
  shell('Jahresprogramm', '', { tab: 'programm' }); loading();
  const since = S.showPast ? new Date(Date.now() - 400 * 864e5).toISOString() : new Date(Date.now() - 6 * 3600e3).toISOString();
  const all = await q(sb.from('events').select('*').gte('starts_at', since).order('starts_at', { ascending: !S.showPast }));
  if (S.showPast) all.splice(0, all.length, ...all.filter((e) => new Date(e.starts_at) < new Date()));
  const events = S.filter === 'alle' ? all : all.filter((e) => catOf(e) === S.filter);
  const ids = events.map((e) => e.id);
  const regs = ids.length ? await q(sb.from('registrations').select('event_id,member_id,status,with_partner,guests').in('event_id', ids)) : [];
  const byEv = {};
  regs.forEach((r) => (byEv[r.event_id] ||= []).push(r));
  const cnt = (c) => all.filter((e) => c === 'alle' || catOf(e) === c).length;
  const hr = +fmt(new Date().toISOString(), { hour: 'numeric', hour12: false });
  const gruss = hr < 11 ? 'Guten Morgen' : hr < 17 ? 'Grüezi' : 'Guten Abend';
  let html = `<div class="hello"><div class="hi">${gruss} ${h(S.me.vorname)}</div></div>`;
  if (!S.showPast) html += installHint();
  if (!S.showPast) {
    const soon = all.filter((e) => new Date(e.starts_at) > new Date() && !e.cancelled).slice(0, 3);
    const sIds = soon.map((e) => e.id);
    const myRegs = sIds.length ? await q(sb.from('registrations').select('event_id,status').eq('member_id', S.me.id).in('event_id', sIds)) : [];
    html += `<h2 style="margin-top:6px">Was steht an?</h2><div class="list">${soon.map((e) => `<a class="row" href="#/event/${e.id}">
        <div class="date"><div class="d">${fmt(e.starts_at, { day: 'numeric' })}</div><div class="m">${fmt(e.starts_at, { month: 'short' })}</div></div>
        <div class="grow"><b>${h(evTitle(e))}</b><div class="sub">${fmt(e.starts_at, { weekday: 'short' })} ${fTime(e.starts_at)}${e.location ? ' · ' + h(e.location) : ''}</div></div>
        ${catOf(e) !== 'club' ? `<span class="chip blue">${catLabel(e)}</span>` : statusChip(myRegs.find((r) => r.event_id === e.id))}</a>`).join('') || '<div class="row muted">Keine Anlässe erfasst.</div>'}</div>`;
    const bd = birthdaysAround(-3, 7);
    if (bd.length) html += `<h2>Geburtstage</h2><div class="list">${bd.map((b) => `<div class="row">
        <div class="av gold">🎂</div>
        <div class="grow"><a href="#/m/${b.m.id}" style="color:inherit;text-decoration:none"><b>${h(fullName(b.m))}</b></a>
          <div class="sub">${b.days === 0 ? '<b>heute</b>' : b.days === 1 ? 'morgen' : b.days > 0 ? 'in ' + b.days + ' Tagen' : b.days === -1 ? 'gestern' : 'vor ' + (-b.days) + ' Tagen'} · ${b.days > 0 ? 'wird' : ''} ${b.age} Jahre</div></div>
        ${b.days <= 0 && b.m.id !== S.me.id ? `<button class="btn sm p" data-gr="${b.m.id}" data-age="${b.age}" data-late="${b.days < 0 ? 1 : ''}">🎉 Gratulieren</button>` : ''}</div>`).join('')}</div>`;
  }
  html += `<h2>Jahresprogramm</h2>
    <div class="seg"><a href="#" data-past="0" class="${S.showPast ? '' : 'on'}">Kommende</a><a href="#" data-past="1" class="${S.showPast ? 'on' : ''}">Vergangene</a></div>
    <div class="filt">${[['alle', 'Alle'], ['club', CAT.club], ['regio', CAT.regio], ['nat', CAT.nat]].map(([k, l]) => `<a href="#" data-f="${k}" class="${S.filter === k ? 'on' : ''}">${l} <span>${cnt(k)}</span></a>`).join('')}</div>`;
  if (S.admin) html += `<div class="btns" style="margin-bottom:12px"><a class="btn sm ghost" href="#/admin/event/neu">+ Anlass</a><a class="btn sm ghost" href="#/admin/serie">+ Clubabend-Serie</a></div>`;
  if (!events.length) html += `<div class="empty">Keine ${S.showPast ? 'vergangenen' : 'kommenden'} Anlässe in dieser Auswahl.</div>`;
  let lastMonth = '';
  for (const e of events) {
    const mon = fmt(e.starts_at, { month: 'long', year: 'numeric' });
    if (mon !== lastMonth) { html += `<h2>${h(mon)}</h2>`; lastMonth = mon; }
    const rs = byEv[e.id] || [];
    const mine = rs.find((r) => r.member_id === S.me.id);
    const an = rs.filter((r) => r.status === 'an');
    const persons = an.reduce((s, r) => s + 1 + (r.with_partner ? 1 : 0) + (r.guests || 0), 0);
    const past = new Date(e.starts_at) < new Date();
    const closed = past || e.cancelled || (e.reg_deadline && new Date(e.reg_deadline) < new Date());
    const ext = catOf(e) !== 'club';
    html += `<div class="card ev ${e.cancelled ? 'cancel' : ''} ${ext ? 'ext' : ''}" style="padding:0">
      <a class="row" href="#/event/${e.id}" style="border:0">
        <div class="date"><div class="d">${fmt(e.starts_at, { day: 'numeric' })}</div><div class="m">${fmt(e.starts_at, { weekday: 'short' })}</div></div>
        <div class="grow"><b>${h(evTitle(e))}</b><div class="sub">${fTime(e.starts_at)} · ${h(e.kind)}${e.location ? ' · ' + h(e.location) : ''}</div>
          <div style="margin-top:5px">${ext ? `<span class="chip blue">${catLabel(e)}</span> ` : ''}${e.cancelled ? '<span class="chip no">abgesagt</span> ' : ''}${statusChip(mine)} <span class="chip">${persons} Pers.</span></div></div>
      </a>
      ${closed ? '' : `<div class="btns" style="padding:0 14px 12px">
        <button class="btn sm ${mine?.status === 'an' ? 'ok' : 'ghost'}" data-reg="${e.id}" data-st="an">✓ ${ext ? 'Ich gehe' : 'Anmelden'}</button>
        <button class="btn sm ${mine?.status === 'ab' ? 'no' : 'ghost'}" data-reg="${e.id}" data-st="ab">✗ ${ext ? 'Nicht dabei' : 'Abmelden'}</button></div>`}
    </div>`;
  }
  $app.querySelector('main').innerHTML = html;
  const ihx = document.getElementById('ih_x');
  if (ihx) ihx.onclick = () => { try { localStorage.setItem('ac_ih_hide', '1'); } catch { /* */ } document.getElementById('ih').remove(); };
  const ihb = document.getElementById('ih_btn');
  if (ihb) ihb.onclick = async () => { S.installEvt.prompt(); try { await S.installEvt.userChoice; } catch { /* */ } viewProgramm(); };
  $app.querySelectorAll('[data-gr]').forEach((b) => b.onclick = () => congratulate(S.byId[b.dataset.gr], +b.dataset.age, !!b.dataset.late));
  $app.querySelectorAll('[data-past]').forEach((a) => a.onclick = (ev) => { ev.preventDefault(); S.showPast = a.dataset.past === '1'; viewProgramm(); });
  $app.querySelectorAll('[data-f]').forEach((a) => a.onclick = (ev) => { ev.preventDefault(); S.filter = a.dataset.f; try { localStorage.setItem('ac_filter', S.filter); } catch { /* */ } viewProgramm(); });
  $app.querySelectorAll('[data-reg]').forEach((b) => b.onclick = async () => {
    try { await setReg(b.dataset.reg, S.me.id, { status: b.dataset.st }); toast(b.dataset.st === 'an' ? 'Angemeldet' : 'Abgemeldet'); viewProgramm(); } catch (e) { err(e); }
  });
}
/* Hinweis «Zum Home-Bildschirm» – nur im Browser, nicht in der installierten App */
function installHint() {
  const standalone = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  let hidden = false; try { hidden = localStorage.getItem('ac_ih_hide') === '1'; } catch { /* */ }
  if (standalone || hidden) return '';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  const android = /Android/.test(ua);
  const share = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  const steps = ios
    ? `<ol><li>Unten in Safari auf <b>Teilen</b> ${share} tippen</li><li>Nach unten scrollen: <b>Zum Home-Bildschirm</b></li><li>Oben rechts <b>Hinzufügen</b> – fertig</li></ol><p class="small muted">Wichtig: in <b>Safari</b> öffnen (nicht in WhatsApp oder Mail-Vorschau).</p>`
    : android
      ? `<ol><li>In Chrome oben rechts auf <b>⋮</b> tippen</li><li><b>App installieren</b> oder <b>Zum Startbildschirm hinzufügen</b></li><li>Bestätigen – fertig</li></ol>`
      : `<p>Am Computer: in Chrome/Edge in der Adresszeile auf das Installieren-Symbol klicken. Am einfachsten öffnest du die App aber auf dem Handy mit deinem persönlichen Link.</p>`;
  return `<div class="card ih" id="ih"><div style="display:flex;gap:10px;align-items:flex-start">
    <img src="icons/icon-192.png" alt="" style="width:42px;height:42px;border-radius:10px">
    <div class="grow" style="flex:1"><b>App auf den Home-Bildschirm holen</b><div class="small muted">Dann startet AC Thun mit einem Tipp – wie jede andere App, ohne Login.</div></div>
    <button class="btn sm ghost" id="ih_x" aria-label="Ausblenden">✕</button></div>
    ${S.installEvt ? '<button class="btn p block" id="ih_btn" style="margin-top:10px">Jetzt installieren</button>' : steps}</div>`;
}

/* Geburtstage im Fenster [from, to] Tage relativ zu heute */
function birthdaysAround(from, to) {
  const t0 = new Date(today() + 'T12:00:00');
  const out = [];
  for (const m of S.members) {
    if (!m.aktiv || !m.geburtsdatum || !m.show_birthday) continue;
    const [y, mo, d] = m.geburtsdatum.split('-').map(Number);
    for (const yr of [t0.getFullYear() - 1, t0.getFullYear(), t0.getFullYear() + 1]) {
      const days = Math.round((new Date(yr, mo - 1, d, 12) - t0) / 864e5);
      if (days >= from && days <= to) out.push({ m, days, age: yr - y });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}
const waNumber = (n) => { let s = String(n || '').replace(/[^\d+]/g, ''); if (s.startsWith('00')) s = '+' + s.slice(2); if (s.startsWith('0')) s = '+41' + s.slice(1); return s.replace('+', ''); };
function congratulate(m, age, late) {
  const text = `Lieber ${m.vorname}\n\n${late ? 'Nachträglich ' : ''}herzliche Gratulation zum ${age}. Geburtstag! 🎉 Ich wünsche dir alles Gute, Gesundheit und viel Freude im neuen Lebensjahr.\n\nHerzliche Grüsse\n${S.me.vorname}`;
  const mob = m.mobile || m.tel;
  const opts = [
    mob ? `<a class="btn p block" target="_blank" rel="noopener" href="https://wa.me/${waNumber(mob)}?text=${encodeURIComponent(text)}">WhatsApp</a>` : '',
    mob ? `<a class="btn block" href="sms:${h(mob.replace(/\s/g, ''))}?&body=${encodeURIComponent(text)}">SMS</a>` : '',
    m.email ? `<a class="btn block" href="mailto:${h(m.email)}?subject=${encodeURIComponent('Herzliche Gratulation zum ' + age + '. Geburtstag')}&body=${encodeURIComponent(text)}">E-Mail</a>` : '',
    mob ? `<a class="btn ghost block" href="tel:${h(mob.replace(/\s/g, ''))}">Anrufen</a>` : '',
  ].filter(Boolean);
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="card sheet"><b>🎉 ${h(fullName(m))} – ${age} Jahre</b>
    <textarea id="gr_txt" style="margin:10px 0;min-height:150px">${h(text)}</textarea>
    <div style="display:grid;gap:8px">${opts.join('') || '<p class="muted">Keine Telefonnummer oder E-Mail hinterlegt.</p>'}</div>
    <button class="btn ghost block" id="gr_x" style="margin-top:8px">Schliessen</button></div>`;
  document.body.appendChild(ov);
  const upd = () => { const t = encodeURIComponent(document.getElementById('gr_txt').value);
    ov.querySelectorAll('a[href]').forEach((a) => { a.href = a.href.replace(/(text=|body=)[^&]*/, '$1' + t); }); };
  ov.querySelector('#gr_txt').oninput = upd;
  ov.onclick = (e) => { if (e.target === ov || e.target.id === 'gr_x') ov.remove(); };
}
function statusChip(r) {
  if (!r) return '<span class="chip gold">offen</span>';
  return r.status === 'an' ? '<span class="chip ok">angemeldet</span>' : '<span class="chip no">abgemeldet</span>';
}
async function setReg(eventId, memberId, fields) {
  await q(sb.from('registrations').upsert({ event_id: eventId, member_id: memberId, ...fields }, { onConflict: 'event_id,member_id' }));
}

async function viewEvent(id) {
  shell('Anlass', '', { tab: 'programm', back: true }); loading();
  const e = await q(sb.from('events').select('*').eq('id', id).single());
  const regs = await q(sb.from('registrations').select('*').eq('event_id', id));
  const mine = regs.find((r) => r.member_id === S.me.id);
  const an = regs.filter((r) => r.status === 'an').sort((a, b) => sortName(S.byId[a.member_id] || {}, S.byId[b.member_id] || {}));
  const ab = regs.filter((r) => r.status === 'ab');
  const active = S.members.filter((m) => m.aktiv);
  const open = active.filter((m) => !regs.some((r) => r.member_id === m.id));
  const persons = an.reduce((s, r) => s + 1 + (r.with_partner ? 1 : 0) + (r.guests || 0), 0);
  const past = new Date(e.starts_at) < new Date();
  const closed = past || e.cancelled || (e.reg_deadline && new Date(e.reg_deadline) < new Date());
  const full = e.max_participants && persons >= e.max_participants && mine?.status !== 'an';
  const ext = catOf(e) !== 'club';
  const nm = (r) => S.byId[r.member_id] ? fullName(S.byId[r.member_id]) : '?';
  let html = `<div class="hero">
      <div class="small" style="opacity:.8">${ext ? catLabel(e) + ' · ' : ''}${h(e.kind)}</div>
      <div style="font-size:21px;font-weight:700;margin:2px 0 6px">${h(evTitle(e))}</div>
      <div>${fDate(e.starts_at)}, ${fTime(e.starts_at)}${e.ends_at ? '–' + fTime(e.ends_at) : ''} Uhr</div>
      ${e.location ? `<div><a style="color:#fff" target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(e.location)}">${h(e.location)}</a></div>` : ''}
      <div style="margin-top:8px">${e.cancelled ? '<span class="chip">ABGESAGT</span> ' : ''}<span class="chip">${persons} Personen angemeldet${e.max_participants ? ' / max. ' + e.max_participants : ''}</span>
      ${e.reg_deadline ? ` <span class="chip">Anmeldeschluss ${fmt(e.reg_deadline, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}</div>
    </div>`;
  if (S.admin && !ext) html += `<a class="btn p block" href="factsheet.html?e=${e.id}" style="margin-bottom:10px">📋 Factsheet Präsident</a>`;
  if (e.description) html += `<div class="card" style="white-space:pre-wrap">${h(e.description)}</div>`;
  html += `<div class="card"><b>Meine Anmeldung</b> ${statusChip(mine)}`;
  if (closed) html += `<p class="muted small">${e.cancelled ? 'Der Anlass ist abgesagt.' : 'Die Anmeldung ist geschlossen.'}</p>`;
  else {
    html += `${e.allow_partner ? `<label class="check"><input type="checkbox" id="partner" ${mine?.with_partner ? 'checked' : ''}> mit Partnerin / Partner</label>` : ''}
      <div class="grid2"><div><label>Gäste</label><input id="guests" type="number" min="0" max="10" value="${mine?.guests || 0}"></div><div></div></div>
      <label>Bemerkung (z.B. vegetarisch)</label><input id="comment" value="${h(mine?.comment || '')}">
      ${full ? '<p class="small" style="color:var(--no)">Ausgebucht.</p>' : ''}
      <div class="btns" style="margin-top:12px"><button class="btn ok" id="an" ${full ? 'disabled' : ''}>✓ Anmelden</button><button class="btn no" id="ab">✗ Abmelden</button></div>`;
  }
  html += `</div>`;
  html += `<h2>Angemeldet (${an.length})</h2><div class="list">${an.map((r) => `<div class="row"><div class="grow">${h(nm(r))}<div class="sub">${[r.with_partner ? '+ Partner/in' : '', r.guests ? '+ ' + r.guests + ' Gast/Gäste' : '', r.comment || ''].filter(Boolean).map(h).join(' · ')}</div></div></div>`).join('') || '<div class="row muted">Noch niemand</div>'}</div>`;
  html += `<h2>Abgemeldet (${ab.length})</h2><div class="list">${ab.map((r) => `<div class="row"><div class="grow">${h(nm(r))}${r.comment ? `<div class="sub">${h(r.comment)}</div>` : ''}</div></div>`).join('') || '<div class="row muted">–</div>'}</div>`;
  html += `<details class="card"><summary><b>Noch keine Antwort (${open.length})</b> ›</summary><div class="small" style="margin-top:8px">${open.sort(sortName).map((m) => h(fullName(m))).join(', ') || '–'}</div></details>`;
  if (S.admin) {
    html += `<h2>Admin</h2><div class="btns"><a class="btn" href="#/admin/event/${e.id}">Bearbeiten</a><button class="btn" id="exp">Liste CSV</button></div>
      <details class="card" style="margin-top:10px"><summary><b>Status für Mitglieder setzen</b> ›</summary><table style="margin-top:8px">
      ${active.sort(sortName).map((m) => { const r = regs.find((x) => x.member_id === m.id); return `<tr><td>${h(fullName(m))}</td><td style="width:130px"><select data-adm="${m.id}"><option value="">– offen –</option><option value="an" ${r?.status === 'an' ? 'selected' : ''}>angemeldet</option><option value="ab" ${r?.status === 'ab' ? 'selected' : ''}>abgemeldet</option></select></td></tr>`; }).join('')}
      </table></details>`;
  }
  $app.querySelector('main').innerHTML = html;
  const save = async (status) => {
    try {
      await setReg(id, S.me.id, { status, with_partner: status === 'an' && !!val('partner'), guests: status === 'an' ? Math.max(0, Math.min(10, +(val('guests') || 0))) : 0, comment: val('comment') });
      toast(status === 'an' ? 'Angemeldet' : 'Abgemeldet'); viewEvent(id);
    } catch (x) { err(x); }
  };
  document.getElementById('an') && (document.getElementById('an').onclick = () => save('an'));
  document.getElementById('ab') && (document.getElementById('ab').onclick = () => save('ab'));
  if (S.admin) {
    document.getElementById('exp').onclick = () => {
      const rows = [['Name', 'Status', 'Partner', 'Gäste', 'Bemerkung']];
      regs.forEach((r) => rows.push([nm(r), r.status === 'an' ? 'angemeldet' : 'abgemeldet', r.with_partner ? 'ja' : '', r.guests || '', r.comment || '']));
      open.forEach((m) => rows.push([fullName(m), 'offen', '', '', '']));
      download(`Anmeldungen_${e.starts_at.slice(0, 10)}_${evTitle(e).replace(/\W+/g, '_')}.csv`, csv(rows), 'text/csv');
    };
    $app.querySelectorAll('[data-adm]').forEach((s) => s.onchange = async () => {
      try {
        if (!s.value) await q(sb.from('registrations').delete().eq('event_id', id).eq('member_id', s.dataset.adm));
        else await setReg(id, s.dataset.adm, { status: s.value });
        toast('Gespeichert');
      } catch (x) { err(x); }
    });
  }
}

/* ---------- Mitglieder ---------- */
function viewMembers() {
  shell('Mitglieder', `<div class="search"><input id="s" type="search" placeholder="Suchen (Name, Ort, Beruf…)"></div><div id="ml"></div>`, { tab: 'mitglieder' });
  const list = S.members.filter((m) => m.aktiv).sort(sortName);
  const draw = () => {
    const t = (document.getElementById('s').value || '').toLowerCase();
    const f = list.filter((m) => !t || [m.vorname, m.nachname, m.ort, m.beruf, m.firma, m.partner_vorname].join(' ').toLowerCase().includes(t));
    document.getElementById('ml').innerHTML = `<p class="muted small">${f.length} Mitglieder</p><div class="list">${f.map((m) => `
      <div class="row"><a href="#/m/${m.id}" class="row" style="padding:0;border:0;flex:1;min-width:0">
        <div class="av ${m.ehrenmitglied ? 'gold' : ''}">${h(initials(m))}</div>
        <div class="grow"><b>${h(m.nachname)}</b> ${h(m.vorname)}<div class="sub">${h([m.ort, m.beruf].filter(Boolean).join(' · '))}</div></div></a>
        ${m.mobile || m.tel ? `<a class="btn sm ghost" href="tel:${h((m.mobile || m.tel).replace(/\s/g, ''))}" aria-label="Anrufen">${ICON.phone}</a>` : ''}
      </div>`).join('')}</div>`;
  };
  document.getElementById('s').oninput = draw; draw();
}

async function viewMember(id) {
  const m = S.byId[id]; if (!m) return (location.hash = '#/mitglieder');
  shell(fullName(m), '', { tab: 'mitglieder', back: true });
  const terms = await q(sb.from('board_terms').select('*').eq('member_id', id).order('start_date', { ascending: false }));
  const roleName = (rid) => S.roles.find((r) => r.id === rid)?.name || '';
  const addr = [m.strasse, [m.plz, m.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const kv = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const tel = (n) => n ? `<a href="tel:${h(n.replace(/\s/g, ''))}">${h(n)}</a>` : '';
  let html = `<div class="card" style="display:flex;gap:14px;align-items:center"><div class="av ${m.ehrenmitglied ? 'gold' : ''}" style="width:58px;height:58px;font-size:20px">${h(initials(m))}</div>
     <div><div style="font-size:20px;font-weight:700">${h(fullName(m))}</div><div class="muted">${h([m.beruf, m.firma].filter(Boolean).join(', '))}</div>
     ${m.ehrenmitglied ? '<span class="chip gold">Ehrenmitglied</span>' : ''}</div></div>
   <div class="btns" style="margin-bottom:10px">
     ${m.mobile || m.tel ? `<a class="btn p" href="tel:${h((m.mobile || m.tel).replace(/\s/g, ''))}">Anrufen</a>` : ''}
     ${m.mobile ? `<a class="btn" href="sms:${h(m.mobile.replace(/\s/g, ''))}">SMS</a>` : ''}
     ${m.email ? `<a class="btn" href="mailto:${h(m.email)}">E-Mail</a>` : ''}
     <button class="btn" id="vcf">Kontakt</button></div>
   <div class="card"><dl class="kv">
     ${kv('Adresse', addr ? `<a target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(addr)}">${h(addr)}</a>` : '')}
     ${kv('Mobile', tel(m.mobile))}${kv('Telefon', tel(m.tel))}${kv('E-Mail', m.email ? `<a href="mailto:${h(m.email)}">${h(m.email)}</a>` : '')}
     ${kv('Geburtstag', m.show_birthday && m.geburtsdatum ? h(fDM(m.geburtsdatum)) + ` <span class="muted">(${ageOf(m.geburtsdatum)} Jahre)</span>` : '')}
     ${kv('Partner/in', h([m.partner_vorname, m.partner_nachname].filter(Boolean).join(' ')))}
     ${kv('Im Club seit', h(fDay(m.eintritt)))}${kv('Interessen', h(m.hobbies))}
   </dl></div>`;
  if (terms.length) html += `<h2>Ämter im Vorstand</h2><div class="list">${terms.map((t) => `<div class="row"><div class="grow">${h(roleName(t.role_id))}<div class="sub">${h(yearRange(t))}</div></div></div>`).join('')}</div>`;
  if (S.admin) html += `<a class="btn ghost block" href="#/admin/m/${m.id}">Bearbeiten (Admin)</a>`;
  $app.querySelector('main').innerHTML = html;
  document.getElementById('vcf').onclick = () => download(`${m.vorname}_${m.nachname}.vcf`, vcard(m), 'text/vcard');
}
function vcard(m) {
  const e = (s) => String(s || '').replace(/([,;\\])/g, '\\$1');
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(m.nachname)};${e(m.vorname)};;;`, `FN:${e(fullName(m))}`,
    m.firma ? `ORG:${e(m.firma)}` : '', m.beruf ? `TITLE:${e(m.beruf)}` : '',
    m.mobile ? `TEL;TYPE=CELL:${m.mobile}` : '', m.tel ? `TEL;TYPE=HOME:${m.tel}` : '', m.email ? `EMAIL:${m.email}` : '',
    (m.strasse || m.ort) ? `ADR;TYPE=HOME:;;${e(m.strasse)};${e(m.ort)};;${e(m.plz)};${e(m.land)}` : '',
    m.geburtsdatum && m.show_birthday ? `BDAY:${m.geburtsdatum}` : '', 'NOTE:Ambassador Club Thun', 'END:VCARD'].filter(Boolean).join('\r\n');
}

/* ---------- Vorstand ---------- */
const yearRange = (t) => `${fDay(t.start_date)} – ${t.end_date ? fDay(t.end_date) : 'heute'}`;
const termName = (t) => t.member_id && S.byId[t.member_id] ? fullName(S.byId[t.member_id]) : (t.name_text || '–');
const isCurrent = (t) => t.start_date <= today() && (!t.end_date || t.end_date >= today());

async function viewVorstand() {
  shell('Vorstand', '', { tab: 'vorstand' }); loading();
  const terms = await q(sb.from('board_terms').select('*').order('start_date', { ascending: false }));
  const tab = S.vorstandTab;
  let html = `<div class="seg"><a href="#" data-t="aktuell" class="${tab === 'aktuell' ? 'on' : ''}">Aktuell</a><a href="#" data-t="history" class="${tab === 'history' ? 'on' : ''}">Geschichte</a></div>`;
  if (tab === 'aktuell') {
    const cur = terms.filter(isCurrent);
    html += `<div class="list">${S.roles.map((r) => cur.filter((t) => t.role_id === r.id).map((t) => `
      <a class="row" href="${t.member_id ? '#/m/' + t.member_id : '#/vorstand'}"><div class="grow"><div class="small muted" style="text-transform:uppercase;letter-spacing:.4px">${h(r.name)}</div><b>${h(termName(t))}</b></div><span class="muted small">seit ${new Date(t.start_date).getFullYear()}</span></a>`).join('')).join('') || '<div class="row muted">Noch kein Vorstand erfasst.</div>'}</div>`;
  } else {
    for (const r of S.roles) {
      const ts = terms.filter((t) => t.role_id === r.id);
      if (!ts.length) continue;
      html += `<h2>${h(r.name)}</h2><div class="list">${ts.map((t) => `<div class="row"><div class="grow"><b>${h(termName(t))}</b> ${isCurrent(t) ? '<span class="chip ok">aktuell</span>' : ''}<div class="sub">${h(yearRange(t))}${t.note ? ' · ' + h(t.note) : ''}</div></div></div>`).join('')}</div>`;
    }
    if (!terms.length) html += '<div class="empty">Noch keine Einträge.</div>';
  }
  if (S.admin) html += `<a class="btn ghost block" href="#/admin/vorstand" style="margin-top:12px">Vorstand bearbeiten</a>`;
  $app.querySelector('main').innerHTML = html;
  $app.querySelectorAll('[data-t]').forEach((a) => a.onclick = (e) => { e.preventDefault(); S.vorstandTab = a.dataset.t; viewVorstand(); });
}

/* ---------- Geburtstage ---------- */
function viewBirthdays() {
  const t0 = new Date(today() + 'T12:00:00');
  const list = S.members.filter((m) => m.aktiv && m.geburtsdatum && m.show_birthday).map((m) => {
    const [y, mo, d] = m.geburtsdatum.split('-').map(Number);
    let next = new Date(t0.getFullYear(), mo - 1, d, 12);
    if (next < t0) next = new Date(t0.getFullYear() + 1, mo - 1, d, 12);
    return { m, next, days: Math.round((next - t0) / 864e5), age: next.getFullYear() - y, mo, d };
  });
  const row = (b) => `<a class="row" href="#/m/${b.m.id}"><div class="date"><div class="d">${b.d}</div><div class="m">${MONTHS[b.mo - 1].slice(0, 3)}</div></div>
    <div class="grow"><b>${h(fullName(b.m))}</b><div class="sub">${b.days === 0 ? 'heute!' : b.days === 1 ? 'morgen' : 'in ' + b.days + ' Tagen'}</div></div>
    ${b.days === 0 ? '<span class="chip ok">🎉 heute</span>' : ''} <span class="chip ${b.age % 5 === 0 ? 'gold' : ''}">${b.days === 0 ? '' : 'wird '}${b.age}</span></a>`;
  const soon = list.filter((b) => b.days <= 45).sort((a, b) => a.days - b.days);
  let html = `<h2>Nächste 45 Tage</h2><div class="list">${soon.map(row).join('') || '<div class="row muted">Keine</div>'}</div>`;
  for (let i = 0; i < 12; i++) {
    const mo = ((t0.getMonth() + i) % 12) + 1;
    const ms = list.filter((b) => b.mo === mo).sort((a, b) => a.d - b.d);
    if (ms.length) html += `<h2>${MONTHS[mo - 1]}</h2><div class="list">${ms.map(row).join('')}</div>`;
  }
  if (!list.length) html += '<div class="empty">Noch keine Geburtstage erfasst.</div>';
  shell('Geburtstage', html, { tab: 'geburtstage' });
}

/* ---------- Mehr ---------- */
function viewMore() {
  const r = (href, t, s) => `<a class="row" href="${href}"><div class="grow"><b>${t}</b>${s ? `<div class="sub">${s}</div>` : ''}</div><span class="muted">›</span></a>`;
  shell('Mehr', `
    <div class="card" style="display:flex;gap:12px;align-items:center"><div class="av">${h(initials(S.me))}</div><div><b>${h(fullName(S.me))}</b><div class="muted small">${S.admin ? 'Administrator' : 'Mitglied'}</div></div></div>
    <div class="list">${r('#/profil', 'Mein Profil', 'Adresse, Telefon, Geburtstag')}${r('#/kalender', 'Kalender abonnieren', 'Jahresprogramm im eigenen Kalender')}${r('#/link', 'Mein persönlicher Login-Link', 'für weitere Geräte')}${r('#/installieren', 'App auf Startbildschirm', 'iPhone & Android')}</div>
    <h2>Demnächst</h2>
    <div class="list">${r('#/bald/shop', 'Shop', 'Pins, Aufkleber, AC-Gürtel')}${r('#/bald/dokumente', 'Dokumente', 'Statuten, Protokolle, Downloads')}${r('#/bald/mitteilungen', 'Mitteilungen', 'E-Mail & Push an Mitglieder')}</div>
    ${S.admin ? `<h2>Verwaltung</h2><div class="list">${r('factsheet.html', 'Factsheet Präsident', 'nächster Clubanlass')}${r('#/admin', 'Admin-Bereich', 'Mitglieder, Codes, Programm, Vorstand')}</div>` : ''}
    <button class="btn ghost block" id="logout" style="margin-top:10px">Abmelden</button>`, { tab: 'mehr' });
  document.getElementById('logout').onclick = async () => {
    try { localStorage.removeItem('ac_code'); } catch { /* */ }
    await sb.auth.signOut(); S.me = null; history.replaceState(null, '', location.pathname); renderLogin();
  };
}
function viewSoon(what) {
  const t = { shop: 'Shop', dokumente: 'Dokumente', mitteilungen: 'Mitteilungen' }[what] || 'Demnächst';
  shell(t, `<div class="empty">Dieses Modul folgt in Version 2.</div>`, { tab: 'mehr', back: true });
}

const PROFILE_FIELDS = [['anrede', 'Anrede'], ['vorname', 'Vorname'], ['nachname', 'Nachname'], ['strasse', 'Strasse'], ['plz', 'PLZ'], ['ort', 'Ort'], ['land', 'Land'],
  ['email', 'E-Mail', 'email'], ['mobile', 'Mobile', 'tel'], ['tel', 'Telefon', 'tel'], ['geburtsdatum', 'Geburtsdatum', 'date'], ['beruf', 'Beruf'], ['firma', 'Firma'],
  ['partner_vorname', 'Partner/in Vorname'], ['partner_nachname', 'Partner/in Nachname'], ['hobbies', 'Interessen']];
const ADMIN_FIELDS = [['member_no', 'Mitglied-Nr.'], ['eintritt', 'Eintritt', 'date']];
const fieldsHtml = (m, fields) => `<div class="grid2">${fields.map(([k, l, t]) => `<div style="${['strasse', 'email', 'hobbies'].includes(k) ? 'grid-column:1/-1' : ''}"><label>${l}</label><input id="f_${k}" type="${t || 'text'}" value="${h(m[k] || '')}"></div>`).join('')}</div>`;
const readFields = (fields) => Object.fromEntries(fields.map(([k]) => [k, val('f_' + k)]));

function viewProfile() {
  shell('Mein Profil', `<div class="card">${fieldsHtml(S.me, PROFILE_FIELDS)}
    <label class="check"><input type="checkbox" id="f_show_birthday" ${S.me.show_birthday ? 'checked' : ''}> Geburtstag für andere Mitglieder sichtbar</label>
    <button class="btn p block" id="save">Speichern</button></div>`, { tab: 'mehr', back: true });
  document.getElementById('save').onclick = async () => {
    const d = { ...readFields(PROFILE_FIELDS), show_birthday: val('f_show_birthday') };
    if (!d.vorname || !d.nachname) return toast('Vor- und Nachname nötig');
    try { const r = await q(sb.from('members').update(d).eq('id', S.me.id).select().single()); Object.assign(S.me, r); toast('Gespeichert'); } catch (e) { err(e); }
  };
}

async function mySecret() { return q(sb.from('member_secrets').select('*').eq('member_id', S.me.id).single()); }
async function viewCalendar() {
  shell('Kalender-Abo', '', { tab: 'mehr', back: true }); loading();
  const s = await mySecret();
  const https = `${CFG.supabaseUrl}/functions/v1/ical?t=${s.ical_token}`;
  const webcal = https.replace(/^https:/, 'webcal:');
  $app.querySelector('main').innerHTML = `<div class="card">
    <p>Abonniere das Jahresprogramm in deinem Kalender. Neue oder geänderte Anlässe erscheinen automatisch; deine An-/Abmeldung wird mit ✓ / ✗ angezeigt.</p>
    <div class="btns"><a class="btn p" href="${h(webcal)}">iPhone / Mac / Outlook</a><a class="btn" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}">Google Kalender</a></div>
    <label>Abo-Adresse (persönlich, nicht weitergeben)</label><div class="mono card" style="background:var(--bg)">${h(https)}</div>
    <button class="btn block" id="cp">Adresse kopieren</button>
    <p class="small muted">Outlook (Desktop): Kalender hinzufügen → Aus dem Internet → Adresse einfügen.</p></div>`;
  document.getElementById('cp').onclick = () => copy(https);
}
async function viewMyLink() {
  shell('Mein Login-Link', '', { tab: 'mehr', back: true }); loading();
  const s = await mySecret();
  const link = `${appBase()}?code=${s.login_code}`;
  $app.querySelector('main').innerHTML = `<div class="card"><p>Mit diesem Link oder Code meldest du dich auf weiteren Geräten an. Bitte nicht weitergeben.</p>
    <label>Code</label><div class="code card" style="background:var(--bg)">${h(s.login_code.replace(/(.{4})(?=.)/g, '$1-'))}</div>
    <label>Link</label><div class="mono card" style="background:var(--bg)">${h(link)}</div><button class="btn p block" id="cp">Link kopieren</button></div>`;
  document.getElementById('cp').onclick = () => copy(link);
}
function viewInstall() {
  shell('App installieren', `<div class="card"><b>iPhone (Safari)</b><p>Unten auf <b>Teilen</b> tippen → <b>Zum Home-Bildschirm</b>.</p></div>
    <div class="card"><b>Android (Chrome)</b><p>Menü ⋮ → <b>App installieren</b> bzw. <b>Zum Startbildschirm hinzufügen</b>.</p>
    ${S.installEvt ? '<button class="btn p block" id="inst">Jetzt installieren</button>' : ''}</div>`, { tab: 'mehr', back: true });
  const b = document.getElementById('inst'); if (b) b.onclick = () => S.installEvt.prompt();
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (S.me && /^#\/?(programm)?$/.test(location.hash || '#/')) viewProgramm(); });

/* ---------- Admin ---------- */
function viewAdmin() {
  const r = (href, t, s) => `<a class="row" href="${href}"><div class="grow"><b>${t}</b><div class="sub">${s}</div></div><span class="muted">›</span></a>`;
  shell('Admin', `<div class="list">
    ${r('factsheet.html', 'Factsheet Präsident', 'Teilnehmer, Abmeldungen, Geburtstage – druckbar')}
    ${r('#/admin/mitglieder', 'Mitglieder verwalten', 'erfassen, bearbeiten, Admin-Rechte')}
    ${r('#/admin/codes', 'Persönliche Codes & Links', 'versenden, neu erzeugen, CSV')}
    ${r('#/admin/import', 'Excel-Import', 'Export von ambassadorclub.net einlesen')}
    ${r('#/admin/event/neu', 'Anlass erfassen', 'einzelner Termin')}
    ${r('#/admin/serie', 'Clubabend-Serie', '1. Mi Lunch, 3. Mi Monatsanlass')}
    ${r('#/admin/vorstand', 'Vorstand bearbeiten', 'Ämter & Geschichte')}</div>`, { tab: 'mehr', back: true });
}

function viewAdminMembers() {
  const ms = [...S.members].sort(sortName);
  shell('Mitglieder verwalten', `<a class="btn p block" href="#/admin/m/neu" style="margin-bottom:12px">+ Neues Mitglied</a>
    <div class="list">${ms.map((m) => `<a class="row" href="#/admin/m/${m.id}"><div class="av ${m.aktiv ? '' : 'gold'}">${h(initials(m))}</div><div class="grow"><b>${h(m.nachname)}</b> ${h(m.vorname)}<div class="sub">${h(m.email || 'keine E-Mail')}</div></div>${m.aktiv ? '' : '<span class="chip">inaktiv</span>'}${m.auth_user_id ? '<span class="chip ok">aktiv in App</span>' : ''}</a>`).join('')}</div>`, { tab: 'mehr', back: true });
}

async function viewAdminMember(id) {
  const isNew = id === 'neu';
  const m = isNew ? { aktiv: true, show_birthday: true, land: 'CH' } : S.byId[id];
  if (!m) return (location.hash = '#/admin/mitglieder');
  const admins = await q(sb.from('admins').select('member_id'));
  const isAdm = admins.some((a) => a.member_id === id);
  shell(isNew ? 'Neues Mitglied' : fullName(m), `<div class="card">${fieldsHtml(m, [...PROFILE_FIELDS, ...ADMIN_FIELDS])}
    <label class="check"><input type="checkbox" id="f_show_birthday" ${m.show_birthday ? 'checked' : ''}> Geburtstag sichtbar</label>
    <label class="check"><input type="checkbox" id="f_ehrenmitglied" ${m.ehrenmitglied ? 'checked' : ''}> Ehrenmitglied</label>
    <label class="check"><input type="checkbox" id="f_aktiv" ${m.aktiv ? 'checked' : ''}> Aktiv (Zugang zur App)</label>
    <label class="check"><input type="checkbox" id="f_admin" ${isAdm ? 'checked' : ''}> Administrator</label>
    <button class="btn p block" id="save">Speichern</button>
    ${isNew ? '' : '<button class="btn ghost block" id="del" style="margin-top:8px;color:var(--no)">Mitglied löschen</button>'}</div>`, { tab: 'mehr', back: true });
  document.getElementById('save').onclick = async () => {
    const d = { ...readFields([...PROFILE_FIELDS, ...ADMIN_FIELDS]), show_birthday: val('f_show_birthday'), ehrenmitglied: val('f_ehrenmitglied'), aktiv: val('f_aktiv') };
    if (!d.vorname || !d.nachname) return toast('Vor- und Nachname nötig');
    try {
      const r = isNew ? await q(sb.from('members').insert(d).select().single()) : await q(sb.from('members').update(d).eq('id', id).select().single());
      const wantAdm = val('f_admin');
      if (wantAdm && !isAdm) await q(sb.from('admins').insert({ member_id: r.id }));
      if (!wantAdm && isAdm) await q(sb.from('admins').delete().eq('member_id', r.id));
      await loadBase(); toast('Gespeichert'); location.hash = '#/admin/mitglieder';
    } catch (e) { err(e); }
  };
  const del = document.getElementById('del');
  if (del) del.onclick = async () => {
    if (!confirm(`${fullName(m)} wirklich löschen? Anmeldungen werden ebenfalls gelöscht. (Alternative: «Aktiv» abwählen.)`)) return;
    try { await q(sb.from('members').delete().eq('id', id)); await loadBase(); location.hash = '#/admin/mitglieder'; } catch (e) { err(e); }
  };
}

const MAIL_TPL = (absender) => `Lieber {vorname}

Der Ambassador Club Thun hat eine eigene App: Jahresprogramm mit An- und Abmeldung, Mitgliederliste mit Telefonnummern, Vorstand, Geburtstage und ein Kalender-Abo fürs Handy.

Dein persönlicher Zugang – einfach antippen:
{link}

Oder in der App den Code eingeben: {code}

Tipp: Nach dem Öffnen im Browser «Zum Home-Bildschirm» wählen (iPhone: Teilen-Symbol, Android: Menü ⋮). Dann ist die App wie jede andere auf dem Handy.

Bitte den Link nicht weitergeben – er ist dein persönlicher Schlüssel.

Herzliche Grüsse
${absender}
Ambassador Club Thun`;

async function viewAdminCodes() {
  shell('Codes & Links', '', { tab: 'mehr', back: true }); loading();
  const [secs, logs] = await Promise.all([q(sb.from('member_secrets').select('member_id,login_code')), q(sb.from('mail_log').select('member_id,ok,sent_at').eq('kind', 'code').order('sent_at'))]);
  const code = Object.fromEntries(secs.map((s) => [s.member_id, s.login_code]));
  const lastMail = {}; logs.forEach((l) => { if (l.ok) lastMail[l.member_id] = l.sent_at; });
  const ms = S.members.filter((m) => m.aktiv).sort(sortName);
  const link = (m) => `${appBase()}?code=${code[m.id]}`;
  const mail = (m) => `mailto:${encodeURIComponent(m.email || '')}?subject=${encodeURIComponent('Deine neue AC Thun App')}&body=${encodeURIComponent(`Lieber ${m.vorname}\n\nUnser Club hat eine eigene App: Jahresprogramm mit An-/Abmeldung, Mitgliederliste, Vorstand, Geburtstage und Kalender-Abo.\n\nDein persönlicher Zugang (bitte nicht weitergeben):\n${link(m)}\n\nLink antippen – fertig. Danach im Browser «Zum Home-Bildschirm» wählen, dann ist die App wie jede andere auf dem Handy.\n\nHerzliche Grüsse\n${S.me.vorname}`)}`;
  $app.querySelector('main').innerHTML = `
    ${CFG.appUrl ? '' : '<div class="card" style="background:var(--warn-bg)">Hinweis: In <b>config.js</b> ist noch keine <b>appUrl</b> eingetragen. Die Links zeigen auf die aktuelle Adresse.</div>'}
    <details class="card" id="sm" open><summary><b>✉️ Serienmail: Code an Mitglieder senden</b> ›</summary>
      <p class="small muted">Platzhalter: {vorname} {nachname} {link} {code}. Jedes Mitglied erhält seinen eigenen Link.</p>
      <label>Betreff</label><input id="sm_subj" value="Deine persönliche AC Thun App">
      <label>Text</label><textarea id="sm_text" style="min-height:230px">${h(MAIL_TPL(S.me.vorname))}</textarea>
      <label>Empfänger</label><select id="sm_who">
        <option value="never">Nur wer noch nie eingeloggt war und noch keine Mail erhielt (${ms.filter((m) => m.email && !m.auth_user_id && !lastMail[m.id]).length})</option>
        <option value="notin">Alle, die noch nie eingeloggt waren (${ms.filter((m) => m.email && !m.auth_user_id).length})</option>
        <option value="all">Alle aktiven Mitglieder mit E-Mail (${ms.filter((m) => m.email).length})</option></select>
      <div class="btns" style="margin-top:10px"><button class="btn" id="sm_test">Testmail an mich</button><button class="btn p" id="sm_go">Serienmail senden</button></div>
      <div id="sm_res"></div>
      <p class="small muted">Ohne E-Mail: ${ms.filter((m) => !m.email).map((m) => h(fullName(m))).join(', ') || '–'} → Link einzeln weitergeben.</p></details>
    <button class="btn block" id="csv" style="margin-bottom:12px">CSV für Serienmail (Name, E-Mail, Link)</button>
    <div class="list">${ms.map((m) => `<div class="row"><div class="grow"><b>${h(fullName(m))}</b><div class="sub mono">${h(code[m.id] || '–')}${m.auth_user_id ? ' · ✓ eingeloggt' : ''}${lastMail[m.id] ? ' · ✉️ ' + fmt(lastMail[m.id], { day: 'numeric', month: 'numeric' }) : ''}</div></div>
      <button class="btn sm ghost" data-cp="${m.id}">Link</button>${m.email ? `<a class="btn sm ghost" href="${h(mail(m))}">Mail</a>` : ''}<button class="btn sm ghost" data-new="${m.id}" title="Neuer Code">↻</button></div>`).join('')}</div>`;
  $app.querySelectorAll('[data-cp]').forEach((b) => b.onclick = () => copy(link(S.byId[b.dataset.cp])));
  $app.querySelectorAll('[data-new]').forEach((b) => b.onclick = async () => {
    if (!confirm('Neuen Code erzeugen? Der alte Link funktioniert dann nicht mehr (bestehende Logins bleiben).')) return;
    try { await q(sb.rpc('regenerate_login_code', { p_member: b.dataset.new })); viewAdminCodes(); } catch (e) { err(e); }
  });
  const send = async (test) => {
    const who = val('sm_who');
    const target = ms.filter((m) => m.email && (who === 'all' || (!m.auth_user_id && (who === 'notin' || !lastMail[m.id]))));
    const body = { subject: val('sm_subj'), text: document.getElementById('sm_text').value };
    if (test) { body.test_to = S.me.email || prompt('Testmail an welche Adresse?'); if (!body.test_to) return; }
    else { if (!target.length) return toast('Keine Empfänger'); if (!confirm(`Serienmail an ${target.length} Mitglieder senden?`)) return; body.member_ids = target.map((m) => m.id); }
    const res = document.getElementById('sm_res'); res.innerHTML = '<p class="small">Versand läuft…</p>';
    const { data, error } = await sb.functions.invoke('send-codes', { body });
    let j = data;
    if (error) { try { j = await error.context.json(); } catch { j = { error: error.message }; } }
    if (j?.error) { res.innerHTML = `<div class="card" style="background:var(--no-bg);color:var(--no)">${h(j.error)}${j.setup ? '<br><br>Einrichtung: Gratis-Konto bei brevo.com, Absender bestätigen, API-Key erstellen und in Supabase unter Edge Functions → Secrets als BREVO_API_KEY und MAIL_FROM eintragen.' : ''}</div>`; return; }
    res.innerHTML = `<p><b>${j.sent} gesendet</b>${j.failed ? `, <span style="color:var(--no)">${j.failed} Fehler</span>` : ''}${test ? ` (Test an ${h(body.test_to)})` : ''}</p>
      <div class="res">${j.results.filter((r) => !r.ok).map((r) => `<div>✗ ${h(r.name)} – ${h(r.error || '')}</div>`).join('')}</div>`;
    if (!test) setTimeout(viewAdminCodes, 2500);
  };
  document.getElementById('sm_test').onclick = () => send(true);
  document.getElementById('sm_go').onclick = () => send(false);
  document.getElementById('csv').onclick = () => download('AC_Thun_Zugangslinks.csv', csv([['Anrede', 'Vorname', 'Nachname', 'E-Mail', 'Link'], ...ms.map((m) => [m.anrede, m.vorname, m.nachname, m.email, link(m)])]), 'text/csv');
}

async function viewAdminEvent(id) {
  const isNew = id === 'neu';
  const e = isNew ? { kind: 'Anlass', location: DEFAULT_LOC, allow_partner: true, title: '' } : await q(sb.from('events').select('*').eq('id', id).single());
  const cat = catOf(e);
  const kinds = KINDS.includes(e.kind) ? KINDS : [e.kind, ...KINDS];
  shell(isNew ? 'Neuer Anlass' : 'Anlass bearbeiten', `<div class="card">
    <label>Veranstalter</label><select id="cat"><option value="club" ${cat === 'club' ? 'selected' : ''}>AC Thun</option><option value="Regio" ${cat === 'regio' ? 'selected' : ''}>Regio (anderer Club)</option><option value="National" ${/^National:/i.test(e.title) ? 'selected' : ''}>National (CHAC)</option><option value="International" ${/^International:/i.test(e.title) ? 'selected' : ''}>International (IAC)</option></select>
    <label>Titel</label><input id="title" value="${h(evTitle(e))}">
    <div class="grid2"><div><label>Art</label><select id="kind">${kinds.map((k) => `<option ${k === e.kind ? 'selected' : ''}>${h(k)}</option>`).join('')}</select></div>
      <div><label>Max. Personen</label><input id="max" type="number" min="0" value="${e.max_participants || ''}"></div>
      <div><label>Beginn</label><input id="start" type="datetime-local" value="${toLocalInput(e.starts_at)}"></div>
      <div><label>Ende</label><input id="end" type="datetime-local" value="${toLocalInput(e.ends_at)}"></div>
      <div style="grid-column:1/-1"><label>Anmeldeschluss</label><input id="dl" type="datetime-local" value="${toLocalInput(e.reg_deadline)}"></div></div>
    <label>Ort</label><input id="loc" value="${h(e.location || '')}">
    <label>Beschreibung / Programm</label><textarea id="desc">${h(e.description || '')}</textarea>
    <label class="check"><input type="checkbox" id="partner" ${e.allow_partner ? 'checked' : ''}> Partner/innen willkommen</label>
    <label class="check"><input type="checkbox" id="canc" ${e.cancelled ? 'checked' : ''}> Abgesagt</label>
    <button class="btn p block" id="save">Speichern</button>
    ${isNew ? '' : '<button class="btn ghost block" id="dup" style="margin-top:8px">Duplizieren</button><button class="btn ghost block" id="del" style="margin-top:8px;color:var(--no)">Löschen</button>'}</div>`, { tab: 'programm', back: true });
  const read = () => {
    const c = val('cat'); const t = val('title');
    return { title: t ? (c === 'club' ? t : `${c}: ${t}`) : null, kind: val('kind'), max_participants: val('max') ? +val('max') : null, starts_at: fromLocalInput(val('start')), ends_at: fromLocalInput(val('end')),
      reg_deadline: fromLocalInput(val('dl')), location: val('loc'), description: val('desc'), allow_partner: val('partner'), cancelled: val('canc') };
  };
  document.getElementById('save').onclick = async () => {
    const d = read(); if (!d.title || !d.starts_at) return toast('Titel und Beginn nötig');
    try { const r = isNew ? await q(sb.from('events').insert(d).select().single()) : await q(sb.from('events').update(d).eq('id', id).select().single()); toast('Gespeichert'); location.hash = '#/event/' + r.id; } catch (x) { err(x); }
  };
  if (!isNew) {
    document.getElementById('dup').onclick = async () => { const d = read(); d.title += ' (Kopie)'; try { const r = await q(sb.from('events').insert(d).select().single()); location.hash = '#/admin/event/' + r.id; } catch (x) { err(x); } };
    document.getElementById('del').onclick = async () => { if (!confirm('Anlass inkl. Anmeldungen löschen?')) return; try { await q(sb.from('events').delete().eq('id', id)); location.hash = '#/programm'; } catch (x) { err(x); } };
  }
}

function nthWeekday(year, month, weekday, n) { const d = new Date(year, month, 1); const off = (weekday - d.getDay() + 7) % 7; return new Date(year, month, 1 + off + (n - 1) * 7); }
function viewAdminSeries() {
  const y = new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0);
  shell('Clubabend-Serie', `<div class="card">
    <p class="small muted">Erzeugt die regulären Clubtage. Bereits vorhandene Termine am gleichen Tag mit gleicher Art werden übersprungen. Der Monatsname wird automatisch an den Titel angehängt (z.B. «Monatslunch März 2027»).</p>
    <label>Jahr</label><input id="yr" type="number" value="${y}">
    <label class="check"><input type="checkbox" id="lunch" checked> 1. Mittwoch: Lunch</label>
    <div class="grid2"><div><label>Lunch Beginn</label><input id="lt" type="time" value="11:45"></div><div><label>Titel</label><input id="ln" value="Monatslunch"></div></div>
    <label class="check"><input type="checkbox" id="dinner"> 3. Mittwoch: Monatsanlass</label>
    <div class="grid2"><div><label>Beginn</label><input id="dt" type="time" value="18:30"></div><div><label>Titel</label><input id="dn" value="Monatsanlass"></div></div>
    <label>Monate</label><div class="grid2">${MONTHS.map((m, i) => `<label class="check" style="margin:2px 0"><input type="checkbox" class="mon" value="${i}" checked> ${m}</label>`).join('')}</div>
    <label>Anmeldeschluss (Tage vorher, 0 = keiner)</label><input id="dl" type="number" min="0" value="2">
    <label>Ort</label><input id="loc" value="${h(DEFAULT_LOC)}">
    <button class="btn p block" id="go" style="margin-top:12px">Termine erzeugen</button></div>`, { tab: 'programm', back: true });
  document.getElementById('go').onclick = async () => {
    const yr = +val('yr'); const months = [...document.querySelectorAll('.mon:checked')].map((c) => +c.value);
    const mk = (date, time, title, kind) => { const [hh, mm] = time.split(':').map(Number); const s = new Date(date); s.setHours(hh, mm, 0, 0);
      const dl = +val('dl'); const d = dl ? new Date(s.getTime() - dl * 864e5) : null; if (d) d.setHours(12, 0, 0, 0);
      return { title: `${title} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`, kind, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + (kind === 'Lunch' ? 2 : 3.5) * 3600e3).toISOString(), reg_deadline: d ? d.toISOString() : null, location: val('loc'), allow_partner: kind !== 'Lunch' }; };
    const rows = [];
    months.forEach((mo) => {
      if (val('lunch')) rows.push(mk(nthWeekday(yr, mo, 3, 1), val('lt'), val('ln'), 'Lunch'));
      if (val('dinner')) rows.push(mk(nthWeekday(yr, mo, 3, 3), val('dt'), val('dn'), 'Anlass'));
    });
    try {
      const ex = await q(sb.from('events').select('title,kind,starts_at').gte('starts_at', `${yr}-01-01`).lte('starts_at', `${yr}-12-31T23:59`));
      const key = (e) => e.kind + '|' + new Date(e.starts_at).toDateString();
      const have = new Set(ex.filter((e) => catOf(e) === 'club').map(key)); const neu = rows.filter((r) => !have.has(key(r)));
      if (!neu.length) return toast('Alle Termine bereits vorhanden');
      if (!confirm(`${neu.length} Termine anlegen?`)) return;
      await q(sb.from('events').insert(neu)); toast(neu.length + ' Termine angelegt'); location.hash = '#/programm';
    } catch (x) { err(x); }
  };
}

/* Excel-Import (ambassadorclub.net Export) */
function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  const s = String(v).trim(); let m, y, mo, d;
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else return null;
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function viewAdminImport() {
  shell('Excel-Import', `<div class="card"><p class="small">Export der Mitgliederliste von ambassadorclub.net (Club-Mitglieder → Export) hier einlesen. Bestehende Mitglieder werden über die Mitglied-Nr. bzw. den Namen erkannt und ergänzt; leere Felder überschreiben nichts.</p>
    <input type="file" id="file" accept=".xlsx,.xls,.csv"></div><div id="prev"></div>`, { tab: 'mehr', back: true });
  document.getElementById('file').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      await loadXLSX();
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      const head = rows[0].map((x) => String(x).trim());
      const idx = (name, from = 0) => head.indexOf(name, from);
      const pIdx = idx('Familienname Partnerin / Partner');
      const col = { member_no: idx('memberID'), nachname: idx('Familienname'), vorname: idx('Vorname'), anrede: idx('Anrede'), strasse: idx('Strasse'),
        land: idx('Landeskennziffer'), plz: idx('Postleitzahl'), ort: idx('Ort'), email: idx('E-Mail'), tel: idx('P-Tel'), mobile: idx('P-Mobile'), eintritt: idx('Eintrittsdatum'),
        beruf: idx('Beruf'), firma: idx('Arbeitsgeber/Firma'), geburtsdatum: idx('Geburtsdatum'), partner_nachname: pIdx, partner_vorname: pIdx >= 0 ? idx('Vorname Partnerin / Partner') : -1,
        hobbies: idx('Hobby / Interessen'), ehrenmitglied: idx('Ehrenmitglied') };
      if (col.nachname < 0 || col.vorname < 0) throw new Error('Spalten «Familienname»/«Vorname» nicht gefunden');
      const recs = rows.slice(1).filter((r) => String(r[col.nachname]).trim()).map((r) => {
        const o = {};
        for (const [k, i] of Object.entries(col)) {
          if (i < 0) continue; let v = r[i];
          if (k === 'eintritt' || k === 'geburtsdatum') v = parseDate(v);
          else if (k === 'ehrenmitglied') v = !!v && !/^(\.+|-+|0|nein|no|false)$/i.test(String(v).trim());
          else { v = String(v ?? '').trim(); if (/^(\.+|-+)$/.test(v)) v = ''; v = v || null; }
          if (k === 'email' && v) v = v.toLowerCase();
          o[k] = v;
        }
        return o;
      });
      const nkey = (m) => (m.vorname + ' ' + m.nachname).toLowerCase().trim();
      const plan = recs.map((r) => ({ r, ex: S.members.find((m) => (r.member_no && m.member_no === r.member_no)) || S.members.find((m) => nkey(m) === nkey(r)) }));
      const missing = S.members.filter((m) => !plan.some((p) => p.ex?.id === m.id));
      document.getElementById('prev').innerHTML = `<div class="card"><b>${plan.filter((p) => !p.ex).length} neu</b>, <b>${plan.filter((p) => p.ex).length} aktualisieren</b>
        ${missing.length ? `<p class="small muted">Nicht in der Datei (bleiben unverändert): ${missing.map((m) => h(fullName(m))).join(', ')}</p>` : ''}
        <button class="btn p block" id="run" style="margin-top:10px">Import ausführen</button></div>
        <div class="list">${plan.map((p) => `<div class="row"><div class="grow">${h(p.r.nachname)} ${h(p.r.vorname)}<div class="sub">${h([p.r.ort, p.r.email].filter(Boolean).join(' · '))}</div></div><span class="chip ${p.ex ? '' : 'ok'}">${p.ex ? 'update' : 'neu'}</span></div>`).join('')}</div>`;
      document.getElementById('run').onclick = async () => {
        const btn = document.getElementById('run'); btn.disabled = true; btn.textContent = 'Import läuft…';
        try {
          const inserts = plan.filter((p) => !p.ex).map((p) => ({ ...p.r, ehrenmitglied: !!p.r.ehrenmitglied }));
          if (inserts.length) await q(sb.from('members').insert(inserts));
          for (const p of plan.filter((x) => x.ex)) {
            const upd = Object.fromEntries(Object.entries(p.r).filter(([, v]) => v !== null && v !== ''));
            await q(sb.from('members').update(upd).eq('id', p.ex.id));
          }
          await loadBase(); toast('Import abgeschlossen'); location.hash = '#/admin/codes';
        } catch (x) { err(x); btn.disabled = false; btn.textContent = 'Import ausführen'; }
      };
    } catch (x) { err(x); }
  };
}

async function viewAdminBoard() {
  shell('Vorstand bearbeiten', '', { tab: 'vorstand', back: true }); loading();
  const terms = await q(sb.from('board_terms').select('*').order('start_date', { ascending: false }));
  let html = `<a class="btn p block" href="#/admin/term/neu" style="margin-bottom:12px">+ Amt / Amtszeit erfassen</a>`;
  for (const r of S.roles) {
    const ts = terms.filter((t) => t.role_id === r.id);
    html += `<h2>${h(r.name)}</h2><div class="list">${ts.map((t) => `<a class="row" href="#/admin/term/${t.id}"><div class="grow"><b>${h(termName(t))}</b> ${isCurrent(t) ? '<span class="chip ok">aktuell</span>' : ''}<div class="sub">${h(yearRange(t))}</div></div><span class="muted">›</span></a>`).join('') || '<div class="row muted small">–</div>'}</div>`;
  }
  html += `<button class="btn ghost block" id="role" style="margin-top:12px">+ Neues Amt (Funktion) anlegen</button>`;
  $app.querySelector('main').innerHTML = html;
  document.getElementById('role').onclick = async () => {
    const n = prompt('Bezeichnung des Amtes:'); if (!n) return;
    try { await q(sb.from('board_roles').insert({ name: n.trim(), sort: (S.roles.at(-1)?.sort || 100) + 10 })); await loadBase(); viewAdminBoard(); } catch (e) { err(e); }
  };
}
async function viewAdminTerm(id) {
  const isNew = id === 'neu';
  const t = isNew ? { start_date: `${new Date().getFullYear()}-01-01` } : await q(sb.from('board_terms').select('*').eq('id', id).single());
  const ms = [...S.members].sort(sortName);
  shell(isNew ? 'Amtszeit erfassen' : 'Amtszeit bearbeiten', `<div class="card">
    <label>Amt</label><select id="role">${S.roles.map((r) => `<option value="${r.id}" ${r.id === t.role_id ? 'selected' : ''}>${h(r.name)}</option>`).join('')}</select>
    <label>Mitglied</label><select id="mem"><option value="">– anderer Name (z.B. ehemaliges Mitglied) –</option>${ms.map((m) => `<option value="${m.id}" ${m.id === t.member_id ? 'selected' : ''}>${h(m.nachname + ' ' + m.vorname)}</option>`).join('')}</select>
    <label>oder Name (falls nicht in Mitgliederliste)</label><input id="nt" value="${h(t.name_text || '')}">
    <div class="grid2"><div><label>Von</label><input id="sd" type="date" value="${t.start_date || ''}"></div><div><label>Bis (leer = aktuell)</label><input id="ed" type="date" value="${t.end_date || ''}"></div></div>
    <label>Notiz</label><input id="note" value="${h(t.note || '')}">
    <button class="btn p block" id="save" style="margin-top:12px">Speichern</button>
    ${isNew ? '' : '<button class="btn ghost block" id="del" style="margin-top:8px;color:var(--no)">Löschen</button>'}</div>`, { tab: 'vorstand', back: true });
  document.getElementById('save').onclick = async () => {
    const d = { role_id: val('role'), member_id: val('mem'), name_text: val('nt'), start_date: val('sd'), end_date: val('ed'), note: val('note') };
    if (!d.member_id && !d.name_text) return toast('Mitglied oder Name angeben');
    if (!d.start_date) return toast('Startdatum nötig');
    try { isNew ? await q(sb.from('board_terms').insert(d)) : await q(sb.from('board_terms').update(d).eq('id', id)); toast('Gespeichert'); location.hash = '#/admin/vorstand'; } catch (e) { err(e); }
  };
  const del = document.getElementById('del');
  if (del) del.onclick = async () => { if (!confirm('Eintrag löschen?')) return; try { await q(sb.from('board_terms').delete().eq('id', id)); location.hash = '#/admin/vorstand'; } catch (e) { err(e); } };
}

/* ---------- Styles für Filter (ergänzt index.html) ---------- */
(() => {
  const st = document.createElement('style');
  st.textContent = `.filt{display:flex;gap:6px;overflow-x:auto;margin:-4px 0 12px;padding-bottom:2px}
  .filt a{flex:none;padding:6px 12px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none;font-size:14px}
  .filt a span{color:var(--muted);font-size:12px;margin-left:2px}
  .filt a.on{background:#2E3192;border-color:#2E3192;color:#fff}.filt a.on span{color:#cfd0f5}
  .chip.blue{background:#e6e7f7;color:#2E3192}
  .hello{margin:2px 0 14px}.hello .hi{font-size:22px;font-weight:700;color:var(--navy)}
  .res{max-height:260px;overflow:auto;font-size:13px}
  .ih{border:1px solid var(--gold);background:var(--warn-bg)}.ih ol{margin:10px 0 4px;padding-left:22px}.ih li{margin:3px 0}
  .ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;display:flex;align-items:flex-end;justify-content:center;padding:12px}
  .ov .sheet{width:100%;max-width:480px;margin:0 0 calc(10px + env(safe-area-inset-bottom))}
  .card.ev.ext{border-left:4px solid var(--gold-l,#c4a76a)}`;
  document.head.appendChild(st);
})();

/* ---------- boot ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { S.me = null; } });
start();
