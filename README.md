# X-Planer · Beyblade X

Web-App (PWA) zum Planen von Beyblade-X-Kombos – läuft im Browser und lässt sich auf iPhone/Android wie eine App zum Homescreen hinzufügen.

## Funktionen

- **Kombo-Planer:** Blade, Ratchet und Bit wählen → Typ, Richtwert-Profil, Warnungen (z. B. integrierter Ratchet, Burst-Risiko, Linksdreher) und Tipps. Optional nur mit Teilen aus der eigenen Sammlung.
- **Teile-Datenbank:** Produkte (BX/UX/CX, Takara Tomy + Hasbro-Namen), Blades und Bits mit Suche und Typ-Filter. Ungeprüfte Angaben sind markiert.
- **Sammlung:** Produkte mit +/− erfassen, verfügbare Teile werden automatisch berechnet. Export/Import als JSON.
- **Deck-Check:** 3 Kreisel, keine doppelte Blade/Ratchet/Bit – Turnier-Faustregel.
- **Neuheiten-Radar:** GitHub Action durchsucht täglich das Beyblade Wiki nach neuen Produktnummern und zeigt Treffer im News-Tab.
- **Offline:** Nach dem ersten Öffnen funktioniert die App auch ohne Internet.

Daten zur Sammlung bleiben lokal auf dem Gerät (localStorage).

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm run check      # Typecheck, Lint, Datenprüfung, Tests, Build
```

## Daten pflegen

- `public/data/db.json` – Teile und Produkte. Wird aus `scripts/seed-db.mjs` erzeugt (`node scripts/seed-db.mjs`), dort neue Produkte eintragen.
- `public/data/news.json` – wird vom Neuheiten-Radar automatisch gefüllt.
- `npm run validate-data` prüft Verweise, IDs und Formate.

## Veröffentlichung (GitHub Pages)

1. Repository auf GitHub anlegen und Code pushen.
2. **Settings → Pages → Source: „GitHub Actions“** wählen.
3. Jeder Push auf `main` baut und veröffentlicht die App (`.github/workflows/deploy.yml`).
4. Der Neuheiten-Radar (`.github/workflows/update-data.yml`) läuft täglich und kann unter **Actions → Neuheiten-Radar → Run workflow** manuell gestartet werden.

Auf dem iPhone: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Hinweis

Die Profilwerte im Kombo-Planer sind Richtwerte aus Teile-Typen und Ratchet-Form, keine Messwerte. Fan-Projekt, nicht mit Takara Tomy oder Hasbro verbunden.
