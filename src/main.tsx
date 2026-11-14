import { render } from 'preact';
import { App } from './App';
import './fonts.css';
import './styles.css';

render(<App />, document.getElementById('app')!);

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
