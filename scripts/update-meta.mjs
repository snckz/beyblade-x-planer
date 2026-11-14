// Turnier-Meta automatisch erneuern (einmal pro Woche):
// liest den Monatsbericht von BEYWATCH.GG (gemeldete WBO-Siegerdecks der letzten 30 Tage),
// ordnet die Kombos den Teilen aus db.json zu, zählt sie und schreibt public/data/meta.json.
// Sicherheitsnetz: zu wenig erkannte Decks → meta.json bleibt, wie sie ist.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateMeta } from './validate-data.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SHORT = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const DATE_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/;
const MIN_DECKS = 8;
const MAX_AGE_DAYS = 7;
/** Community-Schreibweisen, die anders heißen als im Wiki */
const ALIASES = { pegasis: 'pegasus' };

export const reportUrl = (d) => `https://beywatch.gg/meta/${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;

/** HTML → Textzeilen (Block-Elemente werden zu Zeilenumbrüchen). */
export function htmlToLines(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(li|div|p|a|h\d|td|tr|span|section|article|header|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Wörter eines Namens, sortiert – „Hover Wyvern“ und „WyvernHover“ ergeben denselben Schlüssel. */
const wordKey = (name) =>
  String(name)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => ALIASES[w] ?? w)
    .sort()
    .join(' ');

export function bladeIndex(db) {
  const map = new Map();
  for (const b of db.blades) for (const n of [b.id, b.name, b.hasbroName].filter(Boolean)) map.set(wordKey(n), b);
  return map;
}

/** „Wizard Rod 1-60H“ → { bladeId, ratchetId, bitId } oder null, wenn ein Teil unbekannt ist. */
export function parseCombo(line, db, index = bladeIndex(db)) {
  const m = /^(.+?)\s+((?:\d|[A-Z])-\d{2})?([A-Z][A-Za-z]{0,3})$/.exec(line.trim());
  if (!m) return null;
  const [, rawName, ratchetId, bitId] = m;
  const words = rawName.split(/\s+/);
  // Längster passender Blade-Name vorne (CX: „Bahamut Blitz Break Heavy“ → Bahamut Blitz + Assist Blade)
  let blade = null;
  for (let k = words.length; k >= 1 && !blade; k--) blade = index.get(wordKey(words.slice(0, k).join(' '))) ?? null;
  if (!blade) return null;
  if (!db.bits.some((b) => b.id === bitId)) return null;
  if (ratchetId && !db.ratchets.some((r) => r.id === ratchetId)) return null;
  if (!ratchetId && !blade.integratedRatchet) return null;
  return { bladeId: blade.id, ratchetId: ratchetId ?? null, bitId };
}

/** Turniere aus den Textzeilen: Titel, Datum, dann Kombo-Zeilen bis „Source“. */
export function parseDecks(lines, db) {
  const index = bladeIndex(db);
  const decks = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const d = DATE_RE.exec(lines[i]);
    if (!d) continue;
    const event = lines[i - 1];
    if (DATE_RE.test(event) || /^source/i.test(event)) continue;
    const date = new Date(Date.UTC(Number(d[3]), SHORT[d[1]], Number(d[2]))).toISOString().slice(0, 10);
    const combos = [];
    let unknown = 0;
    for (let j = i + 1; j < lines.length && j < i + 12; j++) {
      if (/^source/i.test(lines[j]) || DATE_RE.test(lines[j + 1] ?? '')) break;
      const c = parseCombo(lines[j], db, index);
      if (c) combos.push(c);
      else unknown++;
    }
    const key = `${event}|${date}`;
    if (!combos.length || seen.has(key)) continue;
    seen.add(key);
    decks.push({ event, date, combos, unknown });
  }
  return decks;
}

const comboKey = (c) => `${c.bladeId}|${c.ratchetId ?? ''}|${c.bitId}`;

/** Aus den Decks die neue meta.json bauen. prev = bisherige meta.json (für den Trend). */
export function buildMeta(decks, prev, { today, source }) {
  const counts = {};
  for (const d of decks) for (const c of new Map(d.combos.map((x) => [comboKey(x), x])).values()) counts[comboKey(c)] = (counts[comboKey(c)] ?? 0) + 1;
  const total = decks.length;
  const ranked = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const prevShare = (key) => (prev?.counts?.[key] !== undefined && prev?.decksTotal ? prev.counts[key] / prev.decksTotal : null);
  const combos = ranked.map(([key, n], i) => {
    const [bladeId, ratchetId, bitId] = key.split('|');
    const share = n / total;
    const before = prevShare(key);
    const trend = i < 2 ? 'top' : before === null ? 'up' : share > before * 1.2 ? 'up' : share < before * 0.8 ? 'down' : 'steady';
    return { bladeId, ratchetId: ratchetId || null, bitId, note: `In ${n} von ${total} Siegerdecks der letzten 30 Tage.`, trend };
  });
  const latest = [...decks]
    .filter((d) => d.combos.length === 3 && d.unknown === 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((d) => ({ event: d.event.slice(0, 80), date: d.date, combos: d.combos.map((c) => [c.bladeId, c.ratchetId, c.bitId]) }));
  return {
    updatedAt: today,
    auto: true,
    note: `Automatisch aus ${total} gemeldeten WBO-Siegerdecks der letzten 30 Tage, wöchentlich aktualisiert.`,
    sources: [{ name: 'BEYWATCH.GG – Meta-Report', url: source }],
    combos,
    decks: latest,
    decksTotal: total,
    counts,
  };
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url), now = new Date(), force = false } = {}) {
  const metaPath = new URL('meta.json', dataDir);
  const db = JSON.parse(readFileSync(new URL('db.json', dataDir), 'utf8'));
  let prev = null;
  try {
    prev = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch {
    /* erste Ausführung */
  }
  const today = now.toISOString().slice(0, 10);
  const age = prev?.updatedAt ? (Date.parse(today) - Date.parse(prev.updatedAt)) / 86400000 : Infinity;
  if (!force && prev?.auto && age < MAX_AGE_DAYS) {
    console.log(`Meta ist ${age} Tage alt – nächste Aktualisierung in ${MAX_AGE_DAYS - age} Tagen.`);
    return { changed: false };
  }
  try {
    // Anfang des Monats kann der neue Bericht noch fehlen → Vormonat.
    const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    // Anfang des Monats ist der neue Bericht evtl. noch dünn → dann den Vormonat nehmen.
    let decks = [];
    let source = null;
    for (const url of [reportUrl(now), reportUrl(prevMonth)]) {
      const res = await fetchFn(url, { headers: { 'User-Agent': 'beyblade-x-planer-meta/1.0 (GitHub Actions)', Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      decks = parseDecks(htmlToLines(await res.text()), db);
      source = url;
      if (decks.length >= MIN_DECKS) break;
    }
    if (decks.length < MIN_DECKS) throw new Error(`nur ${decks.length} Siegerdecks erkannt`);
    const meta = buildMeta(decks, prev, { today, source });
    const errors = validateMeta(meta, db);
    if (errors.length || meta.combos.length < 3) throw new Error(errors[0] ?? 'zu wenige Kombos');
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    console.log(`Meta: ${decks.length} Siegerdecks, Top: ${meta.combos.slice(0, 3).map((c) => `${c.bladeId} ${c.ratchetId ?? ''}${c.bitId}`).join(', ')}`);
    return { changed: true, meta };
  } catch (err) {
    console.warn(`⚠️ Meta nicht aktualisiert, meta.json bleibt: ${err.message}`);
    return { changed: false };
  }
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) void run();
