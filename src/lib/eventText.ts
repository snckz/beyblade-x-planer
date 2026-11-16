/**
 * Termin-Notizen sind freier Text („Balance-Typ … 1.600 Yen. Bei Hasbro als …“).
 * Für die Anzeige wird nur aufgeteilt – am Inhalt ändert sich nichts:
 * erster Satz als Kurzbeschreibung, der Rest aufklappbar, ein genannter Yen-Preis zusätzlich als Etikett.
 */

const ABBR = new Set(['inkl', 'exkl', 'ca', 'bzw', 'nr', 'vol', 'ggf', 'max', 'min', 'z', 'b', 'u', 'a']);

/** Teilt nach dem ersten Satz. Punkte in Zahlen („1.600“) und nach Abkürzungen („inkl.“) trennen nicht. */
export function splitNote(note: string): { lead: string; rest: string } {
  const text = note.trim();
  const re = /([A-Za-zÄÖÜäöüß]+|[)”“"])[.!?] (?=[A-ZÄÖÜ0-9])/gu;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (ABBR.has(m[1]!.toLowerCase())) continue;
    const cut = m.index + m[0].length;
    return { lead: text.slice(0, cut).trim(), rest: text.slice(cut).trim() };
  }
  return { lead: text, rest: '' };
}

/** Erster genannter Yen-Preis („1.600 Yen“, „6600 Yen“) oder null. */
export function notePriceYen(note: string): number | null {
  const m = /(\d{1,3}(?:\.\d{3})+|\d{3,6}) Yen/.exec(note);
  if (!m) return null;
  const n = Number(m[1]!.replace(/\./g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Passt das Blade-Foto genau zu diesem Termin? Nur wenn der Titel mit dem Bildtitel endet
 * („BX-54 Booster SiegSuperion 0-70LP“ ↔ „SiegSuperion 0-70LP“). Sets und Sonderfarben
 * („… Metal Coat: Black“, „… Gunmetal Ver.“) zeigen dieselbe Blade in anderer Ausführung → „Abb. ähnlich“.
 */
export function photoMatchesTitle(eventTitle: string, imageTitle: string | undefined): boolean {
  if (!imageTitle) return false;
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(eventTitle).endsWith(norm(imageTitle));
}
