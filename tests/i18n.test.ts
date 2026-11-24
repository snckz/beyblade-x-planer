// @vitest-environment jsdom
// Sprache: Vollständigkeit des englischen Wörterbuchs, Platzhalter, die einmalige Frage und das Umschalten.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { EN, EN_DATA, EN_RULES } from '../src/lib/i18n.en';

const SRC = join(process.cwd(), 'src');

/** Alle `tr(…)`-Aufrufe im Quelltext: Texte und die Stellen, an denen kein fester Text steht */
function collect() {
  const keys = new Map<string, string>();
  const dynamic: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f) && !/i18n(\.en)?\.ts$/.test(f)) {
        const sf = ts.createSourceFile(p, readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const visit = (n: ts.Node) => {
          if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr') {
            const a = n.arguments[0];
            const where = `${relative(SRC, p)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
            if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) keys.set(a.text, where);
            else dynamic.push(where);
          }
          ts.forEachChild(n, visit);
        };
        visit(sf);
      }
    }
  };
  walk(SRC);
  return { keys, dynamic };
}

const holes = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
const edge = (s: string) => `${s.length - s.trimStart().length}/${s.length - s.trimEnd().length}`;

describe('Englisches Wörterbuch', () => {
  const { keys, dynamic } = collect();

  it('findet die Texte im Quelltext', () => {
    expect(keys.size).toBeGreaterThan(700);
  });

  it('tr() bekommt immer einen festen Text (sonst lässt er sich nicht übersetzen)', () => {
    expect(dynamic).toEqual([]);
  });

  it('hat für jeden Text einen Eintrag', () => {
    const missing = [...keys].filter(([k]) => !(k in EN)).map(([k, where]) => `${where}: ${k}`);
    expect(missing).toEqual([]);
  });

  it('enthält keine verwaisten Einträge', () => {
    expect(Object.keys(EN).filter((k) => !keys.has(k))).toEqual([]);
  });

  it('Platzhalter stimmen überein', () => {
    expect(Object.entries(EN).filter(([de, en]) => holes(de) !== holes(en)).map(([de]) => de)).toEqual([]);
    expect(Object.entries(EN_DATA).filter(([de, en]) => holes(de) !== holes(en))).toEqual([]);
  });

  it('Leerzeichen am Rand bleiben erhalten (Satzteile werden aneinandergesetzt)', () => {
    // „{Teil}-Auswahl“ wird englisch zu „{Teil} selection“ – dort gehört das Leerzeichen dazu.
    const ok = new Set(['-Auswahl']);
    expect(Object.entries(EN).filter(([de, en]) => !ok.has(de) && edge(de) !== edge(en)).map(([de]) => de)).toEqual([]);
  });

  it('kein Eintrag ist leer', () => {
    expect(Object.entries({ ...EN, ...EN_DATA }).filter(([, en]) => !en.trim()).map(([de]) => de)).toEqual([]);
  });

  it('die Muster für erzeugte Datentexte greifen', () => {
    const apply = (s: string) => EN_RULES.reduce((x, [re, to]) => x.replace(re, to), s);
    expect(apply('In 111 von 314 Siegerdecks der letzten 30 Tage.')).toBe('In 111 of 314 winning decks from the last 30 days.');
    expect(apply('erscheint am 2026-12-26, Daten noch nicht geprüft')).toBe('releases on 2026-12-26, data not verified yet');
    expect(apply('erschienen in BX-01')).toBe('released in BX-01');
  });
});

describe('Sprache wählen und merken', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    document.documentElement.lang = 'de';
  });
  afterEach(() => localStorage.clear());

  it('ohne Wahl: deutsch, und es wurde noch nicht gefragt', async () => {
    const i18n = await import('../src/lib/i18n');
    expect(i18n.storedLang()).toBeNull();
    expect(i18n.lang).toBe('de');
    await i18n.loadLang();
    expect(i18n.tr('Speichern')).toBe('Speichern');
    expect(i18n.tr('{0} von {1} Blades gesammelt', 3, 144)).toBe('3 von 144 Blades gesammelt');
    expect(i18n.trData('Tokio')).toBe('Tokio');
    expect(i18n.dec(3.5)).toBe('3,5');
  });

  it('Deutsch gewählt: gemerkt, kein Neuladen', async () => {
    const i18n = await import('../src/lib/i18n');
    const reload = vi.fn();
    expect(await i18n.chooseLang('de', reload)).toBe(true);
    expect(localStorage.getItem(i18n.LANG_KEY)).toBe('de');
    expect(reload).not.toHaveBeenCalled();
    expect(i18n.storedLang()).toBe('de');
  });

  it('Englisch gewählt: gemerkt und neu geladen – danach ist die App englisch', async () => {
    const first = await import('../src/lib/i18n');
    const reload = vi.fn();
    expect(await first.chooseLang('en', reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    vi.resetModules(); // = Neuladen
    const i18n = await import('../src/lib/i18n');
    expect(i18n.lang).toBe('en');
    await i18n.loadLang();
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.tr('Speichern')).toBe('Save');
    expect(i18n.tr('{0} von {1} Blades gesammelt', 3, 144)).toBe('3 of 144 Blades collected');
    expect(i18n.tr('Ein Text ohne Eintrag')).toBe('Ein Text ohne Eintrag');
    expect(i18n.trData('Tokio')).toBe('Tokyo');
    expect(i18n.trData('In 36 von 314 Siegerdecks der letzten 30 Tage.')).toBe('In 36 of 314 winning decks from the last 30 days.');
    expect(i18n.dec(3.5)).toBe('3.5');
    // Konstanten in anderen Programmteilen entstehen erst nach dem Laden der Sprache
    const { METRICS } = await import('../src/lib/verdict');
    expect(METRICS.map((m) => m.label)).toEqual(['Attack', 'Defense', 'Stamina', 'Burst resistance']);
    const { checkDeck, deckSizeProblem } = await import('../src/lib/analysis');
    expect(deckSizeProblem(2)).toBe('A deck has exactly 3 Beys (currently 2).');
    expect(checkDeck({ blades: [], ratchets: [], bits: [], products: [] } as never, []).problems).toContain(deckSizeProblem(0));
  });

  it('ungültiger gespeicherter Wert zählt als „noch nicht gefragt“', async () => {
    localStorage.setItem('bxplaner:lang', 'fr');
    const i18n = await import('../src/lib/i18n');
    expect(i18n.storedLang()).toBeNull();
    expect(i18n.lang).toBe('de');
  });

  it('ohne Speicher wird nicht gefragt (sonst käme die Frage bei jedem Start)', async () => {
    const i18n = await import('../src/lib/i18n');
    expect(i18n.canStoreLang()).toBe(true);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blockiert');
    });
    expect(i18n.canStoreLang()).toBe(false);
    expect(await i18n.chooseLang('de', vi.fn())).toBe(false);
    spy.mockRestore();
  });
});
