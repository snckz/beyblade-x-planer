/**
 * Die App ist auf dem Handy nur fürs Hochformat gebaut.
 * Android (installierte App) sperrt das Querformat schon über das Manifest ("orientation": "portrait").
 * iOS beachtet das nicht, und eine Website darf die Drehung dort auch nicht sperren – deshalb legt sich im
 * Querformat ein Hinweis über die App (Klasse `phone-landscape` an <html>, Gestaltung in styles.css).
 *
 * Bewusst über die echte Gerätedrehung statt `@media (orientation: landscape)`: Unter Android wird der sichtbare
 * Bereich beim Öffnen der Tastatur breiter als hoch – eine reine CSS-Abfrage würde dann mitten beim Tippen sperren.
 */

/** Kürzere Bildschirmseite eines Handys (größtes iPhone: 440 px); Tablets bleiben frei drehbar. */
const PHONE_MAX = 500;

export interface OrientationEnv {
  /** screen.orientation.type, z. B. „landscape-primary“ (iOS ab 16.4, Android) */
  type?: string;
  /** veraltetes window.orientation (ältere iOS-Versionen): 90 / -90 = quer */
  legacyAngle?: number;
  screenWidth: number;
  screenHeight: number;
  /** Touch als Hauptbedienung (kein Maus-Zeiger) */
  coarse: boolean;
}

export function isPhoneLandscape(env: OrientationEnv): boolean {
  if (!env.coarse) return false;
  if (Math.min(env.screenWidth, env.screenHeight) > PHONE_MAX) return false;
  if (env.type) return env.type.startsWith('landscape');
  return env.legacyAngle === 90 || env.legacyAngle === -90;
}

function readEnv(): OrientationEnv {
  const w = window as Window & { orientation?: number };
  return {
    type: screen.orientation?.type,
    legacyAngle: typeof w.orientation === 'number' ? w.orientation : undefined,
    screenWidth: screen.width,
    screenHeight: screen.height,
    coarse: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  };
}

/** Setzt die Klasse jetzt und bei jeder Drehung. Gibt eine Funktion zum Abmelden zurück. */
export function watchPhoneOrientation(root: HTMLElement = document.documentElement): () => void {
  const apply = () => root.classList.toggle('phone-landscape', isPhoneLandscape(readEnv()));
  apply();
  screen.orientation?.addEventListener?.('change', apply);
  window.addEventListener('orientationchange', apply);
  window.addEventListener('resize', apply);
  return () => {
    screen.orientation?.removeEventListener?.('change', apply);
    window.removeEventListener('orientationchange', apply);
    window.removeEventListener('resize', apply);
  };
}
