/**
 * Wischen zwischen den Hauptseiten (Kombo, Lexikon, Battle, Termine, Sammlung) – Regeln, wo die Geste NICHT gilt.
 * Die Geste selbst (Werte, Mitgehen, Einrasten) ist dieselbe wie in den Auswahlfenstern: lib/categorySwipe.ts.
 */

/** Flächen mit eigener Bedienung: Schieberegler und alles, was als Fenster über der Seite liegt. */
const OWN = 'input[type="range"], [role="slider"], .sheet, .sheet-backdrop, .live, [aria-modal="true"], [role="dialog"]';

/** Ist gerade ein Fenster offen? (lib/scrollLock.ts sperrt dann das Scrollen der Seite) */
const modalOpen = () => document.body.style.overflow === 'hidden';

/**
 * Darf an dieser Stelle gar kein Seitenwechsel beginnen?
 * - solange ein Fenster offen ist,
 * - auf Flächen mit eigener Bedienung,
 * - in allem, was selbst waagrecht scrollt (Filterleisten, breite Tabellen): Dort scrollt der Finger die Leiste.
 */
export function blocksTabSwipe(target: Element, root: Element): boolean {
  if (modalOpen() || target.closest(OWN)) return true;
  for (let n: Element | null = target; n && n !== root; n = n.parentElement) {
    if (n.scrollWidth <= n.clientWidth + 1) continue;
    const flow = getComputedStyle(n).overflowX;
    if (flow === 'auto' || flow === 'scroll') return true;
  }
  return false;
}

/**
 * Einträge mit „Wischen zum Löschen“ (lib/swipeRow.ts): Nach links gehört die Geste dem Eintrag (Papierkorb),
 * ebenso alles an einem offenen Eintrag. Nach rechts auf einem geschlossenen Eintrag tut er nichts – dort darf
 * zur vorherigen Seite gewischt werden.
 */
export function rowOwnsStep(target: Element, step: 1 | -1): boolean {
  const row = target.closest('.swipe-row');
  if (!row) return false;
  return step === 1 || row.classList.contains('is-open') || row.classList.contains('is-swiping');
}

/**
 * Unterseiten innerhalb einer Hauptseite (Lexikon: Karten, Blades, Bits …; components/TabPager.tsx mit `sub`).
 * Sie melden sich hier an: In ihrem Bereich gehört ein Wisch ihnen, solange es dort in diese Richtung weitergeht.
 * An der ersten/letzten Unterseite und oberhalb ihres Bereichs blättern die Hauptseiten.
 */
type SubOwner = (y: number, step: 1 | -1) => boolean;
const subPagers = new Set<SubOwner>();

/** Anmelden; die Rückgabe meldet wieder ab. `owns(y, step)`: Setzt der Finger auf Höhe `y` (px im Fenster) auf – blättert dann diese Unterseite? */
export function registerSubPager(owns: SubOwner): () => void {
  subPagers.add(owns);
  return () => void subPagers.delete(owns);
}

export function subPagerOwnsStep(y: number, step: 1 | -1): boolean {
  for (const owns of subPagers) if (owns(y, step)) return true;
  return false;
}

/** iPhone/iPad (auch iPadOS, das sich als Mac ausgibt) */
const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * Die aktuelle Seite in der Adresse merken (`#battle` …), damit Neuladen und Links dort landen.
 *
 * iPhone/iPad: ohne neuen Eintrag im Verlauf. iOS blättert bei einem Wisch vom Bildschirmrand sonst selbst durch den
 * Verlauf – der ganze Bildschirm samt Logo und Leiste schiebt sich dann als Standbild übereinander, und man kommt nur
 * zu Seiten, auf denen man schon war. Diese System-Geste lässt sich nicht abschalten; ohne Verlauf hat sie nichts zu
 * blättern, und der Wisch gehört der App (components/TabPager.tsx).
 * Sonst (Android, PC): wie bisher ein Eintrag je Wechsel – die Zurück-Taste geht zur vorherigen Seite.
 */
export function rememberTab(tab: string): void {
  if (isIos()) history.replaceState(history.state, '', `${location.pathname}${location.search}#${tab}`);
  else window.location.hash = tab;
}
