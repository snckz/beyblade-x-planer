import type { UserState } from '../lib/storage';
import { importSummary } from '../lib/transfer';
import { ConfirmSheet } from './ConfirmSheet';
import { Download } from 'lucide-preact';

/** Rückfrage vor dem Übernehmen von Daten eines anderen Geräts (Link oder Code) – im Fenster-System der App. */
export function ImportConfirm({ incoming, onConfirm, onClose }: { incoming: UserState; onConfirm: () => void; onClose: () => void }) {
  const { counts, note, iosHint } = importSummary(incoming);
  return (
    <ConfirmSheet title="Daten übernehmen?" confirmLabel="Übernehmen" icon={Download} note={note} onConfirm={onConfirm} onClose={onClose}>
      <p class="confirm-item">Von deinem anderen Gerät</p>
      <p class="confirm-parts">
        {counts.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </p>
      {iosHint && <p class="confirm-note confirm-hint">{iosHint}</p>}
    </ConfirmSheet>
  );
}
