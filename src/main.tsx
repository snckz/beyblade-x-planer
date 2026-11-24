import { render } from 'preact';
import { loadLang, tr } from './lib/i18n';
import { watchPhoneOrientation } from './lib/orientation';
import './fonts.css';
import './styles.css';

// Erst die Sprache, dann die App: Viele Texte sind Konstanten und werden beim Laden der Programmteile festgelegt.
// Für Deutsch ist nichts zu laden; für Englisch kommt vorher das Wörterbuch (lib/i18n.ts).
void loadLang()
  .then(() => {
    // Der Dreh-Hinweis steht fest in index.html (er muss ohne Programm sichtbar sein) – hier in der gewählten Sprache
    const set = (selector: string, text: string) => document.querySelector(selector)?.replaceChildren(text);
    set('.rotate-hint-title', tr('Bitte ins Hochformat drehen'));
    set('.rotate-hint-text', tr('Beyblade X ist fürs Hochformat gemacht.'));
    return import('./App');
  })
  .then(({ App }) => render(<App />, document.getElementById('app')!));

// Handy nur im Hochformat (iOS ignoriert die Manifest-Vorgabe) – siehe lib/orientation.ts
watchPhoneOrientation();

// Nach erfolgreichem Start darf ein späterer Ladefehler wieder einmal neu laden.
window.setTimeout(() => {
  try {
    sessionStorage.removeItem('bxplaner:reloaded');
  } catch {
    /* privat */
  }
}, 10_000);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* Offline-Modus ist optional */
    });
  });
}

// Speicher als „dauerhaft“ markieren: Browser (v. a. Safari) löschen Sammlung & Kombos dann nicht beim Aufräumen.
// Als Home-Bildschirm-App wird das meist ohne Rückfrage gewährt.
void navigator.storage?.persist?.().catch(() => undefined);
