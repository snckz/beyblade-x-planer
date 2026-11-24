import { tr, NUM_LOCALE } from './i18n';
import type { Bit, Ratchet } from './types';
import { TYPE_LABEL } from './analysis';

/** Kurze Erklärungen zu den Bits (eigene Formulierungen). */
const BIT_TEXT: Record<string, string> = {
  F: tr('Breite, flache Spitze mit viel Grip. Rast schnell über das Stadium und nutzt die Xtreme Line für harte X-Dashes.'),
  LF: tr('Wie Flat, nur niedriger. Der tiefere Schwerpunkt lässt den Kreisel Gegner von unten treffen.'),
  GF: tr('Flache Spitze mit Zahnrad-Rand. Greift besonders gut in die Xtreme Line und beschleunigt stark.'),
  FF: tr('Flache Angriffsspitze für schnelle, aggressive Bewegungen.'),
  UF: tr('Flache Angriffsspitze aus der UX-Linie für niedrige, aggressive Kombos.'),
  R: tr('Schmalere flache Spitze. Aggressiv, aber kontrollierter als Flat – fliegt seltener selbst aus dem Stadium.'),
  LR: tr('Niedrige Variante von Rush für Angriffe aus tiefer Position.'),
  RA: tr('Gummi-Spitze mit extrem viel Grip. Sehr schnell und wild, nutzt sich aber mit der Zeit ab.'),
  A: tr('Breite Angriffsspitze für schnelle, weite Bewegungen.'),
  Q: tr('Unregelmäßig geformte Spitze. Der Kreisel springt und ändert ständig die Richtung – schwer berechenbar.'),
  C: tr('Aggressive Spitze, die den Kreisel in schnellen Kreisen durchs Stadium treibt.'),
  V: tr('Angriffsspitze der CX-Linie für schnelle Bewegungen.'),
  J: tr('Angriffsspitze mit ruckartiger Bewegung.'),
  T: tr('Kegel mit kleiner flacher Kuppe. Steht ruhig, wird aber aggressiver, sobald er sich neigt.'),
  HT: tr('Höhere Taper-Spitze – gleiches Verhalten, aber höherer Kreisel.'),
  P: tr('Spitzer Kegel mit winziger Fläche. Mischung aus ruhigem Stand und etwas Bewegung.'),
  GP: tr('Point mit Zahnrad-Rand: steht meist ruhig, kann aber über die Xtreme Line beschleunigen.'),
  TP: tr('Point-Variante für Balance-Kombos.'),
  U: tr('Balance-Spitze, die Stabilität und Beweglichkeit verbindet.'),
  E: tr('Balance-Spitze für wechselndes Verhalten.'),
  H: tr('Sechseckige Spitze. Ausgewogen zwischen Stand und Bewegung.'),
  L: tr('Balance-Spitze der UX-Linie.'),
  B: tr('Runde Kugel mit wenig Reibung. Dreht sehr lange und rollt immer wieder in die Mitte.'),
  O: tr('Flachere Kugel – stabiler als Ball, gute Ausdauer.'),
  LO: tr('Niedrige Orb-Spitze für tiefe Ausdauer-Kombos.'),
  GB: tr('Ball mit Zahnrad-Rand: Ausdauer, mit gelegentlichem X-Dash.'),
  DB: tr('Kugel mit Scheibe darüber. Die Scheibe fängt Taumeln ab – eine der besten Ausdauer-Spitzen.'),
  FB: tr('Frei drehende Kugel mit sehr wenig Reibung für maximale Drehzeit.'),
  N: tr('Dünne Spitze. Steht fast regungslos in der Mitte und ist schwer wegzuschieben.'),
  HN: tr('Höhere Needle – gleiche Standfestigkeit, höherer Kreisel.'),
  GN: tr('Needle mit Zahnrad-Rand: hält die Mitte, kann aber ausweichen.'),
  UN: tr('Defense-Spitze für niedrige, standfeste Kombos.'),
  S: tr('Kurze Spitze für Verteidigung.'),
  D: tr('Spitze mit Noppen. Rutscht kaum weg und hält ihre Position.'),
  BS: tr('Spike mit Federung. Federt Treffer ab, statt sie hart weiterzugeben.'),
  W: tr('Keilförmige Defense-Spitze.'),
  WW: tr('Breite Keil-Spitze von Vanish Lucifer für Verteidigung.'),
};

export function bitText(bit: Bit): string {
  const base = BIT_TEXT[bit.id] ?? tr('{0}-Spitze.', TYPE_LABEL[bit.type]);
  return bit.uncertain ? tr('{0} Details noch nicht geprüft.', base) : base;
}

/** Höhe in Millimetern mit Komma und einer Nachkommastelle („6,0“) */
const mm = (h: number | null | undefined) => (h == null ? '?' : h.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export function ratchetText(r: Ratchet): string {
  if (r.contacts === null) return tr('Sonderform ohne klassische Zacken, {0} mm hoch.', mm(r.heightMm));
  const z = r.contacts >= 7 ? tr('Viele Zacken: sehr guter Burst-Schutz.') : r.contacts <= 2 ? tr('Wenige Zacken: große Trefferfläche, aber höheres Burst-Risiko.') : tr('Mittlere Zackenzahl: ausgewogen.');
  const h = (r.heightMm ?? 0) <= 5.5 ? tr('Niedrig: trifft Gegner von unten.') : (r.heightMm ?? 0) >= 8 ? tr('Hoch: trifft über niedrige Gegner hinweg, ist aber anfälliger.') : tr('Mittlere Höhe.');
  return tr('{0} Zacken, {1} mm hoch. {2} {3}', r.contacts, mm(r.heightMm), z, h);
}

export interface Term {
  term: string;
  text: string;
}

export const TERMS: Term[] = [
  { term: 'Blade', text: tr('Der obere Teil mit den Klingen. Bestimmt, wie der Kreisel trifft und wie schwer er ist.') },
  { term: 'Ratchet', text: tr('Das Mittelteil. Die erste Zahl ist die Anzahl der Zacken, die zweite die Höhe in Zehntel-Millimetern: „3-60“ = 3 Zacken, 6,0 mm.') },
  { term: 'Bit', text: tr('Die Spitze unten. Sie entscheidet am meisten, wie sich der Kreisel bewegt – flach = Angriff, rund = Ausdauer, spitz = Verteidigung.') },
  { term: 'X-Dash', text: tr('Das Zahnrad am Bit greift in die Zahnschiene am Stadionrand und schießt den Kreisel plötzlich nach vorne.') },
  { term: 'Xtreme Line', text: tr('Die Zahnschiene am Rand des Xtreme Stadiums, die den X-Dash auslöst.') },
  { term: tr('Xtreme Finish (3 Punkte)'), text: tr('Der Gegner fliegt in eine der Xtreme Zones (seitliche Taschen) des Stadiums.') },
  { term: tr('Over Finish (2 Punkte)'), text: tr('Der Gegner fliegt in den Over-Bereich des Stadiums.') },
  { term: tr('Burst Finish (2 Punkte)'), text: tr('Der Gegner zerfällt in seine Teile.') },
  { term: tr('Spin Finish (1 Punkt)'), text: tr('Der Gegner hört zuerst auf zu drehen.') },
  { term: 'BX / UX / CX', text: tr('Die drei Linien: Basic Line (Standard), Unique Line (Besonderheiten wie integrierter Ratchet) und Custom Line (Blade aus mehreren tauschbaren Teilen).') },
  { term: tr('Integrierter Ratchet'), text: tr('Bei manchen UX-Blades wie Glory Valkyrie steckt der Ratchet schon in der Blade – dort kommt nur noch das Bit dran.') },
  { term: tr('Linksdreher'), text: tr('Kreisel, die gegen den Uhrzeigersinn drehen. Gegen Rechtsdreher reiben sie aneinander und können Spin „klauen“. Brauchen einen Launcher für Linksdrehung.') },
  { term: tr('Deck (3on3)'), text: tr('Im Turnier spielst du mit drei Kreiseln. Keine Blade, kein Ratchet und kein Bit darf doppelt vorkommen.') },
  { term: 'Starter / Booster', text: tr('Starter enthalten Kreisel und Launcher, Booster nur den Kreisel. Random Booster haben zufälligen Inhalt.') },
  { term: 'Takara Tomy / Hasbro', text: tr('Takara Tomy ist der japanische Hersteller, Hasbro der Lizenzpartner im Westen. Bei Beyblade X passen beide Teile zusammen.') },
];
