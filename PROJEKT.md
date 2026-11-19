# AC Thun App – Projektübersicht

Stand: 19.11.2026 · App-Version v1.4

Diese Datei beschreibt, wie die App aufgebaut ist. Sie ist für dich und für Claude gedacht: Zu Beginn einer neuen Sitzung einfach sagen
«Lies https://github.com/schtoni68/AC_Thun/blob/main/PROJEKT.md – wir arbeiten an der AC Thun App weiter».

## Wo liegt was

| Teil | Ort |
|---|---|
| App (Web-App / PWA) | https://club.ac-thun.ch/ (GitHub Pages mit eigener Domain, Datei `CNAME`; alte Adresse https://schtoni68.github.io/AC_Thun/ leitet weiter) |
| Domain | `ac-thun.ch` bei Infomaniak (Halter: Club). DNS: `club` CNAME → `schtoni68.github.io.` |
| Quellcode | GitHub: https://github.com/schtoni68/AC_Thun (Branch `main`) |
| Datenbank, Login, Funktionen | Supabase-Projekt **ac-thun**, ID `yapavquhsfgdgeapavys`, Region Zürich, Organisation «MaennerchorThun's Org», Free Plan |
| Keep-alive | GitHub Action `.github/workflows/keepalive.yml` (alle 3 Tage) |

Änderungen an der App = Dateien auf GitHub ersetzen. Änderungen an Daten/Datenbank = direkt in Supabase (oder via Claude mit dem Supabase-Connector).

## Dateien im Repository

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst, Farben/CSS, lädt supabase-js 2.45.4 (jsDelivr), `config.js`, `app.js` |
| `config.js` | Supabase-URL, öffentlicher Schlüssel (publishable), `appUrl` |
| `app.js` | Die ganze App (Hash-Routing `#/…`, Vanilla JS) |
| `factsheet.html` | Factsheet Präsident (druckbar, nur Admins) – `factsheet.html?e=<event-id>` |
| `sw.js` | Service Worker: Network-first ohne Browser-Cache, Offline-Fallback, Push vorbereitet |
| `manifest.webmanifest` | PWA-Manifest – bewusst **ohne** `start_url` (iPhone übernimmt so die Adresse mit `?code=`) |
| `icons/` | App-Icons und Logo |
| `supabase/` | Kopie der Edge Functions (`functions/`) und der SQL-Migrationen (`migrations/`) – nur zur Dokumentation, wird nicht automatisch deployt |

## Datenbank (Supabase, Schema `public`)

| Tabelle | Zweck |
|---|---|
| `members` | Mitglieder und Kandidaten (Name, Adresse, Telefon, E-Mail, Geburtsdatum, Eintritt, Partner, `aktiv` = Zugang zur App, `show_birthday`, `member_no` = memberID von ambassadorclub.net, `auth_user_id`, `status` mitglied/kandidat, `goetti_id`, `kandidat_seit`) |
| `admins` | Wer Admin ist (`member_id`) |
| `member_secrets` | Persönlicher Login-Code und Kalender-Token pro Mitglied (nur eigenes + Admins lesbar) |
| `board_roles` | Vorstandsämter (Reihenfolge `sort`) |
| `board_terms` | Amtszeiten mit Von/Bis → Vorstand aktuell + Geschichte. `name_text` für Ehemalige ohne Mitgliedseintrag |
| `events` | Anlässe. Kategorie über Titel-Präfix: ohne = AC Thun, `Regio:`, `National:`, `International:` |
| `registrations` | An-/Abmeldungen (`status` an/ab, `with_partner`, `guests`, `comment`) |
| `mail_log` | Versandprotokoll (`kind` code = Login-Link, mail = freie E-Mail; `subject`) |
| `absences` | Abwesenheiten (`von`, `bis`, `grund` Ferien/Krankheit/Militär/Beruflich/Andere, `notiz`) – für alle Mitglieder sichtbar |
| `veto_rounds` | Veto-Verfahren pro Kandidat (`stufe` 1/2, `deadline`, `status` offen/bestanden/abgelehnt/abgebrochen) |
| `veto_votes` | Eingelegte Vetos (`reason`, bei Stufe 2 Pflicht) – nur eigenes + Admins lesbar |

Sicherheit: RLS auf allen Tabellen. Mitglieder lesen alles ausser fremden Codes und fremden Vetos; schreiben nur eigenes Profil, eigene Anmeldungen, eigene Abwesenheiten und eigene Vetos. **Kandidaten** sehen nur sich selbst, ihren Götti und das Programm; sie können sich nur für AC-Thun-Anlässe anmelden. Admins dürfen alles.
Hilfsfunktionen: `my_member_id()`, `is_admin()`, `is_member()` (aktives Mitglied, kein Kandidat), `my_goetti_id()`, `regenerate_login_code(uuid)`.
Trigger: Schutz von Admin-Feldern (inkl. status/goetti_id), Veto-Prüfung (Frist, Begründung bei Veto 2), Code automatisch bei neuem Mitglied, Verknüpfung Login ↔ Mitglied per E-Mail, Vorstands-Einträge ↔ Mitglied per Name.

## Edge Functions (Supabase)

| Funktion | Zweck | JWT |
|---|---|---|
| `login-code` | Persönlicher Code → Login ohne Passwort/Mail | aus |
| `ical` | Kalender-Abo pro Mitglied (`?t=<ical_token>`), ✓/✗ je nach Anmeldung; Kandidaten nur AC-Thun-Anlässe | aus |
| `send-codes` | Login-Link-Serienmail und freie E-Mails an alle/einzelne (`free: true`), nur Admins; Versand per SMTP über info@ac-thun.ch (Infomaniak, Port 465), Antwort-an = Admin | an |

Secrets für `send-codes` (Supabase → Edge Functions → Secrets): `MAIL_FROM` (info@ac-thun.ch), `SMTP_PASS` (Postfach-Passwort), `MAIL_FROM_NAME`, `APP_URL`; optional `SMTP_HOST` (Standard mail.infomaniak.com), `SMTP_USER` (Standard = MAIL_FROM).
Quellcode als Kopie im Repo unter `supabase/functions/`.
Brevo wurde verworfen (Konto am 19.11.2026 vom Anti-Spam-Filter gesperrt) – Secret `BREVO_API_KEY` kann gelöscht werden.

## Funktionen der App (v1.4)

- Login per persönlichem Link `https://club.ac-thun.ch/?code=XXXX` (Code bleibt in Adresse + Gerät gespeichert), Fallback Login-Link per Mail
- Startseite: Begrüssung je nach Tageszeit (Guten Morgen/Tag/Abend), Hinweis auf laufende Veto-Verfahren, Hinweis «Zum Home-Bildschirm», «Was steht an?», Geburtstage (−3 bis +7 Tage) mit Gratulieren (WhatsApp/SMS/Mail)
- Jahresprogramm: Standard nur AC-Thun-Anlässe, Filter Regio / National-Int. / Alle; An-/Abmeldung mit Partner, Gästen, Bemerkung; Abwesende separat statt «keine Antwort»
- Mitglieder (ohne Titel) + Kandidaten (eigener Abschnitt, gestrichelter Kreis, Götti), Abwesenheits-Hinweis, Detail mit Anrufen/SMS/Mail/Kontakt speichern, Alter
- Abwesenheiten (Mehr → Meine Abwesenheiten): Von/Bis, Grund, optional automatische Abmeldung bei Anlässen
- Kandidaten: eigenes Login, sehen nur Programm (AC Thun) und Götti
- Veto: Veto 1 (Einladung) und Veto 2 (Aufnahme nach 5–6 Teilnahmen, nur begründet) – Mitglieder legen Veto in der App ein (`#/veto/<id>`), nur Admins sehen wer
- Vorstand aktuell + Geschichte
- Geburtstage mit Alter
- Kalender-Abo (iPhone/Outlook/Google)
- Admin: Mitglieder, Kandidaten & Veto (Teilnahmen, Veto starten/abschliessen, Aufnahme), E-Mail an alle/Kandidaten/einzelne, Login-Link einzeln senden (E-Mail über App, Mailprogramm, WhatsApp, SMS, Teilen), Excel-Import (ambassadorclub.net), Codes & Links, Serienmail, Anlass erfassen (mit Veranstalter), Clubabend-Serie (Monatslunch 11:45), Vorstand, Factsheet Präsident

## Offene Punkte / Ideen

- [x] Domain `ac-thun.ch` bei Infomaniak, Postfach info@ac-thun.ch
- [x] Secret `SMTP_PASS` (= Gerätepasswort von info@ac-thun.ch, nicht das Infomaniak-Kontopasswort) → Testmail ok (19.11.2026)
- [ ] Serienmail an alle senden
- [ ] Supabase-Projekt aus «MaennerchorThun's Org» in eine eigene AC-Thun-Organisation verschieben
- [x] Supabase → Authentication → URL Configuration: Site URL = https://club.ac-thun.ch/ (+ Redirect URL https://club.ac-thun.ch/**)
- [ ] Termine 2027 ergänzen (Monatsanlässe: Platzhalter «Clubabend» Feb–Dez umbenennen oder löschen; Lunch Juli/August fehlen)
- [ ] «uh» in alten Anmeldelisten zuordnen
- [ ] Amtsbeginn der Vorstandsmitglieder prüfen (Platzhalter 28.01.2026)
- [ ] V2: Shop (Bestellung → Mail an Kassier, QR-Rechnung), Dokumente (Supabase Storage), Push-Nachrichten
- [ ] Evtl. eigenes Feld «bleibt zum Essen» bei Anlässen

## Hinweise

- Keine persönlichen Codes oder Mitgliederdaten in dieses Repository schreiben – es ist öffentlich.
- Nach dem Hochladen neuer Dateien: einmal neu laden (Ctrl+F5); dank neuem `sw.js` kommen Updates sonst sofort.
