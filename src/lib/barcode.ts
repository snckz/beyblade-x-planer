// Barcode-Erkennung für den Scan-Modus.
// Nutzt den eingebauten BarcodeDetector (Chrome/Android), sonst ZXing als WebAssembly (iPhone/Safari).
// Die WASM-Datei liegt mit im Build (kein CDN) und wird erst beim ersten Scan geladen.

export interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string; format: string }[]>;
}

export const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** Prüfziffer von EAN-8/EAN-13/UPC-A (GTIN) – schützt vor Fehllesungen. */
export function validGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-A (12 Stellen) als EAN-13 schreiben, damit derselbe Code immer gleich gespeichert wird. */
export const normalizeGtin = (code: string) => (code.length === 12 ? `0${code}` : code);

let pending: Promise<Detector> | null = null;

export function createDetector(): Promise<Detector> {
  pending ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
    if (Native?.getSupportedFormats) {
      const supported = await Native.getSupportedFormats().catch(() => [] as string[]);
      if (supported.includes('ean_13')) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
    }
    const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) });
    return new BarcodeDetector({ formats: FORMATS as never[] }) as unknown as Detector;
  })().catch((err) => {
    pending = null;
    throw err;
  });
  return pending;
}
