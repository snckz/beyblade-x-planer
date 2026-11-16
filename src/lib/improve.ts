import type { Combo, Database, MetaFeed } from "./types";
import { matchup, toBey, type Bey } from "./battle";
import { metaUsage } from "./metaUsage";

export interface Improvement {
  /** neue Kombo (Blade bleibt gleich) */
  combo: Combo;
  label: string;
  /** Plus gegen die Gegner (Punkte, gerundet) */
  gain: number;
  /** was getauscht wird, z. B. „Bit F → R“ */
  change: string;
  /** Warnungen der alten Kombo, die damit verschwinden */
  fixes: string[];
  /** wie oft genau diese Kombo in Siegerdecks steckt */
  metaDecks: number;
  /** Teile, die dir dafür noch fehlen (nur ohne Sammlungs-Filter) */
  missing: string[];
}

export interface ImprovePool {
  ratchets: string[];
  bits: string[];
  /** Teile, die man schon hat – für den Hinweis „fehlt dir noch“ */
  owned?: { ratchets: Set<string>; bits: Set<string> };
}

/** Warnungen, die man über Teile beheben kann (nicht „Daten ungeprüft“ o. Ä.). */
const fixable = (w: string) =>
  !/nicht geprüft|nicht bestätigt|integrierten Ratchet/.test(w);

/**
 * Bessere Ratchet/Bit-Varianten für eine Blade: Tauscht ein oder beide Teile und rechnet gegen
 * die aktuellen Turnier-Kombos. Bevorzugt Varianten, die Warnungen beheben oder im Turnier gespielt werden.
 */
export function improveCombo(
  db: Database,
  combo: Combo,
  opponents: Bey[],
  pool: ImprovePool,
  meta: MetaFeed | null = null,
  limit = 3,
): Improvement[] {
  const blade = db.blades.find((b) => b.id === combo.bladeId);
  const now = toBey(db, combo);
  if (!blade || !now || !opponents.length) return [];
  const score = (b: Bey) =>
    opponents.reduce((s, o) => s + matchup(b, o).score, 0) / opponents.length;
  const base = score(now);
  const oldWarn = now.analysis.warnings.filter(fixable);
  const metaCount = (c: Combo) =>
    meta?.counts?.[`${c.bladeId}|${c.ratchetId ?? ""}|${c.bitId}`] ?? 0;

  const ratchets = blade.integratedRatchet
    ? [undefined]
    : [combo.ratchetId, ...pool.ratchets.filter((r) => r !== combo.ratchetId)];
  const bits = [combo.bitId, ...pool.bits.filter((b) => b !== combo.bitId)];

  // Turnier-Kombos dieser Blade immer mitprüfen – auch wenn die Teile fehlen
  const metaTop = metaUsage(db, meta, "blade", blade.id);
  const extra: Combo[] = [];
  if (meta?.counts && metaTop) {
    for (const [k, n] of Object.entries(meta.counts)) {
      const [b, r, t] = k.split("|");
      if (b === blade.id && n > 0 && t)
        extra.push({ id: "", bladeId: b, ratchetId: r || undefined, bitId: t });
    }
  }

  const seen = new Set<string>();
  const out: { item: Improvement; rank: number }[] = [];
  const consider = (c: Combo) => {
    const key = `${c.ratchetId ?? ""}|${c.bitId}`;
    if (
      seen.has(key) ||
      (c.ratchetId === combo.ratchetId && c.bitId === combo.bitId)
    )
      return;
    seen.add(key);
    const bey = toBey(db, c);
    if (!bey?.analysis.valid) return;
    const gain = score(bey) - base;
    const warn = bey.analysis.warnings.filter(fixable);
    const fixes = oldWarn.filter((w) => !warn.includes(w));
    const decks = metaCount(c);
    // Nur echte Verbesserungen: mehr Punkte, behobene Warnung ohne Verlust, oder Turnier-Kombo ohne großen Verlust
    if (!(
      gain >= 2 ||
      (fixes.length && gain >= -1 && warn.length < oldWarn.length) ||
      (decks >= 3 && gain >= -3)
    ))
      return;
    const parts: string[] = [];
    if (c.ratchetId !== combo.ratchetId && c.ratchetId)
      parts.push(`Ratchet ${combo.ratchetId ?? "–"} → ${c.ratchetId}`);
    if (c.bitId !== combo.bitId) parts.push(`Bit ${combo.bitId} → ${c.bitId}`);
    const missing: string[] = [];
    if (pool.owned) {
      if (
        c.ratchetId &&
        c.ratchetId !== combo.ratchetId &&
        !pool.owned.ratchets.has(c.ratchetId)
      )
        missing.push(`Ratchet ${c.ratchetId}`);
      if (c.bitId !== combo.bitId && !pool.owned.bits.has(c.bitId))
        missing.push(`Bit ${c.bitId}`);
    }
    out.push({
      item: {
        combo: { ...combo, ratchetId: c.ratchetId, bitId: c.bitId },
        label: bey.analysis.label,
        gain: Math.round(gain),
        change: parts.join(" · "),
        fixes,
        metaDecks: decks,
        missing,
      },
      // Rang: Punkte + Bonus für behobene Warnungen und Turnier-Beliebtheit, kleiner Abzug für fehlende Teile
      rank:
        gain +
        fixes.length * 4 +
        Math.min(decks, 30) * 0.4 -
        missing.length * 1.5,
    });
  };
  for (const r of ratchets)
    for (const t of bits)
      consider({ id: "", bladeId: blade.id, ratchetId: r, bitId: t });
  for (const c of extra)
    if (blade.integratedRatchet || c.ratchetId) consider(c);

  // Auswahl mit Vielfalt: bester Gesamtvorschlag, dazu wenn möglich die beste Variante,
  // bei der nur EIN Teil getauscht wird – und nie zweimal dasselbe Bit oder derselbe Ratchet.
  out.sort((a, b) => b.rank - a.rank);
  const picked: typeof out = [];
  const usedBits = new Set<string>();
  const usedRatchets = new Set<string>();
  const take = (x: (typeof out)[number] | undefined) => {
    if (!x || picked.includes(x) || picked.length >= limit) return;
    picked.push(x);
    usedBits.add(x.item.combo.bitId);
    if (x.item.combo.ratchetId !== combo.ratchetId)
      usedRatchets.add(x.item.combo.ratchetId ?? "");
  };
  const fresh = (x: (typeof out)[number]) =>
    !usedBits.has(x.item.combo.bitId) &&
    (x.item.combo.ratchetId === combo.ratchetId ||
      !usedRatchets.has(x.item.combo.ratchetId ?? ""));
  const onlyBit = (x: (typeof out)[number]) =>
    x.item.combo.ratchetId === combo.ratchetId;
  const onlyRatchet = (x: (typeof out)[number]) =>
    x.item.combo.bitId === combo.bitId;
  take(out[0]);
  take(out.find((x) => onlyBit(x) && fresh(x) && x.rank > 0));
  take(out.find((x) => onlyRatchet(x) && fresh(x) && x.rank > 0));
  for (const x of out) if (fresh(x)) take(x);
  return picked.sort((a, b) => b.rank - a.rank).map((x) => x.item);
}
