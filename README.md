# Beyblade X – Fan-App

Web-App (PWA) zum Planen von Beyblade-X-Kombos – läuft im Browser und lässt sich auf iPhone/Android wie eine App zum Homescreen hinzufügen.

## App öffnen und installieren

**Zur App: <https://snckz.github.io/beyblade-x-planer/>**

Kostenlos, ohne Anmeldung und ohne App Store. Die App läuft sofort im Browser. Als Symbol auf dem Home-Bildschirm startet sie im Vollbild und funktioniert auch ohne Internet.

| Dein Gerät | Anleitung |
| --- | --- |
| 📱 iPhone oder iPad | [Zur Anleitung fürs iPhone](#iphone) |
| 🤖 Android | [Zur Anleitung für Android](#android) |

---

### iPhone

Gilt genauso fürs iPad. Dauert etwa eine Minute.

1. **Link in Safari öffnen**<br>
   <https://snckz.github.io/beyblade-x-planer/>
2. **Auf „Teilen“ tippen**<br>
   Das ist das Quadrat mit dem Pfeil nach oben. Siehst du es nicht, tippe zuerst auf **⋯**.
3. **„Zum Home-Bildschirm“ wählen**<br>
   Dafür in der Liste etwas nach unten gehen. Falls ein Schalter „Als Web-App öffnen“ erscheint, eingeschaltet lassen.
4. **Auf „Hinzufügen“ tippen**<br>
   Der Knopf sitzt oben rechts.

✅ Fertig. Das Symbol „Beyblade“ liegt jetzt auf deinem Home-Bildschirm.

> [!TIP]
> Hast du den Link in WhatsApp, Instagram oder einer anderen App geöffnet? Dann fehlt der Menüpunkt. Wähle dort zuerst „In Safari öffnen“.

> [!IMPORTANT]
> Starte die App danach immer über das Symbol. In Safari kann iOS deine gespeicherte Sammlung nach 7 Tagen ohne Besuch löschen, in der Home-Bildschirm-App bleibt sie erhalten.

---

### Android

Es gibt zwei Wege. Der erste ist der einfachere.

**Weg 1: Im Browser (empfohlen, immer aktuell)**

1. **Link in Chrome öffnen**<br>
   <https://snckz.github.io/beyblade-x-planer/>
2. **Oben rechts auf ⋮ tippen**
3. **„Zum Startbildschirm hinzufügen“ wählen**<br>
   Je nach Gerät heißt der Punkt „App installieren“. Danach mit **Installieren** bestätigen.

✅ Fertig. Die App liegt als Symbol auf deinem Startbildschirm.

**Weg 2: Als App-Datei (APK)**

1. **[Neueste APK herunterladen](https://github.com/snckz/beyblade-x-planer/releases/latest)**<br>
   Auf der Seite unter „Assets“ die Datei mit der Endung `.apk` antippen.
2. **Heruntergeladene Datei öffnen**<br>
   Beim ersten Mal fragt Android, ob der Browser Apps installieren darf. Das erlauben.

> [!NOTE]
> Die APK ist nur so aktuell wie das letzte Release. Die Web-App aus Weg 1 hat immer den neuesten Stand.

---

## Funktionen

- **Kombo-Planer:** Blade, Ratchet und Bit wählen → Typ, Richtwert-Profil, Warnungen (z. B. integrierter Ratchet, Burst-Risiko, Linksdreher) und Tipps. Optional nur mit Teilen aus der eigenen Sammlung.
- **Lexikon:** Sammelkarten-Album mit Seltenheit (Standard, Zufall, Limitiert, Ultra-Limitiert) und Fortschritt, Blades, Bits mit Fotos, Ratchets mit Erklärungen, Begriffe (X-Dash, Finishes, Linien …) und Produkte.
- **Teile-Datenbank:** Produkte (BX/UX/CX, Takara Tomy + Hasbro-Namen), Blades und Bits mit Suche und Typ-Filter. Ungeprüfte Angaben sind markiert.
- **Sammlung:** Produkte mit +/− erfassen, verfügbare Teile werden automatisch berechnet. Export/Import als JSON.
- **Battle:** Deck-Check (3 Kreisel, keine doppelten Teile), Gegner-Deck eingeben, Matchup-Matrix mit Siegchance, empfohlene Reihenfolge und Tausch-Vorschläge (Bit/Ratchet), auf Wunsch nur aus der eigenen Sammlung.
- **Termine:** Releases und Turniere mit Countdown (`public/data/events.json`), zweimal pro Woche per Scheduled Task recherchiert.
- **Detailseiten:** Steckbrief im Wiki-Stil je Blade. Bilder werden direkt vom Beyblade Wiki verlinkt (nicht kopiert), mit Quellenlink; ohne Bild erscheint ein eigenes Emblem.
- **Neuheiten-Radar:** GitHub Action durchsucht täglich das Beyblade Wiki nach neuen Produktnummern und zeigt Treffer im News-Tab.
- **Wischen:** Zwischen den Hauptseiten (Kombo, Lexikon, Battle, Termine, Sammlung) blättert man mit einem Wisch nach links oder rechts – mit denselben Werten wie in den Auswahlfenstern (`src/lib/categorySwipe.ts`, `src/components/TabPager.tsx`). Im Lexikon blättert der Wisch oben (Titel, Leiste, Suche) die Hauptseiten und unten auf der Liste die Unterseiten Karten, Blades, Bits, Ratchets, Begriffe; an der ersten und letzten Unterseite geht es zur nächsten Hauptseite weiter. Alle Werte fürs Wischen und für die Fenster stehen zum Übernehmen in andere Apps in [`docs/wischen-und-fenster.md`](docs/wischen-und-fenster.md).
- **Sprache:** Deutsch oder Englisch. Beim ersten Start wird einmal gefragt, später lässt sich die Sprache unter Sammlung → Sprache ändern.
- **Offline:** Nach dem ersten Öffnen funktioniert die App auch ohne Internet.

Daten zur Sammlung bleiben lokal auf dem Gerät (localStorage).

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm run check      # Typecheck, Lint, Datenprüfung, Tests, Build
```

## Sprache (Deutsch / Englisch)

- Im Code stehen die deutschen Texte, eingewickelt in `tr('…')` (`src/lib/i18n.ts`). Der deutsche Text ist zugleich der Schlüssel; Platzhalter schreibt man als `tr('{0} von {1} Blades', a, b)`.
- Die englischen Texte stehen in `src/lib/i18n.en.ts` (`EN`). **Neuer Text in der App = neuer Eintrag dort** – `tests/i18n.test.ts` schlägt sonst fehl (fehlende und verwaiste Einträge, Platzhalter, Leerzeichen am Rand).
- Texte aus den Daten (Notizen zu Teilen, Termine) laufen über `trData(…)`: feste Übersetzungen in `EN_DATA`, Muster für erzeugte Texte in `EN_RULES`. Die Daten selbst bleiben deutsch; was dort neu dazukommt (z. B. ein Termin aus dem wöchentlichen Update), erscheint auf Englisch erst nach einem Eintrag in `EN_DATA`, bis dahin auf Deutsch.
- Zahlen und Datumsangaben richten sich nach `NUM_LOCALE` / `DATE_LOCALE`.
- Die Sprache steht für die Laufzeit fest (viele Texte sind Konstanten); ein Wechsel lädt die App neu. Das englische Wörterbuch ist ein eigener Programmteil und wird nur für Englisch geladen.

## Daten pflegen

- `public/data/db.json` – Teile und Produkte. Wird aus `scripts/seed-db.mjs` erzeugt (`node scripts/seed-db.mjs`), dort neue Produkte eintragen.
- `public/data/news.json` – wird vom Neuheiten-Radar automatisch gefüllt.
- `public/data/images.json` – Bild-Links aus dem Beyblade Wiki (`node scripts/update-images.mjs`, läuft im Radar-Workflow mit).
- `public/data/events.json` – Releases und Turniere.
- **Kauf-Check** (`src/components/PhotoCheck.tsx`) ist der eine Einstieg für alles rund um eine Packung – in der Sammlung und im Einkaufsmodus. Auf der Startseite wählt man: Barcode scannen (Kamera), Packung fotografieren oder eintippen. Alle Wege enden in derselben Bewertung (kaufen oder nicht, Gründe, Preis), von dort geht es in die Sammlung oder auf die Wunschliste. Nach einem Scan bietet das Ergebnis „Nächste Packung scannen“ und – falls der Barcode falsch zugeordnet war – „Falsches Produkt? Neu zuordnen“. Ein eigenes Fenster nur zum Scannen gibt es nicht mehr.
- `public/data/barcodes.json` – Barcodes (EAN) von Packungen → Artikelnummer. Damit erkennt der Scan eine Packung beim ersten Mal von selbst. Von Hand gepflegt: nur eintragen, was ein Händler zusammen mit der Artikelnummer nennt – nichts raten und nichts aus anderen Nummern ableiten. Stand: Takara Tomy 70 von 85 Packungen (japanische Barcodes; ob Packungen aus anderen Ländern denselben tragen, ist nicht geprüft), Hasbro 67 von 125.
  - **Random Booster** stehen mit der Packungsnummer in der Liste (`BX-24`, nie `BX-24-03`): Der Barcode sagt nicht, welcher Kreisel drin ist. Der Kauf-Check bewertet die Packung über alle möglichen Inhalte und zeigt, welche davon schon in der Sammlung sind; nach dem Öffnen wählt man dort den Kreisel aus.
  - **Unbekannter Barcode:** Die App liest die Produktnummer per Texterkennung vom selben Bild. Steht sie dort nicht, führt „Vorderseite fotografieren“ zum Ziel (dort steht z. B. „BX-05“) – der Barcode wird dem erkannten Produkt zugeordnet und gilt danach auf dem Gerät. Letzter Weg: Produkt suchen und auswählen.
  - **Etiketten des Ladens** (Nummern mit Präfix 02, 04, 20–29) sind keine Hersteller-Barcodes. Die App sagt das und merkt sich solche Nummern nie (`isStoreCode` in `src/lib/barcode.ts`).
- `npm run validate-data` prüft Verweise, IDs und Formate.
- **Datenverlust-Schutz:** Alle Skripte, die `db.json` schreiben, gehen über `scripts/data-safety.mjs`. Ein Update, das ein Blade, Ratchet, Bit oder Produkt entfernt oder einer Produktnummer andere Teile gibt (ohne Eintrag in `aliases.json`), wird abgelehnt (Skript und Workflow schlagen fehl, nichts wird committet). Abruffehler im Wiki gelten nie als „Seite fehlt“. Im Workflow prüft zusätzlich `validate-data.mjs --previous` gegen den letzten Stand auf `main`.
- **Hasbro-Import** (`scripts/import-hasbro.mjs`): ergänzt schrittweise – bekannte Produkte und Teile bleiben unverändert (inkl. Prüfstatus), Set-Inhalte werden über die Teile wiedererkannt, nicht über die Reihenfolge. Status im Bericht `hasbro-report.json`: `ok`, `partial` (einzelne neue Produkte nicht übernommen → Warnung im Workflow) oder `error` (Quelle unerreichbar, fehlerhaft oder unvollständig → Workflow schlägt fehl, nichts wird committet). Die Namens-Heuristik (`update-hasbro.mjs`) ergänzt nur fehlende Hasbro-Namen.
- `public/data/aliases.json` – **zentrales ID-Register** (`src/lib/idRegister.js`, gemeinsam für App und Datenpipeline): `aliases` = andere Schreibweisen bestehender IDs (`"StormPegasis": "StormPegasus"`), `retired` = alte IDs – umbenannt (`"alteId": "neueId"`), bei Produkten aufgeteilt (`["neu1", "neu2"]`) oder entfernt (`null`), `reassigned` = Korrekturen von Produktnummern mit Grund. Nur Eingetragenes wird umgeleitet, nie „ähnliche“ Namen; Konflikte und Kreise lässt `validate-data` scheitern. Die App stellt gespeicherte Kombos, Sammlung und Wunschliste beim Laden auf die aktuellen IDs um; nur was hier steht, darf in `db.json` verschwinden oder sich ändern.

- **Freigabestatus** (`src/lib/release.js`, gemeinsam für App und Datenpipeline): Jedes Blade, Ratchet und Bit ist *angekündigt*, *erschienen, ungeprüft* oder *freigegeben*. Nur Freigegebenes ist im Kombo-Planer (inkl. Battle, Deck-Optimierer, Vergleich, Tagebuch) wählbar; Lexikon, Steckbrief, Termine und Kauf-Check zeigen auch Angekündigtes. Ein Teil gilt als erschienen, sobald es in einem erschienenen Produkt steckt (ein neues Produkt sperrt also nie vorhandene Teile). Ein Produkt ist erschienen, wenn `released: true` gesetzt ist, ein importiertes Produkt `verified` ist (verify-catalog bestätigt erst nach Wiki-Release) oder ein geprüftes Bestandsprodukt kein Release-Datum hat. Ein `releaseJp` in der Zukunft sperrt immer; ein vergangenes Datum gibt nie allein frei – dann setzt verify-catalog `released: true`, sobald das Wiki den Release meldet (sonst Warnung im Workflow). „Freigegeben“ braucht zusätzlich geprüfte Teiledaten (Blade `verified`, Bit ohne `uncertain`). Automatische Updates dürfen `verified`/`released` nie zurücksetzen (Datenverlust-Schutz). Gespeicherte Kombos und Sammlung bleiben unverändert; Kombos mit gesperrten Teilen werden nur gekennzeichnet.

## Veröffentlichung (GitHub Pages)

1. Repository auf GitHub anlegen und Code pushen.
2. **Settings → Pages → Source: „GitHub Actions“** wählen.
3. Jeder Push auf `main` baut und veröffentlicht die App (`.github/workflows/deploy.yml`).
4. Der Neuheiten-Radar (`.github/workflows/update-data.yml`) läuft täglich und kann unter **Actions → Neuheiten-Radar → Run workflow** manuell gestartet werden.

Wie man die App auf iPhone und Android installiert, steht oben unter „App öffnen und installieren“.

## Hinweis

Die Profilwerte im Kombo-Planer sind Richtwerte aus Teile-Typen und Ratchet-Form, keine Messwerte. Fan-Projekt, nicht mit Takara Tomy oder Hasbro verbunden.

## Schrift

Die App nutzt nur **Inter Tight** (OFL), selbst gehostet unter `src/assets/fonts/`. Die Dateien sind die
Latein-Ausschnitte aus `@fontsource-variable/inter-tight` (`inter-tight-latin-wght-normal.woff2` und
`…-italic.woff2`, Gewichtsachse 100–900) – zusammen ca. 90 KB. Titel sind fett-kursiv, alles andere aufrecht.
