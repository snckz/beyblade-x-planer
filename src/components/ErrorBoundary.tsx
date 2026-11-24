import { tr } from '../lib/i18n';
import { Component, type ComponentChildren } from 'preact';

const RELOAD_KEY = 'bxplaner:reloaded';

/** Fehler beim Nachladen eines Programmteils – passiert, wenn die App während eines Updates offen war. */
export const isChunkError = (e: unknown) => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Load failed/i.test(String((e as Error)?.message ?? e));

/** Einmal neu laden (nicht in einer Schleife): danach sind die neuen Dateien da. */
export function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch {
    /* privat */
  }
  window.location.reload();
  return true;
}

/**
 * Fängt Fehler beim Anzeigen ab, statt die ganze App (samt Menü) verschwinden zu lassen.
 * Daten bleiben unberührt – sie liegen im Gerätespeicher.
 */
export class ErrorBoundary extends Component<{ children: ComponentChildren }, { error: unknown }> {
  state = { error: null as unknown };

  componentDidCatch(error: unknown) {
    if (isChunkError(error) && reloadOnce()) return;
    this.setState({ error });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div class="card glass stack-sm" role="alert" style={{ margin: '16px 0' }}>
        <p class="row-title">{tr('Da ist etwas schiefgegangen')}</p>
        <p class="muted">{tr('Meist hilft neu laden – zum Beispiel nach einem App-Update. Deine Sammlung und Kombos bleiben gespeichert.')}</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" onClick={() => window.location.reload()}>
            {tr('Neu laden')}
          </button>
          <button type="button" class="btn" onClick={() => this.setState({ error: null })}>
            {tr('Nochmal versuchen')}
          </button>
        </div>
      </div>
    );
  }
}
