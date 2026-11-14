import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ImageIndex } from './types';

export interface AppCtx {
  images: ImageIndex;
  /** Öffnet die Detailseite einer Blade */
  openBlade: (bladeId: string) => void;
}

export const AppContext = createContext<AppCtx>({ images: { source: '', blades: {} }, openBlade: () => {} });

export const useApp = () => useContext(AppContext);
