import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { LanguagePrompt, LanguageSetting } from '../src/components/LanguagePrompt';
import { LANG_KEY } from '../src/lib/i18n';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Frage nach der Sprache beim ersten Start', () => {
  it('zeigt beide Sprachen, jede in ihrer eigenen', () => {
    const view = render(<LanguagePrompt onDone={() => {}} />);
    expect(view.getByRole('dialog')).toBeTruthy();
    expect(view.getByRole('button', { name: /Deutsch/ }).getAttribute('lang')).toBe('de');
    expect(view.getByRole('button', { name: /English/ }).getAttribute('lang')).toBe('en');
    expect(view.getByText('Choose your language')).toBeTruthy();
    expect(view.getByText('Sprache wählen')).toBeTruthy();
  });

  it('Deutsch: Wahl wird gemerkt, die App geht weiter', async () => {
    const done = vi.fn();
    const view = render(<LanguagePrompt onDone={done} />);
    fireEvent.click(view.getByRole('button', { name: /Deutsch/ }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(LANG_KEY)).toBe('de');
  });

  it('lässt sich die Wahl nicht speichern, erscheint ein Hinweis statt weiterzugehen', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blockiert');
    });
    const done = vi.fn();
    const view = render(<LanguagePrompt onDone={done} />);
    fireEvent.click(view.getByRole('button', { name: /Deutsch/ }));
    await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
    expect(done).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Sprache später ändern (Sammlung)', () => {
  it('zeigt die aktuelle Sprache als gewählt und bietet die andere an', () => {
    const view = render(<LanguageSetting />);
    const de = view.getByRole('button', { name: /Deutsch/ }) as HTMLButtonElement;
    const en = view.getByRole('button', { name: /English/ }) as HTMLButtonElement;
    expect(de.getAttribute('aria-pressed')).toBe('true');
    expect(de.disabled).toBe(true);
    expect(en.getAttribute('aria-pressed')).toBe('false');
    expect(en.disabled).toBe(false);
  });
});
