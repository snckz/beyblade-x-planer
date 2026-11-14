import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, mergeState, transferLink } from '../src/lib/transfer';
import { EMPTY_STATE } from '../src/lib/storage';

const a = { ...EMPTY_STATE, owned: { 'BX-01': 1, 'UX-01': 2 }, combos: [{ id: 'c1', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' }], deck: ['c1'], wishlist: ['BX-05'], seenNews: ['n1'] };
const b = { ...EMPTY_STATE, owned: { 'BX-01': 3, 'CX-01': 1 }, combos: [{ id: 'c2', bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H' }], wishlist: ['BX-05', 'UX-15'], barcodes: { '4904810123453': 'BX-05' } };

describe('Übertragung', () => {
  it('Rundreise über den Link-Code', async () => {
    const code = await encodeState(a);
    expect(code.startsWith('z.') || code.startsWith('j.')).toBe(true);
    const back = await decodeState(code);
    expect(back.owned).toEqual(a.owned);
    expect(back.combos).toEqual(a.combos);
    expect(back.seenNews).toEqual([]); // gelesene News werden nicht übertragen
    expect(transferLink(code, 'https://x.y/app/')).toBe(`https://x.y/app/#import=${code}`);
  });
  it('kaputte Codes werfen', async () => {
    await expect(decodeState('x.abc')).rejects.toThrow();
  });
  it('führt zusammen, ohne etwas zu verlieren', () => {
    const m = mergeState(a, b);
    expect(m.owned).toEqual({ 'BX-01': 3, 'UX-01': 2, 'CX-01': 1 });
    expect(m.combos.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(m.deck).toEqual(['c1']);
    expect(m.wishlist).toEqual(['BX-05', 'UX-15']);
    expect(m.barcodes).toEqual({ '4904810123453': 'BX-05' });
  });
});
