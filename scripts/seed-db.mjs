// Erzeugt public/data/db.json aus einer gut lesbaren Kurzform.
// Nur einmal bzw. bei manueller Pflege ausführen: node scripts/seed-db.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const B = (id, line, type, spin, verified, extra = {}) => ({ id, name: id.replace(/([a-z])([A-Z])/g, '$1 $2'), line, type, spin, verified, ...extra });

const blades = [
  B('DranSword', 'BX', 'attack', 'right', true),
  B('HellsScythe', 'BX', 'balance', 'right', true),
  B('WizardArrow', 'BX', 'stamina', 'right', true),
  B('KnightShield', 'BX', 'defense', 'right', true),
  B('KnightLance', 'BX', 'defense', 'right', true),
  B('SharkEdge', 'BX', 'attack', 'right', true),
  B('LeonClaw', 'BX', 'balance', 'right', true),
  B('ViperTail', 'BX', 'stamina', 'right', false),
  B('RhinoHorn', 'BX', 'defense', 'right', true),
  B('DranDagger', 'BX', 'attack', 'right', true, { hasbroName: 'Dagger Dran' }),
  B('HellsChain', 'BX', 'balance', 'right', true),
  B('PhoenixWing', 'BX', 'attack', 'right', true),
  B('WyvernGale', 'BX', 'stamina', 'right', false),
  B('UnicornSting', 'BX', 'balance', 'right', true, { hasbroName: 'Sting Unicorn' }),
  B('SphinxCowl', 'BX', 'defense', 'right', true, { hasbroName: 'Cowl Sphinx' }),
  B('TyrannoBeat', 'BX', 'attack', 'right', false),
  B('CobaltDragoon', 'BX', 'attack', 'left', true),
  B('CrimsonGaruda', 'BX', 'balance', 'right', false),
  B('DranStrike', 'BX', 'attack', 'right', false),
  B('LusterDragoon', 'BX', 'attack', 'left', false, { note: 'Neuheit – Typ und Drehrichtung noch nicht bestätigt.' }),
  B('AeroPegasus', 'BX', 'attack', 'right', false),
  B('StormPegasus', 'BX', 'attack', 'right', false, { name: 'Storm Pegasis', note: 'Limitierte Neuauflage des Metal-Fight-Klassikers für Beyblade X.', wikiTitle: 'StormPegasis 3-70RA' }),
  B('DranBuster', 'UX', 'attack', 'right', true, { note: 'Große Angriffsklinge mit viel Metall am Außenrand für wuchtige Sofort-Treffer.' }),
  B('HellsHammer', 'UX', 'balance', 'right', true, { note: 'Dicke Smash-Klingen und Metall am Außenrand, gebaut um Gegner gegen die Stadionwand zu schmettern.' }),
  B('WizardRod', 'UX', 'stamina', 'right', true, { note: 'Großer Durchmesser mit Schwerpunkt weit außen und Metall am Rand – für lange Ausdauer.' }),
  B('LeonCrest', 'UX', 'balance', 'right', false, { note: 'Steile, wandartige Klingen und Metall am Außenrand, die Angriffe aus jeder Richtung abprallen lassen.' }),
  B('SamuraiSaber', 'UX', 'attack', 'right', true, { note: 'Klingen-Vorsprünge fahren im Spin ein und aus.' }),
  B('SharkScale', 'UX', 'attack', 'right', false),
  B('ClockMirage', 'UX', 'stamina', 'right', true),
  B('BulletGriffon', 'UX', 'balance', 'right', false, { integratedRatchet: true, note: 'Spaltet sich im Kampf in Hauptkörper und „Bullet“.' }),
  B('GloryValkyrie', 'UX', 'attack', 'right', true, { integratedRatchet: true, hasbroName: 'Glory Valkerion', note: 'Nachfolger von ValkyrieVolt, Ratchet in die Blade integriert.' }),
  B('VanishLucifer', 'UX', 'defense', 'right', true, { integratedRatchet: true, note: 'Erscheint in Japan am 26.12.2026, ausfahrbare Verteidigungsschicht (Barrier-Gimmick).' }),
  B('DranBrave', 'CX', 'attack', 'right', true, { note: 'CX: Lock Chip + Main Blade + Assist Blade (S).' }),
  B('WizardArc', 'CX', 'stamina', 'right', true, { note: 'CX: Lock Chip + Main Blade + Assist Blade (R).' }),
  B('PerseusDark', 'CX', 'defense', 'right', false, { note: 'CX: Assist Blade (B).' }),
  B('KnightFortress', 'CX', 'defense', 'right', false, { note: 'CX: Assist Blade (GV).', wikiTitle: 'KnightFortress GV8-70UN' }),
];

const ratchetIds = ['0-70','0-80','1-60','1-70','1-80','2-60','2-70','2-80','3-60','3-70','3-80','3-85','4-50','4-55','4-60','4-70','4-80','5-60','5-70','5-80','6-60','6-70','6-80','7-60','7-70','7-80','8-70','9-60','9-65','9-70','9-80'];
const ratchets = ratchetIds.map((id) => {
  const [c, h] = id.split('-').map(Number);
  return { id, contacts: c === 0 ? null : c, heightMm: h / 10, ...(c === 0 ? { note: 'Sonderform ohne klassische Zacken.' } : {}) };
});

const T = (id, name, type, uncertain = false, note, extra = {}) => ({ id, name, type, ...(uncertain ? { uncertain } : {}), ...(note ? { note } : {}), ...extra });
const bits = [
  T('F', 'Flat', 'attack'), T('LF', 'Low Flat', 'attack'), T('GF', 'Gear Flat', 'attack'), T('FF', 'Free Flat', 'attack'),
  T('UF', 'Under Flat', 'attack', true), T('R', 'Rush', 'attack'), T('LR', 'Low Rush', 'attack'), T('RA', 'Rubber Accel', 'attack'),
  T('A', 'Accel', 'attack'), T('Q', 'Quake', 'attack'), T('C', 'Cyclone', 'attack'), T('V', 'Vortex', 'attack', true), T('J', 'Jolt', 'attack', true),
  T('T', 'Taper', 'balance'), T('HT', 'High Taper', 'balance'), T('P', 'Point', 'balance'), T('GP', 'Gear Point', 'balance'),
  T('TP', 'Trans Point', 'balance', true), T('U', 'Unite', 'balance'), T('E', 'Elevate', 'balance', true), T('H', 'Hexa', 'balance'), T('L', 'Level', 'balance'),
  T('B', 'Ball', 'stamina'), T('O', 'Orb', 'stamina'), T('LO', 'Low Orb', 'stamina'), T('GB', 'Gear Ball', 'stamina'), T('DB', 'Disk Ball', 'stamina'), T('FB', 'Free Ball', 'stamina'),
  T('N', 'Needle', 'defense'), T('HN', 'High Needle', 'defense'), T('GN', 'Gear Needle', 'defense'), T('UN', 'Under Needle', 'defense'),
  T('S', 'Spike', 'defense'), T('D', 'Dot', 'defense'), T('BS', 'Bound Spike', 'defense'), T('W', 'Wedge', 'defense', true), T('WW', 'Wall Wedge', 'defense', false, 'Gehört zu Vanish Lucifer.'),
  T('LC', 'Low Cyclone', 'attack', false, 'Neues Bit von Luster Dragoon (BX-52), Release 10.10.2026.', { wikiTitle: 'Bit - Low Cyclone' }),
];

const P = (code, name, kind, verified, extra = {}) => ({ code, name, kind, verified, ...extra });
const bey = (bladeId, ratchetId, bitId) => ({ bladeId, ...(ratchetId ? { ratchetId } : {}), bitId });
const products = [
  P('BX-01', 'Starter DranSword 3-60F', 'starter', true, { ...bey('DranSword', '3-60', 'F'), includesLauncher: true }),
  P('BX-02', 'Starter HellsScythe 4-60T', 'starter', true, { ...bey('HellsScythe', '4-60', 'T'), includesLauncher: true }),
  P('BX-03', 'Starter WizardArrow 4-80B', 'starter', true, { ...bey('WizardArrow', '4-80', 'B'), includesLauncher: true }),
  P('BX-04', 'Starter KnightShield 3-80N', 'starter', true, { ...bey('KnightShield', '3-80', 'N'), includesLauncher: true }),
  P('BX-10', 'Xtreme Stadium', 'stadium', true),
  P('BX-13', 'Booster KnightLance 4-80HN', 'booster', true, bey('KnightLance', '4-80', 'HN')),
  P('BX-14', 'Random Booster Vol.1 SharkEdge 3-60LF', 'random-booster', true, bey('SharkEdge', '3-60', 'LF')),
  P('BX-15', 'Starter LeonClaw 5-60P', 'starter', true, { ...bey('LeonClaw', '5-60', 'P'), includesLauncher: true }),
  P('BX-16', 'Random Booster ViperTail Select 5-80O', 'random-booster', false, bey('ViperTail', '5-80', 'O')),
  P('BX-23', 'Starter PhoenixWing 9-60GF', 'starter', true, { ...bey('PhoenixWing', '9-60', 'GF'), includesLauncher: true }),
  P('BX-34', 'Starter CobaltDragoon 2-60C', 'starter', true, { ...bey('CobaltDragoon', '2-60', 'C'), includesLauncher: true, note: 'Linksdreher – Launcher für Linksdrehung beiliegend.' }),
  P('BX-37', 'Double Xtreme Stadium Set', 'set', true, { includesLauncher: true, note: 'Motorisierte Mitte mit zweiter Zahnschiene, 3× AA.' }),
  P('BX-38', 'Booster CrimsonGaruda 4-70TP', 'booster', false, bey('CrimsonGaruda', '4-70', 'TP')),
  P('BX-49', 'DranStrike 4-50FF', 'booster', true, bey('DranStrike', '4-50', 'FF')),
  P('BX-52', 'Starter LusterDragoon 6-60LC', 'starter', true, { ...bey('LusterDragoon', '6-60', 'LC'), includesLauncher: true }),
  P('UX-01', 'Starter DranBuster 1-60A', 'starter', true, { ...bey('DranBuster', '1-60', 'A'), includesLauncher: true }),
  P('UX-02', 'Starter HellsHammer 3-70H', 'starter', true, { ...bey('HellsHammer', '3-70', 'H'), includesLauncher: true }),
  P('UX-03', 'Booster WizardRod 5-70DB', 'booster', true, bey('WizardRod', '5-70', 'DB')),
  P('UX-06', 'Booster LeonCrest 7-60GN', 'booster', false, bey('LeonCrest', '7-60', 'GN')),
  P('UX-09', 'Starter SamuraiSaber 2-70L', 'starter', true, { ...bey('SamuraiSaber', '2-70', 'L'), includesLauncher: true, weightG: 45.6 }),
  P('UX-15', 'Set SharkScale 4-50UF', 'set', false, { ...bey('SharkScale', '4-50', 'UF'), note: 'Deck Set mit Tyranno Roar 1-70L und Hells Brave J3-60GF.' }),
  P('UX-16', 'Random Booster ClockMirage', 'random-booster', true, { bladeId: 'ClockMirage', note: 'Inhalt zufällig.' }),
  P('UX-19', 'Starter BulletGriffon H', 'starter', true, { ...bey('BulletGriffon', undefined, 'H'), includesLauncher: true }),
  P('UX-20', 'Starter GloryValkyrie LF', 'starter', true, { ...bey('GloryValkyrie', undefined, 'LF'), includesLauncher: true, weightG: 45.4, hasbroName: 'Glory Valkerion LF' }),
  P('UX-22', 'Starter VanishLucifer WW', 'starter', true, { ...bey('VanishLucifer', undefined, 'WW'), includesLauncher: true, note: 'Japan-Release 26.12.2026.' }),
  P('CX-01', 'Starter DranBrave S6-60V', 'starter', true, { ...bey('DranBrave', '6-60', 'V'), includesLauncher: true }),
  P('CX-02', 'Starter WizardArc R4-55LO', 'starter', true, { ...bey('WizardArc', '4-55', 'LO'), includesLauncher: true }),
  P('CX-14', 'KnightFortress GV8-70UN', 'booster', false, bey('KnightFortress', '8-70', 'UN')),
  P('BX-00-SP', 'Starter Storm Pegasis 3-70RA', 'starter', false, { ...bey('StormPegasus', '3-70', 'RA'), includesLauncher: true, rarity: 'limited', note: 'Limitierte BX-00-Version.' }),
  P('UX-00-GVMC', 'Starter Glory Valkyrie LF Metal Coat: Blue', 'starter', true, { ...bey('GloryValkyrie', undefined, 'LF'), includesLauncher: true, rarity: 'limited', note: 'Event-Limited, erschienen am 29.08.2026 für Xtreme-Gear-Sports-Events.' }),
];

// Lesbare Produktnamen: „Starter DranSword 3-60F“ → „Starter Dran Sword 3-60F“.
for (const p of products) {
  const b = blades.find((x) => x.id === p.bladeId);
  if (b && b.name !== b.id) p.name = p.name.replace(new RegExp(`\\b${b.id}\\b`), b.name);
}

// Vom Katalog-Import (scripts/import-catalog.mjs) ergänzte Einträge bleiben erhalten,
// solange sie hier nicht von Hand gepflegt werden.
const dbUrl = new URL('../public/data/db.json', import.meta.url);
if (existsSync(dbUrl)) {
  const old = JSON.parse(readFileSync(dbUrl, 'utf8'));
  const keep = (list, mine, key) => {
    const have = new Set(mine.map((x) => x[key]));
    for (const x of list ?? []) if (x.imported && !have.has(x[key])) mine.push(x);
  };
  keep(old.blades, blades, 'id');
  keep(old.ratchets, ratchets, 'id');
  keep(old.bits, bits, 'id');
  keep(old.products, products, 'code');
  // Gewichte (update-weights.mjs) und Hasbro-Namen (update-hasbro.mjs) behalten.
  for (const b of blades) {
    const o = old.blades?.find((x) => x.id === b.id);
    if (o && o.weightG !== undefined && b.weightG === undefined) b.weightG = o.weightG;
    if (o?.hasbroName && !b.hasbroName) {
      b.hasbroName = o.hasbroName;
      if (o.hasbroNameAuto) b.hasbroNameAuto = true;
    }
  }
  // Von scripts/verify-catalog.mjs bestätigte Einträge bleiben bestätigt.
  for (const b of blades) if (!b.verified && old.blades?.find((x) => x.id === b.id)?.verified) b.verified = true;
  for (const b of bits) {
    const o = old.bits?.find((x) => x.id === b.id);
    if (b.uncertain && o && !o.uncertain) {
      delete b.uncertain;
      b.type = o.type;
    }
  }
  for (const p of products) if (!p.verified && old.products?.find((x) => x.code === p.code)?.verified) p.verified = true;
  for (const p of products) {
    const o = old.products?.find((x) => x.code === p.code);
    if (o?.released === true) p.released = true; // Release-Bestätigung (Freigabestatus) nie verlieren
    if (o?.releaseJp && !p.releaseJp) p.releaseJp = o.releaseJp;
  }
  // Vom Import ermittelte Japan-Preise auch bei gepflegten Produkten behalten.
  for (const p of products) {
    const o = old.products?.find((x) => x.code === p.code);
    if (o && o.priceJpy !== undefined && p.priceJpy === undefined) p.priceJpy = o.priceJpy;
  }
}

const db = { version: 1, updatedAt: new Date().toISOString().slice(0, 10), blades, ratchets, bits, products };
writeFileSync(dbUrl, JSON.stringify(db, null, 2) + '\n');
const newsUrl = new URL('../public/data/news.json', import.meta.url);
if (!existsSync(newsUrl)) writeFileSync(newsUrl, JSON.stringify({ updatedAt: null, lastRunOk: true, items: [] }, null, 2) + '\n');
console.log(`db.json: ${blades.length} Blades, ${ratchets.length} Ratchets, ${bits.length} Bits, ${products.length} Produkte`);
