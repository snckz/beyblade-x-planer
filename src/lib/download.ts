// Dateien speichern – im Browser per Download, in der Android-App über die App (Teilen-Menü / Kalender),
// weil eine Android-WebView keine Downloads kann.

interface AndroidBridge {
  saveFile(base64: string, mime: string, fileName: string): void;
}

const bridge = (): AndroidBridge | null => (globalThis as { XPlanerAndroid?: AndroidBridge }).XPlanerAndroid ?? null;

/** Läuft die Seite in der Android-App? */
export const inAndroidApp = () => !!bridge();

/** Android im Browser (nicht in der App) – dann lohnt der Hinweis auf die App. */
export const isAndroidBrowser = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !inAndroidApp();

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Speichert/teilt eine Datei. Gibt true zurück, wenn die Android-App übernommen hat. */
export async function saveBlob(blob: Blob, fileName: string): Promise<boolean> {
  const b = bridge();
  if (b) {
    b.saveFile(await toBase64(blob), blob.type.split(';')[0] || 'application/octet-stream', fileName);
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iOS/Safari braucht die URL noch kurz nach dem Klick.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return false;
}
