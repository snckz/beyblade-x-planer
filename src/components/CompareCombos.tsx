import { tr, NUM_LOCALE } from '../lib/i18n';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Combo, Database } from '../lib/types';
import { matchup, toBey } from '../lib/battle';
import { nb } from '../lib/analysis';
import { METRICS, totalScore } from '../lib/verdict';
import { displayName } from '../lib/names';
import { ComboPicker } from './ComboPicker';
import { BladePhoto } from './BeyImage';
import { Section, TypeChip } from './ui';

type Part = Omit<Combo, 'id' | 'name'>;

/** Zwei Kombos nebeneinander: Werte, Gewicht, Höhe und wer im direkten Duell vorne liegt. */
/** `openSignal`: ändert sich der Zähler, öffnet sich der Vergleich mit `initial` als Kombo A und rückt ins Bild. */
export function CompareCombos({ db, initial, openSignal = 0 }: { db: Database; initial?: Part; openSignal?: number }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const [a, setA] = useState<Part>(initial ?? { bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' });
  const [b, setB] = useState<Part>({ bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H' });

  useEffect(() => {
    if (!openSignal) return;
    if (initial) setA(initial);
    setOpen(true);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // erst nach dem Aufklappen scrollen, sonst stimmt die Höhe noch nicht
    requestAnimationFrame(() => anchor.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }));
    // nur auf den Auslöser reagieren, nicht auf jede Änderung der Kombo
  }, [openSignal]);

  const ba = toBey(db, { id: 'a', ...a });
  const bb = toBey(db, { id: 'b', ...b });
  const ok = !!ba && !!bb && ba.analysis.valid && bb.analysis.valid;
  const m = ok ? matchup(ba!, bb!) : null;
  const name = (x: NonNullable<typeof ba>) => nb(`${displayName(x.resolved.blade)} ${x.resolved.ratchet?.id ?? ''}${x.resolved.bit.id}`);

  type Row = { label: string; a: number | null; b: number | null; unit?: string; higherIsBetter?: boolean };
  // Die vier Richtwerte in derselben Reihenfolge wie in Balken und Netzdiagramm
  const metrics: Row[] = ok ? METRICS.map((mt) => ({ label: mt.label, a: ba!.analysis.profile[mt.key], b: bb!.analysis.profile[mt.key] })) : [];
  const total: Row | null = ok ? { label: tr('Gesamt'), a: totalScore(ba!.analysis.profile), b: totalScore(bb!.analysis.profile) } : null;
  const facts: Row[] = ok
    ? [
        { label: tr('Blade-Gewicht'), a: ba!.resolved.blade.weightG ?? null, b: bb!.resolved.blade.weightG ?? null, unit: ' g' },
        { label: tr('Ratchet-Höhe'), a: ba!.analysis.heightMm, b: bb!.analysis.heightMm, unit: ' mm', higherIsBetter: false },
      ]
    : [];
  // Millimeter immer mit einer Nachkommastelle („6,0 mm“ wie in der Auswahl)
  const fmt = (v: number | null, unit = '') => (v === null ? '–' : `${v.toLocaleString(NUM_LOCALE, unit === ' mm' ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : undefined)}${unit}`);
  const better = (r: Row, side: 'a' | 'b') => {
    if (r.a === null || r.b === null || r.a === r.b || r.higherIsBetter === false) return false;
    return side === 'a' ? r.a > r.b : r.b > r.a;
  };
  const line = (r: Row, cls = '') => (
    <tr key={r.label} class={cls}>
      <th scope="row">{r.label}</th>
      <td class={better(r, 'a') ? 'best' : ''}>{fmt(r.a, r.unit)}</td>
      <td class={better(r, 'b') ? 'best' : ''}>{fmt(r.b, r.unit)}</td>
    </tr>
  );

  return (
    <div ref={anchor} class="scroll-anchor">
    <Section
      title={tr('Kombos vergleichen')}
      aside={
        <button
          type="button"
          class="btn btn-sm"
          onClick={() => {
            // Beim Öffnen die gerade gebaute Kombo als A übernehmen.
            if (!open && initial) setA(initial);
            setOpen(!open);
          }}
          aria-expanded={open}
        >
          {open ? tr('Schließen') : tr('Öffnen')}
        </button>
      }
    >
      {open && (
        <div class="ref-card vs">
          <div class="cmp-pickers">
            <div>
              <p class="eyebrow">{tr('Kombo A')}</p>
              <ComboPicker db={db} value={{ id: 'a', ...a }} label={tr('Kombo A')} onChange={({ bladeId, ratchetId, bitId }) => setA({ bladeId, ratchetId, bitId })} />
            </div>
            <div>
              <p class="eyebrow">{tr('Kombo B')}</p>
              <ComboPicker db={db} value={{ id: 'b', ...b }} label={tr('Kombo B')} onChange={({ bladeId, ratchetId, bitId }) => setB({ bladeId, ratchetId, bitId })} />
            </div>
          </div>
          {ok && m ? (
            <>
              <table class="vs-table">
                <thead>
                  <tr>
                    <td />
                    {[ba!, bb!].map((x, i) => (
                      <th key={i} scope="col">
                        <span class={`vs-art aura-${x.analysis.type}`}>
                          <BladePhoto blade={x.resolved.blade} alt="" variant="card" />
                        </span>
                        <span class="vs-side">{tr('Kombo')} {i === 0 ? 'A' : 'B'}</span>
                        <span class="vs-name">{name(x)}</span>
                        <TypeChip type={x.analysis.type} />
                        {x.resolved.blade.spin === 'left' && <span class="vs-spin">{tr('Linksdreher')}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((r) => line(r))}
                  {total && line(total, 'vs-total')}
                  {facts.map((r) => line(r, 'vs-fact'))}
                </tbody>
              </table>
              <div class="cmp-verdict">
                <div class="cmp-bar" role="img" aria-label={tr('Kombo A gewinnt etwa {0} %, Kombo B {1} %', m.chance, 100 - m.chance)}>
                  <span style={{ width: `${m.chance}%` }} />
                </div>
                <p>
                  <strong>
                    {m.chance > 55 ? tr('A liegt vorne ({0} %)', m.chance) : m.chance < 45 ? tr('B liegt vorne ({0} %)', 100 - m.chance) : tr('Ausgeglichen ({0} : {1})', m.chance, 100 - m.chance)}
                  </strong>
                </p>
                {m.reasons.length > 0 && (
                  <ul class="cmp-reasons">
                    {m.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                <p class="fineprint">{tr('Gesamt ist die Summe der vier Richtwerte. Das Duell ist eine grobe Einschätzung aus Typ, Profil, Gewicht und Drehrichtung – Höhe ist je nach Stil Vor- oder Nachteil.')}</p>
              </div>
            </>
          ) : (
            <p class="muted">{tr('Wähle für beide Kombos Blade, Ratchet und Bit.')}</p>
          )}
        </div>
      )}
    </Section>
    </div>
  );
}
