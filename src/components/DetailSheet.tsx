import { lockScroll } from '../lib/scrollLock';
import { displayName, displayProductName } from '../lib/names';
import { useEffect, useRef } from 'preact/hooks';
import type { BeyEvent, Database } from '../lib/types';
import { TYPE_HINT, TYPE_LABEL } from '../lib/analysis';
import { useApp } from '../lib/context';
import { BeyImage, ImageCredit } from './BeyImage';
import { SpinBadge, TypeBadge, UnverifiedMark } from './ui';

interface Props {
  db: Database;
  events: BeyEvent[];
  bladeId: string;
  onClose: () => void;
  onUse: (bladeId: string) => void;
}

const LINE_LABEL = { BX: 'Basic Line (BX)', UX: 'Unique Line (UX)', CX: 'Custom Line (CX)' } as const;
const SPIN_LABEL = { right: 'Rechts', left: 'Links', both: 'Beide' } as const;

/** Wiki-artige Detailseite einer Blade mit Infobox, Produkten und Terminen. */
export function DetailSheet({ db, events, bladeId, onClose, onUse }: Props) {
  const { images } = useApp();
  const closeRef = useRef<HTMLButtonElement>(null);
  const blade = db.blades.find((b) => b.id === bladeId);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
      prevFocus?.focus?.();
    };
  }, [onClose]);

  if (!blade) return null;
  const products = db.products.filter((p) => p.bladeId === blade.id);
  const related = events.filter((e) => e.bladeId === blade.id);
  const weight = products.find((p) => p.weightG)?.weightG;
  const wiki = images.blades[blade.id];

  const rows: [string, string | null][] = [
    ['Typ', TYPE_LABEL[blade.type]],
    ['Drehrichtung', SPIN_LABEL[blade.spin]],
    ['Linie', LINE_LABEL[blade.line]],
    ['Ratchet', blade.integratedRatchet ? 'In Blade integriert' : 'Austauschbar'],
    ['Hasbro-Name', blade.hasbroName ?? null],
    ['Japan-Name', blade.hasbroName ? blade.name : null],
    ['Gewicht (Kreisel)', weight ? `${weight} g` : null],
    ['Erschienen in', products.map((p) => (p.code.startsWith('TBA') ? 'Neuheit' : p.code)).join(', ') || null],
    ['Datenstatus', blade.verified ? 'Geprüft' : 'Ungeprüft'],
  ];

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet glass" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="sheet-grab" aria-hidden="true" />
        <button ref={closeRef} type="button" class="icon-btn sheet-close" onClick={onClose} aria-label="Schließen">
          ×
        </button>
        <header class={`sheet-hero hero-${blade.type}`}>
          <BeyImage bladeId={blade.id} type={blade.type} size="lg" alt={blade.name} />
          <div class="sheet-hero-text">
            <p class="eyebrow">{blade.line} · Blade</p>
            <h2 id="sheet-title" class="sheet-title">
              {displayName(blade)} <UnverifiedMark show={!blade.verified} />
            </h2>
            <div class="badges badges-left">
              <TypeBadge type={blade.type} />
              <SpinBadge spin={blade.spin} />
            </div>
          </div>
        </header>

        <div class="sheet-body">
          <p class="lead">{blade.note ?? TYPE_HINT[blade.type]}</p>

          <table class="infobox">
            <caption>Steckbrief</caption>
            <tbody>
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          {products.length > 0 && (
            <section>
              <h3 class="sheet-h">Produkte</h3>
              <ul class="mini-list">
                {products.map((p) => (
                  <li key={p.code}>
                    <span class="code">{p.code.startsWith('TBA') ? 'neu' : p.code}</span>
                    <span>{displayProductName(p, db)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {related.length > 0 && (
            <section>
              <h3 class="sheet-h">Termine</h3>
              <ul class="mini-list">
                {related.map((e) => (
                  <li key={e.id}>
                    <span class="code">{e.date.split('-').reverse().join('.')}</span>
                    <span>
                      {e.title}
                      {e.place ? ` · ${e.place}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div class="btn-row">
            <button type="button" class="btn btn-primary" onClick={() => onUse(blade.id)}>
              Im Kombo-Planer nutzen
            </button>
            {wiki && (
              <a class="btn" href={wiki.page} target="_blank" rel="noopener noreferrer">
                Im Beyblade Wiki ↗
              </a>
            )}
          </div>
          <ImageCredit bladeId={blade.id} />
        </div>
      </div>
    </div>
  );
}
