import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ImageIndex, Rates } from './types';

export interface AppCtx {
  images: ImageIndex;
  /** Wechselkurse für Preis-Hinweise (null, solange keine da sind) */
  rates: Rates | null;
  /** Öffnet die Detailseite einer Blade */
  openBlade: (bladeId: string) => void;
  /** Zeigt das Foto eines Teils groß an (Standard: Blade) */
  openImage: (id: string, kind?: ImageKind) => void;
}

export type ImageKind = 'blade' | 'bit' | 'ratchet';

export const AppContext = createContext<AppCtx>({ images: { source: '', blades: {} }, rates: null, openBlade: () => {}, openImage: () => {} });

export const useApp = () => useContext(AppContext);
