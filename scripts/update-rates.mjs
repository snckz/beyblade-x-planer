// Wechselkurse für die Preis-Hinweise: Euro-Referenzkurse der EZB (täglich, kostenlos, ohne Schlüssel).
// Schreibt public/data/rates.json nur, wenn sich der Kurstag ändert. Bei Fehlern bleibt die Datei, wie sie ist.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/** Liest Datum sowie JPY- und THB-Kurs (1 € = x) aus der EZB-XML. */
export function parseEcb(xml) {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  const rate = (cur) => {
    const m = new RegExp(`currency=['"]${cur}['"]\\s+rate=['"]([\\d.]+)['"]`).exec(xml);
    return m ? Number(m[1]) : NaN;
  };
  const JPY = rate('JPY');
  const THB = rate('THB');
  const USD = rate('USD'); // für Hasbro-Preise (US-Verkaufspreis)
  if (!date || !(JPY > 0) || !(THB > 0)) return null;
  return { source: 'EZB-Referenzkurse', date, base: 'EUR', JPY, THB, ...(USD > 0 ? { USD } : {}) };
}

/** Für Preis-Richtwerte reicht ein Update bei > 1 % Kursänderung oder wenn der Stand älter als 7 Tage ist. */
export function needsUpdate(prev, next) {
  if (!prev?.date || !(prev.JPY > 0) || !(prev.THB > 0)) return true;
  if (next.USD && !prev.USD) return true; // USD neu dazugekommen
  if (prev.date === next.date) return false;
  const moved = (a, b) => Math.abs(b / a - 1) > 0.01;
  const ageDays = (Date.parse(next.date) - Date.parse(prev.date)) / 86400000;
  return moved(prev.JPY, next.JPY) || moved(prev.THB, next.THB) || ageDays >= 7;
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url) } = {}) {
  const path = new URL('rates.json', dataDir);
  try {
    const res = await fetchFn(ECB_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rates = parseEcb(await res.text());
    if (!rates) throw new Error('Kurse nicht lesbar');
    let prev = null;
    try {
      prev = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      /* erste Ausführung */
    }
    if (!needsUpdate(prev, rates)) return { changed: false, rates };
    writeFileSync(path, JSON.stringify(rates, null, 2) + '\n');
    console.log(`Kurse ${rates.date}: 1 € = ${rates.JPY} ¥ = ${rates.THB} ฿`);
    return { changed: true, rates };
  } catch (err) {
    console.warn(`⚠️ Wechselkurse nicht aktualisiert: ${err.message}`);
    return { changed: false, rates: null };
  }
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) void run();
