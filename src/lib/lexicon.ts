import type { Bit, Ratchet } from './types';
import { TYPE_LABEL } from './analysis';

/** Kurze Erklärungen zu den Bits (eigene Formulierungen). */
const BIT_TEXT: Record<string, string> = {
  F: 'Breite, flache Spitze mit viel Grip. Rast schnell über das Stadium und nutzt die Xtreme Line für harte X-Dashes.',
  LF: 'Wie Flat, nur niedriger. Der tiefere Schwerpunkt lässt den Kreisel Gegner von unten treffen.',
  GF: 'Flache Spitze mit Zahnrad-Rand. Greift besonders gut in die Xtreme Line und beschleunigt stark.',
  FF: 'Flache Angriffsspitze für schnelle, aggressive Bewegungen.',
  UF: 'Flache Angriffsspitze aus der UX-Linie für niedrige, aggressive Kombos.',
  R: 'Schmalere flache Spitze. Aggressiv, aber kontrollierter als Flat – fliegt seltener selbst aus dem Stadium.',
  LR: 'Niedrige Variante von Rush für Angriffe aus tiefer Position.',
  RA: 'Gummi-Spitze mit extrem viel Grip. Sehr schnell und wild, nutzt sich aber mit der Zeit ab.',
  A: 'Breite Angriffsspitze für schnelle, weite Bewegungen.',
  Q: 'Unregelmäßig geformte Spitze. Der Kreisel springt und ändert ständig die Richtung – schwer berechenbar.',
  C: 'Aggressive Spitze, die den Kreisel in schnellen Kreisen durchs Stadium treibt.',
  V: 'Angriffsspitze der CX-Linie für schnelle Bewegungen.',
  J: 'Angriffsspitze mit ruckartiger Bewegung.',
  T: 'Kegel mit kleiner flacher Kuppe. Steht ruhig, wird aber aggressiver, sobald er sich neigt.',
  HT: 'Höhere Taper-Spitze – gleiches Verhalten, aber höherer Kreisel.',
  P: 'Spitzer Kegel mit winziger Fläche. Mischung aus ruhigem Stand und etwas Bewegung.',
  GP: 'Point mit Zahnrad-Rand: steht meist ruhig, kann aber über die Xtreme Line beschleunigen.',
  TP: 'Point-Variante für Balance-Kombos.',
  U: 'Balance-Spitze, die Stabilität und Beweglichkeit verbindet.',
  E: 'Balance-Spitze für wechselndes Verhalten.',
  H: 'Sechseckige Spitze. Ausgewogen zwischen Stand und Bewegung.',
  L: 'Balance-Spitze der UX-Linie.',
  B: 'Runde Kugel mit wenig Reibung. Dreht sehr lange und rollt immer wieder in die Mitte.',
  O: 'Flachere Kugel – stabiler als Ball, gute Ausdauer.',
  LO: 'Niedrige Orb-Spitze für tiefe Ausdauer-Kombos.',
  GB: 'Ball mit Zahnrad-Rand: Ausdauer, mit gelegentlichem X-Dash.',
  DB: 'Kugel mit Scheibe darüber. Die Scheibe fängt Taumeln ab – eine der besten Ausdauer-Spitzen.',
  FB: 'Frei drehende Kugel mit sehr wenig Reibung für maximale Drehzeit.',
  N: 'Dünne Spitze. Steht fast regungslos in der Mitte und ist schwer wegzuschieben.',
  HN: 'Höhere Needle – gleiche Standfestigkeit, höherer Kreisel.',
  GN: 'Needle mit Zahnrad-Rand: hält die Mitte, kann aber ausweichen.',
  UN: 'Defense-Spitze für niedrige, standfeste Kombos.',
  S: 'Kurze Spitze für Verteidigung.',
  D: 'Spitze mit Noppen. Rutscht kaum weg und hält ihre Position.',
  BS: 'Spike mit Federung. Federt Treffer ab, statt sie hart weiterzugeben.',
  W: 'Keilförmige Defense-Spitze.',
  WW: 'Breite Keil-Spitze von Vanish Lucifer für Verteidigung.',
};

export function bitText(bit: Bit): string {
  const base = BIT_TEXT[bit.id] ?? `${TYPE_LABEL[bit.type]}-Spitze.`;
  return bit.uncertain ? `${base} Details noch nicht geprüft.` : base;
}

export function ratchetText(r: Ratchet): string {
  if (r.contacts === null) return `Sonderform ohne klassische Zacken, ${r.heightMm?.toFixed(1)} mm hoch.`;
  const z = r.contacts >= 7 ? 'Viele Zacken: sehr guter Burst-Schutz.' : r.contacts <= 2 ? 'Wenige Zacken: große Trefferfläche, aber höheres Burst-Risiko.' : 'Mittlere Zackenzahl: ausgewogen.';
  const h = (r.heightMm ?? 0) <= 5.5 ? 'Niedrig: trifft Gegner von unten.' : (r.heightMm ?? 0) >= 8 ? 'Hoch: trifft über niedrige Gegner hinweg, ist aber anfälliger.' : 'Mittlere Höhe.';
  return `${r.contacts} Zacken, ${r.heightMm?.toFixed(1)} mm hoch. ${z} ${h}`;
}

export interface Term {
  term: string;
  text: string;
}

export const TERMS: Term[] = [
  { term: 'Blade', text: 'Der obere Teil mit den Klingen. Bestimmt, wie der Kreisel trifft und wie schwer er ist.' },
  { term: 'Ratchet', text: 'Das Mittelteil. Die erste Zahl ist die Anzahl der Zacken, die zweite die Höhe in Zehntel-Millimetern: „3-60“ = 3 Zacken, 6,0 mm.' },
  { term: 'Bit', text: 'Die Spitze unten. Sie entscheidet am meisten, wie sich der Kreisel bewegt – flach = Angriff, rund = Ausdauer, spitz = Verteidigung.' },
  { term: 'X-Dash', text: 'Das Zahnrad am Bit greift in die Zahnschiene am Stadionrand und schießt den Kreisel plötzlich nach vorne.' },
  { term: 'Xtreme Line', text: 'Die Zahnschiene am Rand des Xtreme Stadiums, die den X-Dash auslöst.' },
  { term: 'Xtreme Finish (3 Punkte)', text: 'Der Gegner fliegt in eine der Xtreme Zones (seitliche Taschen) des Stadiums.' },
  { term: 'Over Finish (2 Punkte)', text: 'Der Gegner fliegt in den Over-Bereich des Stadiums.' },
  { term: 'Burst Finish (2 Punkte)', text: 'Der Gegner zerfällt in seine Teile.' },
  { term: 'Spin Finish (1 Punkt)', text: 'Der Gegner hört zuerst auf zu drehen.' },
  { term: 'BX / UX / CX', text: 'Die drei Linien: Basic Line (Standard), Unique Line (Besonderheiten wie integrierter Ratchet) und Custom Line (Blade aus mehreren tauschbaren Teilen).' },
  { term: 'Integrierter Ratchet', text: 'Bei manchen UX-Blades wie Glory Valkyrie steckt der Ratchet schon in der Blade – dort kommt nur noch das Bit dran.' },
  { term: 'Linksdreher', text: 'Kreisel, die gegen den Uhrzeigersinn drehen. Gegen Rechtsdreher reiben sie aneinander und können Spin „klauen“. Brauchen einen Launcher für Linksdrehung.' },
  { term: 'Deck (3on3)', text: 'Im Turnier spielst du mit drei Kreiseln. Keine Blade, kein Ratchet und kein Bit darf doppelt vorkommen.' },
  { term: 'Starter / Booster', text: 'Starter enthalten Kreisel und Launcher, Booster nur den Kreisel. Random Booster haben zufälligen Inhalt.' },
  { term: 'Takara Tomy / Hasbro', text: 'Takara Tomy ist der japanische Hersteller, Hasbro der Lizenzpartner im Westen. Bei Beyblade X passen beide Teile zusammen.' },
];
