/* Ambassador Club Thun – App (v1.5) */
'use strict';
const CFG = window.AC_CONFIG;
const sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const $app = document.getElementById('app');
const S = { me: null, admin: false, cand: false, members: [], byId: {}, roles: [], absences: [], showPast: false, vorstandTab: 'aktuell', installEvt: null, filter: 'club', mailDraft: null };
// Standard: nur AC-Thun-Anlässe (neuer Schlüssel, damit die alte Einstellung «Alle» nicht übernommen wird)
try { S.filter = localStorage.getItem('ac_filter2') || 'club'; } catch { /* */ }
const TZ = 'Europe/Zurich';
const KINDS = ['Lunch', 'Nachtessen', 'Anlass', 'Ausflug', 'Generalversammlung', 'Vorstand', 'Andere'];
const DEFAULT_LOC = 'Restaurant Krone, Thun';
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/* ---------- helpers ---------- */
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Factsheet mit Code in der Adresse – so klappt es auch in Safari / in der iPhone-Web-App */
const factsheetUrl = (e) => { let c = ''; try { c = localStorage.getItem('ac_code') || ''; } catch { /* */ } const p = new URLSearchParams(); if (e) p.set('e', e); if (c) p.set('code', c); const qs = p.toString(); return 'factsheet.html' + (qs ? '?' + qs : ''); };
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
/* Stunde in Zürich (0–23). Achtung: toLocaleString({hour}) liefert in de-CH «9 Uhr» → darum formatToParts */
const hourNow = () => +new Intl.DateTimeFormat('de-CH', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).find((p) => p.type === 'hour').value;
const greeting = () => { const hr = hourNow(); return hr < 11 ? 'Guten Morgen' : hr < 18 ? 'Guten Tag' : 'Guten Abend'; };
const isCand = (m) => m?.status === 'kandidat';
const isMobile = () => /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && 'ontouchend' in document);
/* Abwesenheiten */
const GRUENDE = ['Ferien', 'Krankheit', 'Militär', 'Beruflich', 'Andere'];
const absOn = (mid, day) => S.absences.find((a) => a.member_id === mid && a.von <= day && a.bis >= day);
const absNow = (mid) => absOn(mid, today());
const absText = (a) => `${a.grund} ${a.von === a.bis ? 'am ' + fDM(a.von) : (a.von > today() ? fDM(a.von) + ' – ' : 'bis ') + fDM(a.bis)}`;
const absChip = (mid) => { const a = absNow(mid); return a ? `<span class="chip abs">${h(absText(a))}</span>` : ''; };
const csv = (rows) =>'﻿' + rows.map((r) => r.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');

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
  <nav class="tabs">${S.cand ? t('programm', 'Programm', 'cal') + t('mehr', 'Mehr', 'menu')
    : t('programm', 'Programm', 'cal') + t('mitglieder', 'Mitglieder', 'users') + t('vorstand', 'Vorstand', 'star') + t('geburtstage', 'Geburtstage', 'cake') + t('mehr', 'Mehr', 'menu')}</nav>`;
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
  const since = new Date(Date.now() - 2 * 864e5).toLocaleDateString('sv-SE', { timeZone: TZ });
  const [mid, adm, members, roles, absences] = await Promise.all([
    q(sb.rpc('my_member_id')), q(sb.rpc('is_admin')),
    q(sb.from('members').select('*').order('nachname')), q(sb.from('board_roles').select('*').order('sort')),
    q(sb.from('absences').select('*').gte('bis', since).order('von')),
  ]);
  try { S.settings = Object.fromEntries((await q(sb.from('settings').select('key,value'))).map((x) => [x.key, x.value])); } catch { S.settings = {}; }
  S.admin = !!adm;
  S.members = members; S.byId = Object.fromEntries(members.map((m) => [m.id, m]));
  S.roles = roles; S.absences = absences;
  S.me = mid ? S.byId[mid] : null;
  S.cand = isCand(S.me) && !S.admin;
  if (S.cand) S.filter = 'club';
}
const setv = (k, d = null) => (S.settings && S.settings[k] != null ? S.settings[k] : d);
const memberList = () => S.members.filter((m) => m.aktiv && !isCand(m));
const candList = () => S.members.filter((m) => m.aktiv && isCand(m));

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
  if (!new URLSearchParams(location.search).get('code')) {
    try { const s = await mySecret(); if (s?.login_code) rememberCode(s.login_code); } catch { /* */ }
  }
  route();
}

/* ---------- router ---------- */
const routes = [
  [/^$|^programm$/, viewProgramm], [/^event\/(.+)$/, viewEvent],
  [/^mitglieder$/, viewMembers], [/^m\/(.+)$/, viewMember],
  [/^vorstand$/, viewVorstand], [/^geburtstage$/, viewBirthdays],
  [/^mehr$/, viewMore], [/^profil$/, viewProfile], [/^kalender$/, viewCalendar], [/^link$/, viewMyLink], [/^installieren$/, viewInstall], [/^bald\/(.+)$/, viewSoon],
  [/^abwesenheit$/, () => viewAbsences()], [/^veto\/(.+)$/, viewVeto],
  [/^admin$/, viewAdmin], [/^admin\/mitglieder$/, viewAdminMembers], [/^admin\/m\/(.+)$/, viewAdminMember],
  [/^admin\/event\/(.+)$/, viewAdminEvent], [/^admin\/serie$/, viewAdminSeries], [/^admin\/import$/, viewAdminImport],
  [/^admin\/codes$/, viewAdminCodes], [/^admin\/vorstand$/, viewAdminBoard], [/^admin\/term\/(.+)$/, viewAdminTerm],
  [/^shop$/, viewShop], [/^shop\/bestellungen$/, viewMyOrders], [/^dokumente$/, viewDocuments],
  [/^admin\/einstellungen$/, viewAdminSettings], [/^admin\/abwesenheiten$/, () => viewAbsences(null, true)], [/^admin\/shop$/, viewAdminShop], [/^admin\/produkt\/(.+)$/, viewAdminProduct],
  [/^admin\/kandidaten$/, viewAdminCandidates], [/^admin\/mail(?:\/(.+))?$/, viewAdminMail], [/^admin\/abwesenheit\/(.+)$/, (id) => viewAbsences(id)],
];
const CAND_BLOCKED = /^(mitglieder|m\/|vorstand|geburtstage|veto\/|shop)/;
async function route() {
  if (!S.me) return;
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      if (path.startsWith('admin') && !S.admin) { location.hash = '#/programm'; return; }
      if (S.cand && CAND_BLOCKED.test(path)) { location.hash = '#/programm'; return; }
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
  if (S.cand) all.splice(0, all.length, ...all.filter((e) => catOf(e) === 'club'));
  const inFilter = (e) => S.filter === 'alle' || catOf(e) === S.filter;
  const events = all.filter(inFilter);
  const ids = events.map((e) => e.id);
  const regs = ids.length ? await q(sb.from('registrations').select('event_id,member_id,status,with_partner,guests').in('event_id', ids)) : [];
  const byEv = {};
  regs.forEach((r) => (byEv[r.event_id] ||= []).push(r));
  const cnt = (c) => all.filter((e) => c === 'alle' || catOf(e) === c).length;
  let html = `<div class="hello"><div class="hi">${greeting()} ${h(S.me.vorname)}</div></div>`;
  if (!S.showPast) html += installHint();
  if (!S.showPast && S.cand) {
    const g = S.byId[S.me.goetti_id];
    html += `<div class="card cand-card"><b>Willkommen als Kandidat</b><div class="small" style="margin-top:4px">Du kannst dich hier für die Anlässe des AC Thun an- und abmelden.${g ? ` Dein Götti ist <b>${h(fullName(g))}</b>${g.mobile || g.tel ? ` – <a href="tel:${h((g.mobile || g.tel).replace(/\s/g, ''))}">${h(g.mobile || g.tel)}</a>` : ''}.` : ''}</div></div>`;
  }
  if (!S.showPast && !S.cand) html += await vetoBanner();
  if (!S.showPast) {
    const soon = all.filter((e) => new Date(e.starts_at) > new Date() && !e.cancelled && inFilter(e)).slice(0, 3);
    const sIds = soon.map((e) => e.id);
    const myRegs = sIds.length ? await q(sb.from('registrations').select('event_id,status').eq('member_id', S.me.id).in('event_id', sIds)) : [];
    html += `<h2 style="margin-top:6px">Was steht an?</h2><div class="list">${soon.map((e) => `<a class="row" href="#/event/${e.id}">
        <div class="date"><div class="d">${fmt(e.starts_at, { day: 'numeric' })}</div><div class="m">${fmt(e.starts_at, { month: 'short' })}</div></div>
        <div class="grow"><b>${h(evTitle(e))}</b><div class="sub">${fmt(e.starts_at, { weekday: 'short' })} ${fTime(e.starts_at)}${e.location ? ' · ' + h(e.location) : ''}</div></div>
        ${catOf(e) !== 'club' ? `<span class="chip blue">${catLabel(e)}</span>` : statusChip(myRegs.find((r) => r.event_id === e.id))}</a>`).join('') || '<div class="row muted">Keine Anlässe erfasst.</div>'}</div>`;
    const bd = S.cand ? [] : birthdaysAround(-3, 7);
    if (bd.length) html += `<h2>Geburtstage</h2><div class="list">${bd.map((b) => `<div class="row">
        <div class="av gold">🎂</div>
        <div class="grow"><a href="#/m/${b.m.id}" style="color:inherit;text-decoration:none"><b>${h(fullName(b.m))}</b></a>
          <div class="sub">${b.days === 0 ? '<b>heute</b>' : b.days === 1 ? 'morgen' : b.days > 0 ? 'in ' + b.days + ' Tagen' : b.days === -1 ? 'gestern' : 'vor ' + (-b.days) + ' Tagen'} · ${b.days > 0 ? 'wird' : ''} ${b.age} Jahre</div></div>
        ${b.days <= 0 && b.m.id !== S.me.id ? `<button class="btn sm p" data-gr="${b.m.id}" data-age="${b.age}" data-late="${b.days < 0 ? 1 : ''}">🎉 Gratulieren</button>` : ''}</div>`).join('')}</div>`;
  }
  html += `<h2>Jahresprogramm</h2>
    <div class="seg"><a href="#" data-past="0" class="${S.showPast ? '' : 'on'}">Kommende</a><a href="#" data-past="1" class="${S.showPast ? 'on' : ''}">Vergangene</a></div>
    ${S.cand ? '' : `<div class="filt">${[['club', CAT.club], ['regio', CAT.regio], ['nat', CAT.nat], ['alle', 'Alle']].map(([k, l]) => `<a href="#" data-f="${k}" class="${S.filter === k ? 'on' : ''}">${l} <span>${cnt(k)}</span></a>`).join('')}</div>`}`;
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
          <div style="margin-top:5px">${ext ? `<span class="chip blue">${catLabel(e)}</span> ` : ''}${e.cancelled ? '<span class="chip no">abgesagt</span> ' : ''}${statusChip(mine)} ${S.cand ? '' : `<span class="chip">${persons} Pers.</span>`}</div></div>
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
  $app.querySelectorAll('[data-f]').forEach((a) => a.onclick = (ev) => { ev.preventDefault(); S.filter = a.dataset.f; try { localStorage.setItem('ac_filter2', S.filter); } catch { /* */ } viewProgramm(); });
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
    if (!m.aktiv || isCand(m) || !m.geburtsdatum || !m.show_birthday) continue;
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
  const ext = catOf(e) !== 'club';
  if (S.cand && ext) return (location.hash = '#/programm');
  // Kandidaten nehmen nur an AC-Thun-Anlässen teil
  const active = ext ? memberList() : [...memberList(), ...candList()];
  const evDay = new Date(e.starts_at).toLocaleDateString('sv-SE', { timeZone: TZ });
  const noAnswer = active.filter((m) => !regs.some((r) => r.member_id === m.id));
  const away = noAnswer.filter((m) => absOn(m.id, evDay));
  const open = noAnswer.filter((m) => !absOn(m.id, evDay));
  const persons = an.reduce((s, r) => s + 1 + (r.with_partner ? 1 : 0) + (r.guests || 0), 0);
  const past = new Date(e.starts_at) < new Date();
  const closed = past || e.cancelled || (e.reg_deadline && new Date(e.reg_deadline) < new Date());
  const full = e.max_participants && persons >= e.max_participants && mine?.status !== 'an';
  const candTag = (m) => isCand(m) ? ' <span class="chip cand">Kandidat</span>' : '';
  const nm = (r) => S.byId[r.member_id] ? fullName(S.byId[r.member_id]) : '?';
  const nmT = (r) => h(nm(r)) + candTag(S.byId[r.member_id]);
  let html = `<div class="hero">
      <div class="small" style="opacity:.8">${ext ? catLabel(e) + ' · ' : ''}${h(e.kind)}</div>
      <div style="font-size:21px;font-weight:700;margin:2px 0 6px">${h(evTitle(e))}</div>
      <div>${fDate(e.starts_at)}, ${fTime(e.starts_at)}${e.ends_at ? '–' + fTime(e.ends_at) : ''} Uhr</div>
      ${e.location ? `<div><a style="color:#fff" target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(e.location)}">${h(e.location)}</a></div>` : ''}
      <div style="margin-top:8px">${e.cancelled ? '<span class="chip">ABGESAGT</span> ' : ''}${S.cand ? '' : `<span class="chip">${persons} Personen angemeldet${e.max_participants ? ' / max. ' + e.max_participants : ''}</span>`}
      ${e.reg_deadline ? ` <span class="chip">Anmeldeschluss ${fmt(e.reg_deadline, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}</div>
    </div>`;
  if (S.admin && !ext) html += `<a class="btn p block" href="${factsheetUrl(e.id)}" style="margin-bottom:10px">📋 Factsheet Präsident</a>`;
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
  if (!S.cand) {
    html += `<h2>Angemeldet (${an.length})</h2><div class="list">${an.map((r) => `<div class="row"><div class="grow">${nmT(r)}<div class="sub">${[r.with_partner ? '+ Partner/in' : '', r.guests ? '+ ' + r.guests + ' Gast/Gäste' : '', r.comment || ''].filter(Boolean).map(h).join(' · ')}</div></div></div>`).join('') || '<div class="row muted">Noch niemand</div>'}</div>`;
    html += `<h2>Abgemeldet (${ab.length})</h2><div class="list">${ab.map((r) => `<div class="row"><div class="grow">${nmT(r)}${r.comment ? `<div class="sub">${h(r.comment)}</div>` : ''}</div></div>`).join('') || '<div class="row muted">–</div>'}</div>`;
    if (away.length) html += `<h2>Abwesend (${away.length})</h2><div class="list">${away.sort(sortName).map((m) => `<div class="row"><div class="grow">${h(fullName(m))}${candTag(m)}<div class="sub">${h(absText(absOn(m.id, evDay)))}</div></div></div>`).join('')}</div>`;
    html += `<details class="card"><summary><b>Noch keine Antwort (${open.length})</b> ›</summary><div class="small" style="margin-top:8px">${open.sort(sortName).map((m) => h(fullName(m)) + (isCand(m) ? ' (Kandidat)' : '')).join(', ') || '–'}</div></details>`;
  }
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
      away.forEach((m) => rows.push([fullName(m), 'abwesend', '', '', absText(absOn(m.id, evDay))]));
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
  const list = memberList().sort(sortName);
  const cands = candList().sort(sortName);
  const row = (m) => `
      <div class="row"><a href="#/m/${m.id}" class="row" style="padding:0;border:0;flex:1;min-width:0">
        <div class="av ${isCand(m) ? 'cand' : m.ehrenmitglied ? 'gold' : ''}">${h(initials(m))}</div>
        <div class="grow"><b>${h(m.nachname)}</b> ${h(m.vorname)}${isCand(m) ? ' <span class="chip cand">Kandidat</span>' : ''}
          <div class="sub">${isCand(m) && S.byId[m.goetti_id] ? 'Götti: ' + h(fullName(S.byId[m.goetti_id])) : h([m.ort, m.beruf].filter(Boolean).join(' · '))}</div>
          ${absNow(m.id) ? `<div style="margin-top:3px">${absChip(m.id)}</div>` : ''}</div></a>
        ${m.mobile || m.tel ? `<a class="btn sm ghost" href="tel:${h((m.mobile || m.tel).replace(/\s/g, ''))}" aria-label="Anrufen">${ICON.phone}</a>` : ''}
      </div>`;
  const draw = () => {
    const t = (document.getElementById('s').value || '').toLowerCase();
    const hit = (m) => !t || [m.vorname, m.nachname, m.ort, m.beruf, m.firma, m.partner_vorname].join(' ').toLowerCase().includes(t);
    const f = list.filter(hit), c = cands.filter(hit);
    document.getElementById('ml').innerHTML = `<p class="muted small">${f.length} Mitglieder${c.length ? ` · ${c.length} Kandidaten` : ''}</p><div class="list">${f.map(row).join('')}</div>
      ${c.length ? `<h2>Kandidaten</h2><p class="small muted" style="margin-top:-4px">Noch nicht Mitglied – nehmen an den Anlässen des AC Thun teil.</p><div class="list">${c.map(row).join('')}</div>` : ''}`;
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
  const g = S.byId[m.goetti_id];
  const myAbs = S.absences.filter((a) => a.member_id === m.id && a.bis >= today());
  let html = `<div class="card" style="display:flex;gap:14px;align-items:center"><div class="av ${isCand(m) ? 'cand' : m.ehrenmitglied ? 'gold' : ''}" style="width:58px;height:58px;font-size:20px">${h(initials(m))}</div>
     <div><div style="font-size:20px;font-weight:700">${h(fullName(m))}</div><div class="muted">${h([m.beruf, m.firma].filter(Boolean).join(', '))}</div>
     ${m.ehrenmitglied ? '<span class="chip gold">Ehrenmitglied</span>' : ''}${isCand(m) ? '<span class="chip cand">Kandidat</span>' : ''}</div></div>
   ${myAbs.length ? `<div class="card abs-card">${myAbs.map((a) => `<div><b>Abwesend:</b> ${h(a.grund)} ${a.von === a.bis ? fDay(a.von) : fDM(a.von) + ' – ' + fDay(a.bis)}${a.notiz ? ` <span class="muted">(${h(a.notiz)})</span>` : ''}</div>`).join('')}</div>` : ''}
   <div class="btns" style="margin-bottom:10px">
     ${m.mobile || m.tel ? `<a class="btn p" href="tel:${h((m.mobile || m.tel).replace(/\s/g, ''))}">Anrufen</a>` : ''}
     ${m.mobile ? `<a class="btn" href="sms:${h(m.mobile.replace(/\s/g, ''))}">SMS</a>` : ''}
     ${m.email ? `<a class="btn" href="mailto:${h(m.email)}">E-Mail</a>` : ''}
     <button class="btn" id="vcf">Kontakt</button>${m.lebenslauf_path && !S.cand ? '<button class="btn" id="cv">📄 Lebenslauf</button>' : ''}</div>
   <div class="card"><dl class="kv">
     ${kv('Adresse', addr ? `<a target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(addr)}">${h(addr)}</a>` : '')}
     ${kv('Mobile', tel(m.mobile))}${kv('Telefon', tel(m.tel))}${kv('E-Mail', m.email ? `<a href="mailto:${h(m.email)}">${h(m.email)}</a>` : '')}
     ${kv('Geburtstag', m.show_birthday && m.geburtsdatum ? h(fDM(m.geburtsdatum)) + ` <span class="muted">(${ageOf(m.geburtsdatum)} Jahre)</span>` : '')}
     ${kv('Partner/in', h([m.partner_vorname, m.partner_nachname].filter(Boolean).join(' ')))}
     ${isCand(m) ? kv('Götti', g ? `<a href="#/m/${g.id}">${h(fullName(g))}</a>` : '–') + kv('Kandidat seit', h(fDay(m.kandidat_seit))) : kv('Im Club seit', h(fDay(m.eintritt)))}${kv('Interessen', h(m.hobbies))}
   </dl></div>`;
  if (terms.length) html += `<h2>Ämter im Vorstand</h2><div class="list">${terms.map((t) => `<div class="row"><div class="grow">${h(roleName(t.role_id))}<div class="sub">${h(yearRange(t))}</div></div></div>`).join('')}</div>`;
  if (S.admin) html += `<div class="btns" style="margin-bottom:8px"><button class="btn" id="sendlink">Login-Link senden</button>${m.email ? `<a class="btn" href="#/admin/mail/${m.id}">E-Mail über App</a>` : ''}<a class="btn" href="#/admin/abwesenheit/${m.id}">Abwesenheiten</a></div>
    <a class="btn ghost block" href="#/admin/m/${m.id}">Bearbeiten (Admin)</a>`;
  $app.querySelector('main').innerHTML = html;
  document.getElementById('vcf').onclick = () => download(`${m.vorname}_${m.nachname}.vcf`, vcard(m), 'text/vcard');
  const sl = document.getElementById('sendlink'); if (sl) sl.onclick = () => sendLinkSheet(m);
  const cv = document.getElementById('cv'); if (cv) cv.onclick = () => openCV(m);
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
  const list = memberList().filter((m) => m.geburtsdatum && m.show_birthday).map((m) => {
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
    <div class="card" style="display:flex;gap:12px;align-items:center"><div class="av ${isCand(S.me) ? 'cand' : ''}">${h(initials(S.me))}</div><div><b>${h(fullName(S.me))}</b><div class="muted small">${S.admin ? 'Administrator' : isCand(S.me) ? 'Kandidat' : 'Mitglied'}</div></div></div>
    <div class="list">${r('#/profil', 'Mein Profil', 'Adresse, Telefon, Geburtstag')}${r('#/abwesenheit', 'Meine Abwesenheiten', absNow(S.me.id) ? h(absText(absNow(S.me.id))) : 'Ferien, Krankheit etc. eintragen')}${r('#/kalender', 'Kalender abonnieren', 'Jahresprogramm im eigenen Kalender')}${r('#/link', 'Mein persönlicher Login-Link', 'für weitere Geräte')}${r('#/installieren', 'App auf Startbildschirm', 'iPhone & Android')}</div>
    <h2>Club</h2>
    <div class="list">${S.cand ? '' : r('#/shop', 'Shop', 'Pins, Aufkleber, AC-Gürtel – bestellen')}${r('#/dokumente', 'Dokumente', 'Statuten, Protokolle, Downloads')}</div>
    ${S.admin ? `<h2>Verwaltung</h2><div class="list">${r(factsheetUrl(), 'Factsheet Präsident', 'nächster Clubanlass')}${r('#/admin/mail', 'E-Mail an Mitglieder', 'an alle oder einzelne')}${r('#/admin/kandidaten', 'Kandidaten & Veto', candList().length + ' Kandidaten')}${r('#/admin/abwesenheiten', 'Abwesenheiten', 'für alle Mitglieder bearbeiten')}${r('#/admin/shop', 'Shop verwalten', 'Artikel und Bestellungen')}${r('#/admin/einstellungen', 'Einstellungen', 'Veto, Antwortadresse, Shop, QR-Rechnung')}${r('#/admin', 'Admin-Bereich', 'Mitglieder, Codes, Programm, Vorstand')}</div>` : ''}
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
    ${r(factsheetUrl(), 'Factsheet Präsident', 'Teilnehmer, Abmeldungen, Geburtstage – druckbar')}
    ${r('#/admin/mitglieder', 'Mitglieder verwalten', 'erfassen, bearbeiten, Admin-Rechte')}
    ${r('#/admin/kandidaten', 'Kandidaten & Veto', 'Götti, Teilnahmen, Veto 1 und 2, Aufnahme')}
    ${r('#/admin/mail', 'E-Mail an Mitglieder', 'an alle, Kandidaten oder einzelne')}
    ${r('#/admin/abwesenheiten', 'Abwesenheiten', 'Ferien, Krankheit etc. für alle Mitglieder')}
    ${r('#/admin/shop', 'Shop verwalten', 'Artikel, Bilder, Bestellungen')}
    ${r('#/dokumente', 'Dokumente', 'hochladen und verwalten')}
    ${r('#/admin/einstellungen', 'Einstellungen', 'Veto-Regeln, Antwortadresse, Shop, QR-Rechnung')}
    ${r('#/admin/codes', 'Persönliche Codes & Links', 'per E-Mail, WhatsApp oder SMS senden, neu erzeugen')}
    ${r('#/admin/import', 'Excel-Import', 'Export von ambassadorclub.net einlesen')}
    ${r('#/admin/event/neu', 'Anlass erfassen', 'einzelner Termin')}
    ${r('#/admin/serie', 'Clubabend-Serie', '1. Mi Lunch, 3. Mi Monatsanlass')}
    ${r('#/admin/vorstand', 'Vorstand bearbeiten', 'Ämter & Geschichte')}</div>`, { tab: 'mehr', back: true });
}

function viewAdminMembers() {
  const ms = [...S.members].sort(sortName);
  const row = (m) => `<a class="row" href="#/admin/m/${m.id}"><div class="av ${!m.aktiv ? 'gold' : isCand(m) ? 'cand' : ''}">${h(initials(m))}</div><div class="grow"><b>${h(m.nachname)}</b> ${h(m.vorname)}<div class="sub">${h(m.email || 'keine E-Mail')}</div></div>${isCand(m) ? '<span class="chip cand">Kandidat</span>' : ''}${m.aktiv ? '' : '<span class="chip">kein Zugang</span>'}${absNow(m.id) ? '<span class="chip abs">abwesend</span>' : ''}${m.auth_user_id ? '<span class="chip ok">in App</span>' : ''}</a>`;
  shell('Mitglieder verwalten', `<div class="btns" style="margin-bottom:12px"><a class="btn p" href="#/admin/m/neu">+ Neues Mitglied</a><a class="btn" href="#/admin/m/neu-kandidat">+ Neuer Kandidat</a></div>
    <div class="list">${ms.filter((m) => !isCand(m)).map(row).join('')}</div>
    ${ms.some(isCand) ? `<h2>Kandidaten</h2><div class="list">${ms.filter(isCand).map(row).join('')}</div>` : ''}`, { tab: 'mehr', back: true });
}

async function viewAdminMember(id) {
  const isNew = id === 'neu' || id === 'neu-kandidat';
  const m = isNew ? { aktiv: true, show_birthday: true, land: 'CH', status: id === 'neu-kandidat' ? 'kandidat' : 'mitglied', kandidat_seit: id === 'neu-kandidat' ? today() : null } : S.byId[id];
  if (!m) return (location.hash = '#/admin/mitglieder');
  const admins = await q(sb.from('admins').select('member_id'));
  const isAdm = admins.some((a) => a.member_id === id);
  const goettis = memberList().filter((x) => x.id !== m.id).sort(sortName);
  shell(isNew ? (isCand(m) ? 'Neuer Kandidat' : 'Neues Mitglied') : fullName(m), `
    ${!isNew && isCand(m) ? `<a class="btn p block" href="#/admin/kandidaten" style="margin-bottom:10px">Veto-Verfahren & Teilnahmen ›</a>` : ''}
    ${!isNew ? `<div class="btns" style="margin-bottom:10px"><button class="btn" id="sendlink">Login-Link senden</button>${m.email ? `<a class="btn" href="#/admin/mail/${m.id}">E-Mail</a>` : ''}<a class="btn" href="#/admin/abwesenheit/${m.id}">Abwesenheiten</a></div>` : ''}
    ${!isNew && (isCand(m) || m.lebenslauf_path) ? `<div class="card"><b>Lebenslauf (PDF)</b>
      ${m.lebenslauf_path ? `<div class="btns" style="margin:8px 0"><button class="btn sm" id="cv_open">📄 Lebenslauf öffnen</button><button class="btn sm ghost" id="cv_del" style="color:var(--no)">Löschen</button></div>` : '<p class="small muted">Noch kein Lebenslauf hochgeladen.</p>'}
      <label>${m.lebenslauf_path ? 'Ersetzen durch' : 'PDF hochladen'} (max. 10 MB)</label><input type="file" id="cv_file" accept="application/pdf,.pdf">
      <p class="small muted">Den Lebenslauf sehen alle Mitglieder (z.B. beim Veto), nicht aber Kandidaten.</p></div>` : ''}
    <div class="card">
    <div class="grid2"><div><label>Status</label><select id="f_status"><option value="mitglied" ${!isCand(m) ? 'selected' : ''}>Mitglied</option><option value="kandidat" ${isCand(m) ? 'selected' : ''}>Kandidat</option></select></div>
      <div id="cand_since"><label>Kandidat seit</label><input id="f_kandidat_seit" type="date" value="${h(m.kandidat_seit || '')}"></div>
      <div id="cand_goetti" style="grid-column:1/-1"><label>Götti (Pate)</label><select id="f_goetti_id"><option value="">– bitte wählen –</option>${goettis.map((x) => `<option value="${x.id}" ${x.id === m.goetti_id ? 'selected' : ''}>${h(x.nachname + ' ' + x.vorname)}</option>`).join('')}</select></div></div>
    ${fieldsHtml(m, [...PROFILE_FIELDS, ...ADMIN_FIELDS])}
    <label class="check"><input type="checkbox" id="f_show_birthday" ${m.show_birthday ? 'checked' : ''}> Geburtstag sichtbar</label>
    <label class="check"><input type="checkbox" id="f_ehrenmitglied" ${m.ehrenmitglied ? 'checked' : ''}> Ehrenmitglied</label>
    <label class="check"><input type="checkbox" id="f_aktiv" ${m.aktiv ? 'checked' : ''}> Zugang zur App (aktiv) – für Ferien/Krankheit besser «Abwesenheiten» nutzen</label>
    <label class="check"><input type="checkbox" id="f_admin" ${isAdm ? 'checked' : ''}> Administrator</label>
    <button class="btn p block" id="save">Speichern</button>
    ${isNew ? '' : '<button class="btn ghost block" id="del" style="margin-top:8px;color:var(--no)">Löschen</button>'}</div>`, { tab: 'mehr', back: true });
  const syncCand = () => { const c = val('f_status') === 'kandidat'; document.getElementById('cand_since').style.display = c ? '' : 'none'; document.getElementById('cand_goetti').style.display = c ? '' : 'none'; };
  document.getElementById('f_status').onchange = syncCand; syncCand();
  const sl = document.getElementById('sendlink'); if (sl) sl.onclick = () => sendLinkSheet(m);
  const cvo = document.getElementById('cv_open'); if (cvo) cvo.onclick = () => openCV(m);
  const cvf = document.getElementById('cv_file');
  if (cvf) cvf.onchange = async () => { try { toast('Lädt hoch…'); await uploadCV(m, cvf.files[0]); await loadBase(); toast('Lebenslauf gespeichert'); viewAdminMember(id); } catch (e) { err(e); } };
  const cvd = document.getElementById('cv_del');
  if (cvd) cvd.onclick = async () => { if (!confirm('Lebenslauf löschen?')) return; try { await sb.storage.from('lebenslauf').remove([m.lebenslauf_path]); await q(sb.from('members').update({ lebenslauf_path: null }).eq('id', m.id)); await loadBase(); viewAdminMember(id); } catch (e) { err(e); } };
  document.getElementById('save').onclick = async () => {
    const cand = val('f_status') === 'kandidat';
    const d = { ...readFields([...PROFILE_FIELDS, ...ADMIN_FIELDS]), show_birthday: val('f_show_birthday'), ehrenmitglied: val('f_ehrenmitglied'), aktiv: val('f_aktiv'),
      status: cand ? 'kandidat' : 'mitglied', goetti_id: cand ? val('f_goetti_id') : m.goetti_id ?? null, kandidat_seit: cand ? (val('f_kandidat_seit') || today()) : m.kandidat_seit ?? null };
    if (!d.vorname || !d.nachname) return toast('Vor- und Nachname nötig');
    if (cand && !d.goetti_id && !confirm('Für den Kandidaten ist noch kein Götti gewählt. Trotzdem speichern?')) return;
    try {
      const r = isNew ? await q(sb.from('members').insert(d).select().single()) : await q(sb.from('members').update(d).eq('id', id).select().single());
      const wantAdm = val('f_admin');
      if (wantAdm && !isAdm) await q(sb.from('admins').insert({ member_id: r.id }));
      if (!wantAdm && isAdm) await q(sb.from('admins').delete().eq('member_id', r.id));
      await loadBase(); toast('Gespeichert'); location.hash = cand ? '#/admin/kandidaten' : '#/admin/mitglieder';
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
    <p class="small muted">«Senden» öffnet die Auswahl: E-Mail über die App, eigenes Mailprogramm, WhatsApp, SMS oder Teilen.</p>
    <div class="list">${ms.map((m) => `<div class="row"><div class="grow"><b>${h(fullName(m))}</b>${isCand(m) ? ' <span class="chip cand">Kandidat</span>' : ''}<div class="sub mono">${h(code[m.id] || '–')}${m.auth_user_id ? ' · ✓ eingeloggt' : ''}${lastMail[m.id] ? ' · ✉️ ' + fmt(lastMail[m.id], { day: 'numeric', month: 'numeric' }) : ''}</div></div>
      <button class="btn sm p" data-send="${m.id}">Senden</button><button class="btn sm ghost" data-cp="${m.id}">Link</button><button class="btn sm ghost" data-new="${m.id}" title="Neuer Code">↻</button></div>`).join('')}</div>`;
  $app.querySelectorAll('[data-cp]').forEach((b) => b.onclick = () => copy(link(S.byId[b.dataset.cp])));
  $app.querySelectorAll('[data-send]').forEach((b) => b.onclick = () => sendLinkSheet(S.byId[b.dataset.send], code[b.dataset.send]));
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
    if (j?.error) { res.innerHTML = `<div class="card" style="background:var(--no-bg);color:var(--no)">${h(j.error)}${j.setup ? '<br><br>Einrichtung: In Supabase unter Edge Functions → Secrets MAIL_FROM (z.B. info@ac-thun.ch) und SMTP_PASS (Passwort des Postfachs bei Infomaniak) eintragen.' : ''}</div>`; return; }
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

/* ---------- Kandidaten & Veto ---------- */
/* Einstellbar unter Admin → Einstellungen */
const veto2Min = () => Math.max(1, +setv('veto2_min_teilnahmen', 5) || 5);
const vetoDays = () => Math.max(1, +setv('veto_frist_tage', 14) || 14);
const teiln = (c, parts) => (parts[c.id]?.length || 0) + (+c.teilnahmen_extra || 0);
/* Teilnahmen an vergangenen, nicht abgesagten AC-Thun-Anlässen pro Person */
async function participations(ids) {
  const out = Object.fromEntries(ids.map((i) => [i, []]));
  if (!ids.length) return out;
  const regs = await q(sb.from('registrations').select('event_id,member_id').eq('status', 'an').in('member_id', ids));
  const evIds = [...new Set(regs.map((r) => r.event_id))];
  const evs = evIds.length ? await q(sb.from('events').select('id,title,starts_at,cancelled').in('id', evIds)) : [];
  const ok = Object.fromEntries(evs.filter((e) => catOf(e) === 'club' && !e.cancelled && new Date(e.starts_at) < new Date()).map((e) => [e.id, e]));
  regs.forEach((r) => { if (ok[r.event_id]) out[r.member_id].push(ok[r.event_id]); });
  Object.values(out).forEach((l) => l.sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
  return out;
}
function candPhase(rounds) {
  const open = rounds.find((r) => r.status === 'offen');
  if (open) return { key: 'open', round: open, label: `Veto ${open.stufe} läuft bis ${fmt(open.deadline, { day: 'numeric', month: 'long' })}` };
  if (rounds.some((r) => r.stufe === 2 && r.status === 'bestanden')) return { key: 'v2ok', label: 'Veto 2 bestanden – bereit zur Aufnahme' };
  if (rounds.some((r) => r.status === 'abgelehnt')) return { key: 'rejected', label: 'Veto eingegangen – nicht weiterverfolgt' };
  if (rounds.some((r) => r.stufe === 1 && r.status === 'bestanden')) return { key: 'v1ok', label: 'Veto 1 bestanden – eingeladen' };
  return { key: 'new', label: 'Veto 1 noch nicht gestartet' };
}
const phaseChip = (p) => `<span class="chip ${p.key === 'open' ? 'gold' : p.key === 'rejected' ? 'no' : p.key === 'new' ? '' : 'ok'}">${h(p.label)}</span>`;

function vetoMailDraft(c, r, n) {
  const g = S.byId[c.goetti_id];
  const who = [c.beruf, c.firma, c.ort].filter(Boolean).join(', ');
  const bis = fDate(r.deadline);
  const link = `{link}#/veto/${r.id}`;
  const text = r.stufe === 1
    ? `Lieber {vorname}\n\n${g ? fullName(g) : 'Ein Mitglied'} schlägt ${fullName(c)}${who ? ' (' + who + ')' : ''} als Kandidaten für den Ambassador Club Thun vor.\n\nBist du mit einer Einladung nicht einverstanden, kannst du bis ${bis} in der App ein Veto einlegen:\n${link}\n\nWenn du einverstanden bist, musst du nichts tun. Geht kein Veto ein, wird ${c.vorname} zu unseren Anlässen eingeladen. Dein Veto sehen nur die Admins.\n\nHerzliche Grüsse\n${S.me.vorname}`
    : `Lieber {vorname}\n\n${fullName(c)} hat als Kandidat an ${n} Anlässen teilgenommen${g ? ' (Götti: ' + fullName(g) + ')' : ''}. Wir möchten ${c.vorname} als Mitglied in den Ambassador Club Thun aufnehmen.\n\nHast du begründete Einwände, kannst du bis ${bis} in der App ein Veto mit Begründung einlegen:\n${link}\n\nWenn du einverstanden bist, musst du nichts tun. Geht kein Veto ein, wird ${c.vorname} als Mitglied aufgenommen. Dein Veto sehen nur die Admins.\n\nHerzliche Grüsse\n${S.me.vorname}`;
  return { subject: `Veto ${r.stufe}: ${r.stufe === 1 ? 'Kandidat' : 'Aufnahme von'} ${fullName(c)}`, text, who: 'members' };
}

async function viewAdminCandidates() {
  shell('Kandidaten & Veto', '', { tab: 'mehr', back: true }); loading();
  const cands = candList().sort(sortName);
  const ids = cands.map((c) => c.id);
  const [rounds, parts] = await Promise.all([ids.length ? q(sb.from('veto_rounds').select('*').in('candidate_id', ids).order('started_at')) : [], participations(ids)]);
  const openIds = rounds.filter((r) => r.status === 'offen').map((r) => r.id);
  const votes = openIds.length ? await q(sb.from('veto_votes').select('*').in('round_id', openIds)) : [];
  let html = `<a class="btn p block" href="#/admin/m/neu-kandidat" style="margin-bottom:10px">+ Neuer Kandidat</a>
    <details class="card small"><summary><b>Ablauf</b> ›</summary><ol style="margin:8px 0 0;padding-left:20px">
      <li>Kandidat mit Götti erfassen.</li><li><b>Veto 1</b> starten → alle Mitglieder erhalten eine Mail und können in der App ein Veto einlegen.</li>
      <li>Kein Veto → «Bestanden» → Kandidat mit seinem Login-Link einladen.</li><li>Nach ${veto2Min()} Teilnahmen <b>Veto 2</b> starten (Veto nur mit Begründung).</li>
      <li>Kein Veto → «Bestanden» → «Als Mitglied aufnehmen».</li></ol></details>`;
  if (!cands.length) html += '<div class="empty">Zurzeit keine Kandidaten.</div>';
  for (const c of cands) {
    const rs = rounds.filter((r) => r.candidate_id === c.id);
    const p = candPhase(rs);
    const n = teiln(c, parts);
    const g = S.byId[c.goetti_id];
    html += `<div class="card"><div style="display:flex;gap:10px;align-items:center"><div class="av cand">${h(initials(c))}</div>
      <div class="grow" style="flex:1"><a href="#/admin/m/${c.id}" style="color:inherit"><b>${h(fullName(c))}</b></a><div class="small muted">Götti: ${g ? h(fullName(g)) : '<span style="color:var(--no)">fehlt</span>'}${c.kandidat_seit ? ' · seit ' + fDay(c.kandidat_seit) : ''}</div></div></div>
      <div style="margin:8px 0">${phaseChip(p)} <span class="chip ${n >= veto2Min() ? 'ok' : ''}">${n} Teilnahme${n === 1 ? '' : 'n'}${+c.teilnahmen_extra ? ` (davon ${c.teilnahmen_extra} manuell)` : ''}</span></div>
      <div class="btns" style="margin-bottom:6px"><button class="btn sm ghost" data-extra="${c.id}">Teilnahmen anpassen</button>${c.lebenslauf_path ? `<button class="btn sm ghost" data-cv="${c.id}">📄 Lebenslauf</button>` : `<a class="btn sm ghost" href="#/admin/m/${c.id}">Lebenslauf hochladen</a>`}</div>
      ${n ? `<details class="small"><summary class="muted">Teilnahmen anzeigen ›</summary>${parts[c.id].map((e) => `<div>${fmt(e.starts_at, { day: 'numeric', month: 'short', year: 'numeric' })} – ${h(evTitle(e))}</div>`).join('')}</details>` : ''}`;
    if (p.key === 'open') {
      const vs = votes.filter((v) => v.round_id === p.round.id);
      const expired = new Date(p.round.deadline) < new Date();
      html += `<div class="card" style="background:var(--bg);margin:10px 0 6px"><b>Veto ${p.round.stufe}</b> · Frist ${fDate(p.round.deadline)} ${expired ? '<span class="chip gold">abgelaufen</span>' : ''}
        <div style="margin-top:6px">${vs.length ? `<b style="color:var(--no)">${vs.length} Veto${vs.length > 1 ? 's' : ''}:</b>${vs.map((v) => `<div class="small">• ${h(S.byId[v.member_id] ? fullName(S.byId[v.member_id]) : '?')}${v.reason ? ': ' + h(v.reason) : ''}</div>`).join('')}` : '<span class="small muted">Bisher kein Veto eingegangen.</span>'}</div>
        <div class="btns" style="margin-top:8px"><button class="btn sm ok" data-close="${p.round.id}" data-st="bestanden">Bestanden</button><button class="btn sm no" data-close="${p.round.id}" data-st="abgelehnt">Abgelehnt</button>
          <button class="btn sm ghost" data-remind="${p.round.id}">Erinnerung</button><button class="btn sm ghost" data-frist="${p.round.id}">Frist ändern</button><button class="btn sm ghost" data-close="${p.round.id}" data-st="abgebrochen">Abbrechen</button></div></div>`;
    } else if (p.key === 'new') html += `<div class="btns"><button class="btn p sm" data-start="${c.id}" data-stufe="1">Veto 1 starten</button></div>`;
    else if (p.key === 'v1ok') html += `${n >= veto2Min() ? `<p class="small" style="color:var(--ok)">${n} Teilnahmen – Veto 2 kann gestartet werden.</p>` : `<p class="small muted">Veto 2 nach ${veto2Min()} Teilnahmen.</p>`}
      <div class="btns"><button class="btn sm ${n >= veto2Min() ? 'p' : ''}" data-start="${c.id}" data-stufe="2">Veto 2 starten</button><button class="btn sm ghost" data-link="${c.id}">Login-Link senden</button></div>`;
    else if (p.key === 'v2ok') html += `<div class="btns"><button class="btn p sm" data-admit="${c.id}">Als Mitglied aufnehmen</button></div>`;
    else if (p.key === 'rejected') html += `<div class="btns"><button class="btn sm ghost" data-block="${c.id}">Zugang sperren</button><button class="btn sm ghost" data-start="${c.id}" data-stufe="${rs.some((r) => r.stufe === 1 && r.status === 'bestanden') ? 2 : 1}">Neues Veto starten</button></div>`;
    const closed = rs.filter((r) => r.status !== 'offen');
    if (closed.length) html += `<div class="small muted" style="margin-top:8px">${closed.map((r) => `Veto ${r.stufe}: ${h(r.status)} (${fmt(r.closed_at || r.deadline, { day: 'numeric', month: 'numeric', year: '2-digit' })})`).join(' · ')}</div>`;
    html += `</div>`;
  }
  $app.querySelector('main').innerHTML = html;
  const cById = (id) => S.byId[id];
  $app.querySelectorAll('[data-start]').forEach((b) => b.onclick = async () => {
    const c = cById(b.dataset.start); const stufe = +b.dataset.stufe;
    if (!c.goetti_id && !confirm('Für diesen Kandidaten ist kein Götti erfasst. Trotzdem starten?')) return;
    const days = prompt(`Veto ${stufe} für ${fullName(c)} starten.\nFrist in Tagen:`, String(vetoDays())); if (!days) return;
    const dl = new Date(); dl.setDate(dl.getDate() + Math.max(1, Math.round(+days) || 14)); dl.setHours(23, 59, 0, 0);
    try {
      const r = await q(sb.from('veto_rounds').insert({ candidate_id: c.id, stufe, deadline: dl.toISOString(), started_by: S.me.id }).select().single());
      S.mailDraft = vetoMailDraft(c, r, teiln(c, parts));
      toast(`Veto ${stufe} gestartet – jetzt die Mail an die Mitglieder senden`); location.hash = '#/admin/mail';
    } catch (e) { err(e); }
  });
  $app.querySelectorAll('[data-remind]').forEach((b) => b.onclick = () => {
    const r = rounds.find((x) => x.id === b.dataset.remind); const c = cById(r.candidate_id);
    const d = vetoMailDraft(c, r, teiln(c, parts)); d.subject = 'Erinnerung – ' + d.subject;
    S.mailDraft = d; location.hash = '#/admin/mail';
  });
  $app.querySelectorAll('[data-close]').forEach((b) => b.onclick = async () => {
    const r = rounds.find((x) => x.id === b.dataset.close); const c = cById(r.candidate_id); const st = b.dataset.st;
    const vs = votes.filter((v) => v.round_id === r.id).length;
    const msg = st === 'bestanden' ? (vs ? `Es liegen ${vs} Veto(s) vor. Trotzdem als bestanden abschliessen?` : `Veto ${r.stufe} für ${fullName(c)} als bestanden abschliessen?`)
      : st === 'abgelehnt' ? `Veto ${r.stufe} abschliessen: ${fullName(c)} wird nicht ${r.stufe === 1 ? 'eingeladen' : 'aufgenommen'}?` : 'Verfahren abbrechen (ohne Entscheid)?';
    if (!confirm(msg)) return;
    try {
      await q(sb.from('veto_rounds').update({ status: st, closed_at: new Date().toISOString() }).eq('id', r.id));
      if (st === 'bestanden' && r.stufe === 1 && confirm(`${c.vorname} ist eingeladen. Jetzt den persönlichen Login-Link senden?`)) { await viewAdminCandidates(); return sendLinkSheet(c); }
      if (st === 'bestanden' && r.stufe === 2 && confirm(`${fullName(c)} jetzt als Mitglied aufnehmen?`)) return admit(c);
      viewAdminCandidates();
    } catch (e) { err(e); }
  });
  $app.querySelectorAll('[data-link]').forEach((b) => b.onclick = () => sendLinkSheet(cById(b.dataset.link)));
  $app.querySelectorAll('[data-cv]').forEach((b) => b.onclick = () => openCV(cById(b.dataset.cv)));
  $app.querySelectorAll('[data-extra]').forEach((b) => b.onclick = async () => {
    const c = cById(b.dataset.extra); const auto = parts[c.id].length;
    const v = prompt(`${fullName(c)}: ${auto} Teilnahme(n) in der App erfasst.\nZusätzliche Teilnahmen (z.B. vor der App oder nicht erfasst; negativ zum Abziehen):`, String(+c.teilnahmen_extra || 0));
    if (v === null) return; const x = Math.round(+v);
    if (!Number.isFinite(x)) return toast('Bitte eine Zahl eingeben');
    try { await q(sb.from('members').update({ teilnahmen_extra: x }).eq('id', c.id)); await loadBase(); toast('Gespeichert'); viewAdminCandidates(); } catch (e) { err(e); }
  });
  $app.querySelectorAll('[data-frist]').forEach((b) => b.onclick = async () => {
    const r = rounds.find((x) => x.id === b.dataset.frist);
    const cur = new Date(r.deadline).toLocaleDateString('de-CH', { timeZone: TZ });
    const v = prompt('Neue Frist (TT.MM.JJJJ):', cur); if (!v) return;
    const m = v.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if (!m) return toast('Format: TT.MM.JJJJ');
    const d = new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 0);
    try { await q(sb.from('veto_rounds').update({ deadline: d.toISOString() }).eq('id', r.id)); toast('Frist geändert'); viewAdminCandidates(); } catch (e) { err(e); }
  });
  $app.querySelectorAll('[data-admit]').forEach((b) => b.onclick = () => { const c = cById(b.dataset.admit); if (confirm(`${fullName(c)} als Mitglied aufnehmen?`)) admit(c); });
  $app.querySelectorAll('[data-block]').forEach((b) => b.onclick = async () => {
    const c = cById(b.dataset.block); if (!confirm(`Zugang von ${fullName(c)} sperren? (Der Eintrag bleibt erhalten.)`)) return;
    try { await q(sb.from('members').update({ aktiv: false }).eq('id', c.id)); await loadBase(); viewAdminCandidates(); } catch (e) { err(e); }
  });
}
async function admit(c) {
  try {
    await q(sb.from('members').update({ status: 'mitglied', eintritt: today() }).eq('id', c.id));
    await loadBase(); toast(`${fullName(c)} ist jetzt Mitglied 🎉`); location.hash = '#/admin/m/' + c.id;
  } catch (e) { err(e); }
}

/* Hinweis auf laufende Veto-Verfahren (Startseite, nur Mitglieder) */
async function vetoBanner() {
  let rounds = [];
  try { rounds = await q(sb.from('veto_rounds').select('*').eq('status', 'offen').gt('deadline', new Date().toISOString()).order('deadline')); } catch { return ''; }
  rounds = rounds.filter((r) => r.candidate_id !== S.me.id);
  if (!rounds.length) return '';
  const mine = await q(sb.from('veto_votes').select('round_id').eq('member_id', S.me.id).in('round_id', rounds.map((r) => r.id)));
  return rounds.map((r) => {
    const c = S.byId[r.candidate_id]; const voted = mine.some((v) => v.round_id === r.id);
    return `<a class="card veto-card" href="#/veto/${r.id}"><div class="small muted" style="text-transform:uppercase;letter-spacing:.4px">Veto ${r.stufe} · Frist bis ${fmt(r.deadline, { day: 'numeric', month: 'long' })}</div>
      <b>${r.stufe === 1 ? 'Kandidat' : 'Aufnahme'}: ${h(c ? fullName(c) : '?')}</b>
      <div class="small">${voted ? '✋ Du hast ein Veto eingelegt.' : 'Einverstanden? Dann musst du nichts tun.'} <span class="muted">Details ›</span></div></a>`;
  }).join('');
}

async function viewVeto(id) {
  shell('Veto-Verfahren', '', { tab: 'programm', back: true }); loading();
  const r = await q(sb.from('veto_rounds').select('*').eq('id', id).maybeSingle());
  if (!r) { $app.querySelector('main').innerHTML = '<div class="empty">Verfahren nicht gefunden.</div>'; return; }
  const c = S.byId[r.candidate_id]; const g = c && S.byId[c.goetti_id];
  const mine = await q(sb.from('veto_votes').select('*').eq('round_id', id).eq('member_id', S.me.id).maybeSingle());
  const openNow = r.status === 'offen' && new Date(r.deadline) > new Date();
  const n = r.stufe === 2 && c ? teiln(c, await participations([c.id])) : null;
  let html = `<div class="hero"><div class="small" style="opacity:.8">Veto ${r.stufe} · ${r.stufe === 1 ? 'Einladung als Kandidat' : 'Aufnahme als Mitglied'}</div>
      <div style="font-size:21px;font-weight:700;margin:2px 0 6px">${h(c ? fullName(c) : '?')}</div><div>${h([c?.beruf, c?.firma, c?.ort].filter(Boolean).join(' · '))}</div>
      <div style="margin-top:8px"><span class="chip">Frist: ${fDate(r.deadline)}</span>${openNow ? '' : ' <span class="chip">abgeschlossen</span>'}</div></div>
    <div class="card"><dl class="kv">${g ? `<dt>Götti</dt><dd><a href="#/m/${g.id}">${h(fullName(g))}</a></dd>` : ''}${c?.kandidat_seit ? `<dt>Kandidat seit</dt><dd>${fDay(c.kandidat_seit)}</dd>` : ''}${n !== null ? `<dt>Teilnahmen</dt><dd>${n} Anlässe</dd>` : ''}</dl>
      <div class="btns" style="margin-top:8px">${c ? `<a href="#/m/${c.id}" class="btn sm ghost">Profil ansehen</a>` : ''}${c?.lebenslauf_path ? '<button class="btn sm" id="vt_cv">📄 Lebenslauf</button>' : ''}</div></div>
    <p class="small muted">${r.stufe === 1 ? 'Geht bis zum Ablauf der Frist kein Veto ein, wird der Kandidat zu unseren Anlässen eingeladen.' : 'Geht bis zum Ablauf der Frist kein begründetes Veto ein, wird der Kandidat als Mitglied aufgenommen.'}</p>`;
  if (!openNow) html += `<div class="card">Das Verfahren ist abgeschlossen${mine ? ' – du hattest ein Veto eingelegt' : ''}.</div>`;
  else html += `<div class="card"><b>${mine ? '✋ Du hast ein Veto eingelegt' : 'Veto einlegen'}</b>
      <p class="small muted">${mine ? 'Du kannst die Begründung ändern oder das Veto zurückziehen.' : 'Bist du einverstanden, musst du nichts tun.'} Dein Veto sehen nur die Admins.</p>
      <label>Begründung${r.stufe === 2 ? ' (nötig)' : ' (freiwillig)'}</label><textarea id="vt_reason" style="min-height:90px">${h(mine?.reason || '')}</textarea>
      <div class="btns" style="margin-top:10px"><button class="btn no" id="vt_save">${mine ? 'Begründung speichern' : 'Veto einlegen'}</button>${mine ? '<button class="btn ghost" id="vt_del">Veto zurückziehen</button>' : ''}</div></div>`;
  $app.querySelector('main').innerHTML = html;
  const vcv = document.getElementById('vt_cv'); if (vcv) vcv.onclick = () => openCV(c);
  const sv = document.getElementById('vt_save');
  if (sv) sv.onclick = async () => {
    const reason = val('vt_reason');
    if (r.stufe === 2 && !reason) return toast('Bei Veto 2 ist eine Begründung nötig');
    if (!mine && !confirm(`Veto gegen ${c ? fullName(c) : 'den Kandidaten'} einlegen?`)) return;
    try { await q(sb.from('veto_votes').upsert({ round_id: id, member_id: S.me.id, reason }, { onConflict: 'round_id,member_id' })); toast('Veto gespeichert'); viewVeto(id); } catch (e) { err(e); }
  };
  const dl = document.getElementById('vt_del');
  if (dl) dl.onclick = async () => { if (!confirm('Veto zurückziehen?')) return; try { await q(sb.from('veto_votes').delete().eq('round_id', id).eq('member_id', S.me.id)); toast('Veto zurückgezogen'); viewVeto(id); } catch (e) { err(e); } };
}

/* ---------- Abwesenheiten ---------- */
/* id = Mitglied (Admin), all = Übersicht aller Mitglieder (Admin), sonst eigene */
async function viewAbsences(id, all) {
  const mid = all ? null : (id || S.me.id); const m = mid ? S.byId[mid] : null;
  if (all ? !S.admin : (!m || (mid !== S.me.id && !S.admin))) return (location.hash = '#/mehr');
  const self = mid === S.me.id;
  shell(all ? 'Abwesenheiten' : self ? 'Meine Abwesenheiten' : 'Abwesenheiten', '', { tab: 'mehr', back: true }); loading();
  let qy = sb.from('absences').select('*');
  if (mid) qy = qy.eq('member_id', mid); else qy = qy.gte('bis', new Date(Date.now() - 90 * 864e5).toLocaleDateString('sv-SE', { timeZone: TZ }));
  const list = await q(qy.order('von', { ascending: false }));
  const cur = list.filter((a) => a.bis >= today()).reverse(), past = list.filter((a) => a.bis < today()).slice(0, all ? 50 : 10);
  const who = (a) => all ? `<b>${h(S.byId[a.member_id] ? fullName(S.byId[a.member_id]) : '?')}</b> · ` : '';
  const row = (a) => `<div class="row"><div class="grow">${who(a)}<b>${h(a.grund)}</b> ${a.von === a.bis ? fDay(a.von) : fDM(a.von) + ' – ' + fDay(a.bis)}${a.notiz ? `<div class="sub">${h(a.notiz)}</div>` : ''}</div>
    <button class="btn sm ghost" data-edit="${a.id}">Bearbeiten</button><button class="btn sm ghost" data-del="${a.id}" aria-label="Löschen">✕</button></div>`;
  const ms = S.members.filter((x) => x.aktiv).sort(sortName);
  $app.querySelector('main').innerHTML = `${!all && !self ? `<p><b>${h(fullName(m))}</b> · <a href="#/admin/abwesenheiten">alle Abwesenheiten ›</a></p>` : ''}
    ${all ? '<p class="small muted">Abwesenheiten aller Mitglieder erfassen, ändern und löschen (laufende, geplante und die letzten 90 Tage).</p>' : ''}
    <div class="card" id="ab_form"><b id="ab_head">Abwesenheit eintragen</b>
      ${all ? `<label>Mitglied</label><select id="ab_mem"><option value="">– bitte wählen –</option>${ms.map((x) => `<option value="${x.id}">${h(x.nachname + ' ' + x.vorname)}${isCand(x) ? ' (Kandidat)' : ''}</option>`).join('')}</select>` : ''}
      <div class="grid2"><div><label>Von</label><input id="ab_von" type="date" value="${today()}"></div><div><label>Bis</label><input id="ab_bis" type="date" value="${today()}"></div>
        <div><label>Grund</label><select id="ab_grund">${GRUENDE.map((g) => `<option>${g}</option>`).join('')}</select></div><div><label>Notiz (optional)</label><input id="ab_notiz"></div></div>
      <label class="check" id="ab_auto_l"><input type="checkbox" id="ab_auto" checked> Bei Anlässen in dieser Zeit automatisch abmelden</label>
      <div class="btns"><button class="btn p" id="ab_save">Eintragen</button><button class="btn ghost" id="ab_cancel" style="display:none">Abbrechen</button></div>
      <p class="small muted">Während der Abwesenheit erscheint man bei den Anlässen als «abwesend». Grund und Datum sehen alle Mitglieder.</p></div>
    <h2>Aktuell & geplant</h2><div class="list">${cur.map(row).join('') || '<div class="row muted">Keine</div>'}</div>
    ${past.length ? `<h2>Vergangen</h2><div class="list">${past.map(row).join('')}</div>` : ''}`;
  let editId = null;
  const $ = (x) => document.getElementById(x);
  const reset = () => { editId = null; $('ab_head').textContent = 'Abwesenheit eintragen'; $('ab_save').textContent = 'Eintragen'; $('ab_cancel').style.display = 'none'; $('ab_auto_l').style.display = '';
    $('ab_von').value = today(); $('ab_bis').value = today(); $('ab_grund').value = GRUENDE[0]; $('ab_notiz').value = ''; if ($('ab_mem')) { $('ab_mem').value = ''; $('ab_mem').disabled = false; } };
  $('ab_cancel').onclick = reset;
  $('ab_von').onchange = () => { if (val('ab_bis') < val('ab_von')) $('ab_bis').value = val('ab_von'); };
  $app.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
    const a = list.find((x) => x.id === b.dataset.edit); editId = a.id;
    $('ab_head').textContent = 'Abwesenheit bearbeiten'; $('ab_save').textContent = 'Änderung speichern'; $('ab_cancel').style.display = ''; $('ab_auto_l').style.display = 'none';
    $('ab_von').value = a.von; $('ab_bis').value = a.bis; $('ab_grund').value = GRUENDE.includes(a.grund) ? a.grund : 'Andere'; $('ab_notiz').value = a.notiz || '';
    if ($('ab_mem')) { $('ab_mem').value = a.member_id; $('ab_mem').disabled = true; }
    $('ab_form').scrollIntoView?.({ behavior: 'smooth' });
  });
  $('ab_save').onclick = async () => {
    const target = all ? (editId ? list.find((x) => x.id === editId).member_id : val('ab_mem')) : mid;
    const d = { von: val('ab_von'), bis: val('ab_bis'), grund: val('ab_grund'), notiz: val('ab_notiz') };
    if (!target) return toast('Mitglied wählen');
    if (!d.von || !d.bis) return toast('Von und Bis angeben');
    if (d.bis < d.von) return toast('«Bis» liegt vor «Von»');
    try {
      let n = 0;
      if (editId) await q(sb.from('absences').update(d).eq('id', editId));
      else {
        await q(sb.from('absences').insert({ ...d, member_id: target }));
        if (val('ab_auto')) n = await autoAbmelden(S.byId[target], d);
      }
      S.absences = await q(sb.from('absences').select('*').gte('bis', new Date(Date.now() - 2 * 864e5).toLocaleDateString('sv-SE', { timeZone: TZ })).order('von'));
      toast((editId ? 'Gespeichert' : 'Eingetragen') + (n ? ` – bei ${n} Anlass${n > 1 ? 'en' : ''} abgemeldet` : '')); viewAbsences(id, all);
    } catch (e) { err(e); }
  };
  $app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Abwesenheit löschen? (Abmeldungen bei Anlässen bleiben bestehen.)')) return;
    try { await q(sb.from('absences').delete().eq('id', b.dataset.del)); S.absences = S.absences.filter((a) => a.id !== b.dataset.del); viewAbsences(id, all); } catch (e) { err(e); }
  });
}
/* Bei Anlässen im Zeitraum ohne Antwort automatisch abmelden; liefert Anzahl */
async function autoAbmelden(m, d) {
  if (!m) return 0;
  const from = new Date(d.von + 'T00:00:00').toISOString(), to = new Date(d.bis + 'T23:59:59').toISOString();
  const evs = (await q(sb.from('events').select('id,title,cancelled').gte('starts_at', from).lte('starts_at', to))).filter((e) => !e.cancelled && (!isCand(m) || catOf(e) === 'club'));
  if (!evs.length) return 0;
  const have = await q(sb.from('registrations').select('event_id').eq('member_id', m.id).in('event_id', evs.map((e) => e.id)));
  const neu = evs.filter((e) => !have.some((r) => r.event_id === e.id)).map((e) => ({ event_id: e.id, member_id: m.id, status: 'ab', comment: d.grund }));
  if (neu.length) await q(sb.from('registrations').insert(neu));
  return neu.length;
}

/* ---------- E-Mail an Mitglieder ---------- */
async function viewAdminMail(preId) {
  const draft = S.mailDraft || {}; S.mailDraft = null;
  const act = S.members.filter((m) => m.aktiv).sort(sortName);
  const wm = act.filter((m) => m.email);
  const groups = { members: wm.filter((m) => !isCand(m)), all: wm, cand: wm.filter(isCand) };
  const who0 = preId ? 'pick' : draft.who || 'members';
  shell('E-Mail an Mitglieder', `<div class="card">
    <label>Empfänger</label><select id="ml_who">
      <option value="members" ${who0 === 'members' ? 'selected' : ''}>Alle Mitglieder (${groups.members.length})</option>
      <option value="all" ${who0 === 'all' ? 'selected' : ''}>Mitglieder und Kandidaten (${groups.all.length})</option>
      <option value="cand" ${who0 === 'cand' ? 'selected' : ''}>Nur Kandidaten (${groups.cand.length})</option>
      <option value="pick" ${who0 === 'pick' ? 'selected' : ''}>Einzelne auswählen…</option></select>
    <div id="ml_pick" style="display:none;margin-top:8px"><input id="ml_s" type="search" placeholder="Suchen…">
      <div class="list" style="max-height:260px;overflow:auto;margin-top:6px">${wm.map((m) => `<label class="row check" style="margin:0" data-n="${h((m.vorname + ' ' + m.nachname).toLowerCase())}"><input type="checkbox" class="ml_cb" value="${m.id}" ${m.id === preId ? 'checked' : ''}> ${h(fullName(m))}${isCand(m) ? ' <span class="chip cand">Kandidat</span>' : ''}</label>`).join('')}</div></div>
    <p class="small" id="ml_cnt"></p>
    <label>Betreff</label><input id="ml_subj" value="${h(draft.subject || '')}">
    <label>Text</label><textarea id="ml_text" style="min-height:240px">${h(draft.text || `Lieber {vorname}\n\n\n\nHerzliche Grüsse\n${S.me.vorname}`)}</textarea>
    <p class="small muted">Platzhalter: {vorname} {nachname} {link} (persönlicher Login-Link). Absender ist ${h(CFG.clubName)}; Antworten gehen an ${h(setv('mail_reply_to') || S.me.email || 'dich')} (änderbar unter Einstellungen).</p>
    <div class="btns"><button class="btn" id="ml_test">Testmail an mich</button><button class="btn p" id="ml_go">Senden</button></div>
    <div id="ml_res"></div>
    <button class="btn ghost block" id="ml_bcc" style="margin-top:10px">Stattdessen im eigenen Mailprogramm öffnen (BCC)</button>
    <p class="small muted">Ohne E-Mail-Adresse: ${act.filter((m) => !m.email).map((m) => h(fullName(m))).join(', ') || '–'}</p></div>`, { tab: 'mehr', back: true });
  const targets = () => { const w = val('ml_who'); return w === 'pick' ? [...document.querySelectorAll('.ml_cb:checked')].map((c) => S.byId[c.value]) : groups[w]; };
  const upd = () => { document.getElementById('ml_pick').style.display = val('ml_who') === 'pick' ? '' : 'none'; const t = targets(); document.getElementById('ml_cnt').textContent = `${t.length} Empfänger${t.length && t.length <= 5 ? ': ' + t.map(fullName).join(', ') : ''}`; };
  document.getElementById('ml_who').onchange = upd;
  document.querySelectorAll('.ml_cb').forEach((c) => c.onchange = upd);
  document.getElementById('ml_s').oninput = (e) => { const t = e.target.value.toLowerCase(); document.querySelectorAll('#ml_pick [data-n]').forEach((r) => { r.style.display = !t || r.dataset.n.includes(t) ? '' : 'none'; }); };
  upd();
  const send = async (test) => {
    const t = targets(); const subject = val('ml_subj'); const text = document.getElementById('ml_text').value;
    if (!subject) return toast('Betreff fehlt');
    if (!t.length) return toast('Keine Empfänger');
    const body = { free: true, subject, text, member_ids: t.map((m) => m.id) };
    if (test) { body.test_to = S.me.email || prompt('Testmail an welche Adresse?'); if (!body.test_to) return; }
    else if (!confirm(`E-Mail an ${t.length} Empfänger senden?`)) return;
    const res = document.getElementById('ml_res'); res.innerHTML = `<p class="small">Versand läuft… (ca. ${test ? 5 : Math.ceil(t.length * 1.3) + 5} Sekunden)</p>`;
    const { data, error } = await sb.functions.invoke('send-codes', { body });
    let j = data;
    if (error) { try { j = await error.context.json(); } catch { j = { error: error.message }; } }
    if (j?.error) { res.innerHTML = `<div class="card" style="background:var(--no-bg);color:var(--no)">${h(j.error)}</div>`; return; }
    res.innerHTML = `<p><b>${j.sent} gesendet</b>${j.failed ? `, <span style="color:var(--no)">${j.failed} Fehler</span>` : ''}${test ? ` (Test an ${h(body.test_to)})` : ''}</p>
      <div class="res">${j.results.filter((r) => !r.ok).map((r) => `<div>✗ ${h(r.name)} – ${h(r.error || '')}</div>`).join('')}</div>`;
  };
  document.getElementById('ml_test').onclick = () => send(true);
  document.getElementById('ml_go').onclick = () => send(false);
  document.getElementById('ml_bcc').onclick = () => {
    const t = targets(); if (!t.length) return toast('Keine Empfänger');
    const text = document.getElementById('ml_text').value.replace(/Lieber \{vorname\}/g, 'Liebe Mitglieder').replace(/\{vorname\}|\{nachname\}/g, '').replace(/^.*\{link\}.*$\n?/gm, '');
    location.href = `mailto:?bcc=${t.map((m) => encodeURIComponent(m.email)).join(',')}&subject=${encodeURIComponent(val('ml_subj') || '')}&body=${encodeURIComponent(text)}`;
  };
}

/* ---------- Login-Link an einzelne Person senden (E-Mail, WhatsApp, SMS, Teilen) ---------- */
async function sendLinkSheet(m, code) {
  if (!m) return;
  if (!code) { try { code = (await q(sb.from('member_secrets').select('login_code').eq('member_id', m.id).single())).login_code; } catch (e) { return err(e); } }
  const link = `${appBase()}?code=${code}`;
  const text = isCand(m)
    ? `Lieber ${m.vorname}\n\nHerzlich willkommen als Kandidat beim Ambassador Club Thun! In unserer App siehst du das Programm und kannst dich für die Anlässe an- und abmelden.\n\nDein persönlicher Zugang (bitte nicht weitergeben):\n${link}\n\nLink antippen – fertig. Tipp: danach im Browser «Zum Home-Bildschirm» wählen.\n\nHerzliche Grüsse\n${S.me.vorname}`
    : `Lieber ${m.vorname}\n\nHier ist dein persönlicher Zugang zur App des Ambassador Club Thun (bitte nicht weitergeben):\n${link}\n\nLink antippen – fertig. Tipp: danach im Browser «Zum Home-Bildschirm» wählen, dann ist die App wie jede andere auf dem Handy.\n\nHerzliche Grüsse\n${S.me.vorname}`;
  const tel = (m.tel || '').replace(/\s/g, '');
  const mob = m.mobile || (/^(\+417|00417|07)/.test(tel) ? m.tel : '');
  const subj = 'Dein Zugang zur AC Thun App';
  const wa = mob ? `<a class="btn ${isMobile() ? 'p' : ''} block" target="_blank" rel="noopener" data-k="wa" href="https://wa.me/${waNumber(mob)}?text=">WhatsApp</a>` : '';
  const appMail = m.email ? `<button class="btn ${isMobile() && mob ? '' : 'p'} block" id="sl_app">E-Mail über die App senden</button>` : '';
  const opts = [isMobile() ? wa + appMail : appMail + wa,
    m.email ? `<a class="btn block" data-k="mail" href="mailto:${h(m.email)}?subject=${encodeURIComponent(subj)}&body=">Eigenes Mailprogramm</a>` : '',
    mob ? `<a class="btn block" data-k="sms" href="sms:${h(mob.replace(/\s/g, ''))}?&body=">SMS</a>` : '',
    navigator.share ? '<button class="btn block" id="sl_share">Teilen …</button>' : '',
    '<button class="btn ghost block" id="sl_copy">Text kopieren</button>'].join('');
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="card sheet"><b>Login-Link an ${h(fullName(m))}</b>
    <textarea id="sl_txt" style="margin:10px 0;min-height:170px">${h(text)}</textarea>
    <div style="display:grid;gap:8px">${opts}</div><div id="sl_res" class="small" style="margin-top:6px"></div>
    <button class="btn ghost block" id="sl_x" style="margin-top:8px">Schliessen</button></div>`;
  document.body.appendChild(ov);
  const cur = () => document.getElementById('sl_txt').value;
  const upd = () => { const t = encodeURIComponent(cur()); ov.querySelectorAll('a[data-k]').forEach((a) => { a.href = a.href.replace(/(text=|body=).*$/, '$1' + t); }); };
  ov.querySelector('#sl_txt').oninput = upd; upd();
  ov.onclick = (e) => { if (e.target === ov || e.target.id === 'sl_x') ov.remove(); };
  ov.querySelector('#sl_copy').onclick = () => copy(cur());
  const sh = ov.querySelector('#sl_share'); if (sh) sh.onclick = () => navigator.share({ title: 'AC Thun App', text: cur() }).catch(() => {});
  const am = ov.querySelector('#sl_app');
  if (am) am.onclick = async () => {
    const res = ov.querySelector('#sl_res'); am.disabled = true; res.textContent = 'Wird gesendet…';
    const t = cur(); const hasLink = t.includes(link);
    const { data, error } = await sb.functions.invoke('send-codes', { body: { subject: subj, text: hasLink ? t.split(link).join('{link}') : t, member_ids: [m.id], free: !hasLink } });
    let j = data; if (error) { try { j = await error.context.json(); } catch { j = { error: error.message }; } }
    am.disabled = false;
    if (j?.error) { res.innerHTML = `<span style="color:var(--no)">${h(j.error)}</span>`; return; }
    res.innerHTML = j.sent ? `<span style="color:var(--ok)">✓ E-Mail an ${h(m.email)} gesendet</span>` : `<span style="color:var(--no)">${h(j.results?.[0]?.error || 'nicht gesendet')}</span>`;
  };
}

/* ---------- Dateien (Supabase Storage) ---------- */
const isStandalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
const safeName = (n) => String(n || 'datei').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
const fSize = (b) => !b ? '' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
/* Öffnet eine private Datei über eine zeitlich begrenzte Adresse. In der iPhone-Web-App mit Zwischenschritt (Popup-Sperre). */
async function openStorage(bucket, path, title) {
  const direct = !isStandalone();
  const w = direct ? window.open('', '_blank') : null;
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 900);
    if (error) throw error;
    if (w) { w.location.href = data.signedUrl; return; }
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="card sheet"><b>${h(title || 'Datei')}</b><div style="display:grid;gap:8px;margin-top:10px">
      <a class="btn p block" href="${h(data.signedUrl)}" target="_blank" rel="noopener">Öffnen</a><button class="btn ghost block" id="fo_x">Schliessen</button></div></div>`;
    document.body.appendChild(ov);
    ov.onclick = (e) => { if (e.target === ov || e.target.id === 'fo_x' || e.target.tagName === 'A') setTimeout(() => ov.remove(), 50); };
  } catch (e) { if (w) w.close(); err(e); }
}
const openCV = (m) => m?.lebenslauf_path ? openStorage('lebenslauf', m.lebenslauf_path, 'Lebenslauf ' + fullName(m)) : toast('Kein Lebenslauf hinterlegt');
async function uploadCV(m, file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return toast('Bitte eine PDF-Datei wählen');
  if (file.size > 10485760) return toast('Die Datei ist grösser als 10 MB');
  const path = `${m.id}/${Date.now()}.pdf`;
  const { error } = await sb.storage.from('lebenslauf').upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;
  const old = m.lebenslauf_path;
  await q(sb.from('members').update({ lebenslauf_path: path }).eq('id', m.id));
  if (old) await sb.storage.from('lebenslauf').remove([old]);
}

/* ---------- Einstellungen (Admin) ---------- */
async function viewAdminSettings() {
  const v = (k, d = '') => h(setv(k, d) ?? '');
  shell('Einstellungen', `<div class="card"><b>Kandidaten & Veto</b>
      <div class="grid2"><div><label>Teilnahmen bis Veto 2</label><input id="s_veto2" type="number" min="1" max="20" value="${v('veto2_min_teilnahmen', 5)}"></div>
        <div><label>Standard-Frist Veto (Tage)</label><input id="s_frist" type="number" min="1" max="90" value="${v('veto_frist_tage', 14)}"></div></div>
      <p class="small muted">Die Frist kann beim Start und bei laufenden Verfahren («Frist ändern») auch einzeln angepasst werden; Teilnahmen pro Kandidat unter «Teilnahmen anpassen».</p></div>
    <div class="card"><b>E-Mail</b>
      <label>Antwortadresse für E-Mails aus der App</label><input id="s_reply" placeholder="Vorname Name <adresse@domain.ch>" value="${v('mail_reply_to')}">
      <p class="small muted">Leer = der sendende Admin. Absender bleibt ${h(CFG.clubName)} &lt;info@ac-thun.ch&gt;.</p></div>
    <div class="card"><b>Shop</b>
      <label>Bestellungen gehen an</label><input id="s_shop" placeholder="Kassier <kassier@…>" value="${v('shop_email')}">
      <p class="small muted">Leer = aktuelles Vorstandsamt «Kassier», sonst die Antwortadresse.</p>
      <b style="display:block;margin-top:12px">QR-Rechnung (Zahlungsempfänger)</b>
      <label>IBAN (normale IBAN, keine QR-IBAN)</label><input id="s_iban" placeholder="CH.. .... .... .... .... ." value="${v('qr_iban')}">
      <label>Name</label><input id="s_qname" value="${v('qr_name', CFG.clubName)}">
      <label>Strasse und Nr.</label><input id="s_qstr" value="${v('qr_strasse')}">
      <div class="grid2"><div><label>PLZ</label><input id="s_qplz" value="${v('qr_plz')}"></div><div><label>Ort</label><input id="s_qort" value="${v('qr_ort')}"></div></div>
      <p class="small muted">Ohne IBAN wird keine QR-Rechnung angezeigt; der Kassier meldet sich dann selbst.</p></div>
    <button class="btn p block" id="s_save">Speichern</button>`, { tab: 'mehr', back: true });
  document.getElementById('s_save').onclick = async () => {
    const iban = (val('s_iban') || '').replace(/\s/g, '').toUpperCase();
    if (iban && !/^(CH|LI)\d{19}$/.test(iban)) return toast('IBAN prüfen (CH + 19 Ziffern)');
    if (iban && +iban.slice(4, 9) >= 30000 && +iban.slice(4, 9) <= 31999) return toast('Das ist eine QR-IBAN – bitte die normale IBAN verwenden');
    const rows = { veto2_min_teilnahmen: Math.max(1, +val('s_veto2') || 5), veto_frist_tage: Math.max(1, +val('s_frist') || 14), mail_reply_to: val('s_reply'), shop_email: val('s_shop'),
      qr_iban: iban || null, qr_name: val('s_qname'), qr_strasse: val('s_qstr'), qr_plz: val('s_qplz'), qr_ort: val('s_qort') };
    try {
      await q(sb.from('settings').upsert(Object.entries(rows).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() })), { onConflict: 'key' }));
      Object.assign(S.settings, rows); toast('Gespeichert');
    } catch (e) { err(e); }
  };
}

/* ---------- Dokumente ---------- */
const DOC_CATS = ['Statuten & Reglemente', 'Protokolle', 'Jahresprogramm', 'Formulare', 'Diverses'];
async function viewDocuments() {
  shell('Dokumente', '', { tab: 'mehr', back: true }); loading();
  const docs = await q(sb.from('documents').select('*').order('created_at', { ascending: false }));
  const icon = (d) => /pdf/.test(d.mime || d.file_name) ? '📕' : /image/.test(d.mime || '') ? '🖼️' : /sheet|excel|xls/.test(d.mime || d.file_name) ? '📊' : /word|doc/.test(d.mime || d.file_name) ? '📘' : '📄';
  let html = '';
  if (S.admin) html += `<details class="card" ${docs.length ? '' : 'open'}><summary><b>+ Dokument hochladen</b> ›</summary>
    <label>Datei (max. 25 MB)</label><input type="file" id="dc_file">
    <label>Titel</label><input id="dc_title" placeholder="z.B. Statuten 2026">
    <label>Kategorie</label><select id="dc_cat">${DOC_CATS.map((c) => `<option>${c}</option>`).join('')}</select>
    <label class="check"><input type="checkbox" id="dc_cand"> auch für Kandidaten sichtbar</label>
    <button class="btn p block" id="dc_up">Hochladen</button></details>`;
  const cats = [...DOC_CATS, ...new Set(docs.map((d) => d.kategorie).filter((c) => !DOC_CATS.includes(c)))];
  for (const c of cats) {
    const ds = docs.filter((d) => d.kategorie === c); if (!ds.length) continue;
    html += `<h2>${h(c)}</h2><div class="list">${ds.map((d) => `<div class="row"><a href="#" data-open="${d.id}" class="row" style="padding:0;border:0;flex:1;min-width:0">
      <div class="av" style="background:var(--bg);font-size:20px">${icon(d)}</div><div class="grow"><b>${h(d.title)}</b><div class="sub">${[fmt(d.created_at, { day: 'numeric', month: 'short', year: 'numeric' }), fSize(d.size), S.admin && d.fuer_kandidaten ? 'auch Kandidaten' : ''].filter(Boolean).map(h).join(' · ')}</div></div></a>
      ${S.admin ? `<button class="btn sm ghost" data-del="${d.id}" aria-label="Löschen">✕</button>` : ''}</div>`).join('')}</div>`;
  }
  if (!docs.length) html += '<div class="empty">Noch keine Dokumente.</div>';
  $app.querySelector('main').innerHTML = html;
  $app.querySelectorAll('[data-open]').forEach((a) => a.onclick = (e) => { e.preventDefault(); const d = docs.find((x) => x.id === a.dataset.open); openStorage('dokumente', d.path, d.title); });
  $app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    const d = docs.find((x) => x.id === b.dataset.del); if (!confirm(`«${d.title}» löschen?`)) return;
    try { await sb.storage.from('dokumente').remove([d.path]); await q(sb.from('documents').delete().eq('id', d.id)); viewDocuments(); } catch (e) { err(e); }
  });
  const f = document.getElementById('dc_file');
  if (f) {
    f.onchange = () => { const t = document.getElementById('dc_title'); if (f.files[0] && !t.value) t.value = f.files[0].name.replace(/\.[^.]+$/, ''); };
    document.getElementById('dc_up').onclick = async () => {
      const file = f.files[0]; const title = val('dc_title');
      if (!file) return toast('Datei wählen'); if (!title) return toast('Titel angeben');
      if (file.size > 26214400) return toast('Die Datei ist grösser als 25 MB');
      const btn = document.getElementById('dc_up'); btn.disabled = true; btn.textContent = 'Lädt hoch…';
      try {
        const path = `${Date.now()}-${safeName(file.name)}`;
        const { error } = await sb.storage.from('dokumente').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (error) throw error;
        await q(sb.from('documents').insert({ title, kategorie: val('dc_cat'), path, file_name: file.name, mime: file.type, size: file.size, fuer_kandidaten: val('dc_cand'), uploaded_by: S.me.id }));
        toast('Hochgeladen'); viewDocuments();
      } catch (e) { err(e); btn.disabled = false; btn.textContent = 'Hochladen'; }
    };
  }
}

/* ---------- Shop ---------- */
const chf = (n) => 'CHF ' + (+n || 0).toFixed(2);
const imgUrl = (p) => p ? sb.storage.from('shop').getPublicUrl(p).data.publicUrl : '';
const varsOf = (p) => String(p.varianten || '').split(',').map((s) => s.trim()).filter(Boolean);
const ORDER_ST = { neu: ['offen', 'gold'], bezahlt: ['bezahlt', 'ok'], geliefert: ['geliefert', 'ok'], storniert: ['storniert', 'no'] };
const orderChip = (o) => `<span class="chip ${ORDER_ST[o.status]?.[1] || ''}">${ORDER_ST[o.status]?.[0] || h(o.status)}</span>`;
const loadCart = () => { try { return JSON.parse(localStorage.getItem('ac_cart') || '[]'); } catch { return []; } };
const saveCart = (c) => { try { localStorage.setItem('ac_cart', JSON.stringify(c)); } catch { /* */ } };

async function viewShop() {
  shell('Shop', '', { tab: 'mehr', back: true }); loading();
  const prods = await q(sb.from('products').select('*').eq('aktiv', true).order('sort'));
  prods.sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name, 'de'));
  let cart = loadCart().filter((c) => prods.some((p) => p.id === c.product_id));
  const draw = () => {
    const total = cart.reduce((s, c) => s + (prods.find((p) => p.id === c.product_id)?.preis || 0) * c.menge, 0);
    let html = `<div class="btns" style="margin-bottom:10px"><a class="btn sm ghost" href="#/shop/bestellungen">Meine Bestellungen ›</a>${S.admin ? '<a class="btn sm ghost" href="#/admin/shop">Shop verwalten</a>' : ''}</div>`;
    html += prods.map((p) => `<div class="card shop-item">${p.bild_path ? `<img src="${h(imgUrl(p.bild_path))}" alt="">` : '<div class="noimg">🛍️</div>'}
      <div class="grow"><b>${h(p.name)}</b><div class="price">${chf(p.preis)}</div>${p.beschreibung ? `<div class="small muted" style="white-space:pre-wrap">${h(p.beschreibung)}</div>` : ''}
        <div class="btns" style="margin-top:8px;align-items:center">${varsOf(p).length ? `<select id="v_${p.id}" style="width:auto">${varsOf(p).map((x) => `<option>${h(x)}</option>`).join('')}</select>` : ''}
          <input id="n_${p.id}" type="number" min="1" max="99" value="1" style="width:64px"><button class="btn sm p" data-add="${p.id}">In den Warenkorb</button></div></div></div>`).join('') || '<div class="empty">Zurzeit keine Artikel im Shop.</div>';
    if (cart.length) html += `<div class="card cart" id="cart"><b>Warenkorb</b>${cart.map((c, i) => { const p = prods.find((x) => x.id === c.product_id);
        return `<div class="row" style="padding:6px 0"><div class="grow">${c.menge} × ${h(p.name)}${c.variante ? ' (' + h(c.variante) + ')' : ''}<div class="sub">${chf(p.preis * c.menge)}</div></div><button class="btn sm ghost" data-rm="${i}" aria-label="Entfernen">✕</button></div>`; }).join('')}
      <div style="display:flex;justify-content:space-between;font-weight:700;margin:8px 0"><span>Total</span><span>${chf(total)}</span></div>
      <label>Bemerkung (optional)</label><input id="sh_note" placeholder="z.B. Übergabe am nächsten Lunch">
      <button class="btn p block" id="sh_order" style="margin-top:10px">Verbindlich bestellen</button>
      <p class="small muted">Die Bestellung geht an den Kassier; du erhältst eine Bestätigung per E-Mail.</p></div>`;
    $app.querySelector('main').innerHTML = html;
    $app.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
      const id = b.dataset.add; const variante = val('v_' + id); const menge = Math.max(1, Math.min(99, +val('n_' + id) || 1));
      const ex = cart.find((c) => c.product_id === id && (c.variante || null) === (variante || null));
      if (ex) ex.menge = Math.min(99, ex.menge + menge); else cart.push({ product_id: id, variante, menge });
      saveCart(cart); toast('Im Warenkorb'); draw(); document.getElementById('cart')?.scrollIntoView?.({ behavior: 'smooth' });
    });
    $app.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { cart.splice(+b.dataset.rm, 1); saveCart(cart); draw(); });
    const ob = document.getElementById('sh_order');
    if (ob) ob.onclick = async () => {
      if (!confirm(`Verbindlich bestellen für ${chf(total)}?`)) return;
      ob.disabled = true; ob.textContent = 'Wird bestellt…';
      const { data, error } = await sb.functions.invoke('shop-order', { body: { items: cart, bemerkung: val('sh_note') } });
      let j = data; if (error) { try { j = await error.context.json(); } catch { j = { error: error.message }; } }
      if (j?.error) { ob.disabled = false; ob.textContent = 'Verbindlich bestellen'; return toast(j.error); }
      cart = []; saveCart(cart);
      const o = j.order;
      $app.querySelector('main').innerHTML = `<div class="card" style="text-align:center"><div style="font-size:40px">✅</div><b>Danke für deine Bestellung ${o.id}!</b>
        <p class="small muted">${j.mail?.mitglied ? 'Eine Bestätigung ist per E-Mail unterwegs.' : ''}${j.mail?.kassier ? ' Der Kassier ist informiert.' : ''}${j.mail?.error ? ' (Hinweis: ' + h(j.mail.error) + ')' : ''}</p></div>
        ${await qrBillHtml(o.total, `Shop-Bestellung ${o.id}`)}<a class="btn block" href="#/shop/bestellungen">Meine Bestellungen</a>`;
    };
  };
  draw();
}

async function viewMyOrders() {
  shell('Meine Bestellungen', '', { tab: 'mehr', back: true }); loading();
  const orders = await q(sb.from('orders').select('*').eq('member_id', S.me.id).order('created_at', { ascending: false }));
  $app.querySelector('main').innerHTML = orders.map((o) => `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>Bestellung ${o.id}</b>${orderChip(o)}</div>
      <div class="small muted">${fmt(o.created_at, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      <div class="small" style="margin:6px 0">${(o.items || []).map((l) => `${l.menge} × ${h(l.name)}${l.variante ? ' (' + h(l.variante) + ')' : ''} – ${chf(l.summe)}`).join('<br>')}</div>
      <b>Total ${chf(o.total)}</b>${o.status === 'neu' && setv('qr_iban') ? `<div><button class="btn sm" data-qr="${o.id}" style="margin-top:8px">QR-Rechnung anzeigen</button><div id="qr_${o.id}"></div></div>` : ''}</div>`).join('')
    || '<div class="empty">Noch keine Bestellungen.</div>';
  $app.querySelectorAll('[data-qr]').forEach((b) => b.onclick = async () => { const o = orders.find((x) => String(x.id) === b.dataset.qr); document.getElementById('qr_' + o.id).innerHTML = await qrBillHtml(o.total, `Shop-Bestellung ${o.id}`); b.remove(); });
}

async function viewAdminShop() {
  shell('Shop verwalten', '', { tab: 'mehr', back: true }); loading();
  const [prods, orders] = await Promise.all([q(sb.from('products').select('*').order('sort')), q(sb.from('orders').select('*').order('created_at', { ascending: false }))]);
  const open = orders.filter((o) => o.status === 'neu' || o.status === 'bezahlt');
  const nm = (o) => S.byId[o.member_id] ? fullName(S.byId[o.member_id]) : '?';
  const orow = (o) => `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>${o.id} · ${h(nm(o))}</b><span>${chf(o.total)}</span></div>
    <div class="small muted">${fmt(o.created_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
    <div class="small" style="margin:4px 0">${(o.items || []).map((l) => `${l.menge} × ${h(l.name)}${l.variante ? ' (' + h(l.variante) + ')' : ''}`).join(', ')}${o.bemerkung ? `<br><i>${h(o.bemerkung)}</i>` : ''}</div>
    <select data-ost="${o.id}" style="width:auto">${Object.entries(ORDER_ST).map(([k, [l]]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  $app.querySelector('main').innerHTML = `<div class="btns" style="margin-bottom:10px"><a class="btn p" href="#/admin/produkt/neu">+ Artikel</a><a class="btn" href="#/admin/einstellungen">Einstellungen (Kassier, IBAN)</a><button class="btn" id="o_csv">Bestellungen CSV</button></div>
    <h2>Artikel (${prods.length})</h2><div class="list">${prods.map((p) => `<a class="row" href="#/admin/produkt/${p.id}">${p.bild_path ? `<img src="${h(imgUrl(p.bild_path))}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px">` : '<div class="av" style="background:var(--bg)">🛍️</div>'}
      <div class="grow"><b>${h(p.name)}</b><div class="sub">${chf(p.preis)}${varsOf(p).length ? ' · ' + h(varsOf(p).join(', ')) : ''}</div></div>${p.aktiv ? '' : '<span class="chip">ausgeblendet</span>'}<span class="muted">›</span></a>`).join('') || '<div class="row muted">Noch keine Artikel.</div>'}</div>
    <h2>Offene Bestellungen (${open.length})</h2>${open.map(orow).join('') || '<div class="empty">Keine.</div>'}
    ${orders.length > open.length ? `<details><summary class="muted">Erledigte Bestellungen (${orders.length - open.length}) ›</summary>${orders.filter((o) => !open.includes(o)).map(orow).join('')}</details>` : ''}`;
  $app.querySelectorAll('[data-ost]').forEach((s) => s.onchange = async () => {
    try { await q(sb.from('orders').update({ status: s.value, updated_at: new Date().toISOString() }).eq('id', +s.dataset.ost)); toast('Status gespeichert'); } catch (e) { err(e); }
  });
  document.getElementById('o_csv').onclick = () => download('AC_Thun_Bestellungen.csv', csv([['Nr', 'Datum', 'Mitglied', 'Artikel', 'Total', 'Status', 'Bemerkung'],
    ...orders.map((o) => [o.id, fmt(o.created_at, { dateStyle: 'short' }), nm(o), (o.items || []).map((l) => `${l.menge}x ${l.name}${l.variante ? ' (' + l.variante + ')' : ''}`).join('; '), (+o.total).toFixed(2), ORDER_ST[o.status]?.[0] || o.status, o.bemerkung || ''])]), 'text/csv');
}

async function viewAdminProduct(id) {
  const isNew = id === 'neu';
  const p = isNew ? { aktiv: true, sort: 100, preis: '' } : await q(sb.from('products').select('*').eq('id', id).single());
  shell(isNew ? 'Neuer Artikel' : 'Artikel bearbeiten', `<div class="card">
    <label>Name</label><input id="p_name" value="${h(p.name || '')}">
    <div class="grid2"><div><label>Preis (CHF)</label><input id="p_preis" type="number" min="0" step="0.05" value="${h(p.preis)}"></div><div><label>Reihenfolge</label><input id="p_sort" type="number" value="${h(p.sort)}"></div></div>
    <label>Beschreibung</label><textarea id="p_desc">${h(p.beschreibung || '')}</textarea>
    <label>Varianten (mit Komma getrennt, z.B. «S, M, L» – leer = keine)</label><input id="p_var" value="${h(p.varianten || '')}">
    <label>Bild (JPG/PNG, max. 5 MB)</label>${p.bild_path ? `<img src="${h(imgUrl(p.bild_path))}" alt="" style="max-width:160px;border-radius:10px;display:block;margin:6px 0">` : ''}<input type="file" id="p_img" accept="image/*">
    <label class="check"><input type="checkbox" id="p_aktiv" ${p.aktiv ? 'checked' : ''}> im Shop sichtbar</label>
    <button class="btn p block" id="p_save">Speichern</button>
    ${isNew ? '' : '<button class="btn ghost block" id="p_del" style="margin-top:8px;color:var(--no)">Löschen</button>'}</div>`, { tab: 'mehr', back: true });
  document.getElementById('p_save').onclick = async () => {
    const d = { name: val('p_name'), preis: Math.round((+val('p_preis') || 0) * 100) / 100, sort: +val('p_sort') || 100, beschreibung: val('p_desc'),
      varianten: (val('p_var') || '').split(',').map((s) => s.trim()).filter(Boolean).join(', ') || null, aktiv: val('p_aktiv') };
    if (!d.name) return toast('Name angeben');
    const btn = document.getElementById('p_save'); btn.disabled = true;
    try {
      const file = document.getElementById('p_img').files[0];
      if (file) {
        if (file.size > 5242880) throw new Error('Bild grösser als 5 MB');
        const path = `p/${Date.now()}-${safeName(file.name)}`;
        const { error } = await sb.storage.from('shop').upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        if (p.bild_path) await sb.storage.from('shop').remove([p.bild_path]);
        d.bild_path = path;
      }
      isNew ? await q(sb.from('products').insert(d)) : await q(sb.from('products').update(d).eq('id', id));
      toast('Gespeichert'); location.hash = '#/admin/shop';
    } catch (e) { err(e); btn.disabled = false; }
  };
  const del = document.getElementById('p_del');
  if (del) del.onclick = async () => {
    if (!confirm(`«${p.name}» löschen? (Bestehende Bestellungen bleiben erhalten.) Alternative: «im Shop sichtbar» abwählen.`)) return;
    try { if (p.bild_path) await sb.storage.from('shop').remove([p.bild_path]); await q(sb.from('products').delete().eq('id', id)); location.hash = '#/admin/shop'; } catch (e) { err(e); }
  };
}

/* ---------- Swiss QR-Rechnung (Zahlteil vereinfacht) ---------- */
function loadQR() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; s.onload = res; s.onerror = () => rej(new Error('QR-Bibliothek konnte nicht geladen werden')); document.head.appendChild(s); });
}
/* Inhalt nach Swiss Payment Standards (SPC 0200, strukturierte Adresse «S», ohne Referenz) */
function spcPayload({ iban, name, strasse, plz, ort, amount, message }) {
  const cut = (s, n) => String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);
  return ['SPC', '0200', '1', iban.replace(/\s/g, ''),
    'S', cut(name, 70), cut(strasse, 70), '', cut(plz, 16), cut(ort, 35), 'CH',
    '', '', '', '', '', '', '',
    (+amount).toFixed(2), 'CHF',
    '', '', '', '', '', '', '',
    'NON', '', cut(message, 140), 'EPD'].join('\r\n');
}
async function qrBillHtml(amount, message) {
  const iban = setv('qr_iban'); if (!iban) return '';
  try { await loadQR(); } catch (e) { return `<div class="card small muted">${h(e.message)}</div>`; }
  const qr = window.qrcode(0, 'M');
  window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  qr.addData(spcPayload({ iban, name: setv('qr_name', CFG.clubName), strasse: setv('qr_strasse'), plz: setv('qr_plz'), ort: setv('qr_ort'), amount, message }), 'Byte');
  qr.make();
  const n = qr.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  const s = n * 7 / 46, o = (n - s) / 2, b = s * 0.08, t = s * 0.17, l = s * 0.56;
  const cross = `<rect x="${o}" y="${o}" width="${s}" height="${s}" fill="#fff"/><rect x="${o + b}" y="${o + b}" width="${s - 2 * b}" height="${s - 2 * b}" fill="#000"/>
    <rect x="${n / 2 - t / 2}" y="${n / 2 - l / 2}" width="${t}" height="${l}" fill="#fff"/><rect x="${n / 2 - l / 2}" y="${n / 2 - t / 2}" width="${l}" height="${t}" fill="#fff"/>`;
  const svg = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" width="190" height="190" shape-rendering="crispEdges" style="background:#fff"><path d="${d}" fill="#000"/>${cross}</svg>`;
  const ib = iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
  return `<div class="card qrbill"><b>QR-Rechnung</b><div class="qrwrap">${svg}<div class="small">
    <div class="k">Konto / Zahlbar an</div>${h(ib)}<br>${h(setv('qr_name', CFG.clubName))}<br>${h(setv('qr_strasse', ''))}<br>${h([setv('qr_plz', ''), setv('qr_ort', '')].join(' ').trim())}
    <div class="k">Betrag</div>CHF ${(+amount).toFixed(2)}<div class="k">Mitteilung</div>${h(message)}</div></div>
    <p class="small muted">Mit der Banking-App scannen oder Screenshot machen und in der App einlesen.</p></div>`;
}

/* ---------- Styles für Filter (ergänzt index.html) ---------- */
(() => {
  const st = document.createElement('style');
  st.textContent = `.filt{display:flex;gap:6px;overflow-x:auto;margin:-4px 0 12px;padding-bottom:2px}
  .filt a{flex:none;padding:6px 12px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none;font-size:14px}
  .filt a span{color:var(--muted);font-size:12px;margin-left:2px}
  .filt a.on{background:#2E3192;border-color:#2E3192;color:#fff}.filt a.on span{color:#cfd0f5}
  .chip.blue{background:#e6e7f7;color:#2E3192}
  .chip.cand{background:#f3ead6;color:#7a5b1e}.chip.abs{background:#fde9dc;color:#a24a14}
  .av.cand{background:var(--card);color:var(--navy);border:2px dashed var(--navy)}
  .veto-card{display:block;text-decoration:none;color:inherit;border-left:4px solid var(--no)}
  .cand-card{border-left:4px solid var(--gold)}.abs-card{background:var(--warn-bg)}
  label.row.check{cursor:pointer}
  .shop-item{display:flex;gap:12px;align-items:flex-start}.shop-item img,.shop-item .noimg{width:84px;height:84px;object-fit:cover;border-radius:10px;flex:none;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:32px}
  .shop-item .grow{flex:1;min-width:0}.shop-item .price{color:var(--navy);font-weight:700;margin:2px 0 4px}
  .cart{border:2px solid var(--navy)}
  .qrbill .qrwrap{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-top:8px}.qrbill .k{font-weight:700;font-size:11px;margin-top:6px;text-transform:uppercase;letter-spacing:.3px}
  .qrbill svg{border-radius:4px}
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
