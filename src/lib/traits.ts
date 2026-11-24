import { tr, NUM_LOCALE, trData } from './i18n';
import type { Blade, Database, MetaFeed } from "./types";
import { comboName, META_SEEN, META_TOP, metaUsage, pct } from "./metaUsage";
import { otherName } from "./names";

/** Symbol der Eigenschaft – die Darstellung (SVG-Icon) wählt die Oberfläche. */
export type TraitIcon = "meta" | "custom" | "gimmick" | "ratchet" | "left" | "both" | "heavy" | "light" | "names";

export interface Trait {
  icon: TraitIcon;
  title: string;
  text: string;
  /** hebt besonders wichtige Eigenschaften hervor */
  strong?: boolean;
}

/** Notizen, die nur Herkunft/Status beschreiben und keine Eigenschaft der Blade sind. */
const STATUS_NOTE =
  /^(Neuheit –|Aus der Hasbro-Produktliste|Erscheint in Japan am)/;

/**
 * Besonderheiten einer Blade fürs Lexikon: Gimmick aus den Daten, Bauweise (CX, integrierter Ratchet),
 * Drehrichtung, Gewicht und wie oft sie im Turnier gespielt wird. Nur, was aus den Daten belegt ist.
 */
export function bladeTraits(
  db: Database,
  blade: Blade,
  meta: MetaFeed | null,
  weightG?: number,
): Trait[] {
  const out: Trait[] = [];
  const note = blade.note?.trim() ?? "";

  // Turnier-Meta zuerst – das will man beim Kaufen am ehesten wissen
  const u = metaUsage(db, meta, "blade", blade.id);
  if (u && u.share >= META_SEEN) {
    out.push({
      icon: "meta",
      title: u.share >= META_TOP ? tr('Top im Turnier') : tr('Im Turnier gespielt'),
      text: tr('Steckt in {0} von {1} Siegerdecks ({2}){3}.', u.decks, meta?.decksTotal, pct(u.share), u.top ? tr(', meist als {0}', comboName(db, u.top)) : ""),
      strong: u.share >= META_TOP,
    });
  }

  // Gimmick aus der Notiz (z. B. „Klingen-Vorsprünge fahren im Spin ein und aus.“)
  const cx = /^CX:\s*(.+?)\.?$/.exec(note);
  if (cx) {
    const assist = /Assist Blade \(([^)]+)\)/.exec(cx[1]!)?.[1];
    const full = /Lock Chip/.test(cx[1]!);
    out.push({
      icon: "custom",
      title: tr('Custom Line – zusammensteckbar'),
      text: full
        ? tr('Besteht aus Lock Chip, Main Blade und Assist Blade{0}. Die Teile lassen sich mit anderen CX-Blades tauschen.', assist ? ` „${assist}“` : "")
        : tr('Mit Assist Blade{0}. Die Assist Blade lässt sich mit anderen CX-Blades tauschen und verändert Gewicht und Kontaktpunkte.', assist ? ` „${assist}“` : ""),
    });
  } else if (note && !STATUS_NOTE.test(note)) {
    const barrier = /\(([^)]*Gimmick[^)]*)\)/.exec(note)?.[1];
    out.push({
      icon: "gimmick",
      title: barrier ?? tr('Besonderheit'),
      // Gibt es die Notiz auf Englisch, steht sie dort schon als ganzer Satz – sonst die deutsche, etwas gekürzt
      text: trData(note) !== note ? trData(note) : note
        .replace(/^Erscheint in Japan am [^,]+,\s*/, "")
        .replace(
          blade.integratedRatchet
            ? /,?\s*Ratchet in die Blade integriert/
            : /$^/,
          "",
        )
        .replace(/^./, (c) => c.toUpperCase()),
    });
  }

  if (blade.integratedRatchet) {
    out.push({
      icon: "ratchet",
      title: tr('Ratchet integriert'),
      text: tr('Der Ratchet ist fest in der Blade verbaut – du kombinierst nur noch das Bit.'),
    });
  }
  if (blade.spin === "left") {
    out.push({
      icon: "left",
      title: tr('Linksdreher'),
      text: tr('Dreht gegen den Uhrzeigersinn. Gegen Rechtsdreher reiben sich die Kreisel gegenseitig Spin ab – das kann Ausdauer-Gegner ausbremsen. Braucht einen Launcher für Linksdrehung.'),
      strong: true,
    });
  } else if (blade.spin === "both") {
    out.push({
      icon: "both",
      title: tr('Beide Drehrichtungen'),
      text: tr('Kann links oder rechts gestartet werden – du passt dich dem Gegner an.'),
    });
  }
  if (typeof weightG === "number") {
    if (weightG >= 38)
      out.push({
        icon: "heavy",
        title: tr('Schwergewicht'),
        text: tr('{0} g – viel Schwung, gut für Ausdauer und Konter.', weightG.toLocaleString(NUM_LOCALE)),
      });
    else if (weightG <= 32)
      out.push({
        icon: "light",
        title: tr('Leichtgewicht'),
        text: tr('{0} g – wendig, verliert aber schneller Schwung.', weightG.toLocaleString(NUM_LOCALE)),
      });
  }
  if (otherName(blade) && blade.hasbroName) {
    out.push({
      icon: "names",
      title: tr('Zwei Namen'),
      text: tr('In Japan heißt sie „{0}“, bei Hasbro „{1}“ – es ist dieselbe Blade.', blade.name, blade.hasbroName),
    });
  }
  return out;
}
