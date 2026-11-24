/**
 * Sprache der App: Deutsch (Ausgangssprache) oder Englisch.
 *
 * So funktioniert es:
 * - Im Code stehen die deutschen Texte, eingewickelt in `tr('…')`. Der deutsche Text ist zugleich der Schlüssel.
 * - Für Englisch schlägt `tr` im Wörterbuch `i18n.en.ts` nach. Fehlt dort ein Eintrag, bleibt der deutsche Text stehen
 *   (nichts geht kaputt). `tests/i18n.test.ts` prüft, dass kein Eintrag fehlt.
 * - Platzhalter: `tr('{0} von {1} Blades', have, total)`. Im Englischen dürfen sie in anderer Reihenfolge stehen.
 * - Die Sprache steht für die ganze Laufzeit fest (viele Texte sind Konstanten). Ein Wechsel lädt die App neu.
 * - Gefragt wird genau einmal, beim ersten Start (components/LanguagePrompt.tsx). Danach unter Sammlung → Sprache.
 */
export type Lang = 'de' | 'en';

export const LANG_KEY = 'bxplaner:lang';

/** Die gespeicherte Wahl – `null`, solange noch nicht gefragt wurde (oder Speichern blockiert ist). */
export function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'de' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

export const lang: Lang = storedLang() ?? 'de';

/** Zahlen (Dezimalkomma bzw. -punkt) und Datumsangaben in der gewählten Sprache */
export const NUM_LOCALE = lang === 'en' ? 'en-GB' : 'de-DE';
export const DATE_LOCALE = lang === 'en' ? 'en-GB' : 'de-AT';

/** Dezimalzahl mit fester Stellenzahl in der gewählten Sprache: 3,5 bzw. 3.5 */
export const dec = (n: number, digits = 1) => n.toLocaleString(NUM_LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

let dict: Record<string, string> | null = null;
let dataDict: Record<string, string> = {};
let rules: [RegExp, string][] = [];

/** Wörterbuch laden – vor dem ersten Zeichnen (main.tsx). Schlägt das fehl (offline, nie geladen), bleibt die App deutsch. */
export async function loadLang(): Promise<void> {
  if (lang !== 'en') return;
  try {
    const en = await import('./i18n.en');
    dict = en.EN;
    dataDict = en.EN_DATA;
    rules = en.EN_RULES;
    document.documentElement.lang = 'en';
  } catch {
    dict = null;
  }
}

const fill = (s: string, args: unknown[]) => (args.length ? s.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : s);

/** Text in der gewählten Sprache. `text` ist der deutsche Text (und der Schlüssel), `args` füllen `{0}`, `{1}` … */
export function tr(text: string, ...args: unknown[]): string {
  return fill(dict?.[text] ?? text, args);
}

/**
 * Texte aus den Daten (Notizen zu Teilen, Termine, Hinweise aus lib/release.js): Die Daten sind deutsch. Für Englisch
 * gibt es ein eigenes Wörterbuch und Muster für erzeugte Texte. Was dort fehlt, bleibt deutsch.
 */
export function trData(text: string): string {
  if (!dict || !text) return text;
  const exact = dataDict[text];
  if (exact !== undefined) return exact;
  return rules.reduce((s, [re, to]) => s.replace(re, to), text);
}

/** Kann die Wahl gespeichert werden? Ohne Speicher (privater Modus) wird nicht gefragt – sonst käme die Frage jedes Mal. */
export function canStoreLang(): boolean {
  try {
    const probe = `${LANG_KEY}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sprache wählen. Gleiche Sprache: nur merken. Andere Sprache: erst das Wörterbuch holen (damit es auch offline da
 * ist), dann merken und neu laden. Liefert `false`, wenn Englisch gerade nicht geladen werden kann.
 */
export async function chooseLang(next: Lang, reload: () => void = () => window.location.reload()): Promise<boolean> {
  if (next === 'en') {
    try {
      await import('./i18n.en');
    } catch {
      return false;
    }
  }
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    return false;
  }
  if (next !== lang) reload();
  return true;
}
