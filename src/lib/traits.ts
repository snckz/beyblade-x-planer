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
      title: u.share >= META_TOP ? "Top im Turnier" : "Im Turnier gespielt",
      text: `Steckt in ${u.decks} von ${meta?.decksTotal} Siegerdecks (${pct(u.share)})${u.top ? `, meist als ${comboName(db, u.top)}` : ""}.`,
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
      title: "Custom Line – zusammensteckbar",
      text: full
        ? `Besteht aus Lock Chip, Main Blade und Assist Blade${assist ? ` „${assist}“` : ""}. Die Teile lassen sich mit anderen CX-Blades tauschen.`
        : `Mit Assist Blade${assist ? ` „${assist}“` : ""}. Die Assist Blade lässt sich mit anderen CX-Blades tauschen und verändert Gewicht und Kontaktpunkte.`,
    });
  } else if (note && !STATUS_NOTE.test(note)) {
    const barrier = /\(([^)]*Gimmick[^)]*)\)/.exec(note)?.[1];
    out.push({
      icon: "gimmick",
      title: barrier ?? "Besonderheit",
      text: note
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
      title: "Ratchet integriert",
      text: "Der Ratchet ist fest in der Blade verbaut – du kombinierst nur noch das Bit.",
    });
  }
  if (blade.spin === "left") {
    out.push({
      icon: "left",
      title: "Linksdreher",
      text: "Dreht gegen den Uhrzeigersinn. Gegen Rechtsdreher reiben sich die Kreisel gegenseitig Spin ab – das kann Ausdauer-Gegner ausbremsen. Braucht einen Launcher für Linksdrehung.",
      strong: true,
    });
  } else if (blade.spin === "both") {
    out.push({
      icon: "both",
      title: "Beide Drehrichtungen",
      text: "Kann links oder rechts gestartet werden – du passt dich dem Gegner an.",
    });
  }
  if (typeof weightG === "number") {
    if (weightG >= 38)
      out.push({
        icon: "heavy",
        title: "Schwergewicht",
        text: `${weightG.toLocaleString("de-DE")} g – viel Schwung, gut für Ausdauer und Konter.`,
      });
    else if (weightG <= 32)
      out.push({
        icon: "light",
        title: "Leichtgewicht",
        text: `${weightG.toLocaleString("de-DE")} g – wendig, verliert aber schneller Schwung.`,
      });
  }
  if (otherName(blade) && blade.hasbroName) {
    out.push({
      icon: "names",
      title: "Zwei Namen",
      text: `In Japan heißt sie „${blade.name}“, bei Hasbro „${blade.hasbroName}“ – es ist dieselbe Blade.`,
    });
  }
  return out;
}
