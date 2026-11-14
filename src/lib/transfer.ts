// Übertragung der eigenen Daten auf ein anderes Gerät per Link/QR-Code – ohne Server.
// Format im Link: #import=z.<base64url(deflate(json))>  (ohne CompressionStream: j.<base64url(json)>)
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

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const reader = src.pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>).getReader();
  const parts: Uint8Array[] = [];
  for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(r.value);
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
  if (typeof CompressionStream !== 'undefined') return `z.${b64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
  return `j.${b64url(json)}`;
}

export async function decodeState(code: string): Promise<UserState> {
  const [kind, data] = [code.slice(0, 2), code.slice(2)];
  let bytes: Uint8Array = fromB64url(data);
  if (kind === 'z.') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann den Link nicht entpacken.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind !== 'j.') throw new Error('Unbekanntes Format');
  return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
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
    matches: byId(local.matches, incoming.matches).sort((a, b) => a.date.localeCompare(b.date)).slice(-500),
  };
}
