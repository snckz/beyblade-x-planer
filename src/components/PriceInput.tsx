import { useEffect, useState } from 'preact/hooks';
import type { ShopPrice } from '../lib/storage';
import { parsePrice } from '../lib/price';

interface Props {
  value: ShopPrice | null;
  cur: ShopPrice['cur'];
  label: string;
  onCommit: (v: ShopPrice | null) => void;
}

const show = (v: ShopPrice | null, cur: ShopPrice['cur']) => (v && v.cur === cur ? v.amount.toLocaleString('de-DE', { maximumFractionDigits: 2, useGrouping: false }) : '');

/** Ladenpreis-Eingabe: tippt frei (auch „1,290“ oder „1.290“), übernimmt beim Verlassen oder Enter. */
export function PriceInput({ value, cur, label, onCommit }: Props) {
  const [draft, setDraft] = useState(() => show(value, cur));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(show(value, cur));
    setBad(false);
  }, [value?.amount, value?.cur, cur]);
  const sym = cur === 'THB' ? '฿' : '€';
  const commit = () => {
    if (!draft.trim()) {
      setBad(false);
      // Nur löschen, was in dieser Währung angezeigt war – ein gemerkter Preis in der anderen Währung bleibt.
      if (value && value.cur === cur) onCommit(null);
      return;
    }
    const n = parsePrice(draft);
    if (n === null) return setBad(true); // alten Wert behalten
    setBad(false);
    if (n !== value?.amount || value?.cur !== cur) onCommit({ amount: n, cur });
  };
  return (
    <div class="price-input">
      <label class={`shop-input${bad ? ' bad' : ''}`}>
        <span class="sr-only">{label}</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Ladenpreis"
          value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          enterKeyHint="done"
          aria-invalid={bad}
        />
        <span aria-hidden="true">{sym}</span>
      </label>
      {bad && (
        <span class="price-bad" role="alert">
          Preis nicht erkannt – z. B. „1290“ oder „12,50“
        </span>
      )}
    </div>
  );
}
