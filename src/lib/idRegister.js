// Zentrales ID-Register: eine Implementierung für App (src/) und Datenpipeline (scripts/).
// Daten: public/data/aliases.json
//   aliases:    { blades|ratchets|bits|products: { "Schreibweise": "kanonischeId" } }
//               Andere Schreibweisen einer BESTEHENDEN ID (z. B. Wiki-Titel „StormPegasis“ → StormPegasus).
//   retired:    { blades|ratchets|bits|products: { "alteId": "neueId" | null } }  (products auch [..] = aufgeteilt)
//               IDs, die es nicht mehr gibt: umbenannt (Weiterleitung) oder bewusst entfernt (null).
//   reassigned: { "Produktnummer": "Grund" } – Produktnummer darf ausnahmsweise andere Teile bekommen.
// Regeln: Nur ausdrücklich eingetragene Zuordnungen – keine Zusammenführung wegen ähnlicher Namen.
// Normalisierung (Groß/Klein, Leer- und Sonderzeichen, Wortreihenfolge) nur für Blade-NAMEN beim Import; zeigt ein
// normalisierter Name auf zwei verschiedene Blades, gilt er als mehrdeutig und wird nicht automatisch zugeordnet.

export const KINDS = ['blades', 'ratchets', 'bits', 'products'];
const LABEL = { blades: 'Blade', ratchets: 'Ratchet', bits: 'Bit', products: 'Produkt' };

/** Name ohne Groß/Klein, Leer- und Sonderzeichen: „Dran Sword“ = „DranSword“ */
export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
/** Wortmenge unabhängig von der Reihenfolge: „Sword Dran“ = „Dran Sword“ (Hasbro- vs. Takara-Schreibweise) */
export const wordKey = (s) =>
  String(s)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join(' ');

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const section = (v) => Object.fromEntries(KINDS.map((k) => [k, { ...obj(obj(v)[k]) }]));

/**
 * Register in die volle Form bringen. Akzeptiert auch die alte flache Form von retired.json
 * ({ blades, ratchets, bits, products, reassigned }) – sie wird zum Abschnitt `retired`.
 */
export function normalizeRegister(raw) {
  const r = obj(raw);
  const structured = 'aliases' in r || 'retired' in r;
  return {
    aliases: section(structured ? r.aliases : {}),
    retired: section(structured ? r.retired : r),
    reassigned: { ...obj(r.reassigned) },
  };
}

export const EMPTY_REGISTER = Object.freeze(normalizeRegister({}));

/**
 * Alle aktuellen IDs zu einer (evtl. alten oder anders geschriebenen) ID.
 * - existiert die ID: [id]
 * - Alias oder Umbenennung: Weiterleitung verfolgen (mehrstufig), bis eine existierende ID erreicht ist
 * - entfernt (null), unbekannt, Kreis oder Ziel fehlt: [] (nie ein „ähnliches“ Teil raten)
 * `exists(id)` prüft, ob die ID in den Daten steht.
 */
export function resolveIds(register, kind, id, exists) {
  const reg = normalizeRegister(register);
  const out = [];
  const visit = (cur, seen) => {
    if (typeof cur !== 'string' || !cur) return;
    if (exists(cur)) {
      if (!out.includes(cur)) out.push(cur);
      return;
    }
    if (seen.has(cur)) return; // Kreis: nicht auflösbar
    const next = Object.hasOwn(reg.aliases[kind], cur) ? reg.aliases[kind][cur] : Object.hasOwn(reg.retired[kind], cur) ? reg.retired[kind][cur] : undefined;
    const nextSeen = new Set(seen).add(cur);
    if (Array.isArray(next)) next.forEach((n) => visit(n, nextSeen));
    else visit(next, nextSeen);
  };
  visit(id, new Set());
  return out;
}

/** Genau eine aktuelle ID oder undefined (nicht auflösbar oder mehrdeutig aufgeteilt). */
export function resolveId(register, kind, id, exists) {
  const ids = resolveIds(register, kind, id, exists);
  return ids.length === 1 ? ids[0] : undefined;
}

/** IDs je Art aus der Datenbank */
const idSets = (db) => ({
  blades: new Set((db.blades ?? []).map((x) => x.id)),
  ratchets: new Set((db.ratchets ?? []).map((x) => x.id)),
  bits: new Set((db.bits ?? []).map((x) => x.id)),
  products: new Set((db.products ?? []).map((x) => x.code)),
});

/**
 * Register prüfen: Typen, Ziele vorhanden, keine Kreise, kein Alias verdeckt eine echte ID, kein Eintrag doppelt
 * (Alias und stillgelegt zugleich), keine widersprüchlichen Schreibweisen (gleich normalisiert, anderes Ziel) und
 * keine Schreibweise, die normalisiert einem ANDEREN bestehenden Blade gleicht (Prüfbedarf statt stiller Umleitung).
 */
export function validateRegister(register, db) {
  const errors = [];
  const reg = normalizeRegister(register);
  const ids = idSets(db);
  for (const kind of KINDS) {
    const label = LABEL[kind];
    const has = (id) => ids[kind].has(id);
    for (const [part, entries] of [
      ['aliases', reg.aliases[kind]],
      ['retired', reg.retired[kind]],
    ]) {
      for (const [key, target] of Object.entries(entries)) {
        const where = `aliases.json ${part}.${kind} „${key}“`;
        const list = Array.isArray(target) ? target : [target];
        const okType = list.length > 0 && list.every((t) => typeof t === 'string' && t) && (!Array.isArray(target) || kind === 'products');
        if (target === null) {
          if (part === 'aliases') errors.push(`${where}: ein Alias braucht ein Ziel (zum Entfernen: retired)`);
        } else if (!okType) {
          errors.push(`${where}: Ziel muss eine ${label}-ID${kind === 'products' ? ' (oder Liste)' : ''} oder null sein`);
          continue;
        }
        if (has(key)) errors.push(`${where}: ${label} „${key}“ gibt es in db.json – ${part === 'aliases' ? 'ein Alias darf keine echte ID verdecken' : 'stillgelegt, steht aber noch in db.json'}`);
        if (part === 'aliases' && Object.hasOwn(reg.retired[kind], key)) errors.push(`${where}: steht zugleich unter retired`);
        if (target === null) continue;
        const resolved = resolveIds(reg, kind, key, has);
        if (resolved.length !== list.length || resolved.length === 0) errors.push(`${where}: Weiterleitung nach ${list.join(', ')} endet nicht bei vorhandenen ${label}s – Ziel gibt es nicht oder Kreis`);
      }
    }
  }
  for (const [code, why] of Object.entries(reg.reassigned)) {
    if (typeof why !== 'string' || !why.trim()) errors.push(`aliases.json reassigned ${code}: Grund fehlt`);
  }
  // Widersprüchliche Schreibweisen: gleich normalisiert, aber anderes Ziel
  for (const kind of KINDS) {
    const byNorm = new Map();
    for (const [key, target] of Object.entries(reg.aliases[kind])) {
      const k = norm(key);
      const prev = byNorm.get(k);
      if (prev && prev.target !== target) errors.push(`aliases.json aliases.${kind}: „${prev.key}“ → ${prev.target} und „${key}“ → ${target} widersprechen sich`);
      else byNorm.set(k, { key, target });
    }
  }
  // Blade-Alias, der normalisiert wie ein ANDERES bestehendes Blade heißt: Prüfbedarf
  const bladeNames = new Map();
  for (const b of db.blades ?? []) for (const n of [b.id, b.name, b.hasbroName].filter(Boolean)) bladeNames.set(norm(n), b.id);
  for (const [part, entries] of [
    ['aliases', reg.aliases.blades],
    ['retired', reg.retired.blades],
  ]) {
    for (const [key, target] of Object.entries(entries)) {
      if (typeof target !== 'string') continue;
      const other = bladeNames.get(norm(key));
      if (other && other !== target) errors.push(`aliases.json ${part}.blades „${key}“ → ${target}: Name gehört bereits zu Blade ${other} (bitte prüfen)`);
    }
  }
  return errors;
}

/**
 * Namensindex für Blades (Importe): ID, Name, Hasbro-Name und Register-Schreibweisen → Blade.
 * `wordOrder: true` erkennt zusätzlich vertauschte Wortreihenfolge (Hasbro: „Sword Dran“).
 * Zeigt ein Schlüssel auf zwei verschiedene Blades, ist er mehrdeutig: find() liefert dann nichts, ambiguous() true.
 */
export function createBladeIndex(blades, register, { wordOrder = false } = {}) {
  const reg = normalizeRegister(register);
  const keys = new Map();
  const conflicts = new Set();
  const keysOf = (s) => [norm(s), ...(wordOrder ? [`w:${wordKey(s)}`] : [])].filter((k) => k && k !== 'w:');
  const put = (k, blade) => {
    const prev = keys.get(k);
    if (prev && prev !== blade && prev.id !== blade.id) conflicts.add(k);
    else keys.set(k, blade);
  };
  const byId = new Map();
  const add = (blade) => {
    byId.set(blade.id, blade);
    for (const n of [blade.id, blade.name, blade.hasbroName].filter(Boolean)) for (const k of keysOf(n)) put(k, blade);
  };
  blades.forEach(add);
  // Ausdrücklich eingetragene Schreibweisen und Umbenennungen (Ziel muss existieren)
  const link = (name, target) => {
    const blade = typeof target === 'string' ? byId.get(resolveId(reg, 'blades', target, (id) => byId.has(id)) ?? '') : undefined;
    if (blade) for (const k of keysOf(name)) put(k, blade);
  };
  const linkAll = () => {
    for (const [a, t] of Object.entries(reg.aliases.blades)) link(a, t);
    for (const [a, t] of Object.entries(reg.retired.blades)) link(a, t);
  };
  linkAll();
  const lookup = (name) => {
    for (const k of keysOf(name)) {
      if (conflicts.has(k)) return { ambiguous: true };
      const b = keys.get(k);
      if (b) return { blade: b };
    }
    return {};
  };
  return {
    /** Erstes eindeutiges Blade zu einem der Namen (in dieser Reihenfolge); undefined, wenn keins oder mehrdeutig */
    find: (...names) => {
      for (const n of names.filter(Boolean)) {
        const r = lookup(n);
        if (r.ambiguous) return undefined;
        if (r.blade) return r.blade;
      }
      return undefined;
    },
    /** Ist einer der Namen mehrdeutig (zeigt auf mehrere Blades)? */
    ambiguous: (...names) => names.filter(Boolean).some((n) => lookup(n).ambiguous),
    /** Neu angelegtes Blade aufnehmen */
    add: (blade) => {
      add(blade);
      linkAll();
    },
  };
}

/**
 * Gespeicherte Nutzerdaten (Kombos, Sammlung, Wunschliste …) auf aktuelle IDs umstellen – nur, wo eine ID in der
 * Datenbank fehlt UND das Register eine eindeutige Weiterleitung kennt. Nicht Auflösbares bleibt unverändert
 * (nichts wird gelöscht). Gibt { state, changes } zurück; ohne Änderung ist state === der übergebene Stand.
 */
export function migrateUserState(state, register, db) {
  const reg = normalizeRegister(register);
  const ids = idSets(db);
  const changes = [];
  const one = (kind, id) => {
    if (typeof id !== 'string' || ids[kind].has(id)) return id;
    const next = resolveId(reg, kind, id, (x) => ids[kind].has(x));
    if (next && next !== id) {
      changes.push(`${LABEL[kind]} ${id} → ${next}`);
      return next;
    }
    return id;
  };
  /** Aktuelle Codes zu einem gespeicherten Code (nur Nachschlagen, ohne Meldung) */
  const lookup = (code) => {
    if (typeof code !== 'string' || ids.products.has(code)) return [code];
    const next = resolveIds(reg, 'products', code, (x) => ids.products.has(x));
    return next.length ? next : [code];
  };
  /** Codes übernehmen und die Umstellung melden – nur, wenn sich wirklich etwas ändert */
  const codes = (code) => {
    const next = lookup(code);
    if (next.length !== 1 || next[0] !== code) changes.push(`Produkt ${code} → ${next.join(', ')}`);
    return next;
  };
  const part = (c) => {
    if (!c || typeof c !== 'object') return c;
    const bladeId = one('blades', c.bladeId);
    const ratchetId = c.ratchetId === undefined ? undefined : one('ratchets', c.ratchetId);
    const bitId = one('bits', c.bitId);
    return bladeId === c.bladeId && ratchetId === c.ratchetId && bitId === c.bitId ? c : { ...c, bladeId, ...(c.ratchetId === undefined ? {} : { ratchetId }), bitId };
  };
  /** Nur eindeutige Umbenennungen (1:1) – ein aufgeteiltes Produkt hat keinen eindeutigen neuen Code */
  const single = (code) => {
    const next = lookup(code);
    if (next.length !== 1 || next[0] === code) return code;
    changes.push(`Produkt ${code} → ${next[0]}`);
    return next[0];
  };
  // Ladenpreise: eigener Preis für den neuen Code hat Vorrang; aufgeteilte Produkte bekommen keinen Set-Preis
  const shopPrices = {};
  const oldPrices = [];
  for (const [c, v] of Object.entries(state.shopPrices ?? {})) {
    const target = single(c);
    if (target === c) shopPrices[c] = v;
    else oldPrices.push([target, v]);
  }
  for (const [c, v] of oldPrices) if (!Object.hasOwn(shopPrices, c)) shopPrices[c] = v;
  const owned = {};
  for (const [code, n] of Object.entries(state.owned ?? {})) for (const c of codes(code)) owned[c] = Math.max(owned[c] ?? 0, n);
  const next = {
    ...state,
    owned,
    combos: (state.combos ?? []).map(part),
    opponent: (state.opponent ?? []).map(part),
    matches: (state.matches ?? []).map((m) => {
      const mine = part(m.mine);
      const opp = part(m.opp);
      return mine === m.mine && opp === m.opp ? m : { ...m, mine, opp };
    }),
    wishlist: [...new Set((state.wishlist ?? []).flatMap(codes))],
    barcodes: Object.fromEntries(Object.entries(state.barcodes ?? {}).map(([g, c]) => [g, single(c)])),
    shopPrices,
  };
  return changes.length ? { state: next, changes } : { state, changes };
}
