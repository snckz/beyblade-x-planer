// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error – JS-Modul ohne Typen
import { buildMeta, htmlToLines, parseCombo, parseDecks, run } from '../scripts/update-meta.mjs';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8'));

const event = (name: string, date: string, combos: string[]) =>
  `<div class="ev"><a href="/t">${name}</a><span>${date}</span><ul>${combos.map((c) => `<li><a href="/combo/x">${c}</a></li>`).join('')}</ul><a href="https://leagues.worldbeyblade.org/x">Source ↗</a></div>`;

const HTML =
  '<html><body><h2>Source tournaments</h2>' +
  event('Lappland&#x27;s Curio Cavern Clash 3!', 'Nov 10, 2026', ['Aero Pegasus 1-50R', 'Shark Scale 1-70LR', 'Wizard Rod 1-60H', 'Shark Scale 9-60Nr']) +
  event('InBEYsion Weekly November 9th', 'Nov 9, 2026', ['Glory Valkyrie K', 'Wizard Rod 1-60H', 'Shark Scale 7-60R']) +
  event('Money Monday #14', 'Nov 9, 2026', ['Shark Scale 7-60T', 'Wizard Rod 1-60H', 'Aero Pegasus 1-50LR']) +
  event('Bad Machines #11', 'Nov 8, 2026', ['Bahamut Blitz Break Heavy 1-50LR', 'Silver Wolf 9-60FB', 'Shark Scale 1-60Nr']) +
  event('Sweaty Sundays #10', 'Nov 8, 2026', ['Aero Pegasus 1-50R', 'Wizard Rod 1-60H', 'Emperor Delta Peak Heavy 9-60FB']) +
  event('Weekly A', 'Nov 7, 2026', ['Hover Wyvern 7-70K', 'Wizard Rod 1-60H', 'Shark Scale 1-70LR']) +
  event('Weekly B', 'Nov 6, 2026', ['Storm Pegasis 1-50R', 'Wizard Rod 1-60H', 'Shark Scale 1-70LR']) +
  event('Weekly C', 'Nov 5, 2026', ['Cobalt Dragoon 5-60E', 'Wizard Rod 1-60FB', 'Shark Scale 1-70LR']) +
  // Dieselben Daten tauchen auf der Seite ein zweites Mal auf
  event('Weekly C', 'Nov 5, 2026', ['Cobalt Dragoon 5-60E', 'Wizard Rod 1-60FB', 'Shark Scale 1-70LR']) +
  '</body></html>';

describe('update-meta', () => {
  it('ordnet Community-Schreibweisen den Teilen zu', () => {
    expect(parseCombo('Wizard Rod 1-60H', db)).toEqual({ bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H' });
    expect(parseCombo('Hover Wyvern 7-70K', db)?.bladeId).toBe('WyvernHover');
    expect(parseCombo('Storm Pegasis 1-50R', db)?.bladeId).toBe('StormPegasus');
    expect(parseCombo('Glory Valkyrie K', db)).toEqual({ bladeId: 'GloryValkyrie', ratchetId: null, bitId: 'K' });
    expect(parseCombo('Bahamut Blitz Break Heavy 1-50LR', db)?.bladeId).toBe('BahamutBlitz');
    expect(parseCombo('Wizard Rod H', db)).toBeNull(); // Ratchet fehlt
    expect(parseCombo('Unbekannt Blade 3-60F', db)).toBeNull();
  });
  it('liest Siegerdecks und baut eine gültige Meta-Liste', () => {
    const decks = parseDecks(htmlToLines(HTML), db);
    expect(decks).toHaveLength(8);
    expect(decks[0].event).toBe("Lappland's Curio Cavern Clash 3!");
    expect(decks[4].unknown).toBe(1);
    const meta = buildMeta(decks, null, { today: '2026-11-14', source: 'https://beywatch.gg/meta/november-2026' });
    expect(meta.combos[0]).toMatchObject({ bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H', trend: 'top' });
    expect(meta.combos[1]).toMatchObject({ bladeId: 'SharkScale', ratchetId: '1-70', bitId: 'LR' });
    expect(meta.decks.every((d: { combos: unknown[] }) => d.combos.length === 3)).toBe(true);
    expect(meta.decks.some((d: { event: string }) => d.event === 'Sweaty Sundays #10')).toBe(false);
  });
  it('aktualisiert höchstens wöchentlich und behält meta.json bei zu wenig Daten', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'meta-'));
    copyFileSync(new URL('../public/data/db.json', import.meta.url), join(dir, 'db.json'));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ updatedAt: '2026-11-09', auto: false, note: '', sources: [], combos: [], decks: [] }));
    const ok = async () => ({ ok: true, status: 200, text: async () => HTML });
    const url = pathToFileURL(dir + '/');
    expect((await run({ fetchFn: ok, dataDir: url, now: new Date('2026-11-14T06:00:00Z') })).changed).toBe(true);
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(meta.auto).toBe(true);
    // 3 Tage später: noch keine neue Runde
    expect((await run({ fetchFn: ok, dataDir: url, now: new Date('2026-11-17T06:00:00Z') })).changed).toBe(false);
    // Kaputte Seite → bleibt
    const bad = async () => ({ ok: true, status: 200, text: async () => '<html>Wartung</html>' });
    expect((await run({ fetchFn: bad, dataDir: url, now: new Date('2026-11-30T06:00:00Z') })).changed).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')).updatedAt).toBe('2026-11-14');
  });
});
