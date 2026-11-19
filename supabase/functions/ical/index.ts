// Kalender-Abo pro Mitglied (?t=<ical_token>), ✓/✗ je nach Anmeldung. Kandidaten sehen nur AC-Thun-Anlässe.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const esc = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function fold(line: string) {
  const out: string[] = [];
  const enc = new TextEncoder();
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const t = (url.searchParams.get('t') || '').replace(/[^0-9a-f]/g, '');
  if (t.length < 16) return new Response('not found', { status: 404 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: sec } = await db.from('member_secrets').select('member_id, members!inner(aktiv, status)').eq('ical_token', t).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const mem: any = sec ? (sec as any).members : null;
  if (!sec || !mem?.aktiv) return new Response('not found', { status: 404 });
  const kandidat = mem.status === 'kandidat';
  const since = new Date(Date.now() - 365 * 864e5).toISOString();
  const { data: all } = await db.from('events').select('*').gte('starts_at', since).order('starts_at');
  const events = (all ?? []).filter((e) => !kandidat || !/^(Regio|National|International):/i.test(e.title));
  const { data: regs } = await db.from('registrations').select('event_id,status').eq('member_id', sec.member_id);
  const rmap = new Map((regs ?? []).map((r) => [r.event_id, r.status]));
  const now = dt(new Date().toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ambassador Club Thun//App//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Ambassador Club Thun', 'X-WR-TIMEZONE:Europe/Zurich', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const e of events) {
    const st = rmap.get(e.id);
    const ext = /^(Regio|National|International):/i.test(e.title);
    const prefix = e.cancelled ? '[ABGESAGT] ' : st === 'an' ? '✓ ' : st === 'ab' ? '✗ ' : '';
    const summary = ext ? e.title.replace(/^(Regio|National|International):\s*/i, (m: string) => m.replace(':', ' –').trim() + ' ') : 'AC Thun: ' + e.title;
    const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 3 * 3600e3).toISOString();
    lines.push('BEGIN:VEVENT', `UID:${e.id}@ac-thun`, `DTSTAMP:${now}`, `DTSTART:${dt(e.starts_at)}`, `DTEND:${dt(end)}`,
      fold(`SUMMARY:${esc(prefix + summary)}`));
    if (e.location) lines.push(fold(`LOCATION:${esc(e.location)}`));
    const desc = [e.kind, e.description, st === 'an' ? 'Du bist angemeldet.' : st === 'ab' ? 'Du bist abgemeldet.' : 'Noch nicht an-/abgemeldet.'].filter(Boolean).join('\n\n');
    lines.push(fold(`DESCRIPTION:${esc(desc)}`));
    if (e.cancelled) lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
});
