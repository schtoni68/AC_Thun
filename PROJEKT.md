# AC Thun App – Projektübersicht

Stand: 18.11.2026 · App-Version v1.3

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

## Datenbank (Supabase, Schema `public`)

| Tabelle | Zweck |
|---|---|
| `members` | Mitglieder (Name, Adresse, Telefon, E-Mail, Geburtsdatum, Eintritt, Partner, `aktiv`, `show_birthday`, `member_no` = memberID von ambassadorclub.net, `auth_user_id`) |
| `admins` | Wer Admin ist (`member_id`) |
| `member_secrets` | Persönlicher Login-Code und Kalender-Token pro Mitglied (nur eigenes + Admins lesbar) |
| `board_roles` | Vorstandsämter (Reihenfolge `sort`) |
| `board_terms` | Amtszeiten mit Von/Bis → Vorstand aktuell + Geschichte. `name_text` für Ehemalige ohne Mitgliedseintrag |
| `events` | Anlässe. Kategorie über Titel-Präfix: ohne = AC Thun, `Regio:`, `National:`, `International:` |
| `registrations` | An-/Abmeldungen (`status` an/ab, `with_partner`, `guests`, `comment`) |
| `mail_log` | Versandprotokoll der Serienmail |

Sicherheit: RLS auf allen Tabellen. Mitglieder lesen alles ausser fremden Codes; schreiben nur eigenes Profil und eigene Anmeldungen. Admins dürfen alles.
Hilfsfunktionen: `my_member_id()`, `is_admin()`, `regenerate_login_code(uuid)`.
Trigger: Schutz von Admin-Feldern, Code automatisch bei neuem Mitglied, Verknüpfung Login ↔ Mitglied per E-Mail, Vorstands-Einträge ↔ Mitglied per Name.

## Edge Functions (Supabase)

| Funktion | Zweck | JWT |
|---|---|---|
| `login-code` | Persönlicher Code → Login ohne Passwort/Mail | aus |
| `ical` | Kalender-Abo pro Mitglied (`?t=<ical_token>`), ✓/✗ je nach Anmeldung | aus |
| `send-codes` | Serienmail mit persönlichem Link (nur Admins), Versand über Brevo | an |

Secrets für `send-codes` (Supabase → Edge Functions → Secrets): `BREVO_API_KEY`, `MAIL_FROM`, optional `MAIL_FROM_NAME`, `APP_URL`.
**Status: noch nicht eingerichtet.**

## Funktionen der App (v1.3)

- Login per persönlichem Link `…/AC_Thun/?code=XXXX` (Code bleibt in Adresse + Gerät gespeichert), Fallback Login-Link per Mail
- Startseite: Begrüssung, Hinweis «Zum Home-Bildschirm», «Was steht an?», Geburtstage (−3 bis +7 Tage) mit Gratulieren (WhatsApp/SMS/Mail)
- Jahresprogramm mit Filter (Alle / AC Thun / Regio / National-Int.), An-/Abmeldung mit Partner, Gästen, Bemerkung
- Mitglieder (ohne Titel), Detail mit Anrufen/SMS/Mail/Kontakt speichern, Alter
- Vorstand aktuell + Geschichte
- Geburtstage mit Alter
- Kalender-Abo (iPhone/Outlook/Google)
- Admin: Mitglieder, Excel-Import (ambassadorclub.net), Codes & Links, Serienmail, Anlass erfassen (mit Veranstalter), Clubabend-Serie (Monatslunch 11:45), Vorstand, Factsheet Präsident

## Offene Punkte / Ideen

- [ ] Brevo einrichten (Secrets) → Serienmail testen und an alle senden. Voraussetzung: Domain `ac-thun.ch` bei Infomaniak registrieren (Halter: Club, Gratis-Mailadresse z.B. info@ac-thun.ch als Absender) (Absender mit eigener Domain wegen DMARC). Danach: Brevo-Konto, Absender verifizieren, API-Key, *Security → Authorised IPs* deaktivieren, Secrets setzen. Edge Function `send-codes` ist bereits fertig deployed.
- [ ] Supabase → Authentication → URL Configuration: Site URL = https://club.ac-thun.ch/ (+ Redirect URL https://club.ac-thun.ch/**)
- [ ] Termine 2027 ergänzen (Monatsanlässe: Platzhalter «Clubabend» Feb–Dez umbenennen oder löschen; Lunch Juli/August fehlen)
- [ ] «uh» in alten Anmeldelisten zuordnen
- [ ] Amtsbeginn der Vorstandsmitglieder prüfen (Platzhalter 28.01.2026)
- [ ] V2: Shop (Bestellung → Mail an Kassier, QR-Rechnung), Dokumente (Supabase Storage), Push-Nachrichten, E-Mail an alle
- [ ] Evtl. eigenes Feld «bleibt zum Essen» bei Anlässen

## Hinweise

- Keine persönlichen Codes oder Mitgliederdaten in dieses Repository schreiben – es ist öffentlich.
- Nach dem Hochladen neuer Dateien: einmal neu laden (Ctrl+F5); dank neuem `sw.js` kommen Updates sonst sofort.
