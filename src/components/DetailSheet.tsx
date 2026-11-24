import { tr, trData } from '../lib/i18n';
import { useModal } from '../lib/useModal';
import { displayName, displayProductName, otherName } from '../lib/names';
import { useEffect, useRef } from 'preact/hooks';
import type { BeyEvent, Database, MetaFeed } from '../lib/types';
import { bladeTraits, type TraitIcon } from '../lib/traits';
import { TYPE_HINT, TYPE_LABEL } from '../lib/analysis';
import { useApp } from '../lib/context';
import { BladePhoto, ImageCredit } from './BeyImage';
import { UnverifiedMark } from './ui';
import { useRelease } from '../lib/useRelease';
import { ArrowLeftRight, ArrowUpRight, BadgeCheck, BookOpen, Check, ChevronRight, CircleAlert, Cog, Feather, Globe, Languages, Layers, Package, Puzzle, RotateCcw, RotateCw, Scale, Shield, Shuffle, Swords, Timer, Trophy, Weight, Wrench, X } from 'lucide-preact';

interface Props {
  db: Database;
  events: BeyEvent[];
  bladeId: string;
  onClose: () => void;
  onUse: (bladeId: string) => void;
  meta?: MetaFeed | null;
}

const LINE_NAME = { BX: tr('Basic Line'), UX: tr('Unique Line'), CX: tr('Custom Line') } as const;
const SPIN_LABEL = { right: tr('Rechts'), left: tr('Links'), both: tr('Beide') } as const;
const SPIN_ICON = { right: RotateCw, left: RotateCcw, both: ArrowLeftRight } as const;
const TYPE_ICON = { attack: Swords, defense: Shield, stamina: Timer, balance: Scale } as const;

/** Wiki-artige Detailseite einer Blade mit Infobox, Produkten und Terminen. */
export function DetailSheet({ db, events, bladeId, onClose, onUse, meta = null }: Props) {
  const { images, openCheck, ownedCount } = useApp();
  const closeRef = useRef<HTMLButtonElement>(null);
  const blade = db.blades.find((b) => b.id === bladeId);
  const { rel } = useRelease(db);

  const sheetRef = useRef<HTMLDivElement>(null);
  const close = useModal(sheetRef, onClose, { animate: true });
  useEffect(() => closeRef.current?.focus(), []);

  if (!blade) return null;
  // Zentraler Freigabestatus: nur Freigegebenes lässt sich in den Kombo-Planer übernehmen
  const release = rel.part('blades', blade.id);
  const products = db.products.filter((p) => p.bladeId === blade.id);
  const related = events.filter((e) => e.bladeId === blade.id);
  const weight = products.find((p) => p.weightG)?.weightG;
  const wiki = images.blades[blade.id];
  const traits = bladeTraits(db, blade, meta, weight);

  const TypeIcon = TYPE_ICON[blade.type];
  const SpinIcon = SPIN_ICON[blade.spin];
  const japanName = otherName(blade) ? blade.name : null;
  // Gewicht: bevorzugt der ganze Kreisel laut Packung, sonst die Blade allein laut Wiki – jeweils so beschriftet.
  const weightStat = weight ? { value: `${weight} g`, of: tr('Kreisel') } : blade.weightG ? { value: `${blade.weightG} g`, of: 'Blade' } : null;
  const codes = products.map((p) => (p.code.startsWith('TBA') ? tr('Neuheit') : p.code)).join(', ');

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={sheetRef} class="sheet glass detail-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabIndex={-1}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="win-head">
          <div class="win-heading">
            <p class="win-title">{tr('Steckbrief')}</p>
            <p class="win-sub">{tr('Beyblade X')}</p>
          </div>
          <button ref={closeRef} type="button" class="icon-btn win-close" onClick={close} aria-label={tr('Schließen')}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div class="win-scroll">
          <div class="sb">
            <header class={`sb-hero aura-${blade.type}`}>
              <div class="sb-hero-art">
                <BladePhoto blade={blade} alt={displayName(blade)} variant="hero" sharp zoomable />
              </div>
              <div class="sb-hero-text">
                <span class="sb-line">{blade.line}</span>
                <h2 id="sheet-title" class="sb-name">
                  {displayName(blade)} <UnverifiedMark show={!blade.verified} />
                </h2>
                {japanName && <p class="sb-alt">{tr('Japan:')} {japanName}</p>}
                <span class="sb-type">
                  <TypeIcon aria-hidden="true" />
                  {TYPE_LABEL[blade.type]}
                </span>
              </div>
            </header>

            <dl class="sb-stats">
              {weightStat && (
                <div class="sb-stat">
                  <Weight aria-hidden="true" />
                  <dt>
                    <span class="sr-only">{tr('Gewicht')} </span>
                    {weightStat.of}
                  </dt>
                  <dd>{weightStat.value}</dd>
                </div>
              )}
              <div class="sb-stat">
                <SpinIcon aria-hidden="true" />
                <dt>{tr('Drehrichtung')}</dt>
                <dd>{SPIN_LABEL[blade.spin]}</dd>
              </div>
              <div class="sb-stat">
                <Layers aria-hidden="true" />
                <dt>{LINE_NAME[blade.line]}</dt>
                <dd>{blade.line}</dd>
              </div>
            </dl>

            <section class="sb-card" aria-labelledby="details-h">
              <h3 id="details-h" class="sheet-h">
                {tr('Details')}
              </h3>
              <dl class="sb-rows">
                <div class="sb-row">
                  <Cog aria-hidden="true" />
                  <dt>Ratchet</dt>
                  <dd>{blade.integratedRatchet ? tr('In Blade integriert') : tr('Austauschbar')}</dd>
                </div>
                {japanName && (
                  <div class="sb-row">
                    <Languages aria-hidden="true" />
                    <dt>{tr('Japanischer Name')}</dt>
                    <dd>{japanName}</dd>
                  </div>
                )}
                {codes && (
                  <div class="sb-row">
                    <Package aria-hidden="true" />
                    <dt>{tr('Erschienen in')}</dt>
                    <dd>{codes}</dd>
                  </div>
                )}
                {release.status === 'announced' && (
                  <div class="sb-row">
                    <CircleAlert aria-hidden="true" />
                    <dt>Release</dt>
                    <dd>
                      <span class="sb-status">{tr('Angekündigt –')} {trData(release.reason)}</span>
                    </dd>
                  </div>
                )}
                <div class="sb-row">
                  {blade.verified ? <BadgeCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                  <dt>{tr('Datenstatus')}</dt>
                  <dd>
                    <span class={`sb-status${blade.verified ? ' ok' : ''}`}>
                      {blade.verified && <Check aria-hidden="true" />}
                      {blade.verified ? tr('Geprüft') : tr('Ungeprüft')}
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            {products.length > 0 && (
              <section class="sb-card" aria-labelledby="products-h">
                <h3 id="products-h" class="sheet-h">
                  {tr('Produkte')}
                </h3>
                <ul class="sb-products">
                  {products.map((p) => (
                    <li key={p.code}>
                      <span class="sb-code">{p.code.startsWith('TBA') ? tr('neu') : p.code}</span>
                      <span class="sb-product-name">{displayProductName(p, db)}</span>
                      {p.kind !== 'stadium' && (
                        <button
                          type="button"
                          class={`sb-buy${ownedCount(p.code) ? ' have' : ''}`}
                          onClick={() => openCheck(p.code)}
                          aria-label={ownedCount(p.code) ? tr('{0}: hast du schon', p.name) : tr('Soll ich {0} kaufen?', p.name)}
                        >
                          <span>{ownedCount(p.code) ? <><Check aria-hidden="true" /> {tr('Hab ich')}</> : tr('Kaufen?')}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section class="sb-card" aria-labelledby="traits-h">
              <h3 id="traits-h" class="sheet-h">
                {tr('Besonderheiten')}
              </h3>
              <p class="sb-lead">{TYPE_HINT[blade.type]}</p>
              {traits.length > 0 && (
                <ul class="traits">
                  {traits.map((t) => (
                    <li key={t.title} class={`trait${t.strong ? ' strong' : ''}`}>
                      <span class="trait-icon" aria-hidden="true">
                        <TraitSymbol icon={t.icon} />
                      </span>
                      <span class="trait-text">
                        <strong>{t.title}</strong>
                        <span>{t.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {related.length > 0 && (
              <section class="sb-card" aria-labelledby="events-h">
                <h3 id="events-h" class="sheet-h">
                  {tr('Termine')}
                </h3>
                <ul class="sb-products">
                  {related.map((e) => (
                    <li key={e.id}>
                      <span class="sb-code">{e.date.split('-').reverse().join('.')}</span>
                      <span class="sb-product-name">
                        {e.title}
                        {e.place ? ` · ${e.place}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div class="sb-actions">
              {release.status === 'confirmed' ? (
                <button type="button" class="sb-cta" onClick={() => onUse(blade.id)}>
                  <Shuffle aria-hidden="true" />
                  <span>{tr('Im Kombo-Planer nutzen')}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              ) : (
                <p class="fineprint">{tr('Im Kombo-Planer wählbar, sobald')} {displayName(blade)} {tr('erschienen und geprüft ist.')}</p>
              )}
              {wiki && (
                <a class="sb-wiki" href={wiki.page} target="_blank" rel="noopener noreferrer">
                  <BookOpen aria-hidden="true" />
                  {tr('Im Beyblade Wiki')}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              )}
            </div>
            <ImageCredit bladeId={blade.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

const TRAIT_ICONS: Record<TraitIcon, typeof Trophy> = {
  meta: Trophy,
  custom: Puzzle,
  gimmick: Cog,
  ratchet: Wrench,
  left: RotateCcw,
  both: ArrowLeftRight,
  heavy: Weight,
  light: Feather,
  names: Globe,
};

function TraitSymbol({ icon }: { icon: TraitIcon }) {
  const Icon = TRAIT_ICONS[icon];
  return <Icon aria-hidden="true" />;
}
