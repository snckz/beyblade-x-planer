// Übertragung der eigenen Daten auf ein anderes Gerät per Link/QR-Code – ohne Server.
// Format im Link: #import=z.<base64url(deflate(json))>  (ohne CompressionStream: j.<base64url(json)>)
import { tr } from './i18n';
import type { UserState } from './storage';
import { sanitize } from './storage';

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const MAX_BYTES = 2_000_000;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const reader = src.pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    size += r.value.length;
    // Schutz vor manipulierten Links, die beim Entpacken riesig werden.
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error(tr('Die Daten im Link sind zu groß.'));
    }
    parts.push(r.value);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Nur übertragen, was der Nutzer selbst angelegt hat (keine gelesenen News). */
const payload = (s: UserState) => ({ v: 1, owned: s.owned, combos: s.combos, deck: s.deck, opponent: s.opponent, wishlist: s.wishlist, barcodes: s.barcodes, matches: s.matches });

export async function encodeState(state: UserState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload(state)));
  try {
    if (typeof CompressionStream !== 'undefined') return `z.${b64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
  } catch {
    /* ältere Browser kennen 'deflate-raw' nicht → unkomprimiert */
  }
  return `j.${b64url(json)}`;
}

export async function decodeState(code: string): Promise<UserState> {
  const [kind, data] = [code.slice(0, 2), code.slice(2)];
  let bytes: Uint8Array = fromB64url(data);
  if (kind === 'z.') {
    if (typeof DecompressionStream === 'undefined') throw new Error(tr('Dieser Browser ist zu alt für den Link – bitte iOS bzw. den Browser aktualisieren oder die Export-Datei nutzen.'));
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind !== 'j.') throw new Error(tr('Unbekanntes Format'));
  return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
}

/** Akzeptiert den ganzen Link oder nur den Code (z. B. eingefügt). */
export function extractCode(input: string): string | null {
  const t = input.trim();
  const m = /#import=([A-Za-z0-9._-]+)/.exec(t) ?? /^([zj]\.[A-Za-z0-9_-]+)$/.exec(t);
  return m ? m[1]! : null;
}

export const transferLink = (code: string, base = `${location.origin}${location.pathname}`) => `${base}#import=${code}`;

/** Zusammenführen statt ersetzen: nichts geht verloren. Bei Anzahlen gilt der höhere Wert. */
export function mergeState(local: UserState, incoming: UserState): UserState {
  const byId = <T extends { id: string }>(a: T[], b: T[]) => [...a, ...b.filter((x) => !a.some((y) => y.id === x.id))];
  const owned = { ...local.owned };
  for (const [code, n] of Object.entries(incoming.owned)) owned[code] = Math.max(owned[code] ?? 0, n);
  const combos = byId(local.combos, incoming.combos);
  return {
    ...local,
    owned,
    combos,
    deck: local.deck.length ? local.deck : incoming.deck.filter((id) => combos.some((c) => c.id === id)),
    opponent: local.opponent.length ? local.opponent : incoming.opponent,
    wishlist: [...new Set([...local.wishlist, ...incoming.wishlist])],
    barcodes: { ...incoming.barcodes, ...local.barcodes },
    shopPrices: { ...incoming.shopPrices, ...local.shopPrices },
    matches: byId(local.matches, incoming.matches).sort((a, b) => a.date.localeCompare(b.date)).slice(-500),
  };
}

/** iPhone/iPad: Safari und die App vom Home-Bildschirm haben getrennten Speicher. */
export function isIosBrowserTab(): boolean {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** Text für die Rückfrage vor dem Zusammenführen. */
/** Für das Import-Fenster: was übernommen wird, und der Hinweis zum Zusammenführen. */
export function importSummary(incoming: UserState): { counts: string[]; note: string; iosHint: string | null } {
  return {
    counts: [
      tr('{0} Produkte', Object.keys(incoming.owned).length),
      tr('{0} Kombos', incoming.combos.length),
      tr('{0} Wünsche', incoming.wishlist.length),
      tr('{0} Kämpfe', incoming.matches.length),
    ],
    note: tr('Fehlendes kommt dazu, bei Anzahlen gilt der höhere Wert. Was du hier gelöscht hast, kann dadurch zurückkommen.'),
    iosHint: isIosBrowserTab()
      ? tr('Das hier ist Safari. Nutzt du die App vom Home-Bildschirm, öffne sie dort und füge den Link unter Sammlung → „Auf anderes Gerät“ → „Code einfügen“ ein – Safari und die App haben getrennten Speicher.')
      : null,
  };
}

export function importQuestion(incoming: UserState): string {
  const n = Object.keys(incoming.owned).length;
  const hint = isIosBrowserTab()
    ? tr('\n\nHinweis: Das hier ist Safari. Nutzt du die App vom Home-Bildschirm, öffne sie dort und füge den Link unter Sammlung → „Auf anderes Gerät“ → „Code einfügen“ ein – Safari und die App haben getrennten Speicher.')
    : '';
  return tr('Daten von deinem anderen Gerät übernehmen?\n\n{0} Produkte, {1} Kombos, {2} Wünsche, {3} Kämpfe.\n\nSie werden mit den Daten hier zusammengeführt: Fehlendes kommt dazu, bei Anzahlen gilt der höhere Wert. Was du hier gelöscht hast, kann dadurch zurückkommen.{4}', n, incoming.combos.length, incoming.wishlist.length, incoming.matches.length, hint);
}

export const importError = (err: unknown) =>
  err instanceof Error && /alt|groß/.test(err.message) ? err.message : tr('Der Link oder Code ist unvollständig oder beschädigt. Erstelle auf dem anderen Gerät einen neuen.');
