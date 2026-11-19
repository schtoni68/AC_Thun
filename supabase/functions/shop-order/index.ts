// Shop-Bestellung: prüft Preise, speichert die Bestellung, Mail an Kassier + Bestätigung an das Mitglied.
// Empfänger der Bestellung: Einstellung «shop_email», sonst aktuelles Vorstandsamt «Kassier», sonst «mail_reply_to».
// Secrets wie send-codes: MAIL_FROM, SMTP_PASS, optional MAIL_FROM_NAME, SMTP_HOST, SMTP_USER, APP_URL
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.16';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const chf = (n: number) => 'CHF ' + n.toFixed(2);
const fmtIban = (s: string) => s.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const [{ data: myId }, { data: isMem }] = await Promise.all([user.rpc('my_member_id'), user.rpc('is_member')]);
  if (!myId || !isMem) return json({ error: 'Nur für Mitglieder' }, 403);

  const body = await req.json().catch(() => ({}));
  const items: { product_id: string; variante?: string; menge: number }[] = Array.isArray(body.items) ? body.items : [];
  const bemerkung = body.bemerkung ? String(body.bemerkung).slice(0, 1000) : null;
  if (!items.length) return json({ error: 'Warenkorb ist leer' }, 400);

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: prods } = await db.from('products').select('*').in('id', items.map((i) => i.product_id)).eq('aktiv', true);
  const lines = [];
  for (const it of items) {
    const p = (prods ?? []).find((x) => x.id === it.product_id);
    const menge = Math.max(1, Math.min(99, Math.round(+it.menge || 1)));
    if (!p) return json({ error: 'Ein Artikel ist nicht mehr verfügbar. Bitte Warenkorb prüfen.' }, 400);
    const vars = String(p.varianten || '').split(',').map((s) => s.trim()).filter(Boolean);
    const variante = it.variante && vars.includes(it.variante) ? it.variante : null;
    if (vars.length && !variante) return json({ error: `Bitte bei «${p.name}» eine Variante wählen.` }, 400);
    lines.push({ product_id: p.id, name: p.name, variante, menge, preis: +p.preis, summe: Math.round(+p.preis * menge * 100) / 100 });
  }
  const total = Math.round(lines.reduce((s, l) => s + l.summe, 0) * 100) / 100;
  const { data: order, error } = await db.from('orders').insert({ member_id: myId, items: lines, total, bemerkung }).select().single();
  if (error) return json({ error: error.message }, 500);

  // Einstellungen + Empfänger
  const { data: sets } = await db.from('settings').select('key,value');
  const S: Record<string, unknown> = Object.fromEntries((sets ?? []).map((s) => [s.key, s.value]));
  const { data: me } = await db.from('members').select('vorname,nachname,email,strasse,plz,ort,mobile').eq('id', myId).single();
  let kassier = typeof S.shop_email === 'string' && S.shop_email.includes('@') ? S.shop_email : null;
  if (!kassier) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: terms } = await db.from('board_terms').select('member_id, start_date, end_date, board_roles!inner(name), members(email, vorname, nachname)').ilike('board_roles.name', '%kassier%');
    // deno-lint-ignore no-explicit-any
    const t: any = (terms ?? []).find((x) => x.start_date <= today && (!x.end_date || x.end_date >= today) && x.members?.email);
    if (t) kassier = `${t.members.vorname} ${t.members.nachname} <${t.members.email}>`;
  }
  if (!kassier && typeof S.mail_reply_to === 'string') kassier = S.mail_reply_to;

  const from = Deno.env.get('MAIL_FROM'); const pass = Deno.env.get('SMTP_PASS');
  const mail = { kassier: false, mitglied: false, error: '' as string | undefined };
  if (from && pass) {
    const tr = nodemailer.createTransport({ host: Deno.env.get('SMTP_HOST') || 'mail.infomaniak.com', port: 465, secure: true, auth: { user: Deno.env.get('SMTP_USER') || from, pass }, connectionTimeout: 15000, socketTimeout: 30000 });
    const sender = { name: Deno.env.get('MAIL_FROM_NAME') || 'Ambassador Club Thun', address: from };
    const list = lines.map((l) => `${l.menge} × ${l.name}${l.variante ? ' (' + l.variante + ')' : ''} à ${chf(l.preis)} = ${chf(l.summe)}`).join('\n');
    const who = `${me?.vorname} ${me?.nachname}`;
    const pay = S.qr_iban ? `\n\nBitte überweise ${chf(total)} auf:\n${S.qr_name || 'Ambassador Club Thun'}\nIBAN ${fmtIban(String(S.qr_iban))}\nMitteilung: Shop-Bestellung ${order.id}\n\nDie QR-Rechnung findest du in der App unter Mehr → Shop → Meine Bestellungen.` : '\n\nDer Kassier meldet sich wegen der Bezahlung.';
    try {
      if (kassier) {
        await tr.sendMail({ from: sender, to: kassier, replyTo: me?.email || undefined, subject: `Shop-Bestellung ${order.id} von ${who}`,
          text: `Neue Bestellung ${order.id} von ${who}\n${[me?.strasse, [me?.plz, me?.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')}\n${[me?.email, me?.mobile].filter(Boolean).join(' · ')}\n\n${list}\n\nTotal ${chf(total)}${bemerkung ? '\n\nBemerkung: ' + bemerkung : ''}\n\nStatus ändern: App → Admin → Shop` });
        mail.kassier = true;
      }
      if (me?.email) {
        await tr.sendMail({ from: sender, to: { name: who, address: me.email }, replyTo: kassier || undefined, subject: `Deine Bestellung ${order.id} beim AC Thun`,
          text: `Lieber ${me.vorname}\n\nVielen Dank für deine Bestellung:\n\n${list}\n\nTotal ${chf(total)}${bemerkung ? '\n\nBemerkung: ' + bemerkung : ''}${pay}\n\nHerzliche Grüsse\nAmbassador Club Thun` });
        mail.mitglied = true;
      }
    } catch (e) { mail.error = String((e as Error)?.message ?? e).slice(0, 200); }
    tr.close();
  } else mail.error = 'Mailversand nicht eingerichtet';
  return json({ order, mail });
});
