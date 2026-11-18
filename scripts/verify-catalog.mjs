// Prüft ungeprüfte Einträge gegen ihre Seite im Beyblade Wiki:
// - Blade: Seite des Kreisels gefunden, Typ und Drehrichtung stimmen mit db.json überein, in Japan schon erschienen
//   → verified: true. Abweichungen werden NICHT automatisch übernommen, sondern im Bericht gemeldet.
// - Bit: Typ steht auf der Bit-Seite („… is an Attack Type Bit“) → Typ übernehmen, uncertain entfällt.
// - Produkt: Blade geprüft und Produkt laut Wiki erschienen → verified: true.
// - Release: Produkt mit vergangenem Release-Datum ohne Beleg → released: true erst, wenn das Wiki „erschienen“ meldet.
// Bei Netzwerkfehlern bleibt alles, wie es ist. Läuft im Neuheiten-Radar.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { API } from './update-data.mjs';
import { parseBeyPage } from './import-catalog.mjs';
import { validateDb } from './validate-data.mjs';
import { DataSafetyError, writeDbSafely, writeFileAtomic } from './data-safety.mjs';

const MAX_PAGES = 260;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Erscheinungsstatus aus dem Wiki-Text.
 * „released … in Japan on July 13th, 2024“ → Datum; „will be released“ / „upcoming“ → noch nicht erschienen.
 */
export function parseRelease(wikitext, today = new Date()) {
  const text = String(wikitext).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  const upcoming = /\bwill be released\b|\bupcoming\b|\bto be released\b/i.test(text.split(/\n==/)[0]);
  const m = /released[^.]{0,160}?\bon\s+([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month >= 0) {
      const date = new Date(Date.UTC(Number(m[3]), month, Number(m[2])));
      return { released: !upcoming && date.getTime() <= today.getTime(), date: date.toISOString().slice(0, 10) };
    }
  }
  if (upcoming) return { released: false };
  // Ohne Datum: „was released … for 1,320円“ gilt als erschienen.
  if (/\bwas released\b|\bis an? .{0,40}Beyblade released by\b/i.test(text)) return { released: true };
  return { released: false };
}

/** Typ eines Bits von seiner Seite: „Low Flat … is an Attack Type Bit“ (auch „Ratchet Integrated Bit“). */
export function parseBitType(wikitext) {
  const text = String(wikitext);
  const m =
    /\bis an?\s+(?:\[\[)?(Attack|Defense|Defence|Stamina|Balance)[ -]Type(?:\]\])?\s+(?:Ratchet Integrated\s+)?Bit\b/i.exec(text) ??
    // Infobox-Feld, z. B. „| type = Attack“
    /\|\s*type\s*=\s*(?:\[\[)?(Attack|Defense|Defence|Stamina|Balance)\b/i.exec(text);
  return m ? m[1].toLowerCase().replace('defence', 'defense') : null;
}

const titleFromUrl = (url) => {
  try {
    return url?.includes('/wiki/') ? decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' ') : null;
  } catch {
    return null;
  }
};

/**
 * Prüft db gegen das Wiki. fetchPage(title) → Wikitext | null (fehlt); wirft bei Netzwerkfehlern.
 * Gibt eine neue db und einen Bericht zurück.
 */
export async function verifyCatalog(db, fetchPage, today = new Date()) {
  const out = structuredClone(db);
  const report = { blades: [], bits: [], products: 0, mismatches: [], unreleased: [], notFound: [] };
  const cache = new Map();
  let fetched = 0;
  const page = async (title) => {
    if (!title) return null;
    if (cache.has(title)) return cache.get(title);
    if (fetched >= MAX_PAGES) return undefined;
    fetched++;
    const wt = await fetchPage(title);
    cache.set(title, wt);
    return wt;
  };
  const releasedTitles = new Map();

  for (const blade of out.blades) {
    if (blade.verified) continue;
    const products = out.products.filter((p) => p.bladeId === blade.id);
    const candidates = [
      ...products.map((p) => titleFromUrl(p.source)),
      blade.wikiTitle,
      // Produktname ohne Art, Blade-Name als Wiki-Schreibweise: „Knight Fortress GV8-70UN“ → „KnightFortress GV8-70UN“
      ...products.map((p) => p.name.replace(/^(Starter|Booster|Set|Random Booster(?: Vol\.\s?\d+)?)\s+/, '').replace(blade.name, blade.id)),
      ...products.map((p) => `${blade.id} ${p.ratchetId ?? ''}${p.bitId ?? ''}`.trim()),
    ].filter((t, i, a) => t && a.indexOf(t) === i);
    let found = null;
    for (const t of candidates) {
      const wt = await page(t);
      if (wt === undefined) break;
      if (wt) {
        found = { title: t, wt };
        break;
      }
    }
    if (!found) {
      report.notFound.push(blade.id);
      continue;
    }
    const info = parseBeyPage(found.wt);
    const rel = parseRelease(found.wt, today);
    releasedTitles.set(found.title, rel.released);
    // Japan-Release-Datum merken (für Erinnerungen in der App)
    // Nur Produkte, die zu genau dieser Seite gehören (bzw. ohne Quelle und noch nicht erschienen).
    // Solange nicht erschienen, wird das Datum aktualisiert – Takara Tomy verschiebt manchmal.
    if (rel.date) {
      for (const p of products) {
        const own = titleFromUrl(p.source) === found.title || (!p.source && !p.verified);
        if (own && (!p.releaseJp || !rel.released)) p.releaseJp = rel.date;
      }
    }
    if (!info.type) {
      report.notFound.push(`${blade.id} (Typ nicht lesbar)`);
      continue;
    }
    const issues = [];
    if (info.type !== blade.type) issues.push(`Typ ${blade.type} → Wiki: ${info.type}`);
    if (info.spin !== blade.spin) issues.push(`Drehrichtung ${blade.spin} → Wiki: ${info.spin}`);
    if (issues.length) {
      report.mismatches.push({ blade: blade.id, page: found.title, issues });
      continue;
    }
    if (!rel.released) {
      report.unreleased.push(`${blade.id}${rel.date ? ` (${rel.date})` : ''}`);
      continue;
    }
    blade.verified = true;
    report.blades.push(blade.id);
  }

  for (const bit of out.bits) {
    if (!bit.uncertain) continue;
    const titles = [bit.wikiTitle, `Bit - ${bit.name}`, `Ratchet Integrated Bit - ${bit.name}`].filter((t, i, a) => t && a.indexOf(t) === i);
    let type = null;
    for (const t of titles) {
      const wt = await page(t);
      if (wt === undefined) break;
      type = wt ? parseBitType(wt) : null;
      if (type) break;
    }
    if (!type) continue;
    if (type !== bit.type) report.mismatches.push({ bit: bit.id, issues: [`Typ ${bit.type} → Wiki: ${type} (übernommen)`] });
    bit.type = type;
    delete bit.uncertain;
    if (bit.note?.startsWith('Aus dem Wiki übernommen')) bit.note = 'Aus dem Beyblade Wiki übernommen und geprüft.';
    report.bits.push(bit.id);
  }

  const bladeOk = new Set(out.blades.filter((b) => b.verified).map((b) => b.id));
  for (const p of out.products) {
    if (p.verified || !p.bladeId || !bladeOk.has(p.bladeId)) continue;
    const t = titleFromUrl(p.source);
    let released = t ? releasedTitles.get(t) : undefined;
    if (released === undefined && t) {
      const wt = await page(t);
      if (wt === undefined) continue;
      released = wt ? parseRelease(wt, today).released : false;
    }
    if (released ?? !t) {
      p.verified = true;
      report.products++;
    }
  }

  // Release-Bestätigung (Freigabestatus, src/lib/release.js): Produkte mit Release-Datum, die noch keinen Beleg haben
  // (von Hand gepflegt wie UX-22). Ein vergangenes Datum allein genügt nicht – erst wenn das Wiki „erschienen“ meldet,
  // wird released: true gesetzt. Nichts wird je zurückgenommen; ohne Seite oder bei Abbruch bleibt es gesperrt.
  report.releaseConfirmed = [];
  report.releasePending = [];
  const day = today.toISOString().slice(0, 10);
  for (const p of out.products) {
    if (!p.releaseJp || p.released === true || (p.imported && p.verified)) continue;
    if (p.releaseJp > day) continue; // noch angekündigt
    // Nur die eigene Seite des Produkts: die Quelle oder – ohne Quelle – die Kombo-Seite, sofern kein anderes Produkt
    // dieselbe Kombo hat (sonst könnte die Seite eines älteren, längst erschienenen Produkts „erschienen“ melden).
    const combo = p.bladeId && `${p.bladeId} ${p.ratchetId ?? ''}${p.bitId ?? ''}`.trim();
    const sameCombo = out.products.some((x) => x !== p && x.bladeId === p.bladeId && x.ratchetId === p.ratchetId && x.bitId === p.bitId);
    const titles = p.source ? [titleFromUrl(p.source)] : combo && !sameCombo ? [combo] : [];
    let released = false;
    for (const title of titles) {
      const wt = await page(title);
      if (wt === undefined) break; // Seitenlimit
      if (wt && parseRelease(wt, today).released) {
        released = true;
        break;
      }
    }
    if (released) {
      p.released = true;
      report.releaseConfirmed.push(p.code);
    } else report.releasePending.push(p.code);
  }
  return { db: out, report, fetched };
}

async function wikitextOf(fetchFn, title) {
  const url = `${API}?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', redirects: '1', format: 'json', formatversion: '2' })}`;
  const res = await fetchFn(url, { headers: { 'User-Agent': 'beyblade-x-planer-verify/1.0 (GitHub Actions)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d?.parse?.wikitext ?? null;
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url), now = new Date() } = {}) {
  const dbPath = new URL('db.json', dataDir);
  const db = JSON.parse(readFileSync(dbPath, 'utf8'));
  try {
    const res = await verifyCatalog(db, (t) => wikitextOf(fetchFn, t), now);
    const errors = validateDb(res.db);
    if (errors.length) throw new Error('ungültige Daten: ' + errors.slice(0, 3).join('; '));
    // Übergangsprüfung + atomares Schreiben (wirft DataSafetyError bei verdächtigen Änderungen)
    const changed = writeDbSafely(dataDir, db, res.db);
    const r = res.report;
    const reportPath = new URL('verify-report.json', dataDir);
    const next = JSON.stringify({ ...r, fetched: res.fetched }, null, 2) + '\n';
    let prev = '';
    try {
      prev = readFileSync(reportPath, 'utf8');
    } catch {
      /* neu */
    }
    if (prev !== next) writeFileAtomic(reportPath, next);
    console.log(`Prüfung: ${r.blades.length} Blades, ${r.bits.length} Bits, ${r.products} Produkte bestätigt; ${r.mismatches.length} Abweichungen, ${r.unreleased.length} noch nicht erschienen, ${r.notFound.length} ohne Wiki-Seite; Release bestätigt: ${r.releaseConfirmed.length}, Datum vorbei, aber unbestätigt: ${r.releasePending.length}.`);
    for (const code of r.releasePending) console.warn(`::warning::${code}: Release-Datum vorbei, im Wiki aber noch nicht als erschienen bestätigt – bleibt im Kombo-Planer gesperrt.`);
    return { changed, report: r };
  } catch (err) {
    if (err instanceof DataSafetyError) throw err; // verdächtig: laut scheitern
    console.warn(`⚠️ Prüfung abgebrochen, db.json bleibt unverändert: ${err.message}`);
    return { changed: false, report: null };
  }
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
