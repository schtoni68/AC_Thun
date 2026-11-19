// Serienmail mit persönlichem Login-Link – Versand per SMTP über das Postfach info@ac-thun.ch (Infomaniak)
// Secrets (Supabase → Edge Functions → Secrets):
//   SMTP_PASS        Passwort des Postfachs (Pflicht)
//   MAIL_FROM        Absender, z.B. info@ac-thun.ch (Pflicht)
//   MAIL_FROM_NAME   optional, Standard «Ambassador Club Thun»
//   APP_URL          optional, Standard https://club.ac-thun.ch/
//   SMTP_HOST        optional, Standard mail.infomaniak.com
//   SMTP_USER        optional, Standard = MAIL_FROM
// Hinweis: Supabase blockiert ausgehend Port 25 und 587 → Port 465 (SSL).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.16';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') ?? '';
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: isAdm } = await user.rpc('is_admin');
  if (!isAdm) return json({ error: 'Nur für Admins' }, 403);
  const { data: myId } = await user.rpc('my_member_id');

  const from = Deno.env.get('MAIL_FROM');
  const pass = Deno.env.get('SMTP_PASS');
  const host = Deno.env.get('SMTP_HOST') || 'mail.infomaniak.com';
  const smtpUser = Deno.env.get('SMTP_USER') || from;
  const fromName = Deno.env.get('MAIL_FROM_NAME') || 'Ambassador Club Thun';
  const appUrl = (Deno.env.get('APP_URL') || 'https://club.ac-thun.ch/').replace(/\/?$/, '/');
  if (!from || !pass) return json({ error: 'Mailversand nicht eingerichtet: Secrets MAIL_FROM und SMTP_PASS fehlen.', setup: true }, 400);

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject || 'Deine AC Thun App');
  const tpl = String(body.text || '');
  const ids: string[] | null = Array.isArray(body.member_ids) ? body.member_ids : null;
  const testTo: string | null = body.test_to ? String(body.test_to).trim() : null;
  // free = freie Mitteilung (E-Mail an alle / einzelne), sonst Versand des Login-Links
  const free = body.free === true;
  const kind = free ? 'mail' : 'code';
  if (!tpl.trim()) return json({ error: 'Der Text ist leer.' }, 400);
  if (!free && !tpl.includes('{link}') && !tpl.includes('{code}')) return json({ error: 'Der Text muss {link} oder {code} enthalten.' }, 400);
  if (free && !testTo && !ids) return json({ error: 'Keine Empfänger ausgewählt.' }, 400);

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let qm = db.from('members').select('id, vorname, nachname, anrede, email, member_secrets(login_code)').eq('aktiv', true).not('email', 'is', null);
  if (ids) qm = qm.in('id', ids);
  const { data: members, error } = await qm.order('nachname');
  if (error) return json({ error: error.message }, 500);
  const { data: me } = await db.from('members').select('email, vorname, nachname').eq('id', myId).maybeSingle();
  const replyTo = me?.email ? { name: `${me.vorname} ${me.nachname}`, address: me.email } : undefined;
  const list = testTo ? (members ?? []).filter((m) => m.id === myId).concat(members ?? []).slice(0, 1) : (members ?? []);

  const transporter = nodemailer.createTransport({
    host, port: 465, secure: true, auth: { user: smtpUser, pass },
    pool: true, maxConnections: 1, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  try {
    await transporter.verify();
  } catch (e) {
    transporter.close();
    return json({ error: 'SMTP-Anmeldung fehlgeschlagen: ' + String((e as Error)?.message ?? e).slice(0, 300) }, 502);
  }

  const results: { id: string; name: string; email: string; ok: boolean; error?: string }[] = [];
  for (const m of list) {
    // deno-lint-ignore no-explicit-any
    const sec: any = Array.isArray(m.member_secrets) ? m.member_secrets[0] : m.member_secrets;
    const code = sec?.login_code;
    const needsCode = tpl.includes('{link}') || tpl.includes('{code}');
    if (!code && needsCode) { results.push({ id: m.id, name: `${m.vorname} ${m.nachname}`, email: m.email!, ok: false, error: 'kein Code' }); continue; }
    const link = `${appUrl}?code=${code}`;
    const text = tpl.replaceAll('{vorname}', m.vorname ?? '').replaceAll('{nachname}', m.nachname ?? '').replaceAll('{anrede}', m.anrede ?? '')
      .replaceAll('{link}', link).replaceAll('{code}', String(code ?? '').replace(/(.{4})(?=.)/g, '$1-'));
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${escHtml(text)
      .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#2E3192;font-weight:bold">${u}</a>`).replace(/\n/g, '<br>')}</div>`;
    const to = testTo || m.email!;
    let ok = false, err: string | undefined;
    try {
      await transporter.sendMail({
        from: { name: fromName, address: from }, to: { name: `${m.vorname} ${m.nachname}`, address: to },
        subject: testTo ? '[TEST] ' + subject : subject, text, html, replyTo,
      });
      ok = true;
    } catch (e) { err = String((e as Error)?.message ?? e).slice(0, 300); }
    results.push({ id: m.id, name: `${m.vorname} ${m.nachname}`, email: to, ok, error: err });
    if (!testTo) await db.from('mail_log').insert({ member_id: m.id, kind, subject, to_email: to, ok, error: err ?? null, sent_by: myId });
    if (!testTo) await new Promise((r) => setTimeout(r, 1000)); // schonend für das Postfach
  }
  transporter.close();
  return json({ sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
});
