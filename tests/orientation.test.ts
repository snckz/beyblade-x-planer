import { describe, expect, it } from 'vitest';
import { isPhoneLandscape } from '../src/lib/orientation';

const phone = { screenWidth: 390, screenHeight: 844, coarse: true };

describe('Handy nur im Hochformat', () => {
  it('sperrt das Handy im Querformat (screen.orientation)', () => {
    expect(isPhoneLandscape({ ...phone, type: 'landscape-primary' })).toBe(true);
    expect(isPhoneLandscape({ ...phone, type: 'landscape-secondary' })).toBe(true);
    expect(isPhoneLandscape({ ...phone, type: 'portrait-primary' })).toBe(false);
  });

  it('nutzt auf älteren iPhones window.orientation', () => {
    expect(isPhoneLandscape({ ...phone, legacyAngle: 90 })).toBe(true);
    expect(isPhoneLandscape({ ...phone, legacyAngle: -90 })).toBe(true);
    expect(isPhoneLandscape({ ...phone, legacyAngle: 0 })).toBe(false);
  });

  it('hängt nicht an der Fenstergröße – die Android-Tastatur im Hochformat sperrt nicht', () => {
    // Bildschirm bleibt hochkant gemeldet, egal wie klein der sichtbare Bereich durch die Tastatur wird
    expect(isPhoneLandscape({ ...phone, type: 'portrait-primary' })).toBe(false);
  });

  it('lässt Tablets und Geräte mit Maus frei drehen', () => {
    expect(isPhoneLandscape({ screenWidth: 820, screenHeight: 1180, coarse: true, type: 'landscape-primary' })).toBe(false);
    expect(isPhoneLandscape({ ...phone, coarse: false, type: 'landscape-primary' })).toBe(false);
    expect(isPhoneLandscape({ screenWidth: 1920, screenHeight: 1080, coarse: false, type: 'landscape-primary' })).toBe(false);
  });

  it('erkennt das größte iPhone als Handy (kurze Seite 440 px)', () => {
    expect(isPhoneLandscape({ screenWidth: 956, screenHeight: 440, coarse: true, type: 'landscape-primary' })).toBe(true);
  });
});
