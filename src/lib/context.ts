import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Blade, ImageIndex, Rates } from './types';

export interface AppCtx {
  images: ImageIndex;
  /** Wechselkurse für Preis-Hinweise (null, solange keine da sind) */
  rates: Rates | null;
  /** Anzeigename einer Blade – je nach Einstellung Takara Tomy oder Hasbro */
  bladeName: (b: Pick<Blade, 'name' | 'hasbroName'>) => string;
  hasbroNames: boolean;
  /** Öffnet die Detailseite einer Blade */
  openBlade: (bladeId: string) => void;
  /** Zeigt das Foto eines Teils groß an (Standard: Blade) */
  openImage: (id: string, kind?: ImageKind) => void;
  /** „Kaufen?“ – öffnet den Kauf-Check direkt mit Bewertung für diese Packung */
  openCheck: (code: string) => void;
}

export type ImageKind = 'blade' | 'bit' | 'ratchet';

export const AppContext = createContext<AppCtx>({ images: { source: '', blades: {} }, rates: null, bladeName: (b) => b.name, hasbroNames: false, openBlade: () => {}, openImage: () => {}, openCheck: () => {} });

export const useApp = () => useContext(AppContext);
