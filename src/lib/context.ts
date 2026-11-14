import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ImageIndex } from './types';

export interface AppCtx {
  images: ImageIndex;
  /** Öffnet die Detailseite einer Blade */
  openBlade: (bladeId: string) => void;
  /** Zeigt das Bild einer Blade groß an */
  openImage: (bladeId: string) => void;
}

export const AppContext = createContext<AppCtx>({ images: { source: '', blades: {} }, openBlade: () => {}, openImage: () => {} });

export const useApp = () => useContext(AppContext);
