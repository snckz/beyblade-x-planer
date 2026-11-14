import { describe, expect, it } from 'vitest';
import { buildIcs } from '../src/lib/ics';
import { wishReleases } from '../src/lib/reminders';
import { EMPTY_STATE } from '../src/lib/storage';
import type { Database } from '../src/lib/types';

const db = {
  version: 1,
  updatedAt: '2026-11-14',
  blades: [],
  ratchets: [],
  bits: [],
  products: [
    { code: 'UX-22', name: 'Starter Vanish Lucifer WW', kind: 'starter', bladeId: 'VanishLucifer', bitId: 'WW', verified: false, releaseJp: '2026-12-26' },
    { code: 'BX-52', name: 'Starter Luster Dragoon 6-60LC', kind: 'starter', bladeId: 'LusterDragoon', verified: true, releaseJp: '2026-11-01' },
    { code: 'BX-01', name: 'Starter Dran Sword 3-60F', kind: 'starter', bladeId: 'DranSword', verified: true, releaseJp: '2023-07-15' },
    { code: 'CX-21', name: 'Starter Neu', kind: 'starter', bladeId: 'Neu', verified: false },
  ],
} as unknown as Database;

describe('Erinnerungen', () => {
  it('meldet bevorstehende und gerade erschienene Wünsche', () => {
    const state = { ...EMPTY_STATE, wishlist: ['UX-22', 'BX-52', 'BX-01', 'CX-21'] };
    const events = [{ id: 'e', kind: 'release' as const, date: '2026-12-01', title: 'Neu', bladeId: 'Neu', confirmed: true }];
    const r = wishReleases(db, state, events, new Date('2026-11-14T10:00:00'));
    expect(r.map((x) => [x.product.code, x.status])).toEqual([
      ['BX-52', 'new'],
      ['CX-21', 'upcoming'],
      ['UX-22', 'upcoming'],
    ]);
  });
  it('baut eine gültige Kalenderdatei mit Erinnerung', () => {
    const ics = buildIcs([{ uid: 'ux-22', date: '2026-12-26', title: 'Release: Vanish Lucifer, mit Komma; und Semikolon', location: 'Japan' }], new Date('2026-11-14T10:00:00Z'));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261226');
    expect(ics).toContain('DTEND;VALUE=DATE:20261227');
    expect(ics.replace(/\r\n /g, '')).toContain('Vanish Lucifer\\, mit Komma\\; und Semikolon');
    expect(ics).toContain('TRIGGER:-PT15H');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
});
