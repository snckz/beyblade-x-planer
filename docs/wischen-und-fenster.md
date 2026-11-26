# Wischen und Fenster – Einstellungen zum Übernehmen

Dieses Dokument beschreibt das Bedien-Gefühl des Beyblade X-Planers so, dass es sich in einer anderen App ohne neues
Ausprobieren nachbauen lässt: alle Werte, die Regeln dahinter und die Dateien, die man direkt kopieren kann.

Stand: November 2026. Quelle der Wahrheit bleibt der Code – jede Zahl hier steht als benannte Konstante am Anfang der
jeweiligen Datei.

## Kurzfassung: so überträgst du es

1. Diese Dateien kopieren. Sie brauchen kein Framework (reines TypeScript, nur DOM):
   - `src/lib/categorySwipe.ts` – Seiten blättern (Auswahlfenster und Hauptseiten)
   - `src/lib/tabSwipe.ts` – wo das Blättern der Hauptseiten nicht gilt
   - `src/lib/sheetDrag.ts` – Fenster am Griff nach unten ziehen und schließen
   - `src/lib/swipeRow.ts` – Eintrag nach links wischen → Papierkorb
   - `src/lib/edgeBack.ts` – vom linken Rand zurückwischen (Vollbild-Fenster mit Ebenen)
   - `src/lib/scrollLock.ts` – Hintergrund sperren, solange ein Fenster offen ist
2. Diese drei sind für Preact geschrieben. In React genügt es, die Importe zu tauschen (`preact/hooks` → `react`,
   `class` → `className`); in anderen Frameworks dienen sie als Vorlage:
   - `src/lib/useModal.ts` – Fenster öffnen/schließen (Fokus, Escape, Tastatur-Höhe, hängt `sheetDrag` ein)
   - `src/components/TabPager.tsx` – Hauptseiten mit vorbereiteten Nachbarseiten
   - `src/components/SwipeRow.tsx` – Listeneintrag mit Papierkorb
3. Die CSS-Blöcke aus Abschnitt 7 übernehmen (Klassennamen müssen zu den Dateien passen).
4. Die Prüfliste in Abschnitt 9 auf dem echten Gerät durchgehen.

Eine Stelle ist app-spezifisch: `TabPager.tsx` hält während der Geste das Freistellen von Fotos an (`pauseCutouts` aus
`lib/cutout.ts`, übergeben als `onActive`). In einer anderen App diesen Import und die Zeile `onActive` entfernen – oder
dort die eigene Hintergrundarbeit anhalten.

## 1. Grundregeln, die für alle Gesten gelten

Diese Regeln machen den größten Teil des Gefühls aus. Sie sind in jeder Datei gleich umgesetzt.

| Regel | Wert / Umsetzung | Warum |
| --- | --- | --- |
| Richtung früh entscheiden | nach 6 px (Blättern, Fenster) bzw. 8 px (Papierkorb, Rand) | Vor dem Browser entscheiden, sonst scrollt er schon |
| Achse | Die überwiegende Achse gewinnt. Senkrecht → Geste sofort aufgeben, der Browser scrollt | Scrollen bleibt immer flüssig |
| Mitgehen | 1:1 mit dem Finger, `translate3d`, kein Übergang während der Geste | Fühlt sich „angefasst“ an |
| Tempo | Aus den letzten 100 ms (höchstens 12 Messpunkte), nicht über die ganze Bewegung gemittelt | Ein kurzer Schnipp am Ende zählt |
| Zurückziehen | Bewegt sich der Finger am Ende deutlich zurück, gilt das als Abbrechen | Man kann es sich anders überlegen |
| Klick danach | Nach einer waagrechten Geste 400 ms lang Klicks verwerfen (Erfassungsphase) | Der Finger landet beim Loslassen auf einem Knopf |
| Übergangskurve | `cubic-bezier(.2, .8, .2, 1)` als feste Kurve | Schnell los, weich aus |
| Weniger Bewegung | Bei `prefers-reduced-motion: reduce` ohne Animation direkt zum Ziel | Systemeinstellung respektieren |
| Zweiter Finger | Beendet die Geste, alles gleitet an seinen Platz | Kein Hängenbleiben |

Zwei technische Entscheidungen, die auf iOS wichtig sind:

- **Blättern und Wischen zum Löschen nutzen Touch-Ereignisse, nicht Pointer-Ereignisse.** Safari bricht Pointer-Gesten
  mit `pointercancel` ab, sobald es selbst eine Geste vermutet (Scrollen). Touch-Ereignisse laufen bis zum Loslassen
  durch. `touchstart` passiv, `touchmove` **nicht** passiv (`{ passive: false }`), damit `preventDefault()` das
  Mitscrollen verhindert. Das Ziehen am Fenster-Griff und das Zurückwischen vom Rand nutzen Pointer-Ereignisse – am
  Griff ist dafür `touch-action: none` gesetzt, dort vermutet Safari keine eigene Geste.
- **Auf der wischbaren Fläche steht `touch-action: pan-y`.** Senkrecht scrollt der Browser, waagrecht kommt bei der
  Geste an. Eigene waagrechte Leisten darin scrollen weiter selbst.

## 2. Seiten blättern (`categorySwipe.ts`)

Gilt für die Kategorien in den Auswahlfenstern (Blade, Ratchet, Bit) und für die fünf Hauptseiten. Nach links: nächste
Seite. Nach rechts: vorherige.

| Konstante | Wert | Bedeutung |
| --- | --- | --- |
| `SLOP` | 6 px | Ab hier ist die Richtung entschieden |
| `MIN_DX` | 30 px | Mindeststrecke für einen Wechsel … |
| `FLICK` | 0,25 px/ms | … oder ein schneller Wisch mit diesem Tempo … |
| `FLICK_MIN_DX` | 18 px | … ab dieser kürzeren Strecke |
| `DOMINANCE` | 1 | Beim Loslassen muss waagrecht überwiegen (nicht strenger – Daumen ziehen Bögen) |
| `MAX_MS` | 1000 ms | Längere Bewegungen sind Herumschieben, kein Wisch |
| `VELOCITY_MS` | 100 ms | Zeitfenster für das Tempo |
| Abbrechen | Tempo > 0,15 px/ms entgegen der Wischrichtung | Zurückgezogen = kein Wechsel |
| `CLICK_GUARD_MS` | 400 ms | Klicks nach dem Wisch verwerfen |
| `RUBBER` | 0,55 | Gummiband am Rand (Formel unten) |
| `PAGE_GAP` | 24 px | Abstand zwischen zwei Seiten |
| `SPRING_OMEGA` | 19 1/s | Feder fürs Einrasten, kritisch gedämpft |
| `SPRING_MS` | 220 ms | Zurückfedern ohne Federkurve |
| `SETTLE_MIN_MS` / `SETTLE_MAX_MS` | 160 / 320 ms | Einrasten ohne Federkurve: Reststrecke ÷ Tempo, in diesen Grenzen |

**Entscheidung beim Loslassen** (`swipeStep`): kein Wechsel, wenn die Strecke unter 18 px liegt, senkrecht überwiegt
oder die Geste länger als 1 s dauerte. Sonst Wechsel ab 30 px – oder schon ab 18 px, wenn das Tempo zuletzt mindestens
0,25 px/ms war.

**Gummiband am Rand** (`followOffset`, gleiche Formel wie `UIScrollView`), wenn es in die Richtung keine Seite mehr gibt:

```
versatz = vorzeichen(dx) · (1 − 1 / (|dx| · 0,55 / breite + 1)) · breite
```

**Einrasten mit Feder** (`springEasing`): Die Spur übernimmt das Tempo des Fingers und läuft ohne Überschwingen aus.

```
x(t) = 1 − e^(−ω·t) · (1 + (ω − v0) · t)      ω = 19, v0 = Fingertempo ÷ Reststrecke (pro Sekunde), höchstens 3·ω
Dauer: bis 1 − x(t) ≤ 0,003 (höchstens 1,2 s) · als CSS linear() mit 24 Stützpunkten
```

Kennt der Browser `linear()` nicht, greift die feste Kurve mit den Zeiten aus der Tabelle.

**Aufbau im DOM** – das ist der Teil, der das Blättern ruckelfrei macht:

- Eine **Spur** enthält die aktuelle Seite und ihre Nachbarn. Die Nachbarn liegen fertig gebaut links
  (`calc(-100% - 24px)`) und rechts (`calc(100% + 24px)`) daneben. Pro Bild wird nur die Spur verschoben.
- Beim Start der Geste bekommen die Nachbarn `translate3d(0, scrollstand, 0)`: Sie zeigen ihren Anfang dort, wo man
  gerade hinschaut. Nach dem Wechsel steht die neue Seite oben.
- Beim Loslassen mit Wechsel wird das Ziel **sofort** gemeldet (`onSettle`: Chip bzw. Leiste umschalten), der
  eigentliche Wechsel (`onStep`) folgt nach dem Einrasten. Erst wechseln, dann die Stile lösen – so springt nichts.
- Während der Geste ruht Hintergrundarbeit (`onActive`).
- Ausnahmen: Eingabefelder, eigene waagrechte Leisten und alles mit `data-no-swipe`.

### Hauptseiten (`TabPager.tsx`, `tabSwipe.ts`)

Zusätzlich zu oben:

| Einstellung | Wert | Bedeutung |
| --- | --- | --- |
| `NEIGHBOR_DELAY_MS` | 250 ms | Nachbarseiten entstehen erst so lange nach Start bzw. Wechsel |
| `REFRESH_MS` | 500 ms | So lange dürfen Nachbarseiten auf Änderungen warten (gesammelt) |
| Scrollstand | `window.scrollY` | Die Seiten scrollen mit dem Fenster, nicht in einem Kasten |

Regeln:

- Die aktuelle Seite liegt normal im Dokument. Nachbarn sind `position: absolute`, `inert` und `aria-hidden`.
- Wer eine Seite verlässt, findet sie beim nächsten Mal frisch vor (neuer Schlüssel beim Verlassen). Die Seite, zu der
  man wischt, behält ihren Aufbau – sie war schon da.
- Wischt jemand, bevor die Nachbarn gebaut sind, geht die aktuelle Seite trotzdem mit; die neue erscheint nach dem
  Einrasten.
- Nachbarseiten dürfen nichts auslösen, was „gesehen“ bedeutet. Hier: Meldungen gelten erst als gelesen, wenn die
  Seite sichtbar ist (`active`).
- Gewischt wird auf der ganzen Seitenfläche samt seitlichem Rand (`swipeArea`), nicht nur auf dem Inhalt: Ein Wisch,
  der am Bildschirmrand beginnt, muss zählen – dort setzt der Daumen meistens auf.
- Kein Seitenwechsel, solange ein Fenster offen ist, auf Schiebereglern und in allem, was selbst waagrecht scrollt
  (`blocksTabSwipe` prüft das beim Aufsetzen des Fingers).
- Einträge mit Wischen-zum-Löschen: nach links gehört die Geste dem Eintrag, nach rechts der Seite (`rowOwnsStep`).
- Felder im Seitenkopf sind kein toter Streifen (`idleFields`): Auf einem Suchfeld ohne Cursor oder einem Schalter
  zählt der Wisch. Ein Feld mit Cursor behält das Ziehen (Text markieren), Auswahllisten und Schieberegler immer.

### Unterseiten in einer Hauptseite (`TabPager` mit `sub`)

Hat eine Hauptseite selbst Unterseiten mit Umschaltleiste (hier das Lexikon: Karten, Blades, Bits, Ratchets,
Begriffe), teilt sich der Bildschirm:

| Bereich | Wisch blättert |
| --- | --- |
| oben: Titel, Umschaltleiste, Suche und Filter | die Hauptseiten |
| unten: ab der Unterkante des Kopfs (`below`, hier `.filters`) bis zum Seitenende | die Unterseiten |
| unten an der ersten bzw. letzten Unterseite | wieder die Hauptseiten (kein Nachgeben am Rand) |

Regeln:

- Dieselbe Komponente, dieselben Werte. Die Unterseiten sind ein zweiter `TabPager` in der Hauptseite; nur die Liste
  mit ihrem Kopf geht mit dem Finger, Titel und Umschaltleiste bleiben stehen.
- Die Grenze ist eine Höhe auf dem Bildschirm, kein Element: Auch der leere Platz unter einer kurzen Liste gehört
  zum unteren Bereich. Ist der Kopf aus dem Bild gescrollt, ist der ganze Bildschirm unterer Bereich.
- Es blättert immer genau eine Spur: Die Unterseiten melden sich an (`registerSubPager`); die Hauptseiten überlassen
  ihnen den Wisch, solange es dort in diese Richtung weitergeht (`subPagerOwnsStep`), und umgekehrt geben die
  Unterseiten ihn an ihrer ersten/letzten Seite ab.
- Als Nachbarseite ruhen die Unterseiten (`enabled`): keine eigene Geste, keine eigenen Nachbarn im Hintergrund.
- Nachbar-Unterseiten sind unsichtbar (`visibility: hidden`), außer während die Unterseiten selbst gewischt werden
  (`data-swiping`). Sie liegen eine Seitenbreite daneben – genau dort, wo die nächste Hauptseite hereinkommt – und
  hängen an der Spur der Hauptseiten. Ohne diese Regel fährt z. B. die Blades-Liste über der Battle-Seite mit ins Bild.
- Weiter unten in einer Liste gewischt: Die nächste Unterseite kommt mit ihrem Anfang herein (`offset`), und nach dem
  Wechsel steht die Umschaltleiste wieder oben im Bild – man sieht, wo man gelandet ist.
- Beim Loslassen schaltet die Umschaltleiste sofort um (`onPreview`), die Unterseite wechselt nach dem Einrasten.
- Suche und Filter, die für mehrere Unterseiten gelten, bleiben beim Wischen erhalten.

## 3. Fenster (`useModal.ts`, `sheetDrag.ts`, `scrollLock.ts`)

Ein System für alle Fenster: Bottom-Sheet (`.sheet` in `.sheet-backdrop`) und Vollbild (`.live`). Die Kopfzeile steht,
der Inhalt scrollt darunter.

| Vorgang | Wert |
| --- | --- |
| Öffnen, Fenster | `rise` 340 ms, `cubic-bezier(.2, .9, .25, 1)`, von `translateY(40px)` und Deckkraft 0 |
| Öffnen, Hintergrund | einblenden 220 ms, `ease-out`; Farbe `rgba(4, 4, 8, .64)`, Weichzeichner 8 px |
| Schließen | 180 ms, `ease-in`: Hintergrund blendet aus, Fenster sinkt 32 px (`CLOSE_MS` = `--dur-close`) |
| Höhe | höchstens `100dvh − Sicherheitsbereich oben − 12 px`; ab 700 px Breite höchstens 880 px, mittig |
| Ecken | 32 px oben (ab 700 px Breite rundum) |
| Griff | 44 × 5 px, 10 px Abstand oben; Tippfläche unsichtbar über die ganze Breite |

**Am Griff nach unten ziehen** (`sheetDrag.ts`):

| Konstante | Wert | Bedeutung |
| --- | --- | --- |
| `SLOP` | 6 px | Ab hier ist es Ziehen statt Tippen |
| `CLOSE_SHARE` / `CLOSE_PX` | 30 % der Fensterhöhe, höchstens 140 px | Schließen ab dieser Strecke |
| `FLICK` / `FLICK_MIN_PX` | 0,5 px/ms ab 24 px | Schneller Wisch nach unten schließt früher |
| `UPWARD` | −0,1 px/ms | Geht der Finger am Ende wieder hoch, bleibt das Fenster offen |
| `VELOCITY_MS` | 100 ms | Zeitfenster für das Tempo |
| `SETTLE_MS` | 260 ms, `cubic-bezier(.2, .9, .25, 1)` | Zurückgleiten |

Regeln:

- Zugfläche sind nur der Griff (`.sheet-grab`) und die Kopfzeile (`.win-head`) – nicht der scrollende Inhalt. Knöpfe in
  der Kopfzeile bleiben tippbar.
- Nur eine klare Bewegung nach unten startet das Ziehen. Die Anlaufstrecke (6 px) wird abgezogen, damit das Fenster
  nicht springt.
- Nach dem Ziehen gleitet das Fenster von seiner Position ganz hinaus (`--sink: 100%`) – über denselben Weg wie der
  Schließen-Knopf.
- Vollbild-Fenster haben keinen Griff und keine Ziehgeste.

**Verhalten** (`useModal.ts`):

- Fokus geht beim Öffnen ins Fenster und beim Schließen zurück. Tab bleibt im Fenster, Escape schließt.
- Nur das vorderste Fenster reagiert auf Tasten.
- Der Hintergrund scrollt nicht (`scrollLock.ts` zählt offene Fenster, statt einen alten Wert zu merken).
- Bildschirmtastatur: iOS verkleinert das Fenster nicht. Die Höhe der Tastatur steht als `--kb` am Fenster (aus
  `visualViewport`, ab 80 px), dazu die Klasse `kb-open`.

## 4. Wischen zum Löschen (`swipeRow.ts`, `SwipeRow.tsx`)

| Konstante | Wert | Bedeutung |
| --- | --- | --- |
| `ACTION_WIDTH` | 84 px | Breite der Aktion (runder Papierkorb, 56 px, mit Abstand) |
| `SLOP` | 8 px | Ab hier ist die Richtung entschieden |
| `FULL` / `FULL_MIN` | 60 % der Breite, mindestens 160 px | Ganz durchwischen löscht direkt |
| `FLICK` | 0,35 px/ms | Schneller Wisch öffnet bzw. schließt auch bei kurzer Strecke |
| Öffnen | ab der halben Aktionsbreite (42 px) | sonst schließt der Eintrag wieder |
| `SNAP_MS` | 260 ms, `cubic-bezier(.2, .8, .2, 1)` | Einrasten |
| Löschen | Inhalt gleitet 200 ms hinaus, danach wird gelöscht | |
| Widerstand | nach rechts über „zu“ hinaus nur ¼ der Strecke | |
| `CLICK_GUARD_MS` | 400 ms | Klick nach dem Wisch verwerfen |

Regeln: immer nur ein Eintrag offen. Antippen woanders, ein anderer Wisch oder Scrollen schließt ihn. Ein Tipp auf einen
anderen Eintrag schließt nur und löst dort nichts aus. Der Papierkorb wächst mit dem Wisch herein (Deckkraft und Größe
von 60 % auf 100 %).

## 5. Vom linken Rand zurückwischen (`edgeBack.ts`)

Für Vollbild-Fenster mit mehreren Ebenen (hier: Kauf-Check).

| Konstante | Wert | Bedeutung |
| --- | --- | --- |
| `EDGE` | 28 px | Breite des Randstreifens, in dem die Geste beginnen darf |
| `SLOP` | 8 px | Ab hier wird entschieden |
| `BACK_SHARE` | 40 % der Breite | Zurück ab dieser Strecke … |
| `FLICK` / `FLICK_MIN_PX` | 0,35 px/ms ab 24 px | … oder bei einem schnellen Wisch |
| `PARALLAX` | 30 % der Breite | Die untere Ebene startet so weit nach links versetzt |
| `DURATION` | 320 ms | Feste Dauer für den Zurück-Knopf und ohne Federkurve; mit Feder höchstens 520 ms |

Knopf und Geste lösen dieselbe Bewegung aus (`slideBack`).

## 6. Zeiten und Kurven auf einen Blick

| Name | Wert | Wofür |
| --- | --- | --- |
| `--ease` | `cubic-bezier(.2, .8, .2, 1)` | Standard für alle Übergänge |
| `--ease-out` | `cubic-bezier(.2, .9, .25, 1)` | Fenster öffnen und zurückgleiten |
| `--dur-1` | 120 ms | Drück-Effekt (Knopf wird kleiner: `scale(.97)`) |
| `--dur-2` | 220 ms | Farben, Einblenden |
| `--dur-3` | 450 ms | Bilder einblenden |
| `--dur-close` | 180 ms | Fenster schließen |

## 7. CSS, das dazugehört

```css
/* Fenster */
.sheet-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; align-items: end; justify-items: center;
  background: rgba(4, 4, 8, .64); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); animation: fade .22s ease-out; }
.sheet { position: relative; width: min(640px, 100%); display: flex; flex-direction: column; overflow: hidden;
  max-height: calc(100dvh - env(safe-area-inset-top, 0px) - 12px); border-radius: 32px 32px 0 0;
  animation: rise .34s cubic-bezier(.2, .9, .25, 1); }
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { transform: translateY(40px); opacity: 0; } }
.sheet-grab { flex: none; position: relative; width: 44px; height: 5px; margin: 10px auto 2px; border-radius: 999px; background: rgba(255, 255, 255, .22); }
.sheet-grab::before { content: ''; position: absolute; inset: -10px -50vw -2px; }            /* Tippfläche über die ganze Breite */
.sheet-grab, .sheet > .win-head { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.win-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.sheet.is-dragging { will-change: transform; }
.sheet.is-settling { transition: transform .26s cubic-bezier(.2, .9, .25, 1); }               /* = SETTLE_MS */
.sheet-backdrop.is-closing { animation: win-fade-out .18s ease-in forwards; }                 /* = CLOSE_MS */
.sheet-backdrop.is-closing .sheet { animation: win-sink .18s ease-in forwards; }
@keyframes win-fade-out { to { opacity: 0; } }
@keyframes win-sink { to { transform: translateY(var(--sink, 32px)); } }

/* Seiten blättern im Fenster */
.picker-body { overflow-x: hidden; touch-action: pan-y; }
.picker-pager { position: relative; overflow-x: visible; overflow-y: clip; }                  /* Höhe = aktuelle Seite (per Skript) */
.picker-track { position: relative; height: 100%; will-change: transform; }
.picker-page { position: absolute; top: 0; left: 0; width: 100%; }
.picker-page.is-side { pointer-events: none; will-change: transform; }
.picker-page.is-side[data-dir="1"] { left: calc(100% + 24px); }
.picker-page.is-side[data-dir="-1"] { left: calc(-100% - 24px); }

/* Hauptseiten blättern */
.main { overflow-x: clip; }
.tab-pager { position: relative; overflow-x: visible; overflow-y: clip; touch-action: pan-y; }
.tab-track { position: relative; }                                                             /* KEIN dauerhaftes transform/will-change */
.tab-page.is-side { position: absolute; top: 0; left: calc(100% + 24px); width: 100%; pointer-events: none; }
.tab-page.is-side[data-dir="-1"] { left: calc(-100% - 24px); }
@supports not (overflow: clip) { .tab-page.is-side { display: none; } }

/* Wischen zum Löschen */
.swipe-row { position: relative; list-style: none; min-width: 0; touch-action: pan-y; }
.swipe-row.is-swiping { overflow: hidden; }
.swipe-content { position: relative; z-index: 1; height: 100%; }
.swipe-delete { position: absolute; z-index: 0; top: 50%; right: 14px; width: 56px; height: 56px; border: 0; border-radius: 50%;
  background: #ff453a; color: #fff; opacity: 0; transform: translate3d(0, -50%, 0) scale(.6); }

@media (prefers-reduced-motion: reduce) {
  .sheet, .sheet-backdrop, .sheet-backdrop.is-closing, .sheet-backdrop.is-closing .sheet { animation: none; }
  .sheet.is-settling, .swipe-content, .swipe-delete { transition: none !important; }
}
```

## 8. Stolpersteine, die schon gelöst sind

- **iOS blättert vom Bildschirmrand selbst durch den Verlauf.** Legt jeder Seitenwechsel einen Eintrag im Verlauf an
  (`location.hash = …`), zeigt iOS bei einem Wisch vom Rand seine eigene Zurück-/Vorwärts-Geste: Der ganze Bildschirm
  samt Kopf und Leiste schiebt sich als Standbild übereinander, und man kommt nur zu Seiten, auf denen man schon war.
  Abschalten lässt sich das nicht. Lösung: auf iPhone/iPad die Adresse mit `history.replaceState` setzen
  (`rememberTab` in `lib/tabSwipe.ts`) – ohne Verlauf hat die System-Geste nichts zu blättern. Auf Android bleibt der
  Verlauf, dort geht die Zurück-Taste zur vorherigen Seite.
- **`position: fixed` in einer verschobenen Fläche.** Ein Element mit `transform` oder `will-change: transform` wird
  zum Bezugsrahmen für alle `fixed`-Elemente darin. Liegen Fenster im DOM innerhalb der Seite, hängen sie dann an der
  Spur statt am Bildschirm. Deshalb bekommt die Spur der Hauptseiten ihre Verschiebung nur während der Geste. Im
  Auswahlfenster darf `will-change` dauerhaft stehen, weil darin keine weiteren Fenster liegen.
- **`overflow: clip` statt `hidden`.** `clip` schneidet ab, ohne einen Scroll-Kasten zu erzeugen. Senkrecht `clip`
  und waagrecht `visible` lassen sich mischen (bei `hidden` nicht). Das Scrollen des Fensters bleibt unberührt.
- **Scroll-Sperre über `body`.** `html` darf kein eigenes `overflow` bekommen – sonst wirkt die Sperre am `body` nicht
  mehr auf das Fenster.
- **Klick nach dem Wisch.** Ohne die 400 ms Sperre wählt der Wisch am Ende eine Karte aus.
- **Kurze Bewegungen sind Tipps.** Unter etwa 10–15 px meldet der Browser gar kein `touchmove`. Das ist richtig so und
  muss nicht abgefangen werden.
- **Fertig gebaute Nachbarseiten.** Baut man die Nachbarseite erst beim Start der Geste, ruckelt das erste Bild. Baut
  man sie sofort beim Start der App, wird der Start langsam. Deshalb: kurz danach, im Hintergrund.
- **Nebenwirkungen in vorbereiteten Seiten.** Alles, was beim Anzeigen etwas speichert (gelesen, gesehen, gezählt),
  braucht ein „bin sichtbar“-Signal.
- **Verschachtelte Seiten überlagern sich.** Hat eine Seite eigene Unterseiten, liegen deren Nachbarn eine
  Seitenbreite daneben – an derselben Stelle wie die nächste Hauptseite. Wischt man die Hauptseiten, fahren beide
  zusammen ins Bild und liegen übereinander. Nachbar-Unterseiten deshalb nur während ihrer eigenen Geste sichtbar
  machen (`visibility: hidden`, sonst bleibt alles fertig gebaut).
- **Zustand beim Einrasten.** Erst den Zustand wechseln, dann die Inline-Stile lösen. Das Framework zeichnet noch vor
  dem nächsten Bild neu, die neue Seite steht ohne Sprung am selben Platz.

## 9. Prüfliste für die andere App

Auf dem echten iPhone, als App vom Home-Bildschirm:

1. Langsam waagrecht ziehen: Die Seite geht 1:1 mit, die Nachbarseite kommt gleichzeitig herein.
2. Kurzer, schneller Schnipp (etwa 2 cm): wechselt.
3. Langsam 2 cm ziehen und loslassen: federt zurück.
4. Weit ziehen und am Ende zurückziehen: federt zurück.
5. Erste und letzte Seite: gibt nur zäh nach, wechselt nicht.
6. Schräg nach unten wischen: scrollt, wechselt nicht.
7. Nach dem Wisch landet der Finger auf einem Knopf: nichts wird ausgelöst.
8. In einer waagrechten Leiste wischen: die Leiste scrollt, die Seite bleibt.
9. Fenster am Griff 3 cm nach unten ziehen: schließt. 1 cm: gleitet zurück. Schneller Schnipp: schließt.
10. Im Fenster-Inhalt scrollen: das Fenster bleibt stehen, der Hintergrund scrollt nicht mit.
11. Bei offenem Fenster waagrecht wischen: die Seite dahinter wechselt nicht.
12. „Bewegung reduzieren“ einschalten: alles funktioniert ohne Animation.

## 10. Was geprüft ist

- Die Werte fürs Blättern in den Auswahlfenstern, das Ziehen der Fenster und das Wischen zum Löschen sind auf dem
  echten iPhone im Einsatz.
- Das Blättern zwischen den Hauptseiten nutzt dieselbe Geste. Es ist mit echten Touch-Ereignissen in Chromium geprüft
  (iPhone-Größen 320 bis 430 px) – auf dem echten iPhone noch nicht.
- Automatische Tests: `tests/swipePhysics.test.ts`, `tests/tabPager.test.tsx`, `tests/sheetDrag.test.tsx`,
  `tests/swipeRow.test.tsx`, `tests/edgeBack.test.ts`.
