# AC Thun App – Version 1

Web-App (PWA) für den Ambassador Club Thun. Backend: Supabase-Projekt **ac-thun** (Region Zürich).

## Online stellen (5 Minuten)
1. https://app.netlify.com/drop öffnen (Gratis-Konto) und den Ordner `ac-thun-app` hineinziehen.
2. Netlify zeigt die Adresse, z.B. `https://ac-thun.netlify.app` (unter *Site settings → Change site name* anpassbar).
3. In `config.js` bei `appUrl` diese Adresse eintragen und den Ordner erneut hochladen (*Deploys → Drag & drop*).
4. Supabase → Authentication → URL Configuration: *Site URL* = diese Adresse (nur für den E-Mail-Login nötig).

## Erste Schritte als Admin
1. Mit deinem persönlichen Link anmelden.
2. Mehr → Admin → **Excel-Import**: Export von ambassadorclub.net hochladen.
3. **Persönliche Codes & Links**: pro Mitglied «Mail» (öffnet Outlook mit Text) oder CSV für Serienmail.
4. **Clubabend-Serie** für 2027 erzeugen, Spezialanlässe einzeln erfassen.
5. **Vorstand bearbeiten**: Ämter mit Von/Bis erfassen (auch Ehemalige → Geschichte).
6. Weitere Admins: Mitglied bearbeiten → «Administrator».

## Login
- Hauptweg: persönlicher Link `…/?code=XXXXXXXXXXXX` – kein Passwort, keine Mail nötig.
- Fallback: Login-Link per E-Mail. Der Gratis-Mailversand von Supabase ist auf wenige Mails pro Stunde begrenzt → für Version 2 eigenen SMTP (z.B. Infomaniak, Brevo) hinterlegen.
- Code neu erzeugen (↻) sperrt den alten Link.

## Kalender-Abo
Jedes Mitglied hat unter Mehr → Kalender eine persönliche Abo-Adresse (iPhone, Outlook, Google). Zeigt ✓/✗ je nach Anmeldung.

## Version 2 (vorbereitet)
Shop (Bestellung → Mail an Kassier, Zahlung per QR-Rechnung), Dokumente (Supabase Storage), E-Mail an alle, Push-Nachrichten (Service Worker ist vorbereitet).
