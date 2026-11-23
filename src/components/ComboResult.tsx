import { ThumbsDown, ThumbsUp } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { TYPE_HINT, nb, type Analysis, type Resolved } from '../lib/analysis';
import { METRICS, radarPoints, totalScore, verdict } from '../lib/verdict';
import { ComboParts, ComboStage } from './ComboStage';
import { SpinBadge, TypeChip } from './ui';

/**
 * Karte „Aktuelle Kombo“: Foto, Name, Linie und Typ, daneben die vier Richtwerte als Balken und ihre Summe.
 * `children` sind die Aktionen (Verbessern, Vergleichen, Speichern) – sie gehören zur Kombo und stehen in ihrer Karte.
 */
export function ComboNow({ resolved, result, children }: { resolved: Resolved; result: Analysis; children?: ComponentChildren }) {
  return (
    <section class={`ref-card combo-now aura-${result.type}`} aria-labelledby="combo-now-h">
      <h3 id="combo-now-h" class="block-h">
        Aktuelle Kombo
      </h3>
      <div class="combo-now-body">
        <ComboStage resolved={resolved} />
        <div class="combo-now-main">
          <p class="combo-name">{nb(result.label)}</p>
          <div class="combo-now-badges">
            <span class="mini-badge">{resolved.blade.line}</span>
            <TypeChip type={result.type} />
            <SpinBadge spin={resolved.blade.spin} />
          </div>
        </div>
        <dl class="combo-bars">
          {METRICS.map((m) => (
            <div key={m.key} class="combo-bar">
              <dt>{m.label}</dt>
              <dd>{result.profile[m.key]}</dd>
              <span class="combo-bar-track" aria-hidden="true">
                <span class={`combo-bar-fill tone-${m.tone}`} style={{ width: `${result.profile[m.key]}%` }} />
              </span>
            </div>
          ))}
          <div class="combo-bar combo-bar-total">
            <dt>Gesamt</dt>
            <dd>
              {totalScore(result.profile)}
              <span class="combo-bar-of" aria-label="von 400">
                {' '}
                / 400
              </span>
            </dd>
          </div>
        </dl>
      </div>
      <ComboParts resolved={resolved} />
      {children}
    </section>
  );
}

// Schmale Zeichenfläche: Auf einem 320 px breiten iPhone bleibt die Beschriftung so bei gut 11 px
const SIZE = { w: 310, h: 216, cx: 155, cy: 107, r: 58 };
/** Wo Beschriftung und Zahl je Achse stehen: oben, rechts, unten, links */
const LABEL_POS = [
  { x: SIZE.cx, y: 18, anchor: 'middle' },
  { x: SIZE.cx + SIZE.r + 12, y: SIZE.cy - 8, anchor: 'start' },
  { x: SIZE.cx, y: SIZE.cy + SIZE.r + 22, anchor: 'middle' },
  { x: SIZE.cx - SIZE.r - 12, y: SIZE.cy - 8, anchor: 'end' },
] as const;

/**
 * Karte „Leistungsbewertung“: Netzdiagramm der vier Richtwerte. Die App rechnet genau diese vier –
 * weitere Achsen gäbe es nur mit erfundenen Zahlen, deshalb ist das Netz eine Raute und kein Fünfeck.
 */
export function Performance({ result, weightG }: { result: Analysis; weightG?: number | null }) {
  const values = METRICS.map((m) => result.profile[m.key]);
  const shape = radarPoints(values, SIZE.cx, SIZE.cy, SIZE.r);
  const ring = (f: number) => radarPoints([100, 100, 100, 100], SIZE.cx, SIZE.cy, SIZE.r * f).map((p) => p.join(',')).join(' ');
  const summary = METRICS.map((m, i) => `${m.label} ${values[i]}`).join(', ');
  return (
    <section class="ref-card perf" aria-labelledby="perf-h">
      <div class="block-head">
        <h3 id="perf-h" class="block-h">
          Leistungsbewertung
        </h3>
        <span class="est-tag">Schätzwerte</span>
      </div>
      <svg class="perf-chart" viewBox={`0 0 ${SIZE.w} ${SIZE.h}`} role="img" aria-label={`Leistungsbewertung von 0 bis 100: ${summary}`}>
        <defs>
          <linearGradient id="perf-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ff5d74" stop-opacity=".78" />
            <stop offset="1" stop-color="#c8102e" stop-opacity=".5" />
          </linearGradient>
        </defs>
        {[1, 0.66, 0.33].map((f) => (
          <polygon key={f} class="perf-ring" points={ring(f)} />
        ))}
        {radarPoints([100, 100, 100, 100], SIZE.cx, SIZE.cy, SIZE.r).map(([x, y], i) => (
          <line key={i} class="perf-axis" x1={SIZE.cx} y1={SIZE.cy} x2={x} y2={y} />
        ))}
        {/* Schein als zweite, breite Kontur: CSS-Filter auf SVG-Teilen sind in Safari unzuverlässig */}
        <polygon class="perf-glow" points={shape.map((p) => p.join(',')).join(' ')} />
        <polygon class="perf-shape" points={shape.map((p) => p.join(',')).join(' ')} fill="url(#perf-fill)" />
        {shape.map(([x, y], i) => (
          <circle key={i} class="perf-dot" cx={x} cy={y} r="3.2" />
        ))}
        {METRICS.map((m, i) => {
          const pos = LABEL_POS[i]!;
          return (
            <g key={m.key} aria-hidden="true">
              <text class="perf-label" x={pos.x} y={pos.y} text-anchor={pos.anchor}>
                {m.label}
              </text>
              <text class="perf-value" x={pos.x} y={pos.y + 21} text-anchor={pos.anchor}>
                {values[i]}
              </text>
            </g>
          );
        })}
      </svg>
      <p class="fineprint">
        Richtwerte von 0 bis 100 aus Teile-Typen, Ratchet-Form
        {typeof weightG === 'number' ? ` und dem echten Blade-Gewicht (${weightG.toLocaleString('de-DE')} g)` : ''} – keine Messwerte.
      </p>
    </section>
  );
}

/** Karte „Fazit“: Einordnung des Typs, Stärken und Schwächen aus den Richtwerten, darunter Warnungen und Tipps. */
export function Verdict({ result }: { result: Analysis }) {
  const { strong, weak } = verdict(result.profile);
  return (
    <section class="ref-card fazit" aria-labelledby="fazit-h">
      <h3 id="fazit-h" class="block-h">
        Fazit
      </h3>
      <p class="fazit-lead">{TYPE_HINT[result.type]}</p>
      <div class="fazit-cols">
        <div>
          <p class="fazit-tag good">
            <ThumbsUp aria-hidden="true" /> Stärken
          </p>
          {strong.length ? (
            <ul class="fazit-list">
              {strong.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p class="fazit-none">Kein Wert sticht heraus.</p>
          )}
        </div>
        <div>
          <p class="fazit-tag bad">
            <ThumbsDown aria-hidden="true" /> Schwächen
          </p>
          {weak.length ? (
            <ul class="fazit-list">
              {weak.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p class="fazit-none">Keine auffällige Schwäche.</p>
          )}
        </div>
      </div>
      {(result.warnings.length > 0 || result.tips.length > 0) && (
        <div class="fazit-notes">
          {result.warnings.length > 0 && (
            <ul class="notes notes-warn">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {result.tips.length > 0 && (
            <ul class="notes">
              {result.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
