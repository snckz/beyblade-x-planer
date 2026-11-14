import { displayName } from './names';
import type { BeyType, Blade, Bit, Combo, Database, Ratchet } from './types';

export const TYPE_LABEL: Record<BeyType, string> = {
  attack: 'Attack',
  defense: 'Defense',
  stamina: 'Stamina',
  balance: 'Balance',
};

export const TYPE_HINT: Record<BeyType, string> = {
  attack: 'Aggressiv, sucht den Treffer und will Xtreme- oder Burst-Finishes.',
  defense: 'Steht stabil in der Mitte und hält Angriffe aus.',
  stamina: 'Dreht möglichst lange und gewinnt nach Spin-Zeit.',
  balance: 'Vielseitig, Mischung aus Angriff und Ausdauer.',
};

export interface Resolved {
  blade: Blade;
  ratchet?: Ratchet;
  bit: Bit;
}

export interface Analysis {
  /** Kurzname wie „DranSword 3-60F“ */
  label: string;
  type: BeyType;
  heightMm: number | null;
  /** Richtwerte 0–100, keine gemessenen Werte */
  profile: { attack: number; stamina: number; defense: number; burstResistance: number };
  warnings: string[];
  tips: string[];
  valid: boolean;
}

export function parseRatchet(id: string): Ratchet | null {
  const m = /^(\d)-(\d{2})$/.exec(id.trim());
  if (!m) return null;
  const c = Number(m[1]);
  return { id: `${m[1]}-${m[2]}`, contacts: c === 0 ? null : c, heightMm: Number(m[2]) / 10 };
}

export function resolveCombo(db: Database, combo: Combo): Resolved | null {
  const blade = db.blades.find((b) => b.id === combo.bladeId);
  const bit = db.bits.find((b) => b.id === combo.bitId);
  if (!blade || !bit) return null;
  const ratchet = combo.ratchetId
    ? (db.ratchets.find((r) => r.id === combo.ratchetId) ?? parseRatchet(combo.ratchetId) ?? undefined)
    : undefined;
  return { blade, ratchet, bit };
}

/** Verhindert Zeilenumbruch in „2-60C“ (geschützter Bindestrich, nur für die Anzeige). */
export function nb(label: string): string {
  return label.replace(/-/g, '\u2011');
}

export function comboLabel(r: Resolved): string {
  return `${displayName(r.blade).replace(/ /g, '')} ${r.ratchet ? r.ratchet.id : ''}${r.bit.id}`.replace(/\s+/g, ' ').trim();
}

const BASE: Record<BeyType, { attack: number; stamina: number; defense: number }> = {
  attack: { attack: 80, stamina: 30, defense: 35 },
  defense: { attack: 30, stamina: 50, defense: 80 },
  stamina: { attack: 25, stamina: 85, defense: 45 },
  balance: { attack: 55, stamina: 55, defense: 55 },
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Leitet einen Kombo-Typ ab: Das Bit bestimmt das Verhalten am stärksten. */
export function deriveType(blade: Blade, bit: Bit): BeyType {
  if (blade.type === bit.type) return bit.type;
  if (bit.type === 'balance') return blade.type;
  return bit.type;
}

export function analyze(r: Resolved): Analysis {
  const warnings: string[] = [];
  const tips: string[] = [];
  let valid = true;

  if (r.blade.integratedRatchet && r.ratchet) {
    warnings.push(`${r.blade.name} hat einen integrierten Ratchet – ein zusätzlicher Ratchet passt nicht.`);
    valid = false;
  }
  if (!r.blade.integratedRatchet && !r.ratchet) {
    warnings.push('Ratchet fehlt: Diese Blade braucht einen Ratchet zwischen Blade und Bit.');
    valid = false;
  }

  const type = deriveType(r.blade, r.bit);
  const base = BASE[type];
  const bladeBase = BASE[r.blade.type];
  const bitBase = BASE[r.bit.type];
  // Blade und Bit tragen je etwa zur Hälfte bei; Kombi-Typ gibt die Richtung vor.
  let attack = (bladeBase.attack + bitBase.attack + base.attack) / 3;
  let stamina = (bladeBase.stamina + bitBase.stamina + base.stamina) / 3;
  let defense = (bladeBase.defense + bitBase.defense + base.defense) / 3;
  let burst = 60;

  // Echtes Blade-Gewicht (Wiki): mehr Masse = mehr Schwung für Ausdauer, Stand und Treffer. Mittel ca. 35 g.
  const w = r.blade.weightG;
  if (typeof w === 'number' && w > 0) {
    const f = Math.max(-1, Math.min(1, (w - 35) / 6));
    stamina += f * 10;
    defense += f * 9;
    attack += f * 5;
    if (w >= 38) tips.push(`Schwere Blade (${w.toLocaleString('de-DE')} g): viel Schwung – gut für Ausdauer und Konter.`);
    else if (w <= 32) tips.push(`Leichte Blade (${w.toLocaleString('de-DE')} g): verliert schneller Schwung, dafür wendiger.`);
  }

  const h = r.ratchet?.heightMm ?? null;
  const contacts = r.ratchet?.contacts ?? null;
  if (h !== null) {
    if (h <= 5.0) {
      defense += 5;
      burst += 5;
      tips.push('Niedriger Ratchet: tiefer Schwerpunkt, trifft Gegner eher von unten.');
    } else if (h >= 8.0) {
      attack -= 5;
      burst -= 5;
      tips.push('Hoher Ratchet: kann über niedrige Gegner hinwegtreffen, ist aber anfälliger.');
    }
  }
  if (contacts !== null) {
    burst += (contacts - 4) * 4;
    if (contacts >= 7) tips.push('Viele Zacken: der Ratchet löst sich schwerer, also mehr Burst-Schutz.');
    if (contacts <= 2) warnings.push('Wenige Zacken: erhöhtes Burst-Risiko bei harten Treffern.');
  }
  if (r.blade.spin === 'left') {
    tips.push('Linksdreher: Starte mit einem Launcher für Linksdrehung. Gegen Rechtsdreher klaut er Spin durch Gegendrehung.');
  }
  if (type === 'attack' && r.bit.type !== 'attack') {
    tips.push('Für mehr X-Dash-Speed ein flaches Attack-Bit wie F, LF oder R probieren.');
  }
  if (r.blade.type === 'stamina' && r.bit.type === 'attack') {
    warnings.push('Stamina-Blade mit Attack-Bit: wird schnell müde, eher als Überraschungs-Kombo geeignet.');
  }
  if (r.bit.uncertain) warnings.push(`Typ von Bit „${r.bit.id}“ ist noch nicht bestätigt.`);
  if (!r.blade.verified) warnings.push(`Daten zu ${r.blade.name} sind noch nicht geprüft.`);

  return {
    label: comboLabel(r),
    type,
    heightMm: h,
    profile: { attack: clamp(attack), stamina: clamp(stamina), defense: clamp(defense), burstResistance: clamp(burst) },
    warnings,
    tips,
    valid,
  };
}

export interface DeckCheck {
  ok: boolean;
  problems: string[];
  types: BeyType[];
}

/** Turnier-Faustregel: 3 Kreisel, keine Blade/kein Ratchet/kein Bit doppelt. */
export function checkDeck(db: Database, combos: Combo[]): DeckCheck {
  const problems: string[] = [];
  if (combos.length !== 3) problems.push(`Ein Deck hat genau 3 Kreisel (aktuell ${combos.length}).`);
  const resolved = combos.map((c) => resolveCombo(db, c));
  if (resolved.some((r) => r === null)) problems.push('Mindestens ein Kreisel enthält unbekannte Teile.');
  const ok = resolved.filter((r): r is Resolved => r !== null);
  const dup = (vals: (string | undefined)[], label: string) => {
    const seen = new Set<string>();
    for (const v of vals) {
      if (!v) continue;
      if (seen.has(v)) problems.push(`${label} „${v}“ ist doppelt – im Turnier nicht erlaubt.`);
      seen.add(v);
    }
  };
  dup(ok.map((r) => r.blade.id), 'Blade');
  dup(ok.map((r) => r.ratchet?.id), 'Ratchet');
  dup(ok.map((r) => r.bit.id), 'Bit');
  for (const r of ok) {
    const a = analyze(r);
    if (!a.valid) problems.push(`${a.label}: ${a.warnings[0]}`);
  }
  return { ok: problems.length === 0, problems, types: ok.map((r) => deriveType(r.blade, r.bit)) };
}
