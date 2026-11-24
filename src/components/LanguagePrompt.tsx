import { useState } from 'preact/hooks';
import { Check } from 'lucide-preact';
import { chooseLang, lang, tr, type Lang } from '../lib/i18n';

// Diese Texte stehen bewusst in beiden Sprachen da: Beim ersten Start ist die Sprache noch nicht gewählt.
const OPTIONS: { id: Lang; name: string; sub: string }[] = [
  { id: 'de', name: 'Deutsch', sub: 'Auf Deutsch weiter' },
  { id: 'en', name: 'English', sub: 'Continue in English' },
];
const FAILED = 'Englisch konnte gerade nicht geladen werden (offline?). · English could not be loaded right now (offline?).';

/** Sprache wählen und merken. Meldet `false`, wenn es nicht geklappt hat. Bei einem Wechsel lädt die App neu. */
function useChoose(onSame?: () => void) {
  const [busy, setBusy] = useState<Lang | null>(null);
  const [failed, setFailed] = useState(false);
  const choose = async (next: Lang) => {
    if (busy) return;
    setBusy(next);
    setFailed(false);
    const ok = await chooseLang(next);
    if (!ok) setFailed(true);
    else if (next === lang) onSame?.();
    // Andere Sprache: Die Seite lädt neu – bis dahin bleibt der Knopf gesperrt.
    if (!ok || next === lang) setBusy(null);
  };
  return { busy, failed, choose };
}

/**
 * Erster Start: einmal nach der Sprache fragen. Die Wahl wird gemerkt (lib/i18n.ts), danach erscheint diese Seite nie
 * wieder – ändern lässt sich die Sprache später unter Sammlung → Sprache.
 */
export function LanguagePrompt({ onDone }: { onDone: () => void }) {
  const { busy, failed, choose } = useChoose(onDone);
  return (
    <div class="lang-prompt" role="dialog" aria-modal="true" aria-labelledby="lang-title">
      <div class="lang-prompt-box">
        <img class="brand-logo" src="./logo.webp" alt="Beyblade X" width="600" height="94" />
        <h1 id="lang-title" class="lang-title">
          <span lang="de">Sprache wählen</span>
          <span lang="en">Choose your language</span>
        </h1>
        <div class="lang-options">
          {OPTIONS.map((o) => (
            <button key={o.id} type="button" class="lang-option" lang={o.id} disabled={busy !== null} aria-busy={busy === o.id} onClick={() => void choose(o.id)}>
              <span class="lang-name">{o.name}</span>
              <span class="lang-sub">{o.sub}</span>
            </button>
          ))}
        </div>
        {failed && (
          <p class="banner" role="alert">
            {FAILED}
          </p>
        )}
        <p class="lang-foot">
          <span lang="de">Später änderbar: Sammlung → Sprache</span>
          <span lang="en">Change it later: Collection → Language</span>
        </p>
      </div>
    </div>
  );
}

/** Sprache später ändern (Sammlung). Ein Wechsel lädt die App neu; Sammlung und Kombos bleiben, wie sie sind. */
export function LanguageSetting() {
  const { busy, failed, choose } = useChoose();
  return (
    <div class="card stack-sm">
      <p class="muted">{tr('Die App gibt es auf Deutsch und Englisch. Beim Wechsel lädt sie kurz neu – deine Daten bleiben erhalten.')}</p>
      <div class="lang-switch" role="group" aria-label={tr('Sprache')}>
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" class={`btn${lang === o.id ? ' is-on' : ''}`} lang={o.id} aria-pressed={lang === o.id} disabled={busy !== null || lang === o.id} onClick={() => void choose(o.id)}>
            {lang === o.id && <Check aria-hidden="true" />}
            {o.name}
          </button>
        ))}
      </div>
      {failed && (
        <p class="banner" role="alert">
          {FAILED}
        </p>
      )}
    </div>
  );
}
