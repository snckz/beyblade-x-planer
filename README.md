# Beyblade X – Fan-App

Web-App (PWA) zum Planen von Beyblade-X-Kombos – läuft im Browser und lässt sich auf iPhone/Android wie eine App zum Homescreen hinzufügen.

## Funktionen

- **Kombo-Planer:** Blade, Ratchet und Bit wählen → Typ, Richtwert-Profil, Warnungen (z. B. integrierter Ratchet, Burst-Risiko, Linksdreher) und Tipps. Optional nur mit Teilen aus der eigenen Sammlung.
- **Lexikon:** Sammelkarten-Album mit Seltenheit (Standard, Zufall, Limitiert, Ultra-Limitiert) und Fortschritt, Blades, Bits mit Fotos, Ratchets mit Erklärungen, Begriffe (X-Dash, Finishes, Linien …) und Produkte.
- **Teile-Datenbank:** Produkte (BX/UX/CX, Takara Tomy + Hasbro-Namen), Blades und Bits mit Suche und Typ-Filter. Ungeprüfte Angaben sind markiert.
- **Sammlung:** Produkte mit +/− erfassen, verfügbare Teile werden automatisch berechnet. Export/Import als JSON.
- **Battle:** Deck-Check (3 Kreisel, keine doppelten Teile), Gegner-Deck eingeben, Matchup-Matrix mit Siegchance, empfohlene Reihenfolge und Tausch-Vorschläge (Bit/Ratchet), auf Wunsch nur aus der eigenen Sammlung.
- **Termine:** Releases und Turniere mit Countdown (`public/data/events.json`), zweimal pro Woche per Scheduled Task recherchiert.
- **Detailseiten:** Steckbrief im Wiki-Stil je Blade. Bilder werden direkt vom Beyblade Wiki verlinkt (nicht kopiert), mit Quellenlink; ohne Bild erscheint ein eigenes Emblem.
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
- `public/data/images.json` – Bild-Links aus dem Beyblade Wiki (`node scripts/update-images.mjs`, läuft im Radar-Workflow mit).
- `public/data/events.json` – Releases und Turniere.
- `npm run validate-data` prüft Verweise, IDs und Formate.
- **Datenverlust-Schutz:** Alle Skripte, die `db.json` schreiben, gehen über `scripts/data-safety.mjs`. Ein Update, das ein Blade, Ratchet, Bit oder Produkt entfernt oder einer Produktnummer andere Teile gibt, wird abgelehnt (Skript und Workflow schlagen fehl, nichts wird committet). Abruffehler im Wiki gelten nie als „Seite fehlt“. Im Workflow prüft zusätzlich `validate-data.mjs --previous` gegen den letzten Stand auf `main`.
- `public/data/retired.json` – gewollte Löschungen (`"alteId": null`), Umbenennungen (`"alteId": "neueId"`) und Korrekturen von Produktnummern (`reassigned`). Nur was hier steht, darf verschwinden oder sich ändern; Importe legen Stillgelegtes nicht wieder an.

## Veröffentlichung (GitHub Pages)

1. Repository auf GitHub anlegen und Code pushen.
2. **Settings → Pages → Source: „GitHub Actions“** wählen.
3. Jeder Push auf `main` baut und veröffentlicht die App (`.github/workflows/deploy.yml`).
4. Der Neuheiten-Radar (`.github/workflows/update-data.yml`) läuft täglich und kann unter **Actions → Neuheiten-Radar → Run workflow** manuell gestartet werden.

Auf dem iPhone: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Hinweis

Die Profilwerte im Kombo-Planer sind Richtwerte aus Teile-Typen und Ratchet-Form, keine Messwerte. Fan-Projekt, nicht mit Takara Tomy oder Hasbro verbunden.

## Schrift

Die App nutzt nur **Inter Tight** (OFL), selbst gehostet unter `src/assets/fonts/`. Die Dateien sind die
Latein-Ausschnitte aus `@fontsource-variable/inter-tight` (`inter-tight-latin-wght-normal.woff2` und
`…-italic.woff2`, Gewichtsachse 100–900) – zusammen ca. 90 KB. Titel sind fett-kursiv, alles andere aufrecht.
