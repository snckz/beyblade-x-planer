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

const LINE_NAME = { BX: 'Basic Line', UX: 'Unique Line', CX: 'Custom Line' } as const;
const SPIN_LABEL = { right: 'Rechts', left: 'Links', both: 'Beide' } as const;
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
  const weightStat = weight ? { value: `${weight} g`, of: 'Kreisel' } : blade.weightG ? { value: `${blade.weightG} g`, of: 'Blade' } : null;
  const codes = products.map((p) => (p.code.startsWith('TBA') ? 'Neuheit' : p.code)).join(', ');

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={sheetRef} class="sheet glass detail-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabIndex={-1}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="win-head">
          <div class="win-heading">
            <p class="win-title">Steckbrief</p>
            <p class="win-sub">Beyblade X</p>
          </div>
          <button ref={closeRef} type="button" class="icon-btn win-close" onClick={close} aria-label="Schließen">
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
                {japanName && <p class="sb-alt">Japan: {japanName}</p>}
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
                    <span class="sr-only">Gewicht </span>
                    {weightStat.of}
                  </dt>
                  <dd>{weightStat.value}</dd>
                </div>
              )}
              <div class="sb-stat">
                <SpinIcon aria-hidden="true" />
                <dt>Drehrichtung</dt>
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
                Details
              </h3>
              <dl class="sb-rows">
                <div class="sb-row">
                  <Cog aria-hidden="true" />
                  <dt>Ratchet</dt>
                  <dd>{blade.integratedRatchet ? 'In Blade integriert' : 'Austauschbar'}</dd>
                </div>
                {japanName && (
                  <div class="sb-row">
                    <Languages aria-hidden="true" />
                    <dt>Japanischer Name</dt>
                    <dd>{japanName}</dd>
                  </div>
                )}
                {codes && (
                  <div class="sb-row">
                    <Package aria-hidden="true" />
                    <dt>Erschienen in</dt>
                    <dd>{codes}</dd>
                  </div>
                )}
                {release.status === 'announced' && (
                  <div class="sb-row">
                    <CircleAlert aria-hidden="true" />
                    <dt>Release</dt>
                    <dd>
                      <span class="sb-status">Angekündigt – {release.reason}</span>
                    </dd>
                  </div>
                )}
                <div class="sb-row">
                  {blade.verified ? <BadgeCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                  <dt>Datenstatus</dt>
                  <dd>
                    <span class={`sb-status${blade.verified ? ' ok' : ''}`}>
                      {blade.verified && <Check aria-hidden="true" />}
                      {blade.verified ? 'Geprüft' : 'Ungeprüft'}
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            {products.length > 0 && (
              <section class="sb-card" aria-labelledby="products-h">
                <h3 id="products-h" class="sheet-h">
                  Produkte
                </h3>
                <ul class="sb-products">
                  {products.map((p) => (
                    <li key={p.code}>
                      <span class="sb-code">{p.code.startsWith('TBA') ? 'neu' : p.code}</span>
                      <span class="sb-product-name">{displayProductName(p, db)}</span>
                      {p.kind !== 'stadium' && (
                        <button
                          type="button"
                          class={`sb-buy${ownedCount(p.code) ? ' have' : ''}`}
                          onClick={() => openCheck(p.code)}
                          aria-label={ownedCount(p.code) ? `${p.name}: hast du schon` : `Soll ich ${p.name} kaufen?`}
                        >
                          <span>{ownedCount(p.code) ? <><Check aria-hidden="true" /> Hab ich</> : 'Kaufen?'}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section class="sb-card" aria-labelledby="traits-h">
              <h3 id="traits-h" class="sheet-h">
                Besonderheiten
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
                  Termine
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
                  <span>Im Kombo-Planer nutzen</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              ) : (
                <p class="fineprint">Im Kombo-Planer wählbar, sobald {displayName(blade)} erschienen und geprüft ist.</p>
              )}
              {wiki && (
                <a class="sb-wiki" href={wiki.page} target="_blank" rel="noopener noreferrer">
                  <BookOpen aria-hidden="true" />
                  Im Beyblade Wiki
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
