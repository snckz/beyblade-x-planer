import { useState } from 'preact/hooks';
import type { Combo, Database } from '../lib/types';
import { matchup, toBey } from '../lib/battle';
import { TYPE_LABEL, nb } from '../lib/analysis';
import { displayName } from '../lib/names';
import { ComboPicker } from './ComboPicker';
import { BeyImage } from './BeyImage';
import { Section } from './ui';

type Part = Omit<Combo, 'id' | 'name'>;

/** Zwei Kombos nebeneinander: Werte, Gewicht, Höhe und wer im direkten Duell vorne liegt. */
export function CompareCombos({ db, initial }: { db: Database; initial?: Part }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<Part>(initial ?? { bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' });
  const [b, setB] = useState<Part>({ bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H' });

  const ba = toBey(db, { id: 'a', ...a });
  const bb = toBey(db, { id: 'b', ...b });
  const ok = !!ba && !!bb && ba.analysis.valid && bb.analysis.valid;
  const m = ok ? matchup(ba!, bb!) : null;
  const name = (x: NonNullable<typeof ba>) => nb(`${displayName(x.resolved.blade)} ${x.resolved.ratchet?.id ?? ''}${x.resolved.bit.id}`);

  const rows: { label: string; a: number | null; b: number | null; unit?: string; higherIsBetter?: boolean }[] = ok
    ? [
        { label: 'Angriff', a: ba!.analysis.profile.attack, b: bb!.analysis.profile.attack },
        { label: 'Ausdauer', a: ba!.analysis.profile.stamina, b: bb!.analysis.profile.stamina },
        { label: 'Verteidigung', a: ba!.analysis.profile.defense, b: bb!.analysis.profile.defense },
        { label: 'Burst-Schutz', a: ba!.analysis.profile.burstResistance, b: bb!.analysis.profile.burstResistance },
        { label: 'Blade-Gewicht', a: ba!.resolved.blade.weightG ?? null, b: bb!.resolved.blade.weightG ?? null, unit: ' g' },
        { label: 'Ratchet-Höhe', a: ba!.analysis.heightMm, b: bb!.analysis.heightMm, unit: ' mm', higherIsBetter: false },
      ]
    : [];
  const fmt = (v: number | null, unit = '') => (v === null ? '–' : `${v.toLocaleString('de-DE')}${unit}`);
  const better = (r: (typeof rows)[number], side: 'a' | 'b') => {
    if (r.a === null || r.b === null || r.a === r.b || r.higherIsBetter === false) return false;
    return side === 'a' ? r.a > r.b : r.b > r.a;
  };

  return (
    <Section
      title="Kombos vergleichen"
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
          {open ? 'Schließen' : 'Öffnen'}
        </button>
      }
    >
      {open && (
        <div class="card glass stack-sm">
          <div class="cmp-pickers">
            <div>
              <p class="eyebrow">Kombo A</p>
              <ComboPicker db={db} value={{ id: 'a', ...a }} label="Kombo A" onChange={({ bladeId, ratchetId, bitId }) => setA({ bladeId, ratchetId, bitId })} />
            </div>
            <div>
              <p class="eyebrow">Kombo B</p>
              <ComboPicker db={db} value={{ id: 'b', ...b }} label="Kombo B" onChange={({ bladeId, ratchetId, bitId }) => setB({ bladeId, ratchetId, bitId })} />
            </div>
          </div>
          {ok && m ? (
            <>
              <div class="cmp-head">
                {[ba!, bb!].map((x, i) => (
                  <div key={i} class="cmp-bey">
                    <BeyImage bladeId={x.resolved.blade.id} type={x.analysis.type} size="md" alt={displayName(x.resolved.blade)} zoomable={false} />
                    <strong>{name(x)}</strong>
                    <span class="muted">
                      {TYPE_LABEL[x.analysis.type]} · {x.resolved.blade.spin === 'left' ? 'Links' : 'Rechts'}
                    </span>
                  </div>
                ))}
              </div>
              <table class="cmp-table">
                <thead>
                  <tr>
                    <th scope="col">A</th>
                    <th scope="col" class="cmp-label">
                      Wert
                    </th>
                    <th scope="col">B</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td class={better(r, 'a') ? 'best' : ''}>{fmt(r.a, r.unit)}</td>
                      <th scope="row" class="cmp-label">
                        {r.label}
                      </th>
                      <td class={better(r, 'b') ? 'best' : ''}>{fmt(r.b, r.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div class="cmp-verdict">
                <div class="cmp-bar" role="img" aria-label={`Kombo A gewinnt etwa ${m.chance} %, Kombo B ${100 - m.chance} %`}>
                  <span style={{ width: `${m.chance}%` }} />
                </div>
                <p>
                  <strong>
                    {m.chance > 55 ? `A liegt vorne (${m.chance} %)` : m.chance < 45 ? `B liegt vorne (${100 - m.chance} %)` : `Ausgeglichen (${m.chance} : ${100 - m.chance})`}
                  </strong>
                </p>
                {m.reasons.length > 0 && (
                  <ul class="cmp-reasons">
                    {m.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                <p class="fineprint">Grobe Einschätzung aus Typ, Profil, Gewicht und Drehrichtung – Höhe ist je nach Stil Vor- oder Nachteil.</p>
              </div>
            </>
          ) : (
            <p class="muted">Wähle für beide Kombos Blade, Ratchet und Bit.</p>
          )}
        </div>
      )}
    </Section>
  );
}
